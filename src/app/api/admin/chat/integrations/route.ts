import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import {
  getEffectiveChatIntegrationConfig,
  saveChatIntegrationConfig,
  toPublicChatIntegrationConfig,
  type ChatIntegrationConfigPatch,
  type ChatQuickReply,
} from '@/lib/chatIntegrationConfig';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getApiErrorMessage, getApiErrorStatus, withApi, type ApiRouteContext } from '@/lib/api/handler';

export const runtime = 'nodejs';

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function cleanQuickReplies(value: unknown): ChatQuickReply[] | undefined {
  return Array.isArray(value) ? value as ChatQuickReply[] : undefined;
}

function integrationError(error: unknown, context: ApiRouteContext) {
  const status = getApiErrorStatus(error);
  return context.json({ success: false, error: getApiErrorMessage(error) }, { status });
}

export const GET = withApi({ name: 'admin/chat/integrations', onError: integrationError }, async (request: NextRequest) => {
    await requirePermission(request, 'manage_settings');
    const origin = request.nextUrl.origin;
    const config = await getEffectiveChatIntegrationConfig();

    return NextResponse.json({
      success: true,
      config: toPublicChatIntegrationConfig(config),
      webhookUrls: {
        facebook: `${origin}/api/integrations/facebook/webhook`,
        zalo: `${origin}/api/integrations/zalo/webhook`,
      },
    });
});

export const PUT = withApi({ name: 'admin/chat/integrations', onError: integrationError }, async (request: NextRequest, context) => {
    await requirePermission(request, 'manage_settings');
    const body = await context.readJson(request);
    const next: ChatIntegrationConfigPatch = {};

    if (typeof body.facebook === 'object' && body.facebook !== null) {
      const fb = body.facebook as Record<string, unknown>;
      const facebook: NonNullable<ChatIntegrationConfigPatch['facebook']> = {};
      const enabled = cleanBoolean(fb.enabled);
      if (enabled !== undefined) facebook.enabled = enabled;
      const pageId = cleanString(fb.pageId);
      if (pageId !== undefined) facebook.pageId = pageId;
      const graphVersion = cleanString(fb.graphVersion);
      if (graphVersion !== undefined) facebook.graphVersion = graphVersion;
      const pageAccessToken = cleanString(fb.pageAccessToken);
      if (pageAccessToken !== undefined) facebook.pageAccessToken = pageAccessToken;
      const appSecret = cleanString(fb.appSecret);
      if (appSecret !== undefined) facebook.appSecret = appSecret;
      const verifyToken = cleanString(fb.verifyToken);
      if (verifyToken !== undefined) facebook.verifyToken = verifyToken;
      next.facebook = facebook;
    }

    if (typeof body.zalo === 'object' && body.zalo !== null) {
      const zalo = body.zalo as Record<string, unknown>;
      const zaloPatch: NonNullable<ChatIntegrationConfigPatch['zalo']> = {};
      const enabled = cleanBoolean(zalo.enabled);
      if (enabled !== undefined) zaloPatch.enabled = enabled;
      const oaId = cleanString(zalo.oaId);
      if (oaId !== undefined) zaloPatch.oaId = oaId;
      const oaAccessToken = cleanString(zalo.oaAccessToken);
      if (oaAccessToken !== undefined) zaloPatch.oaAccessToken = oaAccessToken;
      const webhookSecret = cleanString(zalo.webhookSecret);
      if (webhookSecret !== undefined) zaloPatch.webhookSecret = webhookSecret;
      next.zalo = zaloPatch;
    }
    const quickReplies = cleanQuickReplies(body.quickReplies);
    if (quickReplies !== undefined) next.quickReplies = quickReplies;

    const saved = await saveChatIntegrationConfig(next);
    return NextResponse.json({ success: true, config: toPublicChatIntegrationConfig(saved) });
});

export const POST = withApi({ name: 'admin/chat/integrations', onError: integrationError }, async (request: NextRequest, context) => {
    await requirePermission(request, 'manage_settings');
    const body = await context.readJson(request);
    const channel = typeof body.channel === 'string' ? body.channel : '';
    const config = await getEffectiveChatIntegrationConfig();

    if (channel === 'facebook') {
      const fb = config.facebook;
      const ok = fb.enabled && !!fb.pageId && !!fb.pageAccessToken && !!fb.appSecret && !!fb.verifyToken;
      return NextResponse.json({
        success: true,
        ok,
        message: ok
          ? 'Facebook config has required fields.'
          : 'Facebook is missing enabled/pageId/pageAccessToken/appSecret/verifyToken.',
      });
    }

    if (channel === 'zalo') {
      const zalo = config.zalo;
      const ok = zalo.enabled && !!zalo.oaAccessToken && !!zalo.webhookSecret;
      return NextResponse.json({
        success: true,
        ok,
        message: ok
          ? 'Zalo config has required fields.'
          : 'Zalo is missing enabled/oaAccessToken/webhookSecret.',
      });
    }

    if (channel === 'rtdb') {
      await getAdminDb().collection('private_config').doc('chat_integrations').get();
      return NextResponse.json({ success: true, ok: true, message: 'Firestore config is reachable.' });
    }

    return NextResponse.json({ success: false, error: 'Invalid channel' }, { status: 400 });
});
