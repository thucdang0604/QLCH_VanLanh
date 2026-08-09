import assert from 'node:assert/strict';
import test from 'node:test';
import { stampRepairWarrantyOnParts } from './repairWarrantyRules';

test('uses the snapshotted warranty policy before fuzzy part-name matching', () => {
    const result = stampRepairWarrantyOnParts(
        [{
            partLineId: 'line-1',
            productId: 'part-1',
            productName: 'Pin iPhone',
            quality: 'Zin',
            quantity: 1,
            status: 'selected',
            warrantyPolicyId: 'camera',
        }],
        new Map([['part-1', { partType: 'Pin', warrantyPolicyId: 'pin' }]]),
        [
            { id: 'pin', partType: 'Pin', warrantyMonths: 12 },
            { id: 'camera', partType: 'Camera', warrantyMonths: 3 },
        ],
        new Date('2026-01-15T00:00:00.000Z').getTime(),
    );

    assert.equal(result.parts[0].warrantyPolicyId, 'camera');
    assert.equal(result.parts[0].warrantyMonths, 3);
    assert.equal(result.parts[0].warrantyExpiresAt, new Date('2026-04-15T00:00:00.000Z').getTime());
});
