import assert from 'node:assert/strict';
import test from 'node:test';
import { getListenerReadMetrics, getOneShotReadMetrics } from './firestoreReadMetrics';

test('one-shot server query reports result-document reads with the minimum query charge', () => {
    assert.deepEqual(getOneShotReadMetrics(20, false), {
        source: 'server',
        returnedDocuments: 20,
        documentReadLowerBound: 20,
        documentReadUpperBound: 20,
        note: 'Số read cho document trả về (đã tính mức tối thiểu 1 query). Chưa bao gồm chi phí index entries hoặc document phụ do Rules đọc.',
    });
    assert.equal(getOneShotReadMetrics(0, false).documentReadLowerBound, 1);
});

test('cache snapshots do not claim a new server read', () => {
    const metrics = getOneShotReadMetrics(20, true);
    assert.equal(metrics.source, 'cache');
    assert.equal(metrics.documentReadUpperBound, 0);
});

test('listener updates count changed documents rather than the full snapshot size', () => {
    const metrics = getListenerReadMetrics({
        returnedDocuments: 20,
        fromCache: false,
        isInitialSnapshot: false,
        changes: { added: 0, modified: 1, removed: 0 },
    });

    assert.equal(metrics.documentReadLowerBound, 1);
    assert.equal(metrics.documentReadUpperBound, 1);
});

test('listener removals are reported as a billing range', () => {
    const metrics = getListenerReadMetrics({
        returnedDocuments: 19,
        fromCache: false,
        isInitialSnapshot: false,
        changes: { added: 0, modified: 0, removed: 1 },
    });

    assert.equal(metrics.documentReadLowerBound, 0);
    assert.equal(metrics.documentReadUpperBound, 1);
});
