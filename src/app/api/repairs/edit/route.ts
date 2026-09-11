import { createHash, randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import type { RepairTicket } from '@/lib/types';
import { loadRepairWorkflow, requireWorkflowNode } from '@/lib/repairWorkflowServer';
import {
    canSelectInitialPartsDuringInboundIntake,
    canSelectInitialPartsWhenEditingRepair,
    getInboundIntakeDetailsError,
    requiresInboundArrival,
} from '@/lib/repairInboundIntake';
import { getRepairIssueLaborCost } from '@/lib/repairIssuePricing';
import { normalizeInitialRepairPartRequests, normalizeInitialRepairParts } from '@/lib/repairCreateInput';
import { syncRepairPartRequestDraft, type RepairPartRequestDraftItem } from '@/lib/repairPartRequestDraft';

const PAYMENT_SIGNATURE_FIELDS = ['deposit', 'quote', 'giftDiscount', 'additionalFees', 'laborCost', 'paymentMethod'] as const;
type RepairEditRequestBody = {
    ticketId?: string;
    ticketVersion?: number;
    idempotencyKey?: string;
    paymentData?: Record<string, unknown>;
    profileData?: Record<string, unknown>;
    initialParts?: unknown;
    initialPartRequests?: unknown;
};

function stableSignature(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value || {})).digest('hex');
}

function paymentPayloadSignature(paymentData: Record<string, unknown>, profileData: Record<string, unknown>, initialParts: unknown, initialPartRequests: unknown) {
    const normalizedPayment = PAYMENT_SIGNATURE_FIELDS.reduce((acc, field) => {
        if (field in paymentData) acc[field] = paymentData[field];
        return acc;
    }, {} as Record<string, unknown>);
    return stableSignature({ payment: normalizedPayment, profile: profileData, initialParts, initialPartRequests });
}

function parseDate(value: unknown) {
    if (!value) return null;
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return Timestamp.fromDate(date);
    }
    return null;
}

function asRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeCustomerName(value: unknown) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN') : '';
}

function normalizeCustomerPhone(value: unknown) {
    const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
    return digits.startsWith('84') ? `0${digits.slice(2)}` : digits;
}

export const POST = withApi({
    name: 'repairs/edit',
    onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error, 400)),
}, async (request: NextRequest, context) => {
        const caller = await requirePermission(request, 'manage_repairs');
        const body = await context.readJson<RepairEditRequestBody>(request);
        const { ticketId, ticketVersion, idempotencyKey } = body;
        const paymentData = (body.paymentData || {}) as Record<string, unknown>;
        const profileData = (body.profileData || {}) as Record<string, unknown>;
        const initialParts = normalizeInitialRepairParts(body.initialParts);
        const initialPartRequests = normalizeInitialRepairPartRequests(body.initialPartRequests);

        if (!ticketId || !profileData || !paymentData) {
            return context.error('Missing parameters');
        }

        const payloadSignature = paymentPayloadSignature(paymentData, profileData, initialParts, initialPartRequests);
        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed') {
                        if (
                            data.type !== 'repair_edit' ||
                            data.referenceId !== ticketId ||
                            data.actorId !== caller.uid ||
                            data.payloadSignature !== payloadSignature
                        ) {
                            throw new Error('Idempotency key da duoc dung cho thao tac khac.');
                        }
                        return { success: true, fromCache: true };
                    }
                }
            }

            const ticketRef = db.collection('repairs').doc(String(ticketId));
            const ticketSnap = await tx.get(ticketRef);
            if (!ticketSnap.exists) {
                throw new Error('Phieu sua chua khong ton tai.');
            }

            const ticket = ticketSnap.data() as RepairTicket;
            if (ticket.version !== undefined && ticket.version !== ticketVersion) {
                throw new Error('Du lieu da thay doi. Vui long tai lai phieu truoc khi luu.');
            }
            if (ticket.payment?.status === 'paid' || ticket.payment?.status === 'refunded') {
                throw new Error('Khong the sua chi phi khi phieu da thanh toan hoac hoan tien.');
            }

            const workflow = await loadRepairWorkflow(tx, db, ticket);
            const currentNode = requireWorkflowNode(workflow, ticket.status);
            if (currentNode.isTerminal) {
                throw new Error(`Khong the sua phieu o trang thai ket thuc (${ticket.status}).`);
            }

            const existingInboundShipping = ticket.inboundShipping;
            const inboundFreightWasRecorded = (Number(existingInboundShipping?.paidAmount) || 0) > 0
                || existingInboundShipping?.status === 'received';
            if (ticket.appointmentIntakeMethod === 'send_to_store' && inboundFreightWasRecorded) {
                if (profileData.appointmentIntakeMethod !== 'send_to_store') {
                    throw new Error('Không thể đổi cách nhận máy sau khi đã ghi nhận phí ship nhận máy.');
                }
                const existingCustomer = asRecord(ticket.customer);
                const requestedCustomer = asRecord(profileData.customer);
                const requestedName = normalizeCustomerName(requestedCustomer.name || existingCustomer.name);
                const requestedPhone = normalizeCustomerPhone(requestedCustomer.phone || existingCustomer.phone);
                if (
                    requestedName !== normalizeCustomerName(existingCustomer.name)
                    || requestedPhone !== normalizeCustomerPhone(existingCustomer.phone)
                ) {
                    throw new Error('Không thể đổi khách hàng sau khi đã ghi nhận phí ship nhận máy.');
                }
            }

            const updatedIssues = Array.isArray(profileData.issues) ? profileData.issues as RepairTicket['issues'] : ticket.issues;
            const updatedInboundTicket = {
                ...ticket,
                customer: profileData.customer || ticket.customer,
                deviceInfo: profileData.deviceInfo || ticket.deviceInfo,
                issue: profileData.issue || ticket.issue || {},
                issues: updatedIssues,
            } as unknown as Record<string, unknown>;
            const inboundArrivalRequired = requiresInboundArrival(ticket, currentNode);
            const canSelectInitialParts = canSelectInitialPartsWhenEditingRepair(ticket, currentNode);
            const shouldCompleteInboundIntake = inboundArrivalRequired
                && canSelectInitialPartsDuringInboundIntake(ticket, currentNode)
                && !getInboundIntakeDetailsError(updatedInboundTicket);

            const hasInitialPartsIntakeAction = initialParts.length > 0 || initialPartRequests.length > 0;
            if (hasInitialPartsIntakeAction && !canSelectInitialParts) {
                throw new Error(inboundArrivalRequired
                    ? 'Chỉ được chọn hoặc đề xuất linh kiện khi hoàn tất tiếp nhận máy khách gửi đến shop.'
                    : 'Trạng thái hiện tại không cho phép chọn hoặc đề xuất linh kiện.');
            }
            if (hasInitialPartsIntakeAction && inboundArrivalRequired && !shouldCompleteInboundIntake) {
                throw new Error(getInboundIntakeDetailsError(updatedInboundTicket) || 'Vui lòng hoàn tất thông tin tiếp nhận trước khi chọn hoặc đề xuất linh kiện.');
            }
            if (hasInitialPartsIntakeAction && (ticket.parts || []).length > 0) {
                throw new Error('Phiếu đã có linh kiện. Hãy dùng thao tác linh kiện của KTV để cập nhật.');
            }

            const issueIds = new Set((updatedIssues || []).map(issue => String(issue.id || '').trim()).filter(Boolean));
            for (const part of initialParts) {
                if (!issueIds.has(part.issueId)) {
                    throw new Error('Linh kiện dự kiến phải được gắn với một lỗi có trên phiếu.');
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
            ])]
                .map(productId => db.collection('products').doc(productId));
            const productSnaps = productRefs.length > 0 ? await tx.getAll(...productRefs) : [];
            const products = new Map(productSnaps.map(snapshot => [snapshot.id, snapshot]));
            const heldByProduct = new Map<string, number>();
            const storedInitialParts = initialParts.map(part => {
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
            const updatedParts = [...(ticket.parts || []), ...storedInitialParts, ...storedRequestedParts];

            const currentPayment = ticket.payment || {} as RepairTicket['payment'];
            const updatedPayment = { ...currentPayment };
            if ('deposit' in paymentData) (updatedPayment as Record<string, unknown>).deposit = Number(paymentData.deposit) || 0;
            if ('quote' in paymentData) (updatedPayment as Record<string, unknown>).quote = Number(paymentData.quote) || 0;
            if ('giftDiscount' in paymentData) updatedPayment.giftDiscount = Number(paymentData.giftDiscount) || 0;
            if ('additionalFees' in paymentData) updatedPayment.additionalFees = Number(paymentData.additionalFees) || 0;
            if (updatedIssues?.length) {
                updatedPayment.laborCost = getRepairIssueLaborCost(updatedIssues, updatedParts, Number(paymentData.laborCost) || Number(updatedPayment.laborCost) || 0);
            } else if ('laborCost' in paymentData) {
                updatedPayment.laborCost = Number(paymentData.laborCost) || 0;
            }
            if ('paymentMethod' in paymentData) (updatedPayment as Record<string, unknown>).paymentMethod = paymentData.paymentMethod;

            if (storedInitialParts.length > 0) {
                updatedPayment.partsCost = storedInitialParts.reduce((total, part) => total + part.unitPriceAtUse * part.quantity, 0);
            }
            const partsCost = updatedPayment.partsCost || 0;
            const laborCost = updatedPayment.laborCost || 0;
            const additionalFees = updatedPayment.additionalFees || 0;
            const discountAmount = updatedPayment.discountAmount || 0;
            updatedPayment.amount = partsCost + laborCost + additionalFees - discountAmount;

            const actorName = caller.displayName || caller.name || caller.uid;
            const statusTimelineEvents = [
                ...storedRequestedParts.map(part => ({
                    eventType: 'part_requested',
                    status: ticket.status,
                    timestamp: Date.now(),
                    actorId: caller.uid,
                    actorName,
                    partLineId: part.partLineId,
                    partName: part.productName,
                    source: 'repairs',
                })),
                ...(shouldCompleteInboundIntake ? [{
                    eventType: 'inbound_device_received',
                    status: ticket.status,
                    timestamp: Date.now(),
                    actorId: caller.uid,
                    actorName,
                    source: 'repairs',
                    note: 'Hoàn tất cập nhật thông tin tiếp nhận sau khi máy đã đến shop',
                }] : []),
            ];
            const requestDraftItems: RepairPartRequestDraftItem[] = storedRequestedParts.map(part => ({
                partLineId: part.partLineId,
                productId: part.productId,
                productName: part.productName,
                quantity: part.quantity,
                quality: part.quality,
                importPrice: 0,
                ticketId: String(ticketId),
                requestKey: `${String(ticketId)}:${part.partLineId}`,
            }));
            await syncRepairPartRequestDraft({
                tx,
                db,
                actorId: caller.uid,
                requestedItems: requestDraftItems,
            });

            const nextVersion = (ticket.version || 0) + 1;
            tx.update(ticketRef, {
                appointmentId: profileData.appointmentId || null,
                appointmentIntakeMethod: profileData.appointmentIntakeMethod || null,
                categoryPath: Array.isArray(profileData.categoryPath) ? profileData.categoryPath : [],
                serviceName: profileData.serviceName || '',
                customer: profileData.customer || ticket.customer,
                deviceInfo: profileData.deviceInfo || ticket.deviceInfo,
                preRepairMedia: Array.isArray(profileData.preRepairMedia) ? profileData.preRepairMedia : [],
                postRepairMedia: Array.isArray(profileData.postRepairMedia) ? profileData.postRepairMedia : [],
                issue: profileData.issue || ticket.issue || {},
                issues: Array.isArray(profileData.issues) ? profileData.issues : null,
                timing: {
                    receivedAt: ticket.timing?.receivedAt || FieldValue.serverTimestamp(),
                    estimatedReturnAt: parseDate(profileData.estimatedReturnAt),
                },
                staff: {
                    createdBy: ticket.staff?.createdBy || caller.uid,
                    createdByName: ticket.staff?.createdByName || 'Admin',
                    assignedTechnician: profileData.assignedTechnician || '',
                    assignedTechnicianName: profileData.assignedTechnicianName || '',
                },
                payment: updatedPayment,
                ...((storedInitialParts.length > 0 || storedRequestedParts.length > 0) ? {
                    parts: updatedParts,
                } : {}),
                ...(storedInitialParts.length > 0 ? {
                    partsLockedAt: FieldValue.serverTimestamp(),
                } : {}),
                ...(shouldCompleteInboundIntake ? {
                    inboundShipping: {
                        ...existingInboundShipping,
                        intakeCompletedAt: FieldValue.serverTimestamp(),
                        intakeCompletedBy: caller.uid,
                        intakeCompletedByName: actorName,
                        updatedAt: FieldValue.serverTimestamp(),
                    },
                } : {}),
                ...(statusTimelineEvents.length > 0 ? {
                    statusTimeline: FieldValue.arrayUnion(...statusTimelineEvents),
                } : {}),
                updatedAt: FieldValue.serverTimestamp(),
                version: nextVersion,
            });

            for (const [productId, held] of heldByProduct) {
                tx.update(db.collection('products').doc(productId), { held });
            }

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'repair_edit',
                    referenceId: ticketId,
                    actorId: caller.uid,
                    payloadSignature,
                });
            }

            return { success: true, version: nextVersion, payment: updatedPayment };
        });

        return context.json(result);
});
