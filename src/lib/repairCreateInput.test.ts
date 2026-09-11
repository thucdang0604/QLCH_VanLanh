import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSafeRepairCreateBody, normalizeInitialRepairPartRequests, normalizeInitialRepairParts } from './repairCreateInput';

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

test('groups shortage proposals without turning them into stock reservations', () => {
    assert.deepEqual(normalizeInitialRepairPartRequests([
        { productId: 'screen-13', issueId: 'issue-a', quality: 'Zin', quantity: 1 },
        { productId: 'screen-13', issueId: 'issue-a', quality: 'Zin', quantity: 2 },
        { customName: 'Màn hình iPhone 13', issueId: 'issue-a', quality: 'Loại 1', quantity: 1 },
    ]), [
        { productId: 'screen-13', customName: '', issueId: 'issue-a', quality: 'Zin', quantity: 3 },
        { productId: '', customName: 'Màn hình iPhone 13', issueId: 'issue-a', quality: 'Loại 1', quantity: 1 },
    ]);
});
