import assert from 'node:assert/strict';
import test from 'node:test';
import { planRepairPartVerification } from './repairPartConsumption';

test('separates installed parts from test parts and ignores prior deductions', () => {
    const plan = planRepairPartVerification([
        { partLineId: 'used', status: 'selected' },
        { partLineId: 'test', status: 'selected' },
        { partLineId: 'old', status: 'selected', inventoryDeductedAt: new Date() },
        { partLineId: 'requested', status: 'requested' },
    ], { test: 'return' });

    assert.deepEqual(plan.used.map((entry) => entry.part.partLineId), ['used']);
    assert.deepEqual(plan.returned.map((entry) => entry.part.partLineId), ['test']);
});

test('defaults an unconfirmed selected part to installed', () => {
    const plan = planRepairPartVerification([
        { partLineId: 'screen', status: 'selected' },
    ], undefined);

    assert.equal(plan.used.length, 1);
    assert.equal(plan.returned.length, 0);
});
