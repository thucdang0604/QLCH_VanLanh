import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateAccessoryDiscounts, matchesKeywords } from './discountCalc';
import type { AccessoryDiscountRule } from './types';

const baseRule: AccessoryDiscountRule = {
    id: 'rule-1',
    name: 'Giam cuong luc khi thay man',
    triggerServiceCategory: 'thay-man-hinh',
    triggerKeywords: [],
    discountType: 'percentage',
    discountValue: 40,
    targetProductCategory: 'phu-kien/cuong-luc',
    targetKeywords: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
};

test('discount keywords match Vietnamese accents and slug-like input', () => {
    assert.equal(matchesKeywords('Dan cuong luc iPhone', ['cường lực']), true);
    assert.equal(matchesKeywords('Thay màn hình iPhone', ['thay man hinh']), true);
});

test('accessory discount matches repair name paths against taxonomy slugs', () => {
    const results = calculateAccessoryDiscounts(
        [],
        [{
            productId: 'p1',
            productName: 'Kính cường lực iPhone',
            price: 100_000,
            category: 'Phụ kiện',
            categoryIds: ['Phụ kiện', 'Cường lực'],
        }],
        [baseRule],
        [{
            serviceName: 'Thay màn hình',
            categoryPath: ['Sửa chữa', 'Thay màn hình'],
            issues: [],
        }],
    );

    assert.deepEqual(results, [{
        productName: 'Kính cường lực iPhone',
        originalPrice: 100_000,
        discountAmount: 40_000,
        ruleName: baseRule.name,
    }]);
});
