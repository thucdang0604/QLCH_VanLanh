import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompletedOrderRevenueDelta } from './revenueAggregateServer';
import type { Order } from './types';

test('records a debt deposit in its actual payment channel, not as unclassified revenue', () => {
    const delta = buildCompletedOrderRevenueDelta({
        id: 'DH-240714-0001',
        source: 'pos',
        items: [{ productId: 'otg', productName: 'Bộ chuyển đổi OTG', quantity: 1, price: 65_000 }],
        total_amount: 65_000,
        status: 'Completed',
        is_vat_exported: false,
        payment_method: 'Debt',
        paymentStatus: 'debt',
        paymentHistory: [{ type: 'deposit', amount: 12_000, method: 'CASH' }],
    } as Order);

    assert.equal(delta.orderRevenue, 12_000);
    assert.equal(delta.debtRevenue, 53_000);
    assert.equal(delta.posOrderRevenue, 12_000);
    assert.equal(delta.posOrderCount, 1);
    assert.equal(delta.cashRevenue, 12_000);
    assert.equal(delta.bankRevenue, 0);
    assert.equal(delta.otherRevenue, 0);
});

test('records a debt deposit received by transfer in the bank channel', () => {
    const delta = buildCompletedOrderRevenueDelta({
        id: 'DH-240714-0002',
        source: 'pos',
        items: [{ productId: 'cap', productName: 'Cáp sạc', quantity: 1, price: 65_000 }],
        total_amount: 65_000,
        status: 'Completed',
        is_vat_exported: false,
        payment_method: 'Debt',
        paymentStatus: 'debt',
        paymentHistory: [{ type: 'deposit', amount: 12_000, method: 'BANK' }],
    } as Order);

    assert.equal(delta.orderRevenue, 12_000);
    assert.equal(delta.debtRevenue, 53_000);
    assert.equal(delta.bankRevenue, 12_000);
    assert.equal(delta.cashRevenue, 0);
});
