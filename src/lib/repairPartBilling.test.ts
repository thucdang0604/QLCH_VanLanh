import assert from 'node:assert/strict';
import test from 'node:test';
import { getActualUsedRepairPartsCost, isBillableRepairPart } from './repairPartBilling';

test('charges only installed parts after KTV confirms use or return', () => {
    const used = { status: 'selected', quantity: 1, unitPriceAtUse: 500_000, inventoryDeductedAt: new Date() };
    const returned = { status: 'selected', quantity: 1, unitPriceAtUse: 900_000, returnedToReceptionPendingAt: new Date() };
    const legacySelected = { status: 'selected', quantity: 1, unitPriceAtUse: 200_000 };

    assert.equal(isBillableRepairPart(used), true);
    assert.equal(isBillableRepairPart(returned), false);
    assert.equal(isBillableRepairPart(legacySelected), true);
    assert.equal(getActualUsedRepairPartsCost([used, returned, legacySelected]), 500_000);
});
