import assert from 'node:assert/strict';
import test from 'node:test';

import { requiresRepairPaymentAtPos } from './repairPaymentGate';

const paymentGateNode = {
    id: 'wait_handover', label: 'Chờ bàn giao', color: '', allowedNext: ['complete'], allowedFeatures: ['requirePaymentGate'],
};

test('an unpaid repair at a configured payment gate must use POS before completion', () => {
    assert.equal(requiresRepairPaymentAtPos({ ticketType: 'repair', payment: { status: 'unpaid' } } as never, paymentGateNode), true);
    assert.equal(requiresRepairPaymentAtPos({ ticketType: 'repair', payment: { status: 'deposit' } } as never, paymentGateNode), true);
    assert.equal(requiresRepairPaymentAtPos({ ticketType: 'repair', payment: { status: 'paid' } } as never, paymentGateNode), false);
});

test('a warranty ticket does not need a POS payment even if its workflow node has the gate', () => {
    assert.equal(requiresRepairPaymentAtPos({ ticketType: 'warranty', payment: { status: 'unpaid' } } as never, paymentGateNode), false);
});
