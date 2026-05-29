import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { syncFacebookRoomProfile } from '@/lib/chatServer';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  try {
    await requirePermission(request, 'chat_support');
    const { roomId } = await context.params;
    const profile = await syncFacebookRoomProfile(roomId);

    return NextResponse.json({ success: true, profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const lower = message.toLowerCase();
    const status = lower.includes('missing authorization')
      ? 401
      : lower.includes('forbidden')
        ? 403
        : lower.includes('not found')
          ? 404
          : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
