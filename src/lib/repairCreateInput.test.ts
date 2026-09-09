import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSafeRepairCreateBody, normalizeInitialRepairParts } from './repairCreateInput';

test('initial repair parts are grouped only by the same product and issue', () => {
    assert.deepEqual(normalizeInitialRepairParts([
        { productId: 'battery', issueId: 'issue-a', quantity: 1 },
        { productId: 'battery', issueId: 'issue-a', quantity: 2 },
        { productId: 'battery', issueId: 'issue-b', quantity: 1 },
    ]), [
        { productId: 'battery', issueId: 'issue-a', quantity: 3 },
        { productId: 'battery', issueId: 'issue-b', quantity: 1 },
    ]);
});

test('create body cannot persist client supplied parts without the stock reservation transaction', () => {
    const safe = buildSafeRepairCreateBody({
        customer: { name: 'Khách' },
        parts: [{ productId: 'unsafe' }],
        initialParts: [{ productId: 'battery', issueId: 'issue-a', quantity: 1 }],
        idempotencyKey: 'repair-create-key',
    }, undefined);
    assert.equal('parts' in safe, false);
    assert.equal('initialParts' in safe, false);
    assert.equal('idempotencyKey' in safe, false);
});
