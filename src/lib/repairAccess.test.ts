import test from 'node:test';
import assert from 'node:assert/strict';
import { isRepairManager, isTechnicianUser } from './repairAccess';

test('admin is always a repair manager', () => {
    assert.equal(isRepairManager({ role: 'admin', permissions: [] }), true);
});

test('sale manager needs both repair and order permissions', () => {
    assert.equal(isRepairManager({ role: 'staff', permissions: ['manage_repairs', 'manage_orders'] }), true);
    assert.equal(isRepairManager({ role: 'staff', permissions: ['manage_repairs'] }), false);
    assert.equal(isRepairManager({ role: 'staff', permissions: ['manage_orders'] }), false);
});

test('technician must be staff with repair permission', () => {
    assert.equal(isTechnicianUser({ role: 'staff', permissions: ['manage_repairs'] }), true);
    assert.equal(isTechnicianUser({ role: 'customer', permissions: ['manage_repairs'] }), false);
    assert.equal(isTechnicianUser({ role: 'staff', permissions: ['manage_orders'] }), false);
});
