import assert from 'node:assert/strict';
import test from 'node:test';
import { getRepairIssueLaborCost, resolveRepairIssueBillingMode } from './repairIssuePricing';

const issues = [
    { id: 'battery', label: 'Thay pin', estimatedPrice: 200_000, status: 'pending' as const },
    { id: 'screen-line', label: 'Fix sọc màn hình', estimatedPrice: 350_000, status: 'pending' as const },
];

test('part linked to an issue defaults that issue to parts-only while service-only issues remain billable', () => {
    const parts = [{ issueId: 'battery', status: 'selected' }];
    assert.equal(resolveRepairIssueBillingMode(issues[0], parts), 'parts_only');
    assert.equal(getRepairIssueLaborCost(issues, parts), 350_000);
});

test('explicit parts-and-service mode retains the service fee', () => {
    const pricedIssue = { ...issues[0], billingMode: 'parts_and_service' as const };
    assert.equal(getRepairIssueLaborCost([pricedIssue], [{ issueId: 'battery', status: 'selected' }]), 200_000);
});

test('legacy issues without linked parts retain their existing service fee', () => {
    assert.equal(getRepairIssueLaborCost(issues, []), 550_000);
});

test('a shortage proposal does not suppress the labour estimate before stock is selected', () => {
    const requestedParts = [{ issueId: 'battery', status: 'requested' }];
    assert.equal(resolveRepairIssueBillingMode(issues[0], requestedParts), 'service_only');
    assert.equal(getRepairIssueLaborCost(issues, requestedParts), 550_000);
});
