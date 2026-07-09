import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { isRepairManager } from '@/lib/repairAccess';

const CHECKLIST_KEYS = new Set(['body', 'screen', 'touch', 'camera', 'speaker', 'connectivity', 'battery', 'biometric']);
const CHECKLIST_VALUES = new Set(['', 'OK', 'Trầy', 'Nứt', 'Móp', 'Lỗi', 'Không có']);
const HISTORY_KEYS = new Set(['hasPriorRepair', 'hasWaterDamage', 'hasNonGenuineParts']);
const LOCKED_STATUSES = new Set(['done', 'out', 'refund']);

type ChecklistPatchRequest = {
    ticketId?: string;
    ticketVersion?: number;
    key?: string;
    value?: string | boolean;
};

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');
        const body = await request.json() as ChecklistPatchRequest;
        const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : '';
        const key = typeof body.key === 'string' ? body.key.trim() : '';

        if (!ticketId || !key) {
            return NextResponse.json({ error: 'Missing ticketId or key' }, { status: 400 });
        }

        const isChecklistKey = CHECKLIST_KEYS.has(key);
        const isHistoryKey = HISTORY_KEYS.has(key);
        if (!isChecklistKey && !isHistoryKey) {
            return NextResponse.json({ error: 'Checklist field khong hop le.' }, { status: 400 });
        }

        const nextValue = body.value;
        if (isChecklistKey && (typeof nextValue !== 'string' || !CHECKLIST_VALUES.has(nextValue))) {
            return NextResponse.json({ error: 'Checklist value khong hop le.' }, { status: 400 });
        }
        if (isHistoryKey && typeof nextValue !== 'boolean') {
            return NextResponse.json({ error: 'History value khong hop le.' }, { status: 400 });
        }

        const db = getAdminDb();
        await db.runTransaction(async (tx) => {
            const ticketRef = db.collection('repairs').doc(ticketId);
            const ticketSnap = await tx.get(ticketRef);
            if (!ticketSnap.exists) {
                throw new Error('Phieu sua chua khong ton tai.');
            }

            const ticket = ticketSnap.data() as {
                status?: string;
                version?: number;
                staff?: { assignedTechnician?: string };
            };

            if (LOCKED_STATUSES.has(String(ticket.status || ''))) {
                throw new Error('Phieu da khoa checklist o trang thai hien tai.');
            }

            if (ticket.version !== undefined && ticket.version !== body.ticketVersion) {
                throw new Error('Du lieu da thay doi. Vui long tai lai phieu truoc khi sua checklist.');
            }

            if (!isRepairManager(caller) && ticket.staff?.assignedTechnician !== caller.uid) {
                throw new Error('Ban khong duoc gan xu ly phieu nay.');
            }

            tx.update(ticketRef, {
                [`deviceInfo.checklist.${key}`]: nextValue,
                updatedAt: FieldValue.serverTimestamp(),
                version: FieldValue.increment(1),
                statusTimeline: FieldValue.arrayUnion({
                    status: ticket.status || '',
                    eventType: 'checklist_updated',
                    field: key,
                    timestamp: FieldValue.serverTimestamp(),
                    userId: caller.uid,
                }),
            });
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Repair checklist patch error:', error);
        const message = error instanceof Error ? error.message : 'Khong the cap nhat checklist.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
