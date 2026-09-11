import assert from 'node:assert/strict';
import test from 'node:test';
import {
    assertInboundArrivalConfirmedForTransition,
    canSelectInitialPartsDuringInboundIntake,
    canSelectInitialPartsWhenEditingRepair,
    getInboundIntakeDetailsError,
    getInboundArrivalPrerequisiteError,
    getInboundTechnicianHoldMessage,
} from './repairInboundIntake';

const inboundArrivalNode = {
    id: 'cho_tiep_nhan',
    label: 'Chờ tiếp nhận',
    color: '',
    allowedNext: [],
    allowedFeatures: ['requireInboundArrival'],
};

function incomingTicket(overrides: Record<string, unknown> = {}) {
    return {
        appointmentIntakeMethod: 'send_to_store',
        customer: { name: 'Nguyễn Văn A', phone: '0900000000' },
        deviceInfo: { model: 'iPhone 16' },
        issue: { description: 'Không lên nguồn' },
        inboundShipping: { paidAmount: 50000, lastPaymentMethod: 'CASH', status: 'awaiting_arrival' },
        ...overrides,
    };
}

test('incoming repair requires shipping settlement before arrival confirmation', () => {
    const ticket = incomingTicket({ inboundShipping: { paidAmount: 0, status: 'awaiting_arrival' } });
    assert.match(getInboundArrivalPrerequisiteError(ticket) || '', /phí ship/i);
});

test('incoming repair requires full physical intake after shipping settlement', () => {
    const ticket = incomingTicket({ deviceInfo: { model: '' }, issue: { description: '' }, issues: [] });
    assert.match(getInboundIntakeDetailsError(ticket) || '', /model thiết bị/i);
    assert.match(getInboundArrivalPrerequisiteError(ticket) || '', /model thiết bị/i);
});

test('incoming repair cannot transition until physical arrival is confirmed', () => {
    const ticket = incomingTicket();
    assert.throws(() => assertInboundArrivalConfirmedForTransition(ticket, inboundArrivalNode), /chưa xác nhận máy đã đến/i);

    const receivedTicket = incomingTicket({ inboundShipping: { paidAmount: 50000, lastPaymentMethod: 'BANK', status: 'received' } });
    assert.throws(() => assertInboundArrivalConfirmedForTransition(receivedTicket, inboundArrivalNode), /chưa hoàn tất cập nhật thông tin tiếp nhận/i);

    const completedTicket = incomingTicket({
        inboundShipping: { paidAmount: 50000, lastPaymentMethod: 'BANK', status: 'received', intakeCompletedAt: new Date() },
    });
    assert.doesNotThrow(() => assertInboundArrivalConfirmedForTransition(completedTicket, inboundArrivalNode));
});

test('customer-paid inbound shipping does not require a shop cash or bank expense', () => {
    const ticket = incomingTicket({
        inboundShipping: { status: 'received', settlementType: 'customer_paid', lastPaymentMethod: 'CUSTOMER', intakeCompletedAt: new Date() },
    });
    assert.doesNotThrow(() => assertInboundArrivalConfirmedForTransition(ticket, inboundArrivalNode));
});

test('technician sees an inbound hold until reception completes physical intake', () => {
    assert.equal(getInboundTechnicianHoldMessage(incomingTicket(), inboundArrivalNode), 'Khách đang gửi máy đến shop.');

    const receivedTicket = incomingTicket({
        inboundShipping: { paidAmount: 50000, lastPaymentMethod: 'CASH', status: 'received' },
    });
    assert.equal(getInboundTechnicianHoldMessage(receivedTicket, inboundArrivalNode), 'Tiếp nhận đang hoàn tất thông tin máy.');

    const intakeCompletedTicket = incomingTicket({
        inboundShipping: {
            paidAmount: 50000,
            lastPaymentMethod: 'CASH',
            status: 'received',
            intakeCompletedAt: new Date(),
        },
    });
    assert.equal(getInboundTechnicianHoldMessage(intakeCompletedTicket, inboundArrivalNode), null);

    assert.equal(getInboundTechnicianHoldMessage(incomingTicket(), { ...inboundArrivalNode, allowedFeatures: [] }), null);
});

test('expected parts can only be selected while reception is completing a received inbound device', () => {
    assert.equal(canSelectInitialPartsDuringInboundIntake(incomingTicket(), inboundArrivalNode), false);

    const receivedTicket = incomingTicket({
        inboundShipping: { paidAmount: 50000, lastPaymentMethod: 'CASH', status: 'received' },
    });
    assert.equal(canSelectInitialPartsDuringInboundIntake(receivedTicket, inboundArrivalNode), true);

    const completedTicket = incomingTicket({
        inboundShipping: {
            paidAmount: 50000,
            lastPaymentMethod: 'CASH',
            status: 'received',
            intakeCompletedAt: new Date(),
        },
    });
    assert.equal(canSelectInitialPartsDuringInboundIntake(completedTicket, inboundArrivalNode), false);
    assert.equal(canSelectInitialPartsDuringInboundIntake(receivedTicket, { ...inboundArrivalNode, allowedFeatures: [] }), false);
});

test('editing a walk-in keeps expected-part selection available without relying on a status id', () => {
    const editableNode = { id: 'custom_inspection', label: 'Kiểm tra', color: '', allowedNext: [] };
    const terminalNode = { ...editableNode, isTerminal: true };

    assert.equal(canSelectInitialPartsWhenEditingRepair({ appointmentIntakeMethod: 'walk_in' }, editableNode), true);
    assert.equal(canSelectInitialPartsWhenEditingRepair(incomingTicket(), inboundArrivalNode), false);
    assert.equal(canSelectInitialPartsWhenEditingRepair(
        incomingTicket({ inboundShipping: { paidAmount: 50000, lastPaymentMethod: 'CASH', status: 'received' } }),
        inboundArrivalNode,
    ), true);
    assert.equal(canSelectInitialPartsWhenEditingRepair({ appointmentIntakeMethod: 'walk_in' }, terminalNode), false);
});
