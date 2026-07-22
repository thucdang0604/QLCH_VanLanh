import assert from 'node:assert/strict';
import test from 'node:test';
import { getRepairTicketIdsInCart, removeCartItem, removeRepairTicketFromCart } from './posCartRules';
import type { CartItem } from './posTypes';

function cartItem(overrides: Partial<CartItem>): CartItem {
    return {
        cartItemId: 'cart-item',
        productId: 'product',
        name: 'Sản phẩm',
        originalPrice: 100_000,
        sellingPrice: 100_000,
        quantity: 1,
        ...overrides,
    };
}

test('does not remove an individual repair line', () => {
    const repairPart = cartItem({
        cartItemId: 'repair-1-part-0',
        repairTicketId: 'repair-1',
        isRepairTicket: true,
    });
    const retailItem = cartItem({ cartItemId: 'retail-1' });
    const cart = [repairPart, retailItem];

    assert.equal(removeCartItem(cart, repairPart.cartItemId), cart);
});

test('removes every line belonging to a repair ticket together', () => {
    const repairPart = cartItem({
        cartItemId: 'repair-1-part-0',
        repairTicketId: 'repair-1',
        isRepairTicket: true,
    });
    const repairLabor = cartItem({
        cartItemId: 'repair-1-labor',
        repairTicketId: 'repair-1',
        isRepairTicket: true,
    });
    const repairGift = cartItem({
        cartItemId: 'repair-1-gift',
        repairTicketId: 'repair-1',
    });
    const retailItem = cartItem({ cartItemId: 'retail-1' });

    assert.deepEqual(
        removeRepairTicketFromCart([repairPart, repairLabor, repairGift, retailItem], 'repair-1'),
        [retailItem],
    );
});

test('only treats a repair as paid with the POS cart when its repair line is present', () => {
    const repairLine = cartItem({
        cartItemId: 'repair-1-part-0',
        repairTicketId: 'repair-1',
        isRepairTicket: true,
    });
    const repairGift = cartItem({
        cartItemId: 'repair-2-gift',
        repairTicketId: 'repair-2',
        isRepairTicket: false,
    });

    assert.deepEqual(
        Array.from(getRepairTicketIdsInCart([repairLine, repairGift])),
        ['repair-1'],
    );
});
