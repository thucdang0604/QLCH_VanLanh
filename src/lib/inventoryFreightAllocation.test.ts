import assert from 'node:assert/strict';
import test from 'node:test';
import { allocateInboundFreightByValue } from './inventoryFreightAllocation';

test('allocates inbound freight proportionally and preserves the total', () => {
    const allocation = allocateInboundFreightByValue([
        { quantity: 1, unitPurchaseCost: 300_000 },
        { quantity: 1, unitPurchaseCost: 700_000 },
    ], 50_000);

    assert.deepEqual(allocation, [15_000, 35_000]);
    assert.equal(allocation.reduce((sum, value) => sum + value, 0), 50_000);
});

test('allocates zero-value receipt freight evenly without losing VND', () => {
    assert.deepEqual(allocateInboundFreightByValue([
        { quantity: 1, unitPurchaseCost: 0 },
        { quantity: 1, unitPurchaseCost: 0 },
        { quantity: 1, unitPurchaseCost: 0 },
    ], 10), [3, 3, 4]);
});
