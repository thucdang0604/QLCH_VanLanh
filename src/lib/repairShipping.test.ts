import assert from 'node:assert/strict';
import test from 'node:test';
import { readRepairShippingInput } from './repairShipping';

const repairIds = new Set(['SC-260801-001']);

test('accepts customer-paid repair shipping with recipient details', () => {
    const shipping = readRepairShippingInput({
        repairTicketId: 'SC-260801-001',
        mode: 'customer_paid_now',
        fee: '35000',
        recipientName: 'Nguyễn An',
        recipientPhone: '0900000000',
        recipientAddress: 'Q. 12, TP.HCM',
    }, repairIds);

    assert.deepEqual(shipping, {
        repairTicketId: 'SC-260801-001',
        mode: 'customer_paid_now',
        fee: 35_000,
        recipientName: 'Nguyễn An',
        recipientPhone: '0900000000',
        recipientAddress: 'Q. 12, TP.HCM',
    });
});

test('requires a shop payment channel and a debtor for shop-funded shipping', () => {
    const base = {
        repairTicketId: 'SC-260801-001',
        fee: 35_000,
        recipientName: 'Nguyễn An',
        recipientPhone: '0900000000',
        recipientAddress: 'Q. 12, TP.HCM',
    };

    assert.throws(() => readRepairShippingInput({ ...base, mode: 'shop_absorbs' }, repairIds), /kênh shop thanh toán/);
    assert.throws(() => readRepairShippingInput({ ...base, mode: 'shop_advance_on_credit', shopPaymentMethod: 'CASH' }, repairIds), /mã khách\/đối tác/);
    assert.equal(readRepairShippingInput({
        ...base,
        mode: 'shop_advance_on_credit',
        shopPaymentMethod: 'BANK',
        billingCustomerId: 'KH-DOI-TAC-01',
    }, repairIds)?.billingCustomerId, 'KH-DOI-TAC-01');
});

test('rejects shipping that is not tied to exactly one repair ticket', () => {
    assert.throws(() => readRepairShippingInput({
        repairTicketId: 'SC-unknown',
        mode: 'customer_paid_now',
        fee: 35_000,
        recipientName: 'Nguyễn An',
        recipientPhone: '0900000000',
        recipientAddress: 'Q. 12, TP.HCM',
    }, repairIds), /đúng một phiếu sửa chữa/);

    assert.throws(() => readRepairShippingInput({
        repairTicketId: 'SC-260801-001',
        mode: 'customer_paid_now',
        fee: 35_000,
        recipientName: 'Nguyễn An',
        recipientPhone: '0900000000',
        recipientAddress: 'Q. 12, TP.HCM',
    }, new Set(['SC-260801-001', 'SC-260801-002'])), /đúng một phiếu sửa chữa/);
});
