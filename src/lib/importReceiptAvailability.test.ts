import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateImportableTotal,
    getReceiptItemAvailability,
    isReceiptItemUnavailable,
} from './importReceiptAvailability';

test('prefers the persisted status over the legacy availability field', () => {
    const item = {
        quantity: 1,
        importPrice: 100,
        status: 'unavailable',
        availability: 'in_stock' as const,
    };

    assert.equal(getReceiptItemAvailability(item), 'unavailable');
    assert.equal(isReceiptItemUnavailable(item), true);
});

test('excludes unavailable lines from the importable total', () => {
    assert.equal(calculateImportableTotal([
        { quantity: 2, importPrice: 100, status: 'in_stock' },
        { quantity: 3, importPrice: 200, status: 'unavailable' },
        { quantity: 1, importPrice: 50 },
    ]), 250);
});
