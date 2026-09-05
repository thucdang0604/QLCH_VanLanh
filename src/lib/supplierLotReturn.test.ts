import assert from 'node:assert/strict';
import test from 'node:test';
import { planSupplierLotReturn } from './supplierLotReturn';

const baseInput = {
    quantity: 2,
    lotRemainingQuantity: 4,
    productStock: 10,
    productHeld: 3,
    productCostPrice: 120_000,
    landedUnitCost: 150_000,
    supplierCreditUnitCost: 130_000,
};

test('returns an available quantity from exactly one lot and revalues the remaining stock', () => {
    assert.deepEqual(planSupplierLotReturn(baseInput), {
        quantity: 2,
        nextLotRemainingQuantity: 2,
        nextLotStatus: 'active',
        nextProductStock: 8,
        nextProductCostPrice: 112_500,
        returnedCarryingAmount: 300_000,
        supplierCreditAmount: 260_000,
        nonRefundableFreightAmount: 40_000,
    });
});

test('empties the selected lot without touching the global held quantity', () => {
    const result = planSupplierLotReturn({
        ...baseInput,
        quantity: 4,
        lotRemainingQuantity: 4,
        productStock: 7,
        productHeld: 3,
        productCostPrice: 150_000,
    });

    assert.equal(result.nextLotStatus, 'empty');
    assert.equal(result.nextLotRemainingQuantity, 0);
    assert.equal(result.nextProductStock, 3);
    assert.equal(result.nextProductCostPrice, 150_000);
});

test('rejects a return that would consume held stock', () => {
    assert.throws(
        () => planSupplierLotReturn({ ...baseInput, quantity: 8, lotRemainingQuantity: 8, productStock: 10, productHeld: 3 }),
        /tồn khả dụng/,
    );
});

test('rejects a quantity larger than the selected lot remaining balance', () => {
    assert.throws(
        () => planSupplierLotReturn({ ...baseInput, quantity: 5 }),
        /Lô chỉ còn 4/,
    );
});
