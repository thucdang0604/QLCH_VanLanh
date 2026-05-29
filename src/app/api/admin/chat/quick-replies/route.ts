import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { getEffectiveChatIntegrationConfig } from '@/lib/chatIntegrationConfig';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await requirePermission(request, 'chat_support');
    const config = await getEffectiveChatIntegrationConfig();
    return NextResponse.json({
      success: true,
      quickReplies: config.quickReplies.filter(reply => reply.enabled),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const lower = message.toLowerCase();
    const status = lower.includes('missing authorization') ? 401 : lower.includes('forbidden') ? 403 : 500;
    return NextResponse.json({ success: false, error: status === 500 ? 'Quick replies unavailable' : message }, { status });
  }
}
