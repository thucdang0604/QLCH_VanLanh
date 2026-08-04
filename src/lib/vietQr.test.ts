import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVietQrImageUrl } from './vietQr';

test('builds a proxy-safe VietQR image URL with normalized bank details', () => {
    const url = buildVietQrImageUrl({
        bankId: '9704-07',
        accountNo: '1903 1234 5678',
        accountName: 'NGUYEN VAN A',
        amount: 120_000.4,
        addInfo: 'POS-ABCD1234',
    });

    assert.notEqual(url, '');
    const remoteUrl = new URL(new URL(url, 'https://vanlanh.local').searchParams.get('url') || '');
    assert.equal(remoteUrl.origin, 'https://img.vietqr.io');
    assert.equal(remoteUrl.pathname, '/image/970407-190312345678-compact2.png');
    assert.equal(remoteUrl.searchParams.get('amount'), '120000');
    assert.equal(remoteUrl.searchParams.get('addInfo'), 'POS-ABCD1234');
});

test('does not create a VietQR URL without a usable bank or account number', () => {
    assert.equal(buildVietQrImageUrl({ bankId: '  ', accountNo: '123', amount: 1, addInfo: 'POS-ABC123' }), '');
    assert.equal(buildVietQrImageUrl({ bankId: '970407', accountNo: '---', amount: 1, addInfo: 'POS-ABC123' }), '');
});
