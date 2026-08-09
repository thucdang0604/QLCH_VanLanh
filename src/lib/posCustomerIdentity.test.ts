import assert from 'node:assert/strict';
import test from 'node:test';
import { canCreatePosDebt, readPosCustomerIdentityMode, resolvePosZaloContactIdentity } from './posCustomerIdentity';

test('POS customer identity defaults untrusted request values to guest', () => {
    assert.equal(readPosCustomerIdentityMode(undefined), 'guest');
    assert.equal(readPosCustomerIdentityMode('name_only'), 'guest');
});

test('only explicit customer identities can create POS debt', () => {
    assert.equal(canCreatePosDebt('guest'), false);
    assert.equal(canCreatePosDebt('existing'), true);
    assert.equal(canCreatePosDebt('verified_phone'), true);
    assert.equal(canCreatePosDebt('zalo_contact'), true);
});

test('a Zalo contact card has a deterministic, case-insensitive customer identity', () => {
    assert.deepEqual(
        resolvePosZaloContactIdentity('https://zaloapp.com/qr/p/QalQfllk9ulc'),
        {
            externalId: 'qalqfllk9ulc',
            profileUrl: 'http://zaloapp.com/qr/p/QalQfllk9ulc',
            customerId: 'KH-ZALO-qalqfllk9ulc',
        },
    );
    assert.equal(resolvePosZaloContactIdentity('Anh Bảy Gà'), null);
    assert.equal(resolvePosZaloContactIdentity('https://example.com/zaloapp.com/qr/p/qalqfllk9ulc'), null);
});
