import assert from 'node:assert/strict';
import test from 'node:test';
import { collectOrderWarrantySerials, normalizeWarrantySerial } from './orderWarrantyLookup';

test('normalizes IMEI/serial values for case-insensitive lookup', () => {
    assert.equal(normalizeWarrantySerial(' ab 12-cd '), 'AB12-CD');
});

test('collects unique serials from all order items', () => {
    assert.deepEqual(
        collectOrderWarrantySerials([
            { imeis: [' abc 123 ', 'XYZ'] },
            { imeis: ['ABC123', ''] },
            { name: 'accessory' },
        ]),
        ['ABC123', 'XYZ'],
    );
});
