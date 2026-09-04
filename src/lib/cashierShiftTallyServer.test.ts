import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CASHIER_SHIFT_TALLY_SHARD_COUNT,
    assertCashierShiftExpenseActor,
    assertCashierShiftHasSufficientCash,
    getCashierShiftAvailableCash,
    getCashierShiftCashExpenseBreakdown,
    getCashierShiftTallyShardId,
    queueCashierShiftTally,
    readCashierShiftTallyTotals,
} from './cashierShiftTallyServer';

test('cashier tally uses a stable bounded shard and an idempotent movement id', async () => {
    const operationKey = 'checkout-operation-123';
    const shardId = getCashierShiftTallyShardId(operationKey);
    assert.equal(getCashierShiftTallyShardId(operationKey), shardId);
    assert.equal(Number(shardId) >= 0 && Number(shardId) < CASHIER_SHIFT_TALLY_SHARD_COUNT, true);

    const writes: Array<{ path: string; payload: Record<string, unknown> }> = [];
    const db = {
        collection: (collectionName: string) => ({
            doc: (id: string) => ({ id, path: `${collectionName}/${id}` }),
        }),
    };
    const tx = {
        set: (ref: { path: string }, payload: Record<string, unknown>) => writes.push({ path: ref.path, payload }),
    };

    queueCashierShiftTally(tx as never, db as never, {
        shiftId: 'shift-1',
        operationKey,
        orderId: 'DH-260710-0001',
        paymentMethod: 'CASH',
        cashAmount: 120_000,
        actorId: 'staff-1',
    });

    assert.equal(writes.length, 2);
    assert.equal(writes[0].path, `cashier_shift_movements/CSM-shift-1-${operationKey}`);
    assert.equal(writes[1].path, `cashier_shift_tallies/CSH-shift-1-${shardId}`);

    const totals = await readCashierShiftTallyTotals({
        getAll: async (...refs: Array<{ id: string; path: string }>) => refs.map((ref, index) => ({
            id: ref.id,
            path: ref.path,
            data: () => index === 0 ? { cashSalesAmount: 120_000 } : index === 1 ? { bankSalesAmount: 80_000 } : {},
        })),
    } as never, db as never, 'shift-1');

    assert.deepEqual(totals, {
        cashSalesAmount: 120_000,
        bankSalesAmount: 80_000,
        otherSalesAmount: 0,
        cashExpenseAmount: 0,
        cashInventoryExpenseAmount: 0,
        bankExpenseAmount: 0,
        otherExpenseAmount: 0,
    });
});

test('cash expense is restricted to the employee who opened the active shift', () => {
    assert.doesNotThrow(() => assertCashierShiftExpenseActor({ openedBy: 'staff-1' }, 'staff-1'));
    assert.throws(
        () => assertCashierShiftExpenseActor({ openedBy: 'staff-1', openedByName: 'Thu ngân A' }, 'staff-2'),
        /Thu ngân A/,
    );
});

test('cash expense cannot make the drawer balance negative', () => {
    const available = getCashierShiftAvailableCash(505_000, {
        cashSalesAmount: 0,
        cashExpenseAmount: 0,
    });
    assert.equal(available, 505_000);
    assert.throws(() => assertCashierShiftHasSufficientCash(available, 712_000), /không đủ/);
    assert.doesNotThrow(() => assertCashierShiftHasSufficientCash(available, 505_000));
});

test('cashier tally records cash shipping separately from a supplier import payment', () => {
    const writes: Array<{ path: string; payload: Record<string, unknown> }> = [];
    const db = {
        collection: (collectionName: string) => ({
            doc: (id: string) => ({ id, path: `${collectionName}/${id}` }),
        }),
    };
    const tx = {
        set: (ref: { path: string }, payload: Record<string, unknown>) => writes.push({ path: ref.path, payload }),
    };

    queueCashierShiftTally(tx as never, db as never, {
        shiftId: 'shift-1',
        operationKey: 'repair-shipping-1',
        orderId: 'DH-260710-0002',
        paymentMethod: 'CASH',
        cashAmount: 45_000,
        direction: 'expense',
        movementType: 'repair_shipping',
        actorId: 'staff-1',
    });

    assert.equal(writes[0].payload.direction, 'expense');
    assert.equal(writes[0].payload.movementType, 'repair_shipping');
    assert.equal('cashExpenseAmount' in writes[1].payload, true);
    assert.equal('cashInventoryExpenseAmount' in writes[1].payload, false);

    const importWrites: Array<{ path: string; payload: Record<string, unknown> }> = [];
    queueCashierShiftTally({
        set: (ref: { path: string }, payload: Record<string, unknown>) => importWrites.push({ path: ref.path, payload }),
    } as never, db as never, {
        shiftId: 'shift-1',
        operationKey: 'inventory-purchase-1',
        orderId: 'PN-260710-0001',
        paymentMethod: 'CASH',
        cashAmount: 300_000,
        direction: 'expense',
        movementType: 'inventory_purchase',
        actorId: 'staff-1',
    });
    assert.equal('cashExpenseAmount' in importWrites[1].payload, true);
    assert.equal('cashInventoryExpenseAmount' in importWrites[1].payload, true);
});

test('cash shipping only includes shipping movements, never an unrelated cash expense', () => {
    const breakdown = getCashierShiftCashExpenseBreakdown([
        { direction: 'expense', movementType: 'inventory_freight', cashAmount: 111_111 },
        { direction: 'expense', movementType: 'repair_inbound_shipping', cashAmount: 55_555 },
        { direction: 'expense', movementType: 'repair_inbound_shipping', cashAmount: 20_000 },
        { direction: 'expense', movementType: 'inventory_purchase', cashAmount: 300_000 },
        { direction: 'expense', movementType: 'manual_expense', cashAmount: 40_000 },
    ]);

    assert.deepEqual(breakdown, {
        cashShippingExpenseAmount: 186_666,
        cashShippingExpenseSinceAmount: 186_666,
        hasCashExpenseMovements: true,
    });
});
