import { getAdminRtdb } from '@/lib/firebaseAdmin';
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

export interface UpsertExternalMessageInput {
  channel: ExternalChannel;
  externalUserId: string;
  externalPageId?: string;
  displayName?: string;
  avatarUrl?: string;
  text: string;
  timestamp?: number;
  externalMessageId?: string;
  rawEvent?: unknown;
}

export interface AdminChatSendInput {
  roomId: string;
  text: string;
  adminId: string;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 2000);
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
  };

  if (input.externalMessageId) {
    await withTimeout(
      roomRef.child(`messages/${externalMessageKey(channel, input.externalMessageId)}`).set(message),
      8000,
      'External chat message write',
    );
  } else {
    await withTimeout(roomRef.child('messages').push(message), 8000, 'External chat message push');
  }

  await withTimeout(
    roomRef.child('info').update({
      odId: roomId,
      channel,
      source: channel,
      sourceLabel,
      ...(displayName ? { displayName } : channel === 'facebook' ? {} : { displayName: `${sourceLabel} ${externalUserId.slice(-6)}` }),
      ...(input.avatarUrl?.trim() ? { avatarUrl: input.avatarUrl.trim() } : {}),
      externalUserId,
      externalPageId,
      isGuest: true,
      botActive: false,
      hasUnreadAdmin: true,
      hasUnread: true,
      lastMessage: text.slice(0, 500),
      lastMessageTime: timestamp,
      lastActivity: Date.now(),
      rawLastEvent: input.rawEvent ? JSON.stringify(input.rawEvent).slice(0, 2000) : null,
    }),
    8000,
    'External chat room info update',
  );

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
  const url = `https://graph.facebook.com/${config.graphVersion || 'v25.0'}/${pageId}/messages?access_token=${encodeURIComponent(config.pageAccessToken)}`;
  console.log('[FB Send] Sending to userId:', externalUserId, 'via pageId:', pageId);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
