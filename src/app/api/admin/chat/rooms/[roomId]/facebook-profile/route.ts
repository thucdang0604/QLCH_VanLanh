import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { syncFacebookRoomProfile } from '@/lib/chatServer';

export const runtime = 'nodejs';

export const POST = withApi({
  name: 'admin/chat/facebook-profile',
  onError: (error, context) => {
    const message = getApiErrorMessage(error);
    const status = message.toLowerCase().includes('not found') ? 404 : getApiErrorStatus(error, 400);
    return context.json({ success: false, error: message }, { status });
  },
}, async (
  request: NextRequest,
  context,
  routeContext: { params: Promise<{ roomId: string }> },
) => {
    await requirePermission(request, 'chat_support');
    const { roomId } = await routeContext.params;
    const profile = await syncFacebookRoomProfile(roomId);

    return context.json({ success: true, profile });
});
