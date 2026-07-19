import { isSelectedRepairPart } from '@/lib/repairStatus';

export type SelectableRepairPartLine = {
    productId?: string;
    status?: string;
    quantity?: number;
    reservedQuantity?: number;
};

function toQuantity(value: unknown): number {
    return Math.max(0, Math.floor(Number(value) || 0));
}

export function findSelectedRepairPartIndex(
    parts: SelectableRepairPartLine[],
    productId: string,
): number {
    return parts.findIndex((part) => part.productId === productId && isSelectedRepairPart(part));
}

/** Adds a repeated selection to the same repair line without repricing it. */
export function increaseSelectedRepairPartQuantity<T extends SelectableRepairPartLine>(
    part: T,
    addedQuantity: number,
): T {
    const currentQuantity = toQuantity(part.quantity);
    const increment = toQuantity(addedQuantity);
    const rawReservedQuantity = Number(part.reservedQuantity);
    const currentReservedQuantity = Number.isFinite(rawReservedQuantity) && rawReservedQuantity > 0
        ? Math.min(currentQuantity, Math.max(0, Math.floor(rawReservedQuantity)))
        : currentQuantity;

    return {
        ...part,
        quantity: currentQuantity + increment,
        reservedQuantity: currentReservedQuantity + increment,
    };
}
