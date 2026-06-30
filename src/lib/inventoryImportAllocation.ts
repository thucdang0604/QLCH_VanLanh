const ALLOCATABLE_REPAIR_PART_STATUSES = new Set([
    'requested',
    'approved',
    'ordered',
    'in_stock',
]);

export type ImportAllocationLine = {
    quantity?: number;
    reservedQuantity?: number;
    status?: string;
};

export type ImportAllocationPlan = {
    heldQuantity: number;
    surplusQuantity: number;
    requestedQuantity: number;
    shouldUnlink: boolean;
    unlinkReason?: 'missing_line' | 'inactive_line' | 'already_allocated';
};

export type ProductImportState = {
    stock: number;
    held: number;
    costPrice: number;
};

export type ProductStockReservationState = {
    stock: number;
    held: number;
    label?: string;
};

function positiveInteger(value: unknown, label: string): number {
    const numberValue = Number(value);
    if (!Number.isInteger(numberValue) || numberValue <= 0) {
        throw new Error(`${label} phải là số nguyên lớn hơn 0.`);
    }
    return numberValue;
}

export function planRepairImportAllocation(
    importedQuantityInput: unknown,
    line?: ImportAllocationLine,
): ImportAllocationPlan {
    const importedQuantity = positiveInteger(importedQuantityInput, 'Số lượng nhập');

    if (!line) {
        return {
            heldQuantity: 0,
            surplusQuantity: importedQuantity,
            requestedQuantity: 0,
            shouldUnlink: true,
            unlinkReason: 'missing_line',
        };
    }

    if (!ALLOCATABLE_REPAIR_PART_STATUSES.has(String(line.status || ''))) {
        return {
            heldQuantity: 0,
            surplusQuantity: importedQuantity,
            requestedQuantity: 0,
            shouldUnlink: true,
            unlinkReason: line.status === 'selected' ? 'already_allocated' : 'inactive_line',
        };
    }

    const totalRequestedQuantity = positiveInteger(line.quantity, 'Số lượng KTV yêu cầu');
    const currentReservedQuantity = Math.max(0, Math.min(
        Number(line.reservedQuantity) || 0,
        totalRequestedQuantity,
    ));
    const requestedQuantity = totalRequestedQuantity - currentReservedQuantity;

    if (requestedQuantity === 0) {
        return {
            heldQuantity: 0,
            surplusQuantity: importedQuantity,
            requestedQuantity: 0,
            shouldUnlink: true,
            unlinkReason: 'already_allocated',
        };
    }

    const heldQuantity = Math.min(importedQuantity, requestedQuantity);
    return {
        heldQuantity,
        surplusQuantity: importedQuantity - heldQuantity,
        requestedQuantity,
        shouldUnlink: false,
    };
}

export function applyProductImport(
    current: ProductImportState,
    importedQuantityInput: unknown,
    importPriceInput: unknown,
    heldQuantityInput: unknown,
): ProductImportState {
    const importedQuantity = positiveInteger(importedQuantityInput, 'Số lượng nhập');
    const heldQuantity = Number(heldQuantityInput);
    const importPrice = Number(importPriceInput);
    if (!Number.isInteger(heldQuantity) || heldQuantity < 0 || heldQuantity > importedQuantity) {
        throw new Error('Số lượng giữ kho không hợp lệ.');
    }
    if (!Number.isFinite(importPrice) || importPrice < 0) {
        throw new Error('Giá nhập không hợp lệ.');
    }

    const stock = current.stock + importedQuantity;
    const totalValue = current.stock * current.costPrice + importedQuantity * importPrice;
    return {
        stock,
        held: current.held + heldQuantity,
        costPrice: Math.round(totalValue / stock) || 0,
    };
}

export function assertStockCoversHeld(state: ProductStockReservationState): void {
    const stock = Number(state.stock) || 0;
    const held = Number(state.held) || 0;
    if (stock < held) {
        const label = state.label ? ` "${state.label}"` : '';
        throw new Error(`Ton kho${label} khong du de bao toan hang da giu cho (stock ${stock}, held ${held}).`);
    }
}
