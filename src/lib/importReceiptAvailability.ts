export type ImportReceiptAvailability = 'in_stock' | 'unavailable' | 'approved';

export type AvailabilityReceiptItem = {
    quantity: number;
    importPrice: number;
    status?: string;
    availability?: ImportReceiptAvailability;
};

export function getReceiptItemAvailability(
    item: AvailabilityReceiptItem,
): ImportReceiptAvailability | undefined {
    if (item.status === 'in_stock' || item.status === 'unavailable' || item.status === 'approved') return item.status as ImportReceiptAvailability;
    return item.availability;
}

export function isReceiptItemUnavailable(item: AvailabilityReceiptItem): boolean {
    return getReceiptItemAvailability(item) === 'unavailable';
}

export function calculateImportableTotal(items: AvailabilityReceiptItem[]): number {
    return items.reduce(
        (total, item) => total + (isReceiptItemUnavailable(item) ? 0 : item.importPrice * item.quantity),
        0,
    );
}
