import type { Product } from '@/lib/types';

export interface ProductCodeTarget {
    id?: string;
    name?: string;
    category?: string;
    categoryIds?: string[];
    sku?: string;
    barcode?: string;
    productCode?: string;
    qrCodes?: string[];
}

export type ProductCodeKind = 'product' | 'accessory' | 'component';

const SHORT_CODE_PAYLOAD_LENGTH = 8;

export function normalizeProductCode(value: unknown): string {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9_-]/g, '')
        .replace(/-+/g, '-')
        .slice(0, 64);
}

function normalizeCategoryHint(value: unknown): string {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function buildShortCode(prefix: 'SP' | 'PK' | 'LK', source: string): string {
    const normalized = normalizeProductCode(source);
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;

    for (let index = 0; index < normalized.length; index += 1) {
        const char = normalized.charCodeAt(index);
        first = Math.imul(first ^ char, 0x01000193);
        second = Math.imul(second ^ char, 0x5bd1e995);
    }

    const token = `${(first >>> 0).toString(36).padStart(7, '0')}${(second >>> 0).toString(36).padStart(7, '0')}`
        .slice(0, SHORT_CODE_PAYLOAD_LENGTH)
        .toUpperCase();
    return `${prefix}-${token}`;
}

export function getProductCodeKind(product: Pick<ProductCodeTarget, 'category' | 'categoryIds'>): ProductCodeKind {
    const hints = [product.category, ...(product.categoryIds || [])].map(normalizeCategoryHint);
    if (hints.some((value) => value === 'component' || value === 'linh-kien' || value.startsWith('linh-kien-'))) {
        return 'component';
    }
    if (hints.some((value) => value === 'accessory' || value === 'phu-kien' || value.startsWith('phu-kien/'))) {
        return 'accessory';
    }
    return 'product';
}

export function buildProductCodeFromId(productId: string, kind: ProductCodeKind = 'product'): string {
    const normalized = normalizeProductCode(productId);
    if (!normalized) return '';
    const prefix: Record<ProductCodeKind, 'SP' | 'PK' | 'LK'> = {
        product: 'SP',
        accessory: 'PK',
        component: 'LK',
    };
    return buildShortCode(prefix[kind], normalized);
}

export function getPrimaryProductCode(product: ProductCodeTarget): string {
    return normalizeProductCode(product.sku || product.barcode || product.productCode)
        || buildProductCodeFromId(product.id || '', getProductCodeKind(product));
}

export function getProductScanCandidates(product: ProductCodeTarget): string[] {
    const values: (string | undefined)[] = [
        product.sku,
        product.barcode,
        product.productCode,
        product.id,
        getPrimaryProductCode(product),
        ...(product.qrCodes || []),
    ];
    return Array.from(
        new Set(
            values
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .flatMap((value) => [value, normalizeProductCode(value)])
        )
    );
}

export function extractProductCodeFromScan(rawValue: string): string {
    const value = String(rawValue || '').trim();
    if (!value) return '';

    try {
        const url = new URL(value);
        const fromParam = url.searchParams.get('sku') || url.searchParams.get('code') || url.searchParams.get('barcode');
        if (fromParam) return normalizeProductCode(fromParam);
    } catch {
        // Raw QR/barcode payload, not a URL.
    }

    return normalizeProductCode(value.replace(/^POS:/i, '').replace(/^SKU:/i, ''));
}

export function buildProductQrImageUrl(code: string, size = 220): string {
    const safeSize = Math.max(96, Math.min(512, Math.round(size)));
    return `https://api.qrserver.com/v1/create-qr-code/?size=${safeSize}x${safeSize}&margin=8&data=${encodeURIComponent(code)}`;
}

export function productCodeSearchText(product: Product & { id: string }): string {
    return getProductScanCandidates(product).join(' ').toLowerCase();
}
