import type { RepairTicket } from './types';

export const REPAIR_STATUS = {
    INTAKE: 'cho_tiep_nhan',
    INSPECTION: 'dang_kiem_tra',
    PARTS_ORDERED: 'da_dat_linh_kien',
    CUSTOMER_HANDOVER: 'cho_ban_giao_khach',
    DONE: 'done',
    REFUND: 'refund',
    OUT: 'out',
} as const;

export const REPAIR_PART_STATUS = {
    REQUESTED: 'requested',
    APPROVED: 'approved',
    ORDERED: 'ordered',
    SELECTED: 'selected',
    IN_STOCK: 'in_stock',
    UNAVAILABLE: 'unavailable',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
} as const;

export type CoreRepairStatus = typeof REPAIR_STATUS[keyof typeof REPAIR_STATUS];
export type RepairPartStatus = typeof REPAIR_PART_STATUS[keyof typeof REPAIR_PART_STATUS];
export type RepairPartLine = NonNullable<RepairTicket['parts']>[number];

export function isRepairStatus(status: string | undefined, target: CoreRepairStatus) {
    return status === target;
}

export function isRepairPartStatus(status: string | undefined, target: RepairPartStatus) {
    return status === target;
}

export function hasRepairPartStatus(part: { status?: string }, ...targets: RepairPartStatus[]) {
    return targets.includes(part.status as RepairPartStatus);
}

export function isPendingRepairPart(part: { status?: string }) {
    return hasRepairPartStatus(part, REPAIR_PART_STATUS.REQUESTED, REPAIR_PART_STATUS.ORDERED);
}

export function isSelectedRepairPart(part: { status?: string }) {
    return isRepairPartStatus(part.status, REPAIR_PART_STATUS.SELECTED);
}

export function isRejectedRepairPart(part: { status?: string }) {
    return isRepairPartStatus(part.status, REPAIR_PART_STATUS.REJECTED);
}

export function isWarrantyEligibleRepairPart(part: { status?: string }) {
    return !hasRepairPartStatus(part, REPAIR_PART_STATUS.REJECTED, REPAIR_PART_STATUS.CANCELLED);
}
