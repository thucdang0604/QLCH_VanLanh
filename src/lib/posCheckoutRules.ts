import type { RepairTicket } from '@/lib/types';

export type CheckoutItemInput = Record<string, unknown> & {
    isRepairTicket?: boolean;
    isOrderPayment?: boolean;
    productId?: unknown;
    quantity?: unknown;
    price?: unknown;
    lotCode?: unknown;
    repairTicketId?: unknown;
    orderPaymentId?: unknown;
    productName?: unknown;
    id?: unknown;
    imeis?: unknown;
};

export type RetailTaxonomyNode = {
    id?: string;
    slug?: string;
    warrantyType?: string;
    warrantyMonths?: string | number;
    children?: RetailTaxonomyNode[];
};

export function getCashierShiftChannel(paymentMethodCode: string): 'cash' | 'bank' | 'none' {
    const normalized = paymentMethodCode.trim().toUpperCase();
    if (normalized === 'CASH') return 'cash';
    if (normalized === 'BANK' || normalized === 'QR' || normalized === 'CARD' || normalized === 'MOMO') return 'bank';
    return 'none';
}

export function readNonNegativeCheckoutAmount(value: unknown, label: string): number {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${label} khong hop le.`);
    }
    return amount;
}

export function readOptionalNonNegativeCheckoutAmount(value: unknown, label: string): number {
    if (value === undefined || value === null || value === '') return 0;
    return readNonNegativeCheckoutAmount(value, label);
}

export function readPositiveCheckoutQuantity(value: unknown, label: string): number {
    if (value === undefined || value === null || value === '') return 1;
    const quantity = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`${label} khong hop le.`);
    }
    const normalizedQuantity = Math.floor(quantity);
    if (normalizedQuantity <= 0) {
        throw new Error(`${label} khong hop le.`);
    }
    return normalizedQuantity;
}

export function getRepairPaymentAmount(ticket: RepairTicket, ticketId: string): number {
    const amount = readNonNegativeCheckoutAmount(ticket.payment?.amount, `So tien phieu sua chua #${ticketId.slice(-6)}`);
    if (amount <= 0) {
        throw new Error(`Phieu sua chua #${ticketId.slice(-6)} khong co so tien can thu hop le.`);
    }
    return amount;
}

export function getRepairPaidAmount(ticket: RepairTicket): number {
    const paidFromHistory = (ticket.paymentHistory || []).reduce((sum, payment) => {
        const amount = Math.max(0, Number(payment.amount) || 0);
        return payment.type === 'refund' ? sum - amount : sum + amount;
    }, 0);
    return Math.max(0, Math.max(Number(ticket.payment?.depositAmount) || 0, paidFromHistory));
}

export function normalizeRepairTicketId(value: unknown) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const syntheticMatch = raw.match(/^(.+)_(?:part_\d+|labor)$/);
    return syntheticMatch?.[1] || raw;
}

export function normalizeOrderPaymentId(value: unknown) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const syntheticMatch = raw.match(/^order_payment_(.+)$/);
    return syntheticMatch?.[1] || raw;
}

export function resolveProductWarranty(
    productData: { warrantyType?: string; warrantyMonths?: string | number; category?: string },
    retailTrees: RetailTaxonomyNode[],
): { warrantyType: string; warrantyMonths: number } | null {
    if (productData.warrantyType && productData.warrantyType !== 'none') {
        return { warrantyType: productData.warrantyType, warrantyMonths: Number(productData.warrantyMonths) || 0 };
    }
    if (productData.warrantyType === 'none') return null;

    const categoryPath = productData.category || '';
    if (!categoryPath) return null;

    const segments = categoryPath.split('/');
    let currentNodes = retailTrees;
    let lastFoundWarranty: { warrantyType: string; warrantyMonths: number } | null = null;

    for (let index = 0; index < segments.length; index += 1) {
        const partialId = segments.slice(0, index + 1).join('/');
        const node = currentNodes.find(candidate => candidate.id === partialId || candidate.slug === segments[index]);
        if (!node) break;

        if (node.warrantyType && node.warrantyType !== 'none') {
            lastFoundWarranty = { warrantyType: node.warrantyType, warrantyMonths: Number(node.warrantyMonths) || 0 };
        } else if (node.warrantyType === 'none') {
            lastFoundWarranty = null;
        }

        if (!node.children || node.children.length === 0) break;
        currentNodes = node.children;
    }
    return lastFoundWarranty;
}
