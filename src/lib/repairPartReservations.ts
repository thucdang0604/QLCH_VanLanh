import { isSelectedRepairPart } from '@/lib/repairStatus';
import { isInventoryConsumedRepairPart } from '@/lib/repairPartConsumption';

export type RepairPartReservationLine = {
    productId?: string;
    quantity?: number;
    reservedQuantity?: number;
    inventoryDeductedAt?: unknown;
    status?: string;
};

function toQuantity(value: unknown): number {
    return Math.max(0, Math.floor(Number(value) || 0));
}

export function getSelectedPartQuantity(part: RepairPartReservationLine): number {
    return isSelectedRepairPart(part) && !isInventoryConsumedRepairPart(part)
        ? toQuantity(part.quantity)
        : 0;
}

/** Quantity already recorded as reserved on this repair line. */
export function getRecordedReservationQuantity(part: RepairPartReservationLine): number {
    return Math.min(getSelectedPartQuantity(part), toQuantity(part.reservedQuantity));
}

/** Quantity still needing an inventory hold when a repair enters a configured work status. */
export function getMissingReservationQuantity(part: RepairPartReservationLine): number {
    return getSelectedPartQuantity(part) - getRecordedReservationQuantity(part);
}

/**
 * Used by the repair-hold reconciliation. A selected repair line must hold its
 * entire selected quantity; reservedQuantity is only a per-line audit marker
 * and may be absent or incomplete on historical data.
 */
export function getExpectedReservationQuantity(part: RepairPartReservationLine): number {
    return getSelectedPartQuantity(part);
}
