import assert from 'node:assert/strict';
import test from 'node:test';
import {
    findSelectedRepairPartIndex,
    increaseSelectedRepairPartQuantity,
} from './repairPartSelection';

test('finds only an already selected line for the same product', () => {
    const parts = [
        { productId: 'man-hinh', status: 'requested', quantity: 1 },
        { productId: 'man-hinh', status: 'selected', quantity: 1, reservedQuantity: 1 },
    ];

    assert.equal(findSelectedRepairPartIndex(parts, 'man-hinh'), 1);
});

test('increases a repeated selected part without creating a second line', () => {
    const part = increaseSelectedRepairPartQuantity(
        { productId: 'man-hinh', status: 'selected', quantity: 1, reservedQuantity: 1 },
        2,
    );

    assert.equal(part.quantity, 3);
    assert.equal(part.reservedQuantity, 3);
});

test('preserves a legacy selected line reservation when the field is absent', () => {
    const part = increaseSelectedRepairPartQuantity(
        { productId: 'man-hinh', status: 'selected', quantity: 1 } as {
            productId: string;
            status: string;
            quantity: number;
            reservedQuantity?: number;
        },
        1,
    );

    assert.equal(part.quantity, 2);
    assert.equal(part.reservedQuantity, 2);
});

test('treats a zero legacy reservation as the selected quantity', () => {
    const part = increaseSelectedRepairPartQuantity(
        { productId: 'man-hinh', status: 'selected', quantity: 2, reservedQuantity: 0 },
        1,
    );

    assert.equal(part.quantity, 3);
    assert.equal(part.reservedQuantity, 3);
});
