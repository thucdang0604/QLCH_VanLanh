import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import {
    assertCashierShiftExpenseActor,
    assertCashierShiftHasSufficientCash,
    getCashierShiftAvailableCash,
    queueCashierShiftCashExpenseGuard,
    queueCashierShiftTally,
    readCashierShiftCashGuard,
    readCashierShiftTallyTotals,
} from '@/lib/cashierShiftTallyServer';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { loadRepairWorkflow, requireWorkflowNode, workflowNodeHasFeature } from '@/lib/repairWorkflowServer';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';

const ACTIVE_SHIFT_LOCK_COLLECTION = 'system_counters';
const ACTIVE_SHIFT_LOCK_ID = 'active_cashier_shift';

function readText(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function readPositiveAmount(value: unknown) {
    const amount = Math.round(Number(value) || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Phí ship phải lớn hơn 0.');
    return amount;
}

function readOptionalNonNegativeAmount(value: unknown) {
    const amount = Math.round(Number(value) || 0);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Phí ship không hợp lệ.');
    return amount;
}

function readPaymentMethod(value: unknown) {
    const method = readText(value, 12).toUpperCase();
    if (method === 'CASH' || method === 'BANK') return method;
    throw new Error('Chỉ hỗ trợ tiền mặt POS hoặc chuyển khoản công ty.');
}

function readSettlementType(value: unknown) {
    const settlementType = readText(value, 24);
    if (settlementType === 'customer_paid' || settlementType === 'shop_paid') return settlementType;
    throw new Error('Vui lòng chọn khách đã thanh toán hoặc shop chi ship nhận máy.');
}

/** Records the cost of a customer shipping a device to the shop before intake. */
export const POST = withApi({
    name: 'repairs/inbound-shipping',
    onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error, 400)),
}, async (request: NextRequest, context) => {
    const caller = await requirePermission(request, 'manage_repairs');
    const body = await context.readJson<Record<string, unknown>>(request);
    const repairTicketId = readText(body.repairTicketId, 160);
    const idempotencyKey = readText(body.idempotencyKey, 160);
    const settlementType = readSettlementType(body.settlementType);
    const amount = settlementType === 'shop_paid'
        ? readPositiveAmount(body.amount)
        : readOptionalNonNegativeAmount(body.amount);
    const paymentMethod = settlementType === 'shop_paid' ? readPaymentMethod(body.paymentMethod) : 'CUSTOMER' as const;
    if (settlementType === 'shop_paid' && paymentMethod === 'CASH') {
        await requirePermission(request, 'manage_cashier_expenses');
    }
    const carrierName = readText(body.carrierName, 120);
    const trackingNumber = readText(body.trackingNumber, 120);
    const note = readText(body.note, 500);
    if (!repairTicketId || !idempotencyKey) {
        return context.error('Thiếu mã phiếu sửa chữa hoặc mã chống ghi trùng.', 400);
    }

    const db = getAdminDb();
    const result = await db.runTransaction(async tx => {
        const ticketRef = db.collection('repairs').doc(repairTicketId);
        const operationRef = db.collection('operation_requests').doc(idempotencyKey);
        const lockRef = db.collection(ACTIVE_SHIFT_LOCK_COLLECTION).doc(ACTIVE_SHIFT_LOCK_ID);
        const [ticketSnap, operationSnap, lockSnap] = await tx.getAll(ticketRef, operationRef, lockRef);

        if (operationSnap.exists) {
            const operation = operationSnap.data() || {};
            if (operation.status === 'completed' && operation.type === 'repair_inbound_shipping' && operation.referenceId === repairTicketId) {
                return { success: true, fromCache: true, expenseId: String(operation.expenseId || '') };
            }
            throw new Error('Mã chống ghi trùng đã được dùng cho thao tác khác.');
        }
        if (!ticketSnap.exists) throw new Error('Phiếu sửa chữa không tồn tại.');
        const ticket = ticketSnap.data() || {};
        if (ticket.ticketType === 'warranty') throw new Error('Không thể chi ship nhận máy cho phiếu bảo hành.');
        if (ticket.appointmentIntakeMethod !== 'send_to_store') {
            throw new Error('Chỉ phiếu khách gửi máy mới được ghi nhận phí ship nhận máy.');
        }
        const workflow = await loadRepairWorkflow(tx, db, ticket);
        const currentNode = requireWorkflowNode(workflow, String(ticket.status || ''));
        if (currentNode.isTerminal) {
            throw new Error('Không thể chi ship nhận máy cho phiếu đã kết thúc hoặc đã hủy.');
        }
        if (!workflowNodeHasFeature(currentNode, 'requireInboundArrival')) {
            throw new Error('Bước hiện tại trong workflow chưa bật xác nhận máy gửi đến shop.');
        }

        const existingInboundShipping = (ticket.inboundShipping && typeof ticket.inboundShipping === 'object')
            ? ticket.inboundShipping as Record<string, unknown>
            : {};
        if (existingInboundShipping.status === 'received') {
            throw new Error('Máy đã được xác nhận đến shop. Vui lòng cập nhật thông tin tiếp nhận, không ghi nhận phí ship lần nữa.');
        }

        let cashierShiftId = '';
        if (settlementType === 'shop_paid' && paymentMethod === 'CASH') {
            cashierShiftId = readText(lockSnap.data()?.activeShiftId, 160);
            if (!cashierShiftId) throw new Error('Vui lòng mở ca thu ngân trước khi chi tiền mặt.');
            const shiftSnap = await tx.get(db.collection('cashier_shifts').doc(cashierShiftId));
            if (!shiftSnap.exists || shiftSnap.data()?.status !== 'open') {
                throw new Error('Ca thu ngân đang mở không hợp lệ. Vui lòng tải lại POS.');
            }
            const shift = shiftSnap.data() || {};
            assertCashierShiftExpenseActor(shift, caller.uid);
            const totals = Number(shift.tallyVersion) >= 1
                ? await readCashierShiftTallyTotals(tx, db, cashierShiftId)
                : {
                    cashSalesAmount: Number(shift.cashSalesAmount) || 0,
                    cashExpenseAmount: Number(shift.cashExpenseAmount) || 0,
                };
            await readCashierShiftCashGuard(tx, db, cashierShiftId);
            assertCashierShiftHasSufficientCash(getCashierShiftAvailableCash(shift.openingCashAmount, totals), amount);
        }

        const actorName = caller.displayName || caller.name || caller.uid;
        const paidAmount = settlementType === 'shop_paid' ? amount : Math.max(0, Number(existingInboundShipping.paidAmount) || 0);
        const customerPaidAmount = settlementType === 'customer_paid' ? amount : 0;
        const expenseAllocation = settlementType === 'shop_paid'
            ? await reserveSequentialDocumentId(tx, db, { collectionName: 'expenses', prefix: 'CP' })
            : null;

        if (expenseAllocation) {
            expenseAllocation.commitCounter();
            tx.set(expenseAllocation.ref, {
                category: 'shipping',
                shippingDirection: 'inbound',
                description: `Phí ship nhận máy phiếu sửa #${repairTicketId.slice(-6)}`,
                amount,
                paymentMethod,
                repairTicketId,
                ...(paymentMethod === 'CASH' ? { cashierShiftId } : {}),
                ...(carrierName ? { carrierName } : {}),
                ...(trackingNumber ? { trackingNumber } : {}),
                ...(note ? { note } : {}),
                createdBy: caller.uid,
                createdByName: actorName,
                paidBy: caller.uid,
                paidByName: actorName,
                date: FieldValue.serverTimestamp(),
                createdAt: FieldValue.serverTimestamp(),
            });
        }
        tx.update(ticketRef, {
            inboundShipping: {
                ...existingInboundShipping,
                status: 'received',
                settlementType,
                paidAmount,
                customerPaidAmount,
                ...(expenseAllocation ? { lastExpenseId: expenseAllocation.id } : {}),
                lastPaymentMethod: paymentMethod,
                lastPaidBy: caller.uid,
                lastPaidByName: actorName,
                receivedAt: FieldValue.serverTimestamp(),
                receivedBy: caller.uid,
                receivedByName: actorName,
                ...(carrierName ? { carrierName } : {}),
                ...(trackingNumber ? { trackingNumber } : {}),
                ...(note ? { note } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            },
            timing: {
                ...(ticket.timing && typeof ticket.timing === 'object' ? ticket.timing : {}),
                receivedAt: FieldValue.serverTimestamp(),
            },
            statusTimeline: FieldValue.arrayUnion({
                eventType: 'inbound_device_received',
                status: typeof ticket.status === 'string' ? ticket.status : '',
                timestamp: Date.now(),
                actorId: caller.uid,
                actorName,
                source: 'repairs',
                note: settlementType === 'customer_paid'
                    ? 'Khách đã thanh toán phí ship; máy đã đến shop, chờ cập nhật thông tin tiếp nhận'
                    : `Đã chi ship nhận máy (${paymentMethod}); máy đã đến shop, chờ cập nhật thông tin tiếp nhận`,
            }),
            updatedAt: FieldValue.serverTimestamp(),
            version: (Number(ticket.version) || 0) + 1,
        });
        if (settlementType === 'shop_paid' && paymentMethod === 'CASH') {
            queueCashierShiftTally(tx, db, {
                shiftId: cashierShiftId,
                operationKey: `repair-inbound-shipping:${idempotencyKey}`,
                orderId: repairTicketId,
                paymentMethod: 'CASH',
                cashAmount: amount,
                direction: 'expense',
                movementType: 'repair_inbound_shipping',
                referenceType: 'repair_ticket',
                referenceId: repairTicketId,
                note: note || `Phí ship nhận máy phiếu ${repairTicketId}`,
                actorId: caller.uid,
            });
            queueCashierShiftCashExpenseGuard(tx, db, {
                shiftId: cashierShiftId,
                operationKey: `repair-inbound-shipping:${idempotencyKey}`,
                actorId: caller.uid,
                amount,
            });
        }
        if (settlementType === 'shop_paid') {
            incrementRevenueAggregates(tx, db, {
                shippingExpense: amount,
                ...(paymentMethod === 'CASH' ? { cashExpenses: amount } : { bankExpenses: amount }),
            });
        }
        tx.set(operationRef, {
            status: 'completed',
            type: 'repair_inbound_shipping',
            referenceId: repairTicketId,
            expenseId: expenseAllocation?.id || null,
            actorId: caller.uid,
            completedAt: FieldValue.serverTimestamp(),
        });
        return {
            success: true,
            expenseId: expenseAllocation?.id || null,
            cashierShiftId: cashierShiftId || null,
            inboundShipping: { status: 'received', settlementType, paidAmount, customerPaidAmount, lastPaymentMethod: paymentMethod },
        };
    });
    return context.json(result);
});
