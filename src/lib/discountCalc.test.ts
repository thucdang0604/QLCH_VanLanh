import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAccessoryDiscounts } from './discountCalc';
import type { AccessoryDiscountRule } from './types/voucher';

const categoryRule = {
    id: 'RULE-CATEGORY-ONLY',
    name: 'Giảm cáp sạc khi thay màn',
    triggerServiceCategory: 'sua-chua/thay-man',
    triggerKeywords: ['thay màn'],
    targetProductCategory: 'phu-kien/cap-sac',
    // This simulates keywords auto-populated from a broad parent taxonomy.
    targetKeywords: ['phụ kiện', 'cáp'],
    discountType: 'percentage',
    discountValue: 30,
    isActive: true,
} as AccessoryDiscountRule;

test('does not discount products outside the selected target category', () => {
    const results = calculateAccessoryDiscounts(
        [{ productName: 'Thay màn hình', categoryIds: ['sua-chua', 'sua-chua/thay-man'] }],
        [
            {
                productId: 'charger',
                productName: 'Cáp sạc nhanh',
                price: 100_000,
                categoryIds: ['phu-kien', 'phu-kien/cap-sac'],
            },
            {
                productId: 'holder',
                productName: 'Giá đỡ điện thoại',
                price: 120_000,
                category: 'Phụ kiện',
                categoryIds: ['phu-kien', 'phu-kien/gia-do'],
            },
            {
                productId: 'external-device',
                productName: 'Thiết bị khách mang ngoài danh mục',
                price: 500_000,
                category: 'Phụ kiện',
            },
        ],
        [categoryRule],
    );

    assert.deepEqual(results, [{
        productName: 'Cáp sạc nhanh',
        originalPrice: 100_000,
        discountAmount: 30_000,
        ruleName: 'Giảm cáp sạc khi thay màn',
    }]);
});

test('continues to support rules intentionally configured with keywords only', () => {
    const keywordOnlyRule = {
        ...categoryRule,
        targetProductCategory: '',
        targetKeywords: ['cáp sạc'],
    };
    const results = calculateAccessoryDiscounts(
        [{ productName: 'Thay màn hình', categoryIds: ['sua-chua/thay-man'] }],
        [{ productId: 'charger', productName: 'Cáp sạc nhanh', price: 100_000 }],
        [keywordOnlyRule],
    );

    assert.equal(results.length, 1);
});
