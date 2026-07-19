import type { FirestoreDateValue } from '@/lib/types';
import { calculateImportableTotal, isReceiptItemUnavailable } from '@/lib/importReceiptAvailability';
import type { ImportPreviewState, ImportReceipt, NewPartInfo, ProductWithId } from './importReceiptTypes';

export function formatReceiptPrice(price?: number) {
    if (!price) return '0đ';
    return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
}

export function formatReceiptDate(ts: FirestoreDateValue | Date | number | null | undefined) {
    if (!ts) return '—';
    const date = typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function'
        ? ts.toDate()
        : new Date(ts as number | Date);
    return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function buildImportPreviewState(receipt: ImportReceipt, parts: ProductWithId[]): {
    previewState: ImportPreviewState;
    forecastCostPrices: Map<string, number>;
} {
    const importableItems = receipt.items.filter((item) => !isReceiptItemUnavailable(item));
    const importableReceipt: ImportReceipt = {
        ...receipt,
        items: importableItems,
        totalAmount: calculateImportableTotal(receipt.items),
    };

    const newParts: Record<string, NewPartInfo> = {};
    for (const item of importableItems) {
        const existingPart = parts.find((part) => part.id === item.productId);
        // A receipt line with productId is already linked to a catalog record.
        // Missing records are handled before this preview is opened; only an
        // unlinked line or a proposed catalog entry needs product details.
        if (!item.productId || existingPart?.isProposed) {
            const partKey = item.productId || item.partLineId || crypto.randomUUID();
            newParts[partKey] = {
                model: '',
                partType: '',
                price_promo: 0,
                supplier: item.supplier || '',
            };
        }
    }

    const forecastCostPrices = new Map<string, number>();
    for (const item of importableItems) {
        if (item.productId in newParts) continue;

        const part = parts.find((candidate) => candidate.id === item.productId);
        if (!part) continue;

        const oldStock = Number(part.stock) || 0;
        const oldCost = Number(part.costPrice) || Number(part.price_original) || 0;
        const newQty = Number(item.quantity);
        const newCost = Number(item.importPrice);
        const totalQty = oldStock + newQty;
        const avgCost = totalQty > 0 ? Math.round(((oldStock * oldCost) + (newQty * newCost)) / totalQty) : newCost;
        forecastCostPrices.set(item.productId, avgCost);
    }

    return {
        previewState: {
            isOpen: true,
            receipt: importableReceipt,
            newParts,
        },
        forecastCostPrices,
    };
}
