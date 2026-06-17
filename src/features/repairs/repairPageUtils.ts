import type { TaxonomyNode } from '@/lib/types';

export type WarrantyPrintType = 'warrantyDevice' | 'warrantyRepair' | 'warrantyAccessory';

export interface Appointment {
    id: string;
    fullName: string;
    phone: string;
    date: string;
    timeSlot: string;
    store: string;
    status: string;
    serviceName?: string;
    serviceId?: string;
    appService?: {
        name?: string;
    };
}

export interface ServiceModel {
    id: string;
    name?: string;
    category?: string;
    price?: number | string;
    price_promo?: number | string;
    price_original?: number | string;
    device_model?: string;
    isActive?: boolean;
    [key: string]: unknown;
}

export type RepairPermissionUser = {
    role?: string | null;
    permissions?: string[] | null;
};

export function formatRepairPrice(price: number) {
    return price > 0 ? price.toLocaleString('vi-VN') + 'đ' : '—';
}

export function canOverrideRepairTerminalStatus(user: RepairPermissionUser | null | undefined) {
    return user?.role?.toLowerCase() === 'admin' || user?.permissions?.includes('admin_only');
}

export function mapWarrantyTypeToPrintType(type: WarrantyPrintType): 'device' | 'repair' | 'accessory' {
    if (type === 'warrantyDevice') return 'device';
    if (type === 'warrantyRepair') return 'repair';
    return 'accessory';
}

export function resolveWarrantyTypeFromPath(nodes: TaxonomyNode[], categoryPath: string[]): WarrantyPrintType | null {
    let currentLevel = nodes;
    let result: WarrantyPrintType | null = null;

    for (const pathId of categoryPath) {
        const node = currentLevel.find((item) => item.id === pathId);
        if (!node) break;
        if (node.warrantyType && node.warrantyType !== 'none') result = node.warrantyType;
        currentLevel = node.children || [];
    }

    return result;
}
