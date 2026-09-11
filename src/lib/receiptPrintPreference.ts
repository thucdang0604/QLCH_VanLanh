export type ReceiptPrintTemplate = 'thermal' | 'a5';

export const RECEIPT_PRINT_TEMPLATE_STORAGE_KEY = 'qlch_receipt_print_template_v1';

export function parseReceiptPrintTemplate(rawValue: string | null): ReceiptPrintTemplate | null {
    return rawValue === 'thermal' || rawValue === 'a5' ? rawValue : null;
}
