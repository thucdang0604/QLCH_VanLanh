import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { sendAdminChatMessage } from '@/lib/chatServer';

export const runtime = 'nodejs';

export const POST = withApi({
  name: 'admin/chat/send',
  onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error)),
}, async (request: NextRequest, context) => {
    const user = await requirePermission(request, 'chat_support');
    const body = await context.readJson(request);
    const roomId = typeof body.roomId === 'string' ? body.roomId : '';
    const text = typeof body.text === 'string' ? body.text : '';

    if (!roomId || !text.trim()) {
      return context.json({ error: 'Missing roomId or text' }, { status: 400 });
    }

    await sendAdminChatMessage({
      roomId,
      text,
      adminId: user.uid,
    });

    return context.json({ success: true });
});
