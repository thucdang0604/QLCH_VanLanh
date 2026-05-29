import { NextRequest, NextResponse } from 'next/server';
import { upsertExternalInboundMessage } from '@/lib/chatServer';
import { getEffectiveChatIntegrationConfig } from '@/lib/chatIntegrationConfig';

export const runtime = 'nodejs';

function isAuthorized(request: NextRequest, expected: string): boolean {
  if (!expected) return process.env.NODE_ENV !== 'production';

  const provided =
    request.headers.get('x-webhook-token')
    || request.headers.get('x-zalo-webhook-token')
    || request.nextUrl.searchParams.get('secret')
    || request.nextUrl.searchParams.get('token');

  return provided === expected;
}

function getString(obj: Record<string, unknown>, key: string): string {
  return typeof obj[key] === 'string' ? obj[key] as string : '';
}

function extractZaloMessage(body: Record<string, unknown>) {
  const sender = (body.sender || body.from || {}) as Record<string, unknown>;
  const recipient = (body.recipient || body.to || {}) as Record<string, unknown>;
  const message = (body.message || {}) as Record<string, unknown>;

  const externalUserId =
    getString(sender, 'id')
    || getString(sender, 'user_id')
    || getString(body, 'user_id')
    || getString(body, 'user_id_by_app');

  const externalPageId =
    getString(recipient, 'id')
    || getString(recipient, 'oa_id')
    || getString(body, 'oa_id')
    || getString(body, 'app_id')
    || 'default';

  const text =
    getString(message, 'text')
    || getString(body, 'text')
    || (Array.isArray(message.attachments) ? `[Zalo attachment] ${message.attachments.length} file` : '');

  const externalMessageId =
    getString(message, 'msg_id')
    || getString(message, 'id')
    || getString(body, 'message_id')
    || getString(body, 'msg_id');

  const timestamp =
    typeof body.timestamp === 'number'
      ? body.timestamp
      : typeof body.time === 'number'
        ? body.time
        : Date.now();

  return { externalUserId, externalPageId, text, externalMessageId, timestamp };
}

export async function GET(request: NextRequest) {
  try {
    const config = (await getEffectiveChatIntegrationConfig()).zalo;
    if (config.webhookSecret && !isAuthorized(request, config.webhookSecret)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook token' }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      channel: 'zalo',
      enabled: config.enabled,
      configured: !!config.oaAccessToken,
    });
  } catch (error) {
    console.error('Zalo webhook health check failed:', error);
    return NextResponse.json({ ok: false, error: 'Webhook unavailable' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const config = (await getEffectiveChatIntegrationConfig()).zalo;
    if (!config.enabled) {
      return NextResponse.json({ success: true, skipped: 'zalo_disabled' });
    }
    if (!isAuthorized(request, config.webhookSecret)) {
      return NextResponse.json({ error: 'Invalid webhook token' }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const eventName = getString(body, 'event_name');
    if (eventName && !eventName.toLowerCase().includes('message')) {
      console.warn('Zalo webhook skipped unsupported event:', eventName);
      return NextResponse.json({ success: true, skipped: 'unsupported_event' });
    }

    const message = extractZaloMessage(body);
    console.warn('Zalo webhook event received:', {
      eventName: eventName || 'unknown',
      hasUserId: !!message.externalUserId,
      hasText: !!message.text,
      externalPageId: message.externalPageId,
    });
    const result = await upsertExternalInboundMessage({
      channel: 'zalo',
      externalUserId: message.externalUserId,
      externalPageId: message.externalPageId,
      text: message.text,
      timestamp: message.timestamp,
      externalMessageId: message.externalMessageId || undefined,
    });

    console.warn('Zalo webhook processed:', result);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('Zalo webhook processing failed:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
