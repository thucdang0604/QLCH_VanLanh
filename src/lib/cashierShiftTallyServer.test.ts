import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CASHIER_SHIFT_TALLY_SHARD_COUNT,
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
        bankExpenseAmount: 0,
        otherExpenseAmount: 0,
    });
});

test('cashier tally records repair shipping as an outflow instead of a negative sale', () => {
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
        paymentMethod: 'BANK',
        bankAmount: 45_000,
        direction: 'expense',
        movementType: 'repair_shipping',
        actorId: 'staff-1',
    });

    assert.equal(writes[0].payload.direction, 'expense');
    assert.equal(writes[0].payload.movementType, 'repair_shipping');
    assert.equal('bankExpenseAmount' in writes[1].payload, true);
    assert.equal('bankSalesAmount' in writes[1].payload, false);
});
