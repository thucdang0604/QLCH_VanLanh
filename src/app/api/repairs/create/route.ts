import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { loadRepairWorkflowDefinition } from '@/lib/repairWorkflowServer';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash, randomUUID } from 'crypto';
import { isTechnicianUser } from '@/lib/repairAccess';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';
import { getE2ERunMetadata } from '@/lib/e2eRunMetadata';
import { buildSafeRepairCreateBody, normalizeInitialRepairPartRequests, normalizeInitialRepairParts, normalizeRepairPaymentHistory, parseRepairClientTimestamp } from '@/lib/repairCreateInput';
import { getRepairIssueLaborCost } from '@/lib/repairIssuePricing';
import type { RepairIssue } from '@/lib/types';
import { syncRepairPartRequestDraft, type RepairPartRequestDraftItem } from '@/lib/repairPartRequestDraft';

type CreateRepairBody = Record<string, unknown> & {
    ticketType?: 'repair' | 'warranty';
    timing?: Record<string, unknown>;
    staff?: Record<string, unknown>;
    idempotencyKey?: string;
};

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
        .sort()
        .map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
        .join(',')}}`;
}

function createPayloadSignature(body: CreateRepairBody): string {
    const payload = { ...body } as Record<string, unknown>;
    for (const field of ['idempotencyKey', 'createdAt', 'updatedAt', 'status', 'statusTimeline', 'version']) {
        delete payload[field];
    }

    if (payload.timing && typeof payload.timing === 'object' && !Array.isArray(payload.timing)) {
        const timing = { ...payload.timing as Record<string, unknown> };
        delete timing.receivedAt;
        payload.timing = timing;
    }
    if (Array.isArray(payload.paymentHistory)) {
        payload.paymentHistory = payload.paymentHistory.map(entry => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
            const payment = { ...entry as Record<string, unknown> };
            delete payment.timestamp;
            return payment;
        });
    }

    return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export const POST = withApi({
    name: 'repairs/create',
    onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error, 400)),
}, async (request: NextRequest, context) => {
        const caller = await requirePermission(request, 'manage_repairs');
        const e2eMetadata = getE2ERunMetadata(request);
        const body = await context.readJson<CreateRepairBody>(request);
        const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
            return context.error('Missing or invalid idempotencyKey');
        }
        const payloadSignature = createPayloadSignature(body);

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            const operationRef = db.collection('operation_requests').doc(idempotencyKey);
            const operationSnap = await tx.get(operationRef);
            if (operationSnap.exists) {
                const operation = operationSnap.data();
                if (
                    operation?.status === 'completed'
                    && operation.type === 'repair_create'
                    && operation.actorId === caller.uid
                    && operation.payloadSignature === payloadSignature
                    && typeof operation.referenceId === 'string'
                    && typeof operation.targetStatus === 'string'
                ) {
                    return {
                        id: operation.referenceId,
                        status: operation.targetStatus,
                        fromCache: true,
                    };
                }
                throw new Error('Idempotency key da duoc dung cho thao tac khac.');
            }

            const workflowDefinition = await loadRepairWorkflowDefinition(tx, db, { ticketType: body.ticketType });
            const entryNode = workflowDefinition.entryNode;

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
            const initialPartRequests = normalizeInitialRepairPartRequests(body.initialPartRequests);
            const safeBody = buildSafeRepairCreateBody(body, paymentHistory);
            const issues = Array.isArray(safeBody.issues) ? safeBody.issues as RepairIssue[] : [];
            const issueIds = new Set(issues.map(issue => String(issue.id || '').trim()).filter(Boolean));
            for (const part of initialParts) {
                if (!issueIds.has(part.issueId)) {
                    throw new Error('Linh kiện ban đầu phải được gắn với một lỗi có trên phiếu.');
                }
            }
            for (const part of initialPartRequests) {
                if (!issueIds.has(part.issueId)) {
                    throw new Error('Đề xuất linh kiện phải được gắn với một lỗi có trên phiếu.');
                }
            }

            const productRefs = [...new Set([
                ...initialParts.map(part => part.productId),
                ...initialPartRequests.map(part => part.productId).filter(Boolean),
            ])].map(productId => db.collection('products').doc(productId));
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
            const storedRequestedParts = initialPartRequests.map(part => {
                const product = part.productId ? products.get(part.productId)?.data() : null;
                if (part.productId && !product) throw new Error(`Linh kiện ${part.productId} không còn tồn tại.`);
                return {
                    partLineId: randomUUID(),
                    issueId: part.issueId,
                    productId: part.productId,
                    productName: String(product?.name || part.customName || 'Linh kiện yêu cầu'),
                    quantity: part.quantity,
                    quality: part.quality || String(product?.quality || ''),
                    status: 'requested' as const,
                };
            });
            const allParts = [...storedParts, ...storedRequestedParts];
            const currentPayment = (safeBody.payment && typeof safeBody.payment === 'object'
                ? safeBody.payment
                : {}) as Record<string, unknown>;
            const partsCost = storedParts.reduce((total, part) => total + part.unitPriceAtUse * part.quantity, 0);
            const laborCost = getRepairIssueLaborCost(issues, allParts, Number(currentPayment.laborCost) || 0);
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
                ...(allParts.length > 0 ? {
                    parts: allParts,
                } : {}),
                ...(storedParts.length > 0 ? {
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
                }, ...storedRequestedParts.map(part => ({
                    eventType: 'part_requested',
                    status: entryNode.id,
                    actorId: caller.uid,
                    actorName: typeof callerData?.displayName === 'string' ? callerData.displayName : 'Nhân viên',
                    partLineId: part.partLineId,
                    partName: part.productName,
                    source: 'repairs',
                    timestamp: Date.now(),
                }))],
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                timing: {
                    ...(estimatedReturnAt ? { estimatedReturnAt } : {}),
                    receivedAt: FieldValue.serverTimestamp(),
                },
                version: 1,
                // The short revision preserves audit context without duplicating
                // a full workflow snapshot into every ticket document.
                workflowRevision: workflowDefinition.revision,
            };

            const ticketAllocation = await reserveSequentialDocumentId(tx, db, {
                collectionName: 'repairs',
                prefix: body.ticketType === 'warranty' ? 'BH' : 'SC',
            });
            const newTicketRef = ticketAllocation.ref;
            const requestDraftItems: RepairPartRequestDraftItem[] = storedRequestedParts.map(part => ({
                partLineId: part.partLineId,
                productId: part.productId,
                productName: part.productName,
                quantity: part.quantity,
                quality: part.quality,
                importPrice: 0,
                ticketId: ticketAllocation.id,
                requestKey: `${ticketAllocation.id}:${part.partLineId}`,
            }));
            await syncRepairPartRequestDraft({
                tx,
                db,
                actorId: caller.uid,
                requestedItems: requestDraftItems,
            });
            ticketAllocation.commitCounter();
            tx.set(newTicketRef, finalData);
            tx.set(operationRef, {
                ...e2eMetadata,
                status: 'completed',
                completedAt: FieldValue.serverTimestamp(),
                type: 'repair_create',
                referenceId: ticketAllocation.id,
                targetStatus: entryNode.id,
                actorId: caller.uid,
                payloadSignature,
            });
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
