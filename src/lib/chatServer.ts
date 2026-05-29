import { getAdminRtdb, getAdminStorage } from '@/lib/firebaseAdmin';
import {
  buildExternalChatRoomId,
  getChatChannelLabel,
  isExternalChatChannel,
  normalizeChatChannel,
  toSafeRtdbKey,
  type ChatChannel,
} from '@/lib/chatChannels';
import { getEffectiveChatIntegrationConfig } from '@/lib/chatIntegrationConfig';

type ExternalChannel = Exclude<ChatChannel, 'web'>;

export interface ChatAttachment {
  type: 'image' | 'sticker' | 'audio' | 'video' | 'file' | 'unknown';
  url?: string;
  stickerId?: string;
  storagePath?: string;
  contentType?: string;
}

export interface UpsertExternalMessageInput {
  channel: ExternalChannel;
  externalUserId: string;
  externalPageId?: string;
  displayName?: string;
  avatarUrl?: string;
  text: string;
  attachments?: ChatAttachment[];
  timestamp?: number;
  externalMessageId?: string;
}

export interface AdminChatSendInput {
  roomId: string;
  text: string;
  adminId: string;
}

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2000);
}

function externalMessageKey(channel: ExternalChannel, externalMessageId: string): string {
  return `${channel}_${toSafeRtdbKey(externalMessageId)}`;
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

const MAX_FACEBOOK_IMAGE_BYTES = 8 * 1024 * 1024;

export function isAllowedFacebookMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (url.hostname.endsWith('.fbcdn.net') || url.hostname.endsWith('.fbsbx.com'));
  } catch {
    return false;
  }
}

function imageExtension(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

async function cacheFacebookImages(
  attachments: ChatAttachment[],
  roomId: string,
  messageKey: string,
): Promise<ChatAttachment[]> {
  return Promise.all(attachments.map(async (attachment, index) => {
    if (attachment.type !== 'image' || !attachment.url || !isAllowedFacebookMediaUrl(attachment.url)) {
      return attachment;
    }

    try {
      const response = await fetch(attachment.url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) return attachment;

      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
      if (!contentType.startsWith('image/')) return attachment;

      const statedSize = Number(response.headers.get('content-length') || 0);
      if (statedSize > MAX_FACEBOOK_IMAGE_BYTES) return attachment;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_FACEBOOK_IMAGE_BYTES) return attachment;

      const safeMessageKey = toSafeRtdbKey(messageKey).slice(0, 160) || String(Date.now());
      const storagePath = `private/chat/facebook/${roomId}/${safeMessageKey}_${index}.${imageExtension(contentType)}`;
      await withTimeout(
        getAdminStorage().bucket().file(storagePath).save(bytes, {
          resumable: false,
          contentType,
          metadata: { cacheControl: 'private, max-age=86400' },
        }),
        8000,
        'Facebook image archive',
      );

      return { ...attachment, storagePath, contentType };
    } catch (error) {
      console.warn('[FB Media] Archive unavailable:', error instanceof Error ? error.message : error);
      return attachment;
    }
  }));
}

export interface FacebookUserProfile {
  displayName?: string;
  avatarUrl?: string;
}

export async function fetchFacebookUserProfile(
  userId: string,
  graphVersion: string,
  pageAccessToken: string,
): Promise<FacebookUserProfile> {
  if (!pageAccessToken) return {};

  const params = new URLSearchParams({
    fields: 'first_name,last_name,profile_pic',
  });
  const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(userId)}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pageAccessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.warn('[FB Profile] Lookup unavailable:', res.status);
      return {};
    }

    const data = await res.json() as {
      first_name?: unknown;
      last_name?: unknown;
      profile_pic?: unknown;
    };
    const nameParts = [data.first_name, data.last_name]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(value => value.trim());

    return {
      ...(nameParts.length > 0 ? { displayName: nameParts.join(' ').slice(0, 50) } : {}),
      ...(typeof data.profile_pic === 'string' && data.profile_pic.trim().length > 0
        ? { avatarUrl: data.profile_pic.trim() }
        : {}),
    };
  } catch (error) {
    console.warn('[FB Profile] Lookup failed:', error instanceof Error ? error.message : error);
    return {};
  }
}

export async function syncFacebookRoomProfile(roomId: string): Promise<FacebookUserProfile> {
  const roomRef = getAdminRtdb().ref(`chats/${toSafeRtdbKey(roomId)}`);
  const infoSnap = await roomRef.child('info').get();
  if (!infoSnap.exists()) throw new Error('Chat room not found');

  const info = infoSnap.val() as Record<string, unknown>;
  if (normalizeChatChannel(info.channel || info.source) !== 'facebook') {
    throw new Error('Chat room is not Facebook');
  }

  const externalUserId = typeof info.externalUserId === 'string' ? info.externalUserId : '';
  if (!externalUserId) throw new Error('Missing Facebook user ID');

  const config = (await getEffectiveChatIntegrationConfig()).facebook;
  const profile = await fetchFacebookUserProfile(
    externalUserId,
    config.graphVersion || 'v25.0',
    config.pageAccessToken,
  );
  if (!profile.displayName && !profile.avatarUrl) {
    throw new Error('Facebook profile is unavailable for this user');
  }

  await roomRef.child('info').update({
    ...(profile.displayName ? { displayName: profile.displayName } : {}),
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    profileSyncedAt: Date.now(),
  });

  return profile;
}

export async function upsertExternalInboundMessage(input: UpsertExternalMessageInput) {
  const text = normalizeText(input.text);
  if (!text) {
    return { skipped: true as const, reason: 'empty_text' };
  }

  const externalUserId = input.externalUserId.trim();
  if (!externalUserId) {
    return { skipped: true as const, reason: 'missing_external_user_id' };
  }

  const channel = normalizeChatChannel(input.channel);
  if (!isExternalChatChannel(channel)) {
    return { skipped: true as const, reason: 'invalid_channel' };
  }

  const externalPageId = input.externalPageId?.trim() || 'default';
  const timestamp = input.timestamp || Date.now();
  const roomId = buildExternalChatRoomId(channel, externalPageId, externalUserId);
  const db = getAdminRtdb();
  const roomRef = db.ref(`chats/${roomId}`);
  const sourceLabel = getChatChannelLabel(channel);
  const displayName = input.displayName?.trim();
  const attachments = (input.attachments || []).slice(0, 5);

  const message = {
    text,
    senderId: externalUserId,
    senderType: 'user',
    timestamp,
    channel,
    source: channel,
    sourceLabel,
    externalUserId,
    externalPageId,
    externalMessageId: input.externalMessageId || null,
    ...(attachments.length > 0 ? { attachments } : {}),
  };

  const messageRef = input.externalMessageId
    ? roomRef.child(`messages/${externalMessageKey(channel, input.externalMessageId)}`)
    : roomRef.child('messages').push();

  if (input.externalMessageId) {
    await withTimeout(
      messageRef.set(message),
      8000,
      'External chat message write',
    );
  } else {
    await withTimeout(messageRef.set(message), 8000, 'External chat message push');
  }

  await withTimeout(
    roomRef.child('info').update({
      odId: roomId,
      channel,
      source: channel,
      sourceLabel,
      ...(displayName ? { displayName } : channel === 'facebook' ? {} : { displayName: `${sourceLabel} ${externalUserId.slice(-6)}` }),
      ...(input.avatarUrl?.trim() ? { avatarUrl: input.avatarUrl.trim() } : {}),
      ...(displayName || input.avatarUrl?.trim() ? { profileSyncedAt: Date.now() } : {}),
      externalUserId,
      externalPageId,
      isGuest: true,
      botActive: false,
      hasUnreadAdmin: true,
      hasUnread: true,
      lastMessage: text.slice(0, 500),
      lastMessageTime: timestamp,
      lastActivity: Date.now(),
    }),
    8000,
    'External chat room info update',
  );

  if (channel === 'facebook' && attachments.some(attachment => attachment.type === 'image')) {
    const cachedAttachments = await cacheFacebookImages(
      attachments,
      roomId,
      input.externalMessageId || String(timestamp),
    );
    if (cachedAttachments.some(attachment => attachment.storagePath)) {
      await withTimeout(messageRef.child('attachments').set(cachedAttachments), 8000, 'Facebook attachment cache update');
    }
  }

  return { skipped: false as const, roomId };
}

async function sendFacebookMessage(externalUserId: string, text: string) {
  const config = (await getEffectiveChatIntegrationConfig()).facebook;
  console.log('[FB Send] Config enabled:', config.enabled, 'pageId:', config.pageId, 'hasToken:', !!config.pageAccessToken);
  if (!config.enabled) {
    throw new Error('Facebook integration is disabled');
  }
  if (!config.pageAccessToken) {
    throw new Error('Missing Facebook Page Access Token');
  }

  const pageId = config.pageId || 'me';
  const url = `https://graph.facebook.com/${config.graphVersion || 'v25.0'}/${pageId}/messages`;
  console.log('[FB Send] Sending to userId:', externalUserId, 'via pageId:', pageId);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.pageAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: externalUserId },
      messaging_type: 'RESPONSE',
      message: { text },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[FB Send] FAILED:', res.status, body.slice(0, 500));
    throw new Error(`Facebook send failed (${res.status}): ${body.slice(0, 500)}`);
  }
  console.log('[FB Send] Success');
}

async function sendZaloMessage(externalUserId: string, text: string) {
  const config = (await getEffectiveChatIntegrationConfig()).zalo;
  if (!config.enabled) {
    throw new Error('Zalo integration is disabled');
  }
  if (!config.oaAccessToken) {
    throw new Error('Missing Zalo OA Access Token');
  }

  const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      access_token: config.oaAccessToken,
    },
    body: JSON.stringify({
      recipient: { user_id: externalUserId },
      message: { text },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Zalo send failed (${res.status}): ${body.slice(0, 500)}`);
  }
}

export async function sendAdminChatMessage(input: AdminChatSendInput) {
  const text = normalizeText(input.text);
  if (!text) throw new Error('Message is empty');

  const roomRef = getAdminRtdb().ref(`chats/${toSafeRtdbKey(input.roomId)}`);
  const infoSnap = await roomRef.child('info').get();
  if (!infoSnap.exists()) {
    console.error('[AdminChat] Room not found:', input.roomId);
    throw new Error('Chat room not found');
  }

  const info = infoSnap.val() as Record<string, unknown>;
  const channel = normalizeChatChannel(info.channel || info.source);
  const externalUserId = typeof info.externalUserId === 'string' ? info.externalUserId : '';
  console.log('[AdminChat] Room:', input.roomId, 'channel:', channel, 'externalUserId:', externalUserId);

  if (channel === 'facebook') {
    await sendFacebookMessage(externalUserId, text);
  } else if (channel === 'zalo') {
    await sendZaloMessage(externalUserId, text);
  }

  const now = Date.now();
  await roomRef.child('messages').push({
    text,
    senderId: input.adminId,
    senderType: 'admin',
    timestamp: now,
    channel,
    source: channel,
    sourceLabel: getChatChannelLabel(channel),
  });

  await roomRef.child('info').update({
    lastMessage: `[NV] ${text.slice(0, 480)}`,
    lastMessageTime: now,
    lastActivity: now,
    hasUnreadUser: true,
  });
  console.log('[AdminChat] Message saved to RTDB');
}
