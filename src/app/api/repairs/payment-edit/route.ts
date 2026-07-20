import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';
import type { RepairTicket } from '@/lib/types';
import { loadRepairWorkflow, requireWorkflowNode } from '@/lib/repairWorkflowServer';

const PAYMENT_SIGNATURE_FIELDS = ['deposit', 'quote', 'giftDiscount', 'additionalFees', 'laborCost', 'paymentMethod'] as const;
type PaymentEditRequestBody = {
    ticketId?: string;
    ticketVersion?: number;
    idempotencyKey?: string;
    paymentData?: Record<string, unknown>;
};

function paymentPayloadSignature(paymentData: Record<string, unknown>) {
    const normalized = PAYMENT_SIGNATURE_FIELDS.reduce((acc, field) => {
        if (field in paymentData) acc[field] = paymentData[field];
        return acc;
    }, {} as Record<string, unknown>);
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export const POST = withApi({
    name: 'repairs/payment-edit',
    onError: (error, context) => {
        const message = getApiErrorMessage(error);
        const legacyStatus = /kh(?:\u00f4|\u0103\u00b4)ng|Version/.test(message) ? 400 : 500;
        return context.error(message, getApiErrorStatus(error, legacyStatus));
    },
}, async (request: NextRequest, context) => {
        await requirePermission(request, 'manage_repairs');

        const body = await context.readJson<PaymentEditRequestBody>(request);
        const { ticketId, ticketVersion, idempotencyKey, paymentData } = body;

        if (!ticketId || !paymentData) {
            return context.error('Missing parameters');
        }
        const payloadSignature = paymentPayloadSignature(paymentData);

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed') {
                        if (
                            data.type !== 'repair_payment_edit' ||
                            data.referenceId !== ticketId ||
                            data.payloadSignature !== payloadSignature
                        ) {
                            throw new Error('Idempotency key da duoc dung cho thao tac khac.');
                        }
                        const ticketSnap = await tx.get(db.collection('repairs').doc(ticketId));
                        return { success: true, fromCache: true, payment: ticketSnap.data()?.payment };
                    }
                }
            }

            const ticketRef = db.collection('repairs').doc(ticketId);
            const ticketSnap = await tx.get(ticketRef);

            if (!ticketSnap.exists) {
                throw new Error('Phiếu sửa chữa không tồn tại.');
            }

            const ticket = ticketSnap.data() as RepairTicket;

            if (ticket.version !== undefined && ticket.version !== ticketVersion) {
                throw new Error('Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại trang.');
            }

            if (ticket.payment?.status === 'paid' || ticket.payment?.status === 'refunded') {
                throw new Error(`Không thể sửa chi phí khi phiếu đã thanh toán hoặc hoàn tiền.`);
            }

            const workflow = await loadRepairWorkflow(tx, db, ticket);
            const currentNode = requireWorkflowNode(workflow, ticket.status);
            const isTerminal = !!currentNode.isTerminal;

            if (isTerminal) {
                throw new Error(`Không thể sửa chi phí khi phiếu đã ở trạng thái kết thúc (${ticket.status})`);
            }

            const currentPayment = ticket.payment || {} as RepairTicket['payment'];

            const updatedPayment = { ...currentPayment };

            // Merge allowed fields
            if ('deposit' in paymentData) (updatedPayment as Record<string, unknown>).deposit = Number(paymentData.deposit) || 0;
            if ('quote' in paymentData) (updatedPayment as Record<string, unknown>).quote = Number(paymentData.quote) || 0;
            if ('giftDiscount' in paymentData) updatedPayment.giftDiscount = Number(paymentData.giftDiscount) || 0;
            if ('additionalFees' in paymentData) updatedPayment.additionalFees = Number(paymentData.additionalFees) || 0;
            if ('laborCost' in paymentData) updatedPayment.laborCost = Number(paymentData.laborCost) || 0;
            if ('paymentMethod' in paymentData) (updatedPayment as Record<string, unknown>).paymentMethod = paymentData.paymentMethod;

            // Compute amount
            const partsCost = updatedPayment.partsCost || 0;
            const additionalFees = updatedPayment.additionalFees || 0;
            const discountAmount = updatedPayment.discountAmount || 0; // POS discount if any
            const laborCost = updatedPayment.laborCost || 0;

            updatedPayment.amount = partsCost + laborCost + additionalFees - discountAmount;

            tx.update(ticketRef, {
                payment: updatedPayment,
                version: (ticket.version || 0) + 1,
                updatedAt: FieldValue.serverTimestamp()
            });

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'repair_payment_edit',
                    referenceId: ticketId,
                    payloadSignature
                });
            }

            return { success: true, payment: updatedPayment };
        });

        return context.json(result);
});
