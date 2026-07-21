import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getExpectedReservationQuantity,
    getMissingReservationQuantity,
} from './repairPartReservations';

test('reserves an old selected part that has no recorded inventory hold', () => {
    const part = { productId: 'pin-iphone', quantity: 2, status: 'selected' };

    assert.equal(getMissingReservationQuantity(part), 2);
    assert.equal(getExpectedReservationQuantity(part), 2);
});

test('reconciliation restores the full hold for a partially reserved repair line', () => {
    const part = { productId: 'pin-iphone', quantity: 3, reservedQuantity: 1, status: 'selected' };

    assert.equal(getMissingReservationQuantity(part), 2);
    assert.equal(getExpectedReservationQuantity(part), 3);
});

test('does not reserve requested or rejected repair lines', () => {
    assert.equal(getMissingReservationQuantity({ quantity: 1, status: 'requested' }), 0);
    assert.equal(getExpectedReservationQuantity({ quantity: 1, status: 'rejected' }), 0);
});

test('does not re-hold a part already deducted when repair work was completed', () => {
    const part = { quantity: 1, reservedQuantity: 0, status: 'selected', inventoryDeductedAt: new Date() };

    assert.equal(getMissingReservationQuantity(part), 0);
    assert.equal(getExpectedReservationQuantity(part), 0);
});
