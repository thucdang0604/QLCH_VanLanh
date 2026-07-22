import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePosDiscountBreakdown } from './posDiscountTotals';

test('removes an applied accessory discount when its qualifying product leaves the cart', () => {
    const whileAccessoryIsInCart = calculatePosDiscountBreakdown({
        discountableSubtotal: 100_000,
        manualDiscount: 0,
        autoDiscountAmount: 30_000,
        autoDiscountApplied: true,
    });
    const afterAccessoryIsRemoved = calculatePosDiscountBreakdown({
        discountableSubtotal: 70_000,
        manualDiscount: 0,
        autoDiscountAmount: 0,
        autoDiscountApplied: true,
    });

    assert.equal(whileAccessoryIsInCart.effectiveDiscount, 30_000);
    assert.equal(afterAccessoryIsRemoved.effectiveDiscount, 0);
});

test('keeps a separately entered manual discount distinct from the accessory rule', () => {
    const result = calculatePosDiscountBreakdown({
        discountableSubtotal: 100_000,
        manualDiscount: 20_000,
        autoDiscountAmount: 30_000,
        autoDiscountApplied: true,
    });

    assert.deepEqual(result, {
        appliedAutoDiscount: 30_000,
        appliedManualDiscount: 20_000,
        effectiveDiscount: 50_000,
    });
});
