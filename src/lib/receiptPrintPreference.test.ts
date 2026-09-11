import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReceiptPrintTemplate } from './receiptPrintPreference';

test('accepts only receipt templates supported by the current printer UI', () => {
    assert.equal(parseReceiptPrintTemplate('a5'), 'a5');
    assert.equal(parseReceiptPrintTemplate('thermal'), 'thermal');
    assert.equal(parseReceiptPrintTemplate('a4'), null);
    assert.equal(parseReceiptPrintTemplate('<script>'), null);
    assert.equal(parseReceiptPrintTemplate(null), null);
});
