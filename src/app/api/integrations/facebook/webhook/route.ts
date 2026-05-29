import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { fetchFacebookUserProfile, upsertExternalInboundMessage, type ChatAttachment } from '@/lib/chatServer';
import { getEffectiveChatIntegrationConfig } from '@/lib/chatIntegrationConfig';

export const runtime = 'nodejs';

function verifySignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!appSecret) return process.env.NODE_ENV !== 'production';
  if (!signature?.startsWith('sha256=')) return false;

  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function messageContentFromFacebook(message: Record<string, unknown>) {
  const attachments: ChatAttachment[] = (Array.isArray(message.attachments) ? message.attachments : [])
    .slice(0, 5)
    .map((entry) => {
      const attachment = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {};
      const payload = typeof attachment.payload === 'object' && attachment.payload !== null
        ? attachment.payload as Record<string, unknown>
        : {};
      const rawType = typeof attachment.type === 'string' ? attachment.type : 'unknown';
      const stickerId = typeof payload.sticker_id === 'number' || typeof payload.sticker_id === 'string'
        ? String(payload.sticker_id)
        : undefined;
      const allowedType = rawType === 'image' || rawType === 'audio' || rawType === 'video' || rawType === 'file'
        ? rawType
        : 'unknown';

      return {
        type: stickerId ? 'sticker' : allowedType,
        ...(typeof payload.url === 'string' ? { url: payload.url.slice(0, 2048) } : {}),
        ...(stickerId ? { stickerId: stickerId.slice(0, 180) } : {}),
      };
    });

  if (typeof message.text === 'string' && message.text.trim()) {
    return { text: message.text, attachments };
  }
  if (attachments.some(attachment => attachment.type === 'sticker')) {
    return { text: '[Sticker Facebook]', attachments };
  }
  if (attachments.length > 0) {
    return { text: '[Tệp đính kèm Facebook]', attachments };
  }
  return { text: '', attachments };
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('hub.verify_token');
    const challenge = request.nextUrl.searchParams.get('hub.challenge');
    const mode = request.nextUrl.searchParams.get('hub.mode');
    const expected = (await getEffectiveChatIntegrationConfig()).facebook.verifyToken;

    if (mode === 'subscribe' && expected && token === expected && challenge) {
      return new Response(challenge, { status: 200 });
    }

    return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
  } catch (error) {
    console.error('Facebook webhook verification failed:', error);
    return NextResponse.json({ error: 'Webhook verification unavailable' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    console.log('[FB Webhook] POST received, body length:', rawBody.length);

    const config = (await getEffectiveChatIntegrationConfig()).facebook;
    console.log('[FB Webhook] Config enabled:', config.enabled, 'pageId:', config.pageId, 'hasToken:', !!config.pageAccessToken, 'hasSecret:', !!config.appSecret);

    if (!config.enabled) {
      console.log('[FB Webhook] SKIPPED: facebook_disabled');
      return NextResponse.json({ success: true, skipped: 'facebook_disabled' });
    }
    if (!verifySignature(rawBody, request.headers.get('x-hub-signature-256'), config.appSecret)) {
      console.log('[FB Webhook] REJECTED: invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.log('[FB Webhook] REJECTED: invalid JSON');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    console.log('[FB Webhook] Parsed body object:', body.object, 'entries:', Array.isArray(body.entry) ? body.entry.length : 0);
    const entryList = Array.isArray(body.entry) ? body.entry : [];
    const processed: string[] = [];

    for (const entry of entryList) {
      const entryObj = entry as Record<string, unknown>;
      const messagingList = Array.isArray(entryObj.messaging) ? entryObj.messaging : [];
      console.log('[FB Webhook] Entry id:', entryObj.id, 'messaging events:', messagingList.length);

      for (const event of messagingList) {
        const eventObj = event as Record<string, unknown>;
        const sender = eventObj.sender as Record<string, unknown> | undefined;
        const recipient = eventObj.recipient as Record<string, unknown> | undefined;
        const message = eventObj.message as Record<string, unknown> | undefined;

        console.log('[FB Webhook] Event - sender:', sender?.id, 'recipient:', recipient?.id, 'hasMessage:', !!message, 'isEcho:', message?.is_echo);

        if (!sender?.id || !message || message.is_echo === true) {
          console.log('[FB Webhook] SKIPPED event: no sender/message or is_echo');
          continue;
        }

        const content = messageContentFromFacebook(message);
        const text = content.text;
        console.log('[FB Webhook] Extracted text:', text ? text.slice(0, 100) : '(empty)');
        const profile = await fetchFacebookUserProfile(
          String(sender.id),
          config.graphVersion || 'v25.0',
          config.pageAccessToken,
        );

        const result = await upsertExternalInboundMessage({
          channel: 'facebook',
          externalUserId: String(sender.id),
          externalPageId: recipient?.id ? String(recipient.id) : String(entryObj.id || 'default'),
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          text,
          attachments: content.attachments,
          timestamp: typeof eventObj.timestamp === 'number' ? eventObj.timestamp : Date.now(),
          externalMessageId: typeof message.mid === 'string' ? message.mid : undefined,
        });

        console.log('[FB Webhook] upsert result:', result);
        if (!result.skipped) processed.push(result.roomId);
      }
    }

    console.log('[FB Webhook] Done. Processed rooms:', processed);
    return NextResponse.json({ success: true, processed });
  } catch (error) {
    console.error('[FB Webhook] Processing FAILED:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
