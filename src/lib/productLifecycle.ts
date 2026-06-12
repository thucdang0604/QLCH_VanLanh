import type { Product } from '@/lib/types';

type ProductLifecycleInput = Pick<Product, 'status' | 'stock' | 'held' | 'isProposed'>;

export const PRODUCT_STATUS = {
    ACTIVE: 'active',
    HIDDEN: 'hidden',
    INACTIVE: 'inactive',
} as const;

export function getAvailableStock(product: Pick<ProductLifecycleInput, 'stock' | 'held'>): number {
    return Math.max(0, (Number(product.stock) || 0) - (Number(product.held) || 0));
}

export function isProductArchived(product: Pick<ProductLifecycleInput, 'status'>): boolean {
    return product.status === PRODUCT_STATUS.INACTIVE;
}

export function isProductSellable(product: ProductLifecycleInput): boolean {
    return product.status === PRODUCT_STATUS.ACTIVE && !product.isProposed && getAvailableStock(product) > 0;
}

export function canArchiveProduct(product: Pick<ProductLifecycleInput, 'stock' | 'held'>): boolean {
    return (Number(product.stock) || 0) <= 0 && (Number(product.held) || 0) <= 0;
}

export function getArchiveBlockReason(product: Pick<ProductLifecycleInput, 'stock' | 'held'>): string | null {
    const stock = Number(product.stock) || 0;
    const held = Number(product.held) || 0;
    if (stock > 0) return `còn ${stock} trong kho`;
    if (held > 0) return `đang giữ ${held} sản phẩm`;
    return null;
}

export function buildArchiveUpdate(timestamp?: unknown): Record<string, unknown> {
    return {
        status: PRODUCT_STATUS.INACTIVE,
        archivedAt: timestamp ?? new Date(),
        updatedAt: timestamp ?? new Date(),
    };
}

export function buildReactivateOnImportUpdate(product: ProductLifecycleInput, newStock: number): Record<string, unknown> {
    if (newStock <= 0) return {};
    if (product.isProposed || isProductArchived(product)) {
        return {
            status: PRODUCT_STATUS.ACTIVE,
            archivedAt: null,
            isProposed: false,
        };
    }
    return {};
}
