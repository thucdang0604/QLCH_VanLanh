import type { RepairTicket } from '@/lib/types';
import { getProductCodeKind } from '@/lib/productCodes';

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
    productData: {
        warrantyType?: string;
        warrantyMonths?: string | number;
        category?: string;
        categoryIds?: unknown;
    },
    retailTrees: RetailTaxonomyNode[],
): { warrantyType: string; warrantyMonths: number } | null {
    const productWarranty = productData.warrantyType && productData.warrantyType !== 'none'
        ? { warrantyType: productData.warrantyType, warrantyMonths: Number(productData.warrantyMonths) || 0 }
        : null;
    // Older catalog records can have a warranty type without a term.  Treat it as
    // incomplete rather than letting it override a complete category policy.
    if (productWarranty && productWarranty.warrantyMonths > 0) return productWarranty;
    if (productData.warrantyType === 'none') return null;

    const categoryIds = Array.isArray(productData.categoryIds)
        ? productData.categoryIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];
    const categoryPath = categoryIds.length > 0
        ? categoryIds
        : String(productData.category || '').split('/').filter(Boolean).map((_, index, values) => values.slice(0, index + 1).join('/'));
    if (categoryPath.length === 0) return productWarranty;

    let currentNodes = retailTrees;
    let lastFoundWarranty: { warrantyType: string; warrantyMonths: number } | null = null;

    for (const categoryId of categoryPath) {
        const slug = categoryId.split('/').filter(Boolean).at(-1);
        const node = currentNodes.find(candidate => candidate.id === categoryId || candidate.slug === slug)
            || findRetailTaxonomyNode(retailTrees, categoryId);
        if (!node) break;

        if (node.warrantyType && node.warrantyType !== 'none') {
            lastFoundWarranty = { warrantyType: node.warrantyType, warrantyMonths: Number(node.warrantyMonths) || 0 };
        } else if (node.warrantyType === 'none' && node.warrantyMonths !== undefined) {
            lastFoundWarranty = null;
        }

        if (!node.children || node.children.length === 0) break;
        currentNodes = node.children;
    }
    return lastFoundWarranty || productWarranty;
}

function findRetailTaxonomyNode(nodes: RetailTaxonomyNode[], id: string): RetailTaxonomyNode | null {
    for (const node of nodes) {
        if (node.id === id || node.slug === id) return node;
        const match = findRetailTaxonomyNode(node.children || [], id);
        if (match) return match;
    }
    return null;
}

/** Calculate the immutable expiration timestamp that belongs on an order line. */
export function getWarrantyExpiresAt(startedAt: number, warrantyMonths: number): number | undefined {
    if (!Number.isFinite(startedAt) || !Number.isInteger(warrantyMonths) || warrantyMonths <= 0) return undefined;
    const expiresAt = new Date(startedAt);
    expiresAt.setMonth(expiresAt.getMonth() + warrantyMonths);
    return expiresAt.getTime();
}

export function requiresImeiForPosRetailProduct(productData: { category?: unknown; categoryIds?: unknown }) {
    const categoryIds = Array.isArray(productData.categoryIds)
        ? productData.categoryIds.filter((value): value is string => typeof value === 'string')
        : [];

    return getProductCodeKind({
        category: typeof productData.category === 'string' ? productData.category : '',
        categoryIds,
    }) === 'product';
}

export function getFixedPosRetailPrice(productData: { price_promo?: unknown; price_original?: unknown }, fieldName: string) {
    const promotionalPrice = Number(productData.price_promo);
    if (Number.isFinite(promotionalPrice) && promotionalPrice > 0) return promotionalPrice;
    return readNonNegativeCheckoutAmount(productData.price_original, fieldName);
}
