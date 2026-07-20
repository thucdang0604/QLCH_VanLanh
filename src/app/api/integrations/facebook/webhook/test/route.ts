import { NextRequest, NextResponse } from 'next/server';
import { upsertExternalInboundMessage } from '@/lib/chatServer';
import { getEffectiveChatIntegrationConfig } from '@/lib/chatIntegrationConfig';
import { requireAdmin } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi, type ApiRouteContext } from '@/lib/api/handler';

export const runtime = 'nodejs';

function diagnosticError(error: unknown, context: ApiRouteContext) {
  const status = getApiErrorStatus(error);
  return context.json({
    success: false,
    error: status < 500 ? getApiErrorMessage(error) : 'Webhook diagnostic failed',
  }, { status });
}

/**
 * Diagnostic endpoint: simulate a Facebook inbound message.
 * POST /api/integrations/facebook/webhook/test
 * Body: { text: "Hello from test" }
 * Requires admin auth.
 */
export const POST = withApi({ name: 'integrations/facebook/webhook/test', onError: diagnosticError }, async (request: NextRequest, context) => {
    await requireAdmin(request);
    const body = await context.readJson(request);
    const text = typeof body.text === 'string' ? body.text : 'Test message from diagnostic';

    const config = await getEffectiveChatIntegrationConfig();
    const fbConfig = config.facebook;

    // Step 1: Check config
    const configStatus = {
      enabled: fbConfig.enabled,
      hasPageId: !!fbConfig.pageId,
      hasPageAccessToken: !!fbConfig.pageAccessToken,
      hasAppSecret: !!fbConfig.appSecret,
      hasVerifyToken: !!fbConfig.verifyToken,
      graphVersion: fbConfig.graphVersion,
    };

    // Step 2: Try writing a test message to RTDB
    let upsertResult;
    try {
      upsertResult = await upsertExternalInboundMessage({
        channel: 'facebook',
        externalUserId: 'test_user_diagnostic',
        externalPageId: fbConfig.pageId || 'test_page',
        displayName: 'Facebook Test User',
        text,
        timestamp: Date.now(),
        externalMessageId: `test_${Date.now()}`,
      });
    } catch (upsertError) {
      upsertResult = { error: upsertError instanceof Error ? upsertError.message : String(upsertError) };
    }

    return NextResponse.json({
      success: true,
      configStatus,
      upsertResult,
      message: 'Check /admin/chat for a Facebook test conversation',
    });
});

export const GET = withApi({ name: 'integrations/facebook/webhook/test', onError: diagnosticError }, async (request: NextRequest) => {
    await requireAdmin(request);
    const config = await getEffectiveChatIntegrationConfig();
    return NextResponse.json({
      success: true,
      facebook: {
        enabled: config.facebook.enabled,
        hasPageId: !!config.facebook.pageId,
        hasToken: !!config.facebook.pageAccessToken,
        hasSecret: !!config.facebook.appSecret,
        hasVerify: !!config.facebook.verifyToken,
      },
      zalo: {
        enabled: config.zalo.enabled,
        hasToken: !!config.zalo.oaAccessToken,
      },
    });
});
