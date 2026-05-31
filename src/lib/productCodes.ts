import type { Product } from '@/lib/types';

export interface ProductCodeTarget {
    id?: string;
    name?: string;
    sku?: string;
    barcode?: string;
    productCode?: string;
    qrCodes?: string[];
}

export function normalizeProductCode(value: unknown): string {
    return String(value || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '-')
        .replace(/[^A-Z0-9_-]/g, '')
        .replace(/-+/g, '-')
        .slice(0, 64);
}

export function buildProductCodeFromId(productId: string): string {
    const normalized = normalizeProductCode(productId);
    return normalized.startsWith('VL-') ? normalized : `VL-${normalized}`;
}

export function getPrimaryProductCode(product: ProductCodeTarget): string {
    return normalizeProductCode(product.sku || product.barcode || product.productCode || product.id);
}

export function mergePrimaryProductCode(product: ProductCodeTarget, primaryCode: string): string[] {
    const primary = normalizeProductCode(primaryCode);
    const existing = [
        ...(product.qrCodes || []),
        product.sku,
        product.barcode,
        product.productCode,
    ].map(normalizeProductCode).filter(Boolean);
    return Array.from(new Set([primary, ...existing.filter((code) => code !== primary)].filter(Boolean)));
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
