import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { loadRepairWorkflow } from '@/lib/repairWorkflowServer';
import { FieldValue } from 'firebase-admin/firestore';
import { isTechnicianUser } from '@/lib/repairAccess';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';
import { getE2ERunMetadata } from '@/lib/e2eRunMetadata';
import { buildSafeRepairCreateBody, normalizeRepairPaymentHistory, parseRepairClientTimestamp } from '@/lib/repairCreateInput';

type CreateRepairBody = Record<string, unknown> & {
    ticketType?: 'repair' | 'warranty';
    timing?: Record<string, unknown>;
    staff?: Record<string, unknown>;
};

export const POST = withApi({
    name: 'repairs/create',
    onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error, 400)),
}, async (request: NextRequest, context) => {
        const caller = await requirePermission(request, 'manage_repairs');
        const e2eMetadata = getE2ERunMetadata(request);
        const body = await context.readJson<CreateRepairBody>(request);

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

            const estimatedReturnAt = parseRepairClientTimestamp(body.timing?.estimatedReturnAt);
            const paymentHistory = normalizeRepairPaymentHistory(body.paymentHistory);
            const safeBody = buildSafeRepairCreateBody(body, paymentHistory);

            // Ép trạng thái về entry node
            const finalData = {
                ...e2eMetadata,
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

        return context.json(result);
});
