import { FieldValue, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';

export const CASHIER_SHIFT_TALLY_SHARD_COUNT = 16;

export type CashierShiftTallyTotals = {
    cashSalesAmount: number;
    bankSalesAmount: number;
    otherSalesAmount: number;
};

type CashierShiftTallyReader = {
    getAll(...documentRefs: DocumentReference[]): Promise<DocumentSnapshot[]>;
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
        return totals;
    }, {
        cashSalesAmount: 0,
        bankSalesAmount: 0,
        otherSalesAmount: 0,
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
        actorId: string;
    },
) {
    const cashAmount = asAmount(input.cashAmount);
    const bankAmount = asAmount(input.bankAmount);
    const otherAmount = asAmount(input.otherAmount);
    if (cashAmount + bankAmount + otherAmount <= 0) return;

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
        actorId: input.actorId,
        createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(tallyRef, {
        shiftId: input.shiftId,
        shardId,
        ...(cashAmount > 0 ? { cashSalesAmount: FieldValue.increment(cashAmount) } : {}),
        ...(bankAmount > 0 ? { bankSalesAmount: FieldValue.increment(bankAmount) } : {}),
        ...(otherAmount > 0 ? { otherSalesAmount: FieldValue.increment(otherAmount) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}
