import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { loadRepairWorkflow } from '@/lib/repairWorkflowServer';
import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { isTechnicianUser } from '@/lib/repairAccess';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';
import { getE2ERunMetadata } from '@/lib/e2eRunMetadata';
import { buildSafeRepairCreateBody, normalizeInitialRepairParts, normalizeRepairPaymentHistory, parseRepairClientTimestamp } from '@/lib/repairCreateInput';
import { getRepairIssueLaborCost } from '@/lib/repairIssuePricing';
import type { RepairIssue } from '@/lib/types';

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
            const initialParts = normalizeInitialRepairParts(body.initialParts);
            const safeBody = buildSafeRepairCreateBody(body, paymentHistory);
            const issues = Array.isArray(safeBody.issues) ? safeBody.issues as RepairIssue[] : [];
            const issueIds = new Set(issues.map(issue => String(issue.id || '').trim()).filter(Boolean));
            for (const part of initialParts) {
                if (!issueIds.has(part.issueId)) {
                    throw new Error('Linh kiện ban đầu phải được gắn với một lỗi có trên phiếu.');
                }
            }

            const productRefs = [...new Set(initialParts.map(part => part.productId))].map(productId => db.collection('products').doc(productId));
            const productSnaps = productRefs.length > 0 ? await tx.getAll(...productRefs) : [];
            const products = new Map(productSnaps.map(snapshot => [snapshot.id, snapshot]));
            const heldByProduct = new Map<string, number>();
            const storedParts = initialParts.map(part => {
                const productSnap = products.get(part.productId);
                if (!productSnap?.exists) throw new Error(`Linh kiện ${part.productId} không còn tồn tại.`);
                const product = productSnap.data() || {};
                const stock = Math.max(0, Number(product.stock) || 0);
                const held = heldByProduct.has(part.productId)
                    ? heldByProduct.get(part.productId)!
                    : Math.max(0, Number(product.held) || 0);
                if (stock - held < part.quantity) {
                    throw new Error(`Linh kiện ${String(product.name || part.productId)} không đủ tồn kho khả dụng (Có: ${stock - held}, Cần: ${part.quantity}).`);
                }
                heldByProduct.set(part.productId, held + part.quantity);
                return {
                    partLineId: randomUUID(),
                    issueId: part.issueId,
                    productId: part.productId,
                    productName: String(product.name || 'Linh kiện'),
                    quantity: part.quantity,
                    reservedQuantity: part.quantity,
                    status: 'selected' as const,
                    quality: String(product.quality || ''),
                    partType: String(product.partType || ''),
                    warrantyPolicyId: String(product.warrantyPolicyId || ''),
                    unitPriceAtUse: Number(product.price_promo) || Number(product.price_original) || 0,
                    unitCostAtUse: Number(product.costPrice) || 0,
                    priceConfirmedAt: new Date(),
                };
            });
            const currentPayment = (safeBody.payment && typeof safeBody.payment === 'object'
                ? safeBody.payment
                : {}) as Record<string, unknown>;
            const partsCost = storedParts.reduce((total, part) => total + part.unitPriceAtUse * part.quantity, 0);
            const laborCost = getRepairIssueLaborCost(issues, storedParts, Number(currentPayment.laborCost) || 0);
            const additionalFees = Math.max(0, Number(currentPayment.additionalFees) || 0);
            const discountAmount = Math.max(0, Number(currentPayment.discountAmount) || 0);
            const payment = {
                ...currentPayment,
                partsCost,
                laborCost,
                additionalFees,
                discountAmount,
                amount: Math.max(0, partsCost + laborCost + additionalFees - discountAmount),
            };

            // Ép trạng thái về entry node
            const finalData = {
                ...e2eMetadata,
                ...safeBody,
                ...(storedParts.length > 0 ? {
                    parts: storedParts,
                    partsLockedAt: FieldValue.serverTimestamp(),
                } : {}),
                payment,
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
            for (const [productId, held] of heldByProduct) {
                tx.update(db.collection('products').doc(productId), { held });
            }
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
