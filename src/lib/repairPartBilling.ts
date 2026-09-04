import { isInventoryConsumedRepairPart } from '@/lib/repairPartConsumption';
import { isSelectedRepairPart } from '@/lib/repairStatus';

export type RepairPartBillingLine = {
    status?: string;
    quantity?: number;
    unitPriceAtUse?: number;
    price?: number;
    inventoryDeductedAt?: unknown;
    returnedToReceptionPendingAt?: unknown;
};

/**
 * A returned test part must never be charged. Installed parts are identified
 * by their immutable inventory-consumption marker; legacy selected lines stay
 * billable until their existing handover path consumes them.
 */
export function isBillableRepairPart(part: RepairPartBillingLine): boolean {
    return isSelectedRepairPart(part)
        && (!part.returnedToReceptionPendingAt || isInventoryConsumedRepairPart(part));
}

export function getActualUsedRepairPartsCost(parts: RepairPartBillingLine[]): number {
    return parts
        .filter(part => isBillableRepairPart(part) && isInventoryConsumedRepairPart(part))
        .reduce((sum, part) => sum + (Number(part.unitPriceAtUse ?? part.price ?? 0) || 0) * Math.max(0, Number(part.quantity) || 0), 0);
}
