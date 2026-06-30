import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { loadRepairWorkflow } from '@/lib/repairWorkflowServer';
import { FieldValue } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { isTechnicianUser } from '@/lib/repairAccess';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';
import type { PaymentHistoryEntry } from '@/lib/types';

type CreateRepairBody = Record<string, unknown> & {
    ticketType?: 'repair' | 'warranty';
    timing?: Record<string, unknown>;
    staff?: Record<string, unknown>;
};

function parseClientTimestamp(value: unknown): Timestamp | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as { seconds?: unknown; nanoseconds?: unknown };
    if (typeof raw.seconds !== 'number') return null;
    return new Timestamp(raw.seconds, typeof raw.nanoseconds === 'number' ? raw.nanoseconds : 0);
}

function normalizePaymentHistory(value: unknown): PaymentHistoryEntry[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw new Error('Lich su thanh toan khong hop le.');
    }

    return value.map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error(`Dong thanh toan #${index + 1} khong hop le.`);
        }
        const data = entry as Record<string, unknown>;
        const amount = typeof data.amount === 'number' ? data.amount : Number(data.amount);
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`So tien thanh toan #${index + 1} khong hop le.`);
        }
        const type = typeof data.type === 'string' && data.type.trim()
            ? data.type
            : 'payment';
        if (!['deposit', 'payment', 'full', 'additional', 'refund', 'debt_payment'].includes(type)) {
            throw new Error(`Loai thanh toan #${index + 1} khong hop le.`);
        }
        return {
            ...data,
            type,
            amount,
        } as PaymentHistoryEntry;
    });
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');
        const body = await request.json() as CreateRepairBody;

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            const workflow = await loadRepairWorkflow(tx, db, { ticketType: body.ticketType });
            const entryNode = workflow[0];

            if (!entryNode) {
                throw new Error('Không tìm thấy entry node trong workflow');
            }

            const callerRef = db.collection('users').doc(caller.uid);
            const callerSnap = await tx.get(callerRef);
            const callerData = callerSnap.data() as Record<string, unknown> | undefined;
            const requestedTechnicianId = typeof body.staff?.assignedTechnician === 'string'
                ? body.staff.assignedTechnician.trim()
                : '';
            let assignedTechnicianName = '';

            if (requestedTechnicianId) {
                const technicianSnap = await tx.get(db.collection('users').doc(requestedTechnicianId));
                const technicianData = technicianSnap.data() as Record<string, unknown> | undefined;
                if (!technicianSnap.exists || !isTechnicianUser(technicianData)) {
                    throw new Error('KTV được chọn không tồn tại hoặc không có quyền kỹ thuật viên.');
                }
                assignedTechnicianName = typeof technicianData?.displayName === 'string'
                    ? technicianData.displayName
                    : 'Kỹ thuật viên';
            }

            const estimatedReturnAt = parseClientTimestamp(body.timing?.estimatedReturnAt);
            const paymentHistory = normalizePaymentHistory(body.paymentHistory);
            const safeBody = { ...body };
            delete safeBody.createdAt;
            delete safeBody.updatedAt;
            delete safeBody.status;
            delete safeBody.statusTimeline;
            delete safeBody.version;
            delete safeBody.pendingTechnicianTransfer;
            delete safeBody.paymentHistory;
            if (paymentHistory) {
                safeBody.paymentHistory = paymentHistory;
            }

            // Ép trạng thái về entry node
            const finalData = {
                ...safeBody,
                staff: {
                    createdBy: caller.uid,
                    createdByName: typeof callerData?.displayName === 'string' ? callerData.displayName : 'Nhân viên',
                    ...(requestedTechnicianId ? {
                        assignedTechnician: requestedTechnicianId,
                        assignedTechnicianName,
                    } : {}),
                },
                status: entryNode.id,
                statusTimeline: [{
                    eventType: 'status_transition',
                    status: entryNode.id,
                    toStatus: entryNode.id,
                    actorId: caller.uid,
                    actorName: typeof callerData?.displayName === 'string' ? callerData.displayName : 'Nhân viên',
                    actorRole: caller.role,
                    source: 'repairs',
                    timestamp: Date.now(),
                }],
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                timing: {
                    ...(estimatedReturnAt ? { estimatedReturnAt } : {}),
                    receivedAt: FieldValue.serverTimestamp(),
                },
                version: 1,
            };

            const ticketAllocation = await reserveSequentialDocumentId(tx, db, {
                collectionName: 'repairs',
                prefix: body.ticketType === 'warranty' ? 'BH' : 'SC',
            });
            const newTicketRef = ticketAllocation.ref;
            ticketAllocation.commitCounter();
            tx.set(newTicketRef, finalData);
            if (body.ticketType !== 'warranty' && paymentHistory) {
                const depositRevenue = paymentHistory.reduce((sum, entry) => {
                    return entry.type === 'refund' ? sum - entry.amount : sum + entry.amount;
                }, 0);
                if (depositRevenue !== 0) {
                    incrementRevenueAggregates(tx, db, { repairRevenue: depositRevenue });
                }
            }

            return { id: ticketAllocation.id, status: entryNode.id };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Create ticket API error:', error);
        const message = error instanceof Error ? error.message : 'Không thể tạo phiếu sửa chữa.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
