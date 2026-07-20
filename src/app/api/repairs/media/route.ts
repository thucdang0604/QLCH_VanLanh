import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { isYouTubeUrl } from '@/lib/workflowFeatures';

const MEDIA_EDITABLE_STATUSES = new Set(['done', 'out', 'refund']);
type RepairMediaRequestBody = { ticketId?: string; mediaUrl?: string; source?: 'upload' | 'youtube' };

function isValidMediaUrl(value: string): boolean {
    if (value.length > 2048) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

export const POST = withApi({
    name: 'repairs/media',
    onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error, 400)),
}, async (request: NextRequest, context) => {
        const caller = await requirePermission(request, 'manage_repairs');
        const body = await context.readJson<RepairMediaRequestBody>(request);
        const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : '';
        const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : '';
        const source = body.source || 'upload';

        if (!ticketId || !mediaUrl) {
            return context.error('Missing ticketId or mediaUrl');
        }
        if (!isValidMediaUrl(mediaUrl)) {
            return context.error('Media URL khong hop le.');
        }
        if (source === 'youtube' && !isYouTubeUrl(mediaUrl)) {
            return context.error('Link YouTube khong hop le.');
        }

        const db = getAdminDb();
        await db.runTransaction(async (tx) => {
            const ticketRef = db.collection('repairs').doc(ticketId);
            const ticketSnap = await tx.get(ticketRef);
            if (!ticketSnap.exists) {
                throw new Error('Phieu sua chua khong ton tai.');
            }

            const ticket = ticketSnap.data() as { status?: string };
            const status = String(ticket.status || '');
            if (!MEDIA_EDITABLE_STATUSES.has(status)) {
                throw new Error('Chi duoc them media ban giao cho phieu da hoan tat/ban giao/hoan tien.');
            }

            tx.update(ticketRef, {
                postRepairMedia: FieldValue.arrayUnion(mediaUrl),
                updatedAt: FieldValue.serverTimestamp(),
                statusTimeline: FieldValue.arrayUnion({
                    status,
                    note: source === 'youtube' ? 'Them link YouTube ban giao' : 'Them media ban giao',
                    timestamp: FieldValue.serverTimestamp(),
                    userId: caller.uid,
                }),
            });
        });

        return context.json({ success: true });
});
