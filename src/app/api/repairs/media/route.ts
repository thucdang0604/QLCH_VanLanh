import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { isYouTubeUrl } from '@/lib/workflowFeatures';
import { getConfiguredWorkflow } from '@/lib/repairWorkflowConfig';
import { buildRepairMediaTimelineEntry } from '@/lib/repairMediaSession';

type RepairMediaRequestBody = {
    ticketId?: string;
    mediaUrl?: string;
    source?: 'upload' | 'youtube';
    placement?: 'pre_repair' | 'post_repair';
};

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
        const placement = body.placement === 'pre_repair' ? 'pre_repair' : 'post_repair';

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

            const ticket = ticketSnap.data() as { status?: string; ticketType?: 'repair' | 'warranty' };
            const status = String(ticket.status || '');
            const configSnap = await tx.get(db.collection('system_config').doc('repairs'));
            if (!configSnap.exists) {
                throw new Error('Khong tim thay cau hinh workflow sua chua trong Firebase.');
            }
            const workflow = getConfiguredWorkflow(configSnap.data() ?? {}, ticket.ticketType);
            const currentNode = workflow.find(node => node.id === status);
            if (placement === 'post_repair' && !currentNode?.isTerminal) {
                throw new Error('Chi duoc them media ban giao cho phieu da hoan tat/ban giao/hoan tien.');
            }

            const mediaField = placement === 'pre_repair' ? 'preRepairMedia' : 'postRepairMedia';
            // A retry after a lost response must not append another timeline entry.
            const existingMedia: unknown = ticketSnap.get(mediaField);
            if (Array.isArray(existingMedia) && existingMedia.includes(mediaUrl)) return;

            tx.update(ticketRef, {
                [mediaField]: FieldValue.arrayUnion(mediaUrl),
                updatedAt: FieldValue.serverTimestamp(),
                statusTimeline: FieldValue.arrayUnion(buildRepairMediaTimelineEntry(status, placement, source, caller.uid)),
            });
        });

        return context.json({ success: true });
});
