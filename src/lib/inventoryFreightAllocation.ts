export type FreightAllocationInput = {
    quantity: number;
    unitPurchaseCost: number;
};

/**
 * Allocates inbound freight by the purchase value of each received line.
 * Returned amounts are whole VND and always add up to the source freight.
 */
export function allocateInboundFreightByValue(
    items: readonly FreightAllocationInput[],
    freightAmountInput: unknown,
): number[] {
    const freightAmount = Math.max(0, Math.round(Number(freightAmountInput) || 0));
    if (items.length === 0 || freightAmount === 0) return items.map(() => 0);

    const weights = items.map(item => Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPurchaseCost) || 0));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
        const base = Math.floor(freightAmount / items.length);
        return items.map((_, index) => index === items.length - 1 ? freightAmount - base * index : base);
    }

    let remaining = freightAmount;
    return weights.map((weight, index) => {
        if (index === weights.length - 1) return remaining;
        const allocated = Math.floor((freightAmount * weight) / totalWeight);
        remaining -= allocated;
        return allocated;
    });
}
