import assert from 'node:assert/strict';
import test from 'node:test';
import { extractZaloQrIdentity, resolveZaloProfileQrValue } from './zaloContactCardImport';

test('resolves a Zalo contact-card URL for local QR generation', () => {
    assert.equal(
        resolveZaloProfileQrValue({ profileUrl: 'https://zaloapp.com/qr/p/qalqfllk9ulc' }),
        'http://zaloapp.com/qr/p/qalqfllk9ulc',
    );
    assert.equal(
        resolveZaloProfileQrValue({ externalId: 'qalqfllk9ulc' }),
        'http://zaloapp.com/qr/p/qalqfllk9ulc',
    );
    assert.equal(
        resolveZaloProfileQrValue({ value: 'https://zalo.me/0901234567' }),
        'https://zalo.me/0901234567',
    );
});

test('refuses to turn an arbitrary Zalo label or unsafe URL into a QR link', () => {
    assert.equal(resolveZaloProfileQrValue({ value: 'Anh Bảy Gà' }), null);
    assert.equal(resolveZaloProfileQrValue({ value: 'javascript:alert(1)' }), null);
    assert.equal(extractZaloQrIdentity('https://example.com/zaloapp.com/qr/p/qalqfllk9ulc'), null);
});
