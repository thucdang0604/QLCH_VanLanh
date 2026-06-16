type FlashSaleCandidate = {
    isFlashSale?: unknown;
    price?: unknown;
    price_original?: unknown;
    price_promo?: unknown;
};

function positiveNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function isFlashSaleProduct(product: object): boolean {
    const candidate = product as FlashSaleCandidate;
    if (candidate.isFlashSale === true) return true;

    const promoPrice = positiveNumber(candidate.price_promo);
    const originalPrice = positiveNumber(candidate.price_original) ?? positiveNumber(candidate.price);
    if (!promoPrice || !originalPrice || promoPrice >= originalPrice) return false;

    return ((originalPrice - promoPrice) / originalPrice) * 100 >= 10;
}

export function filterFlashSaleProducts<T extends object>(products: T[]): T[] {
    return products.filter(isFlashSaleProduct);
}
