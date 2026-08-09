import assert from 'node:assert/strict';
import test from 'node:test';
import type { RepairTicket } from '@/lib/types';
import {
    getCashierShiftChannel,
    getFixedPosRetailPrice,
    getRepairPaidAmount,
    getRepairPaymentAmount,
    getWarrantyExpiresAt,
    normalizeOrderPaymentId,
    normalizeRepairTicketId,
    readNonNegativeCheckoutAmount,
    readOptionalNonNegativeCheckoutAmount,
    readPositiveCheckoutQuantity,
    requiresImeiForPosRetailProduct,
    resolveProductWarranty,
} from './posCheckoutRules';

test('normalizes synthetic repair and debt-collection line IDs without changing regular IDs', () => {
    assert.equal(normalizeRepairTicketId('SC-001_part_0'), 'SC-001');
    assert.equal(normalizeRepairTicketId('SC-001_labor'), 'SC-001');
    assert.equal(normalizeRepairTicketId('SC-001'), 'SC-001');
    assert.equal(normalizeOrderPaymentId('order_payment_DH-002'), 'DH-002');
    assert.equal(normalizeOrderPaymentId('DH-002'), 'DH-002');
});

test('validates checkout amounts and normalizes positive quantity exactly once', () => {
    assert.equal(readOptionalNonNegativeCheckoutAmount(undefined, 'amount'), 0);
    assert.equal(readNonNegativeCheckoutAmount('125000', 'amount'), 125_000);
    assert.equal(readPositiveCheckoutQuantity(undefined, 'quantity'), 1);
    assert.equal(readPositiveCheckoutQuantity(2.9, 'quantity'), 2);
    assert.throws(() => readNonNegativeCheckoutAmount(-1, 'amount'), /khong hop le/);
    assert.throws(() => readPositiveCheckoutQuantity(0.5, 'quantity'), /khong hop le/);
});

test('preserves repair payment accounting with refunds and never permits a zero-priced repair', () => {
    const ticket = {
        payment: { amount: 500_000, depositAmount: 100_000 },
        paymentHistory: [
            { type: 'payment', amount: 300_000 },
            { type: 'refund', amount: 50_000 },
        ],
    } as RepairTicket;

    assert.equal(getRepairPaymentAmount(ticket, 'SC-000123'), 500_000);
    assert.equal(getRepairPaidAmount(ticket), 250_000);
    assert.throws(() => getRepairPaymentAmount({ payment: { amount: 0 } } as RepairTicket, 'SC-000123'), /khong co so tien/);
});

test('resolves product warranty from the product first, then the deepest taxonomy node', () => {
    const taxonomy = [{
        id: 'phones',
        slug: 'phones',
        warrantyType: 'warrantyDevice',
        warrantyMonths: 12,
        children: [{
            id: 'phones/android',
            slug: 'android',
            warrantyType: 'warrantyDevice',
            warrantyMonths: 18,
        }],
    }];

    assert.deepEqual(resolveProductWarranty({ warrantyType: 'warrantyStore', warrantyMonths: 6 }, taxonomy), {
        warrantyType: 'warrantyStore', warrantyMonths: 6,
    });
    assert.deepEqual(resolveProductWarranty({ category: 'phones/android' }, taxonomy), {
        warrantyType: 'warrantyDevice', warrantyMonths: 18,
    });
    assert.deepEqual(resolveProductWarranty({ category: 'Phones', categoryIds: ['phones', 'phones/android'] }, taxonomy), {
        warrantyType: 'warrantyDevice', warrantyMonths: 18,
    });
    assert.deepEqual(resolveProductWarranty({ warrantyType: 'warrantyDevice', warrantyMonths: 0, category: 'phones/android' }, taxonomy), {
        warrantyType: 'warrantyDevice', warrantyMonths: 18,
    });
    const inheritedTaxonomy = [{
        id: 'accessories', slug: 'accessories', warrantyType: 'warrantyAccessory', warrantyMonths: 3,
        children: [{ id: 'accessories/cables', slug: 'cables', warrantyType: 'none' }],
    }];
    assert.deepEqual(resolveProductWarranty({ category: 'accessories/cables' }, inheritedTaxonomy), {
        warrantyType: 'warrantyAccessory', warrantyMonths: 3,
    });
    assert.equal(resolveProductWarranty({ warrantyType: 'none', category: 'phones/android' }, taxonomy), null);
});

test('calculates a stable warranty expiry from the checkout timestamp', () => {
    assert.equal(getWarrantyExpiresAt(new Date('2026-01-31T00:00:00.000Z').getTime(), 1), new Date('2026-03-03T00:00:00.000Z').getTime());
    assert.equal(getWarrantyExpiresAt(Date.now(), 0), undefined);
});

test('classifies cashier channels without treating debt as received cash or bank money', () => {
    assert.equal(getCashierShiftChannel('CASH'), 'cash');
    assert.equal(getCashierShiftChannel('QR'), 'bank');
    assert.equal(getCashierShiftChannel('DEBT'), 'none');
});

test('requires IMEI or Serial for every retail device, but never for accessories or components', () => {
    assert.equal(requiresImeiForPosRetailProduct({ category: 'Máy tính bảng', categoryIds: ['may-tinh-bang', 'may-tinh-bang/ipad'] }), true);
    assert.equal(requiresImeiForPosRetailProduct({ category: 'Laptop', categoryIds: ['laptop', 'laptop/macbook'] }), true);
    assert.equal(requiresImeiForPosRetailProduct({ category: 'Phụ kiện', categoryIds: ['phu-kien', 'phu-kien/cap-sac'] }), false);
    assert.equal(requiresImeiForPosRetailProduct({ category: 'Linh kiện', categoryIds: ['linh-kien', 'linh-kien/man-hinh'] }), false);
});

test('uses the catalog price for retail POS lines', () => {
    assert.equal(getFixedPosRetailPrice({ price_promo: 8_490_000, price_original: 9_490_000 }, 'price'), 8_490_000);
    assert.equal(getFixedPosRetailPrice({ price_promo: 0, price_original: 9_490_000 }, 'price'), 9_490_000);
});
