import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { sendAdminChatMessage } from '@/lib/chatServer';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission(request, 'chat_support');
    const body = await request.json();
    const roomId = typeof body.roomId === 'string' ? body.roomId : '';
    const text = typeof body.text === 'string' ? body.text : '';

    if (!roomId || !text.trim()) {
      return NextResponse.json({ error: 'Missing roomId or text' }, { status: 400 });
    }

    await sendAdminChatMessage({
      roomId,
      text,
      adminId: user.uid,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const lower = message.toLowerCase();
    const status = lower.includes('missing authorization') ? 401 : lower.includes('forbidden') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
