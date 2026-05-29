import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { isAllowedFacebookMediaUrl, type ChatAttachment } from '@/lib/chatServer';
import { toSafeRtdbKey } from '@/lib/chatChannels';
import { getAdminRtdb, getAdminStorage } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

function validRtdbKey(value: string): string | null {
  const safe = toSafeRtdbKey(value);
  return safe === value && safe.length > 0 ? safe : null;
}

function mediaResponse(bytes: Buffer, contentType: string) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function imageExtension(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomId: string; messageId: string; attachmentIndex: string }> },
) {
  try {
    await requirePermission(request, 'chat_support');
    const { roomId, messageId, attachmentIndex } = await context.params;
    const safeRoomId = validRtdbKey(roomId);
    const safeMessageId = validRtdbKey(messageId);
    const index = Number(attachmentIndex);

    if (!safeRoomId || !safeMessageId || !Number.isInteger(index) || index < 0 || index > 4) {
      return NextResponse.json({ error: 'Invalid media reference' }, { status: 400 });
    }

    const snap = await getAdminRtdb().ref(`chats/${safeRoomId}/messages/${safeMessageId}/attachments/${index}`).get();
    if (!snap.exists()) return NextResponse.json({ error: 'Media not found' }, { status: 404 });

    const attachment = snap.val() as ChatAttachment;
    if (attachment.type !== 'image') {
      return NextResponse.json({ error: 'Media type is not supported' }, { status: 400 });
    }

    if (attachment.storagePath?.startsWith(`private/chat/facebook/${safeRoomId}/`)) {
      try {
        const [bytes] = await getAdminStorage().bucket().file(attachment.storagePath).download();
        if (bytes.length > 0 && bytes.length <= MAX_MEDIA_BYTES) {
          return mediaResponse(bytes, attachment.contentType || 'image/jpeg');
        }
      } catch {
        // A legacy or incomplete cache can still fall back to the Meta payload URL.
      }
    }

    if (!attachment.url || !isAllowedFacebookMediaUrl(attachment.url)) {
      return NextResponse.json({ error: 'Image source is unavailable' }, { status: 404 });
    }

    const response = await fetch(attachment.url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || '';
    const statedSize = Number(response.headers.get('content-length') || 0);
    if (!response.ok || !contentType.startsWith('image/') || statedSize > MAX_MEDIA_BYTES) {
      return NextResponse.json({ error: 'Image cannot be loaded from Meta' }, { status: 502 });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_MEDIA_BYTES) {
      return NextResponse.json({ error: 'Image exceeds supported size' }, { status: 413 });
    }

    const storagePath = `private/chat/facebook/${safeRoomId}/${safeMessageId}_${index}.${imageExtension(contentType)}`;
    try {
      await getAdminStorage().bucket().file(storagePath).save(bytes, {
        resumable: false,
        contentType,
        metadata: { cacheControl: 'private, max-age=86400' },
      });
      await snap.ref.update({ storagePath, contentType });
    } catch {
      // Successful display is more important than best-effort archival of legacy images.
    }

    return mediaResponse(bytes, contentType);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    const status = message.toLowerCase().includes('missing authorization')
      ? 401
      : message.toLowerCase().includes('forbidden')
        ? 403
        : 500;
    return NextResponse.json({ error: status === 500 ? 'Media request failed' : message }, { status });
  }
}
