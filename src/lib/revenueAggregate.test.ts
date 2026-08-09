import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRevenueAggregateDelta } from './revenueAggregate';

test('shipping charged to the customer is revenue while shop-absorbed shipping is an expense', () => {
    const delta = normalizeRevenueAggregateDelta({
        shippingRevenue: 35_000,
        shippingExpense: 20_000,
    });

    assert.equal(delta.totalRevenue, 35_000);
    assert.equal(delta.totalExpenses, 20_000);
    assert.equal(delta.netProfit, 15_000);
});

test('shipping advanced for a partner has no profit-and-loss delta', () => {
    assert.deepEqual(normalizeRevenueAggregateDelta({}), {});
});
