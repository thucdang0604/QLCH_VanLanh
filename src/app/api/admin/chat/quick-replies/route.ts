import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getEffectiveChatIntegrationConfig } from '@/lib/chatIntegrationConfig';

export const runtime = 'nodejs';

export const GET = withApi({
  name: 'admin/chat/quick-replies',
  onError: (error, context) => {
    const status = getApiErrorStatus(error);
    return context.json({ success: false, error: status === 500 ? 'Quick replies unavailable' : getApiErrorMessage(error) }, { status });
  },
}, async (request: NextRequest, context) => {
    await requirePermission(request, 'chat_support');
    const config = await getEffectiveChatIntegrationConfig();
    return context.json({
      success: true,
      quickReplies: config.quickReplies.filter(reply => reply.enabled),
    });
});
