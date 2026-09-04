import { FieldValue, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';

export const CASHIER_SHIFT_TALLY_SHARD_COUNT = 16;

export type CashierShiftTallyTotals = {
    cashSalesAmount: number;
    bankSalesAmount: number;
    otherSalesAmount: number;
    cashExpenseAmount: number;
    /** Cash paid directly to settle the supplier's import receipt, excluding freight. */
    cashInventoryExpenseAmount: number;
    bankExpenseAmount: number;
    otherExpenseAmount: number;
};

type CashierShiftTallyReader = {
    getAll(...documentRefs: DocumentReference[]): Promise<DocumentSnapshot[]>;
};

type CashExpenseMovement = {
    cashAmount?: unknown;
    direction?: unknown;
    movementType?: unknown;
    createdAt?: unknown;
};

export type CashierShiftCashExpenseBreakdown = {
    cashShippingExpenseAmount: number;
    cashShippingExpenseSinceAmount: number;
    hasCashExpenseMovements: boolean;
};

const CASH_SHIPPING_MOVEMENT_TYPES = new Set([
    'inventory_freight',
    'repair_inbound_shipping',
    'repair_shipping',
]);

type CashierShiftGuardReader = {
    get(documentRef: DocumentReference): Promise<DocumentSnapshot>;
};

function asAmount(value: unknown) {
    const amount = Math.round(Number(value) || 0);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function stableHash(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return hash >>> 0;
}

export function getCashierShiftTallyShardId(operationKey: string) {
    return String(stableHash(operationKey) % CASHIER_SHIFT_TALLY_SHARD_COUNT);
}

/**
 * Phân loại phần chi tiền mặt theo sổ movement. Không suy diễn mọi khoản chi
 * không phải nhập hàng là ship; điều đó làm POS và báo cáo doanh thu lệch nhau.
 */
export function getCashierShiftCashExpenseBreakdown(
    movements: CashExpenseMovement[],
    since?: Date,
): CashierShiftCashExpenseBreakdown {
    let cashShippingExpenseAmount = 0;
    let cashShippingExpenseSinceAmount = 0;
    let hasCashExpenseMovements = false;

    for (const movement of movements) {
        if (String(movement.direction || '') !== 'expense') continue;
        const cashAmount = asAmount(movement.cashAmount);
        if (cashAmount <= 0) continue;
        hasCashExpenseMovements = true;
        if (CASH_SHIPPING_MOVEMENT_TYPES.has(String(movement.movementType || ''))) {
            cashShippingExpenseAmount += cashAmount;
            const createdAt = movement.createdAt as { toDate?: () => Date } | undefined;
            const occurredAt = typeof createdAt?.toDate === 'function' ? createdAt.toDate() : new Date(createdAt as string | number);
            if (!since || (!Number.isNaN(occurredAt.getTime()) && occurredAt >= since)) {
                cashShippingExpenseSinceAmount += cashAmount;
            }
        }
    }

    return { cashShippingExpenseAmount, cashShippingExpenseSinceAmount, hasCashExpenseMovements };
}

/** Reads the immutable movement ledger so old and new shifts use the same ship definition. */
export async function readCashierShiftCashExpenseBreakdown(
    db: Firestore,
    shiftId: string,
    since?: Date,
): Promise<CashierShiftCashExpenseBreakdown> {
    const snapshot = await db.collection('cashier_shift_movements')
        .where('shiftId', '==', shiftId)
        .get();
    return getCashierShiftCashExpenseBreakdown(snapshot.docs.map(doc => doc.data() as CashExpenseMovement), since);
}

/** A cash drawer belongs to the employee who opened its active shift. */
export function assertCashierShiftExpenseActor(
    shiftData: { openedBy?: unknown; openedByName?: unknown },
    actorId: string,
) {
    const openedBy = typeof shiftData.openedBy === 'string' ? shiftData.openedBy.trim() : '';
    if (openedBy && openedBy === actorId) return;
    const openedByName = typeof shiftData.openedByName === 'string' ? shiftData.openedByName.trim() : '';
    throw new Error(openedByName
        ? `Ca POS đang do ${openedByName} mở. Chỉ nhân viên mở ca mới được chi tiền mặt từ ca này.`
        : 'Không xác định được nhân viên mở ca POS. Không thể chi tiền mặt từ ca này.');
}

export function getCashierShiftCashGuardRef(db: Firestore, shiftId: string) {
    return db.collection('cashier_shift_cash_guards').doc(`CSG-${shiftId}`);
}

export function getCashierShiftAvailableCash(
    openingCashAmount: unknown,
    totals: Pick<CashierShiftTallyTotals, 'cashSalesAmount' | 'cashExpenseAmount'>,
    pendingCashIncome = 0,
) {
    return asAmount(openingCashAmount)
        + asAmount(totals.cashSalesAmount)
        - asAmount(totals.cashExpenseAmount)
        + asAmount(pendingCashIncome);
}

export function assertCashierShiftHasSufficientCash(availableCash: number, expenseAmount: unknown) {
    const expense = asAmount(expenseAmount);
    if (expense <= 0) return;
    if (availableCash >= expense) return;
    throw new Error(`Tiền mặt trong ca không đủ. Hiện có ${Math.max(0, availableCash).toLocaleString('vi-VN')}đ, cần chi ${expense.toLocaleString('vi-VN')}đ.`);
}

/**
 * Every cash outflow writes this one guard document. Reading and writing it in
 * the same transaction serializes concurrent expenses even though tallies are sharded.
 */
export async function readCashierShiftCashGuard(
    reader: CashierShiftGuardReader,
    db: Firestore,
    shiftId: string,
) {
    return reader.get(getCashierShiftCashGuardRef(db, shiftId));
}

export function queueCashierShiftCashExpenseGuard(
    tx: Transaction,
    db: Firestore,
    input: { shiftId: string; operationKey: string; actorId: string; amount: number },
) {
    tx.set(getCashierShiftCashGuardRef(db, input.shiftId), {
        shiftId: input.shiftId,
        lastExpenseOperationKey: input.operationKey,
        lastExpenseAmount: asAmount(input.amount),
        lastExpenseBy: input.actorId,
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}

function getTallyRef(db: Firestore, shiftId: string, shardId: string) {
    return db.collection('cashier_shift_tallies').doc(`CSH-${shiftId}-${shardId}`);
}

export function getCashierShiftTallyRefs(db: Firestore, shiftId: string) {
    return Array.from({ length: CASHIER_SHIFT_TALLY_SHARD_COUNT }, (_, index) => getTallyRef(db, shiftId, String(index)));
}

export async function readCashierShiftTallyTotals(
    reader: CashierShiftTallyReader,
    db: Firestore,
    shiftId: string,
): Promise<CashierShiftTallyTotals> {
    const snapshots = await reader.getAll(...getCashierShiftTallyRefs(db, shiftId));
    return snapshots.reduce<CashierShiftTallyTotals>((totals, snapshot) => {
        const data = snapshot.data() || {};
        totals.cashSalesAmount += asAmount(data.cashSalesAmount);
        totals.bankSalesAmount += asAmount(data.bankSalesAmount);
        totals.otherSalesAmount += asAmount(data.otherSalesAmount);
        totals.cashExpenseAmount += asAmount(data.cashExpenseAmount);
        totals.cashInventoryExpenseAmount += asAmount(data.cashInventoryExpenseAmount);
        totals.bankExpenseAmount += asAmount(data.bankExpenseAmount);
        totals.otherExpenseAmount += asAmount(data.otherExpenseAmount);
        return totals;
    }, {
        cashSalesAmount: 0,
        bankSalesAmount: 0,
        otherSalesAmount: 0,
        cashExpenseAmount: 0,
        cashInventoryExpenseAmount: 0,
        bankExpenseAmount: 0,
        otherExpenseAmount: 0,
    });
}

/**
 * Lưu movement xác định theo idempotency key và cộng một shard thay vì ghi dồn
 * vào document ca thu ngân đang mở. Transaction checkout vẫn là nguồn sự thật.
 */
export function queueCashierShiftTally(
    tx: Transaction,
    db: Firestore,
    input: {
        shiftId: string;
        operationKey: string;
        orderId: string;
        paymentMethod: string;
        cashAmount?: number;
        bankAmount?: number;
        otherAmount?: number;
        direction?: 'income' | 'expense';
        movementType?: 'sale' | 'repair_shipping' | 'repair_inbound_shipping' | 'inventory_purchase' | 'inventory_freight';
        referenceType?: 'order' | 'import_receipt' | 'repair_ticket';
        referenceId?: string;
        note?: string;
        actorId: string;
    },
) {
    const cashAmount = asAmount(input.cashAmount);
    const bankAmount = asAmount(input.bankAmount);
    const otherAmount = asAmount(input.otherAmount);
    if (cashAmount + bankAmount + otherAmount <= 0) return;
    const direction = input.direction || 'income';
    const movementType = input.movementType || 'sale';
    const isCashInventoryPurchase = direction === 'expense'
        && movementType === 'inventory_purchase'
        && cashAmount > 0;

    const shardId = getCashierShiftTallyShardId(input.operationKey);
    const movementRef = db.collection('cashier_shift_movements').doc(`CSM-${input.shiftId}-${input.operationKey}`);
    const tallyRef = getTallyRef(db, input.shiftId, shardId);

    tx.set(movementRef, {
        shiftId: input.shiftId,
        operationKey: input.operationKey,
        orderId: input.orderId,
        paymentMethod: input.paymentMethod,
        cashAmount,
        bankAmount,
        otherAmount,
        direction,
        movementType,
        ...(input.referenceType ? { referenceType: input.referenceType } : {}),
        ...(input.referenceId ? { referenceId: input.referenceId } : {}),
        ...(input.note ? { note: input.note } : {}),
        actorId: input.actorId,
        createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(tallyRef, {
        shiftId: input.shiftId,
        shardId,
        ...(cashAmount > 0 ? {
            [direction === 'expense' ? 'cashExpenseAmount' : 'cashSalesAmount']: FieldValue.increment(cashAmount),
        } : {}),
        ...(isCashInventoryPurchase ? {
            cashInventoryExpenseAmount: FieldValue.increment(cashAmount),
        } : {}),
        ...(bankAmount > 0 ? {
            [direction === 'expense' ? 'bankExpenseAmount' : 'bankSalesAmount']: FieldValue.increment(bankAmount),
        } : {}),
        ...(otherAmount > 0 ? {
            [direction === 'expense' ? 'otherExpenseAmount' : 'otherSalesAmount']: FieldValue.increment(otherAmount),
        } : {}),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}
