import assert from 'node:assert/strict';
import test from 'node:test';

import { getReceiptPaymentSummary } from './receiptPaymentSummary';

test('uses the persisted deposit/history contract and does not double-count breakdown rows', () => {
    assert.deepEqual(getReceiptPaymentSummary({
        total_amount: 1000,
        deposit_amount: 400,
        paymentHistory: [{ amount: 400 }],
        paymentBreakdown: [{ amount: 400 }],
        status: 'Pending',
    }), {
        totalAmount: 1000,
        paidAmount: 400,
        remainingAmount: 600,
        isDebt: true,
    });

    assert.equal(getReceiptPaymentSummary({
        total_amount: 1000,
        deposit_amount: 0,
        paymentBreakdown: [{ amount: 1000 }],
        status: 'Completed',
    }).remainingAmount, 0);
});
