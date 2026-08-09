import assert from 'node:assert/strict';
import test from 'node:test';
import { isRepairReadyForPosPayment } from './posRepairPaymentEligibility';

test('only exposes unpaid repairs that are waiting for customer handover in POS', () => {
    assert.equal(isRepairReadyForPosPayment({
        status: 'cho_ban_giao_khach',
        payment: { status: 'unpaid' },
    }), true);
    assert.equal(isRepairReadyForPosPayment({
        status: 'cho_ban_giao_khach',
        payment: { status: 'partial' },
    }), true);

    assert.equal(isRepairReadyForPosPayment({
        status: 'cho_tiep_nhan',
        payment: { status: 'unpaid' },
    }), false);
    assert.equal(isRepairReadyForPosPayment({
        status: 'bao_tinh_trang_va_gia',
        payment: { status: 'unpaid' },
    }), false);
    assert.equal(isRepairReadyForPosPayment({
        status: 'cho_ban_giao_khach',
        payment: { status: 'paid' },
    }), false);
});
