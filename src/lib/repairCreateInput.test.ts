import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildSafeRepairCreateBody,
    normalizeRepairPaymentHistory,
    parseRepairClientTimestamp,
} from './repairCreateInput';

test('accepts only a Firestore-compatible client timestamp', () => {
    const timestamp = parseRepairClientTimestamp({ seconds: 1_700_000_000, nanoseconds: 123 });
    assert.equal(timestamp?.seconds, 1_700_000_000);
    assert.equal(timestamp?.nanoseconds, 123);
    assert.equal(parseRepairClientTimestamp({ seconds: 'bad' }), null);
    assert.equal(parseRepairClientTimestamp(null), null);
});

test('normalizes repair payment entries and rejects invalid amounts or payment types', () => {
    assert.deepEqual(normalizeRepairPaymentHistory([{ amount: '250000', type: 'deposit' }]), [{ amount: 250_000, type: 'deposit' }]);
    assert.deepEqual(normalizeRepairPaymentHistory([{ amount: 1 }]), [{ amount: 1, type: 'payment' }]);
    assert.throws(() => normalizeRepairPaymentHistory([{ amount: -1, type: 'payment' }]), /khong hop le/);
    assert.throws(() => normalizeRepairPaymentHistory([{ amount: 1, type: 'unknown' }]), /Loai thanh toan/);
});

test('removes client-controlled repair fields while retaining validated payment history', () => {
    const paymentHistory = normalizeRepairPaymentHistory([{ amount: 10_000, type: 'deposit' }]);
    const result = buildSafeRepairCreateBody({
        device: 'Phone',
        createdAt: 'spoofed',
        updatedAt: 'spoofed',
        status: 'done',
        statusTimeline: [],
        version: 99,
        pendingTechnicianTransfer: true,
        paymentHistory: [{ amount: 1, type: 'refund' }],
    }, paymentHistory);

    assert.deepEqual(result, {
        device: 'Phone',
        paymentHistory: [{ amount: 10_000, type: 'deposit' }],
    });
});
