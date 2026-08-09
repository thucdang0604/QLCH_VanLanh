import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildPosPaymentBreakdown,
    createPosPaymentReference,
    readPosPaymentBreakdown,
    takePosPaymentBreakdown,
} from './posPaymentBreakdown';

test('builds a cash-only payment and returns change separately', () => {
    const result = buildPosPaymentBreakdown({ total: 100_000, cashTendered: 120_000, bankTransferAmount: 0, bankReference: '' });
    assert.deepEqual(result.entries, [{ method: 'CASH', amount: 100_000 }]);
    assert.equal(result.changeDue, 20_000);
    assert.equal(result.remainingAmount, 0);
});

test('builds a mixed cash and VietQR payment with one stable reference', () => {
    const reference = createPosPaymentReference('8a6e7b4c-1234-5678-9abc-def012345678');
    const result = buildPosPaymentBreakdown({ total: 500_000, cashTendered: 200_000, bankTransferAmount: 300_000, bankReference: reference });
    assert.deepEqual(result.entries, [
        { method: 'CASH', amount: 200_000 },
        { method: 'BANK', amount: 300_000, reference: 'POS-DEF012345678' },
    ]);
});

test('supports a partial bank payment before the remainder becomes debt', () => {
    const result = buildPosPaymentBreakdown({ total: 500_000, cashTendered: 0, bankTransferAmount: 150_000, bankReference: 'POS-12345678' });
    assert.equal(result.paidAmount, 150_000);
    assert.equal(result.remainingAmount, 350_000);
});

test('keeps intentional cash surplus available for an old debt allocation', () => {
    const result = buildPosPaymentBreakdown({ total: 500_000, cashTendered: 650_000, bankTransferAmount: 0, bankReference: '', extraCashAllocation: 150_000 });
    assert.deepEqual(result.entries, [{ method: 'CASH', amount: 650_000 }]);
    assert.equal(result.changeDue, 0);
});

test('validates and allocates payment lines deterministically', () => {
    const payments = readPosPaymentBreakdown([
        { method: 'cash', amount: 200_000 },
        { method: 'bank', amount: 300_000, reference: 'POS-ABC12345' },
    ]);
    assert.deepEqual(takePosPaymentBreakdown(payments || [], 350_000), [
        { method: 'CASH', amount: 200_000 },
        { method: 'BANK', amount: 150_000, reference: 'POS-ABC12345' },
    ]);
});

test('rejects malformed bank reconciliation references', () => {
    assert.throws(() => readPosPaymentBreakdown([{ method: 'BANK', amount: 1, reference: 'wrong-ref' }]));
    assert.throws(() => readPosPaymentBreakdown([{ method: 'CASH', amount: 1, reference: 'POS-ABC12345' }]));
});
