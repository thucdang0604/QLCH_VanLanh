import { isSelectedRepairPart } from '@/lib/repairStatus';

export type RepairPartVerificationAction = 'use' | 'return';

export type ConsumableRepairPartLine = {
    partLineId?: string;
    status?: string;
    inventoryDeductedAt?: unknown;
};

export type RepairPartVerificationEntry<T extends ConsumableRepairPartLine> = {
    index: number;
    part: T;
};

export function isInventoryConsumedRepairPart(part: ConsumableRepairPartLine): boolean {
    return Boolean(part.inventoryDeductedAt);
}

/**
 * Splits selected parts into installed parts and test parts at the point the
 * repair is completed. Missing selections intentionally default to "use" so
 * manager/admin transitions retain the established all-used behavior.
 */
export function planRepairPartVerification<T extends ConsumableRepairPartLine>(
    parts: T[],
    selections: Record<string, RepairPartVerificationAction> | undefined,
): {
    used: RepairPartVerificationEntry<T>[];
    returned: RepairPartVerificationEntry<T>[];
} {
    const used: RepairPartVerificationEntry<T>[] = [];
    const returned: RepairPartVerificationEntry<T>[] = [];

    parts.forEach((part, index) => {
        if (!isSelectedRepairPart(part) || isInventoryConsumedRepairPart(part)) return;

        const entry = { index, part };
        if (part.partLineId && selections?.[part.partLineId] === 'return') {
            returned.push(entry);
        } else {
            used.push(entry);
        }
    });

    return { used, returned };
}
