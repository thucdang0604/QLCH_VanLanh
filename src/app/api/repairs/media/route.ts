import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { isYouTubeUrl } from '@/lib/workflowFeatures';

const MEDIA_EDITABLE_STATUSES = new Set(['done', 'out', 'refund']);

function isValidMediaUrl(value: string): boolean {
    if (value.length > 2048) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');
        const body = await request.json() as { ticketId?: string; mediaUrl?: string; source?: 'upload' | 'youtube' };
        const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : '';
        const mediaUrl = typeof body.mediaUrl === 'string' ? body.mediaUrl.trim() : '';
        const source = body.source || 'upload';

        if (!ticketId || !mediaUrl) {
            return NextResponse.json({ error: 'Missing ticketId or mediaUrl' }, { status: 400 });
        }
        if (!isValidMediaUrl(mediaUrl)) {
            return NextResponse.json({ error: 'Media URL khong hop le.' }, { status: 400 });
        }
        if (source === 'youtube' && !isYouTubeUrl(mediaUrl)) {
            return NextResponse.json({ error: 'Link YouTube khong hop le.' }, { status: 400 });
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

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Repair media append error:', error);
        const message = error instanceof Error ? error.message : 'Khong the them media ban giao.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
