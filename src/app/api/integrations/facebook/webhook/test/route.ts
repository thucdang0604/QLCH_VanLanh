import { NextRequest, NextResponse } from 'next/server';
import { upsertExternalInboundMessage } from '@/lib/chatServer';
import { getEffectiveChatIntegrationConfig } from '@/lib/chatIntegrationConfig';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';

/**
 * Diagnostic endpoint: simulate a Facebook inbound message.
 * POST /api/integrations/facebook/webhook/test
 * Body: { text: "Hello from test" }
 * Requires admin auth.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const body = await request.json();
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
