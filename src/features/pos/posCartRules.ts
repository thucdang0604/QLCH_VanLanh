import type { CartItem } from './posTypes';

/**
 * Repair lines are derived from the repair ticket and must keep their original
 * price/quantity until the whole ticket is removed from the POS cart.
 */
export function removeCartItem(cart: CartItem[], cartItemId: string): CartItem[] {
    const item = cart.find(candidate => candidate.cartItemId === cartItemId);
    if (item?.isRepairTicket) return cart;

    return cart.filter(candidate => candidate.cartItemId !== cartItemId);
}

export function removeRepairTicketFromCart(cart: CartItem[], repairTicketId: string): CartItem[] {
    return cart.filter(item => item.repairTicketId !== repairTicketId);
}

export function getRepairTicketIdsInCart(cart: CartItem[]): Set<string> {
    return new Set(
        cart
            .filter(item => item.isRepairTicket && item.repairTicketId)
            .map(item => item.repairTicketId!),
    );
}
