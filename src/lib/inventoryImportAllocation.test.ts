import assert from 'node:assert/strict';
import test from 'node:test';
import { applyProductImport, planRepairImportAllocation } from './inventoryImportAllocation';

test('holds only the technician request and leaves excess stock available', () => {
    assert.deepEqual(
        planRepairImportAllocation(10, { quantity: 1, status: 'ordered' }),
        {
            heldQuantity: 1,
            surplusQuantity: 9,
            requestedQuantity: 1,
            shouldUnlink: false,
        },
    );
});

test('orphaned or inactive repair links become ordinary available stock', () => {
    assert.equal(planRepairImportAllocation(2).heldQuantity, 0);
    assert.deepEqual(
        planRepairImportAllocation(2, { quantity: 1, status: 'rejected' }),
        {
            heldQuantity: 0,
            surplusQuantity: 2,
            requestedQuantity: 0,
            shouldUnlink: true,
            unlinkReason: 'inactive_line',
        },
    );
});

test('holds only the remaining request across multiple imports', () => {
    assert.deepEqual(
        planRepairImportAllocation(4, {
            quantity: 3,
            reservedQuantity: 2,
            status: 'ordered',
        }),
        {
            heldQuantity: 1,
            surplusQuantity: 3,
            requestedQuantity: 1,
            shouldUnlink: false,
        },
    );
});

test('treats a fully reserved line as an already allocated link', () => {
    assert.deepEqual(
        planRepairImportAllocation(2, {
            quantity: 2,
            reservedQuantity: 2,
            status: 'ordered',
        }),
        {
            heldQuantity: 0,
            surplusQuantity: 2,
            requestedQuantity: 0,
            shouldUnlink: true,
            unlinkReason: 'already_allocated',
        },
    );
});

test('rejects non-positive or fractional quantities', () => {
    assert.throws(() => planRepairImportAllocation(0, { quantity: 1, status: 'ordered' }));
    assert.throws(() => planRepairImportAllocation(1.5, { quantity: 1, status: 'ordered' }));
});

test('aggregates repeated imports for one product without overwriting stock or held', () => {
    const first = applyProductImport({ stock: 5, held: 1, costPrice: 100 }, 2, 200, 1);
    const second = applyProductImport(first, 3, 300, 0);

    assert.deepEqual(second, {
        stock: 10,
        held: 2,
        costPrice: 180,
    });
});
