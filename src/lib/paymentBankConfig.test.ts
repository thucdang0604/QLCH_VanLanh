import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaymentBankConfig } from './paymentBankConfig';

test('exposes only valid payment QR fields from bank settings', () => {
    const config = buildPaymentBankConfig({
        adminPhone: '0900000000',
        totpEnabled: true,
        totpSecret: 'private-secret',
        bankId: '  970422 ',
        accountNo: ' 123456789 ',
        accountName: ' VĂN LÀNH ',
        accounts: [
            { bankId: '970422', accountNo: '123456789', accountName: 'VĂN LÀNH', isDefault: true },
            { bankId: '', accountNo: 'missing-bank-id' },
            { bankId: '970436', accountNo: '222222222', accountName: 123 },
        ],
    });

    assert.deepEqual(config, {
        bankId: '970422',
        accountNo: '123456789',
        accountName: 'VĂN LÀNH',
        accounts: [
            { bankId: '970422', accountNo: '123456789', accountName: 'VĂN LÀNH', isDefault: true },
            { bankId: '970436', accountNo: '222222222', accountName: '', isDefault: false },
        ],
    });
    assert.equal('totpSecret' in config, false);
    assert.equal('adminPhone' in config, false);
});
