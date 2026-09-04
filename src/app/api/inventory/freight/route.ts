import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorStatus, withApi } from '@/lib/api/handler';
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
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';

const ACTIVE_SHIFT_LOCK_COLLECTION = 'system_counters';
const ACTIVE_SHIFT_LOCK_ID = 'active_cashier_shift';

function readText(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function readPositiveAmount(value: unknown) {
    const amount = Math.round(Number(value) || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Phí ship phải lớn hơn 0.');
    }
    return amount;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Không thể ghi nhận phí ship.';
}

/** Cash-only supplier freight paid before stock arrives. */
export const POST = withApi({
    name: 'inventory/freight',
    onError: (error, context) => context.error(errorMessage(error), getApiErrorStatus(error, 400)),
}, async (request: NextRequest, context) => {
    const caller = await requirePermission(request, 'manage_inventory');
    await requirePermission(request, 'manage_cashier_expenses');
    const body = await context.readJson<Record<string, unknown>>(request);
    const receiptId = readText(body.receiptId, 160);
    const idempotencyKey = readText(body.idempotencyKey, 160);
    const amount = readPositiveAmount(body.amount);
    const carrierName = readText(body.carrierName, 120);
    const trackingNumber = readText(body.trackingNumber, 120);
    const note = readText(body.note, 500);
    if (!receiptId || !idempotencyKey) {
        return context.error('Thiếu mã phiếu nhập hoặc mã chống ghi trùng.', 400);
    }

    const db = getAdminDb();
    const result = await db.runTransaction(async (tx) => {
        const receiptRef = db.collection('import_receipts').doc(receiptId);
        const operationRef = db.collection('operation_requests').doc(idempotencyKey);
        const lockRef = db.collection(ACTIVE_SHIFT_LOCK_COLLECTION).doc(ACTIVE_SHIFT_LOCK_ID);
        const [receiptSnap, operationSnap, lockSnap] = await tx.getAll(receiptRef, operationRef, lockRef);

        if (operationSnap.exists) {
            const operation = operationSnap.data() || {};
            if (operation.status === 'completed' && operation.type === 'inventory_freight' && operation.referenceId === receiptId) {
                return { success: true, fromCache: true, freightExpenseId: String(operation.freightExpenseId || '') };
            }
            throw new Error('Mã chống ghi trùng đã được dùng cho thao tác khác.');
        }
        if (!receiptSnap.exists) throw new Error('Phiếu nhập không tồn tại.');
        if (receiptSnap.data()?.status !== 'ordered') {
            throw new Error('Chỉ được chi phí ship cho phiếu đang ở trạng thái đã đặt hàng.');
        }

        const activeShiftId = readText(lockSnap.data()?.activeShiftId, 160);
        if (!activeShiftId) throw new Error('Vui lòng mở ca thu ngân trước khi chi tiền mặt.');
        const shiftRef = db.collection('cashier_shifts').doc(activeShiftId);
        const shiftSnap = await tx.get(shiftRef);
        if (!shiftSnap.exists || shiftSnap.data()?.status !== 'open') {
            throw new Error('Ca thu ngân đang mở không hợp lệ. Vui lòng tải lại POS.');
        }
        const shiftData = shiftSnap.data() || {};
        assertCashierShiftExpenseActor(shiftData, caller.uid);
        const tallyTotals = Number(shiftData.tallyVersion) >= 1
            ? await readCashierShiftTallyTotals(tx, db, activeShiftId)
            : {
                cashSalesAmount: Number(shiftData.cashSalesAmount) || 0,
                cashExpenseAmount: Number(shiftData.cashExpenseAmount) || 0,
            };
        await readCashierShiftCashGuard(tx, db, activeShiftId);
        assertCashierShiftHasSufficientCash(
            getCashierShiftAvailableCash(shiftData.openingCashAmount, tallyTotals),
            amount,
        );

        const freightAllocation = await reserveSequentialDocumentId(tx, db, {
            collectionName: 'inventory_freight_expenses',
            prefix: 'VCH',
        });

        const createdByName = caller.displayName || caller.name || caller.uid;
        tx.set(freightAllocation.ref, {
            importReceiptId: receiptId,
            amount,
            paymentMethod: 'cash',
            paymentSource: 'cashier_shift',
            cashierShiftId: activeShiftId,
            status: 'pending_allocation',
            ...(carrierName ? { carrierName } : {}),
            ...(trackingNumber ? { trackingNumber } : {}),
            ...(note ? { note } : {}),
            createdBy: caller.uid,
            createdByName,
            createdAt: FieldValue.serverTimestamp(),
        });
        queueCashierShiftTally(tx, db, {
            shiftId: activeShiftId,
            operationKey: `freight:${idempotencyKey}`,
            orderId: receiptId,
            paymentMethod: 'CASH',
            cashAmount: amount,
            direction: 'expense',
            movementType: 'inventory_freight',
            referenceType: 'import_receipt',
            referenceId: receiptId,
            note: note || `Phí ship hàng về phiếu ${receiptId}`,
            actorId: caller.uid,
        });
        queueCashierShiftCashExpenseGuard(tx, db, {
            shiftId: activeShiftId,
            operationKey: `freight:${idempotencyKey}`,
            actorId: caller.uid,
            amount,
        });
        tx.update(receiptRef, {
            freightPaidAmount: FieldValue.increment(amount),
            updatedAt: FieldValue.serverTimestamp(),
        });
        incrementRevenueAggregates(tx, db, {
            shippingExpense: amount,
            cashExpenses: amount,
        });
        freightAllocation.commitCounter();
        tx.set(operationRef, {
            status: 'completed',
            type: 'inventory_freight',
            referenceId: receiptId,
            freightExpenseId: freightAllocation.id,
            completedAt: FieldValue.serverTimestamp(),
        });

        return { success: true, freightExpenseId: freightAllocation.id, cashierShiftId: activeShiftId };
    });

    return context.json(result);
});
