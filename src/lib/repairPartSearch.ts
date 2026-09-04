import type { Product } from './types';

type PartSearchProduct = Product & {
    code?: string;
    model?: string;
    searchKeywords?: string[];
};

const DEVICE_BRAND_TOKENS = new Set([
    'samsung', 'galaxy', 'apple', 'oppo', 'xiaomi', 'redmi', 'vivo', 'realme',
    'huawei', 'honor', 'asus', 'acer', 'lenovo', 'dell', 'hp', 'msi',
]);

export function normalizeRepairPartSearch(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function searchTerms(value: string): string[] {
    return normalizeRepairPartSearch(value).split(' ').filter(Boolean);
}

function productSearchHaystack(product: PartSearchProduct): string {
    return normalizeRepairPartSearch([
        product.name,
        product.code,
        product.sku,
        product.productCode,
        product.barcode,
        ...(product.qrCodes || []),
        product.brand,
        product.model,
        product.partType,
        product.category,
        ...(product.categoryIds || []),
        ...(product.searchKeywords || []),
    ].filter(Boolean).join(' '));
}

export function repairTextMatchesDeviceModel(value: string, deviceModel: string): boolean {
    const modelTerms = getRepairDeviceModelTerms(deviceModel);
    if (modelTerms.length === 0) return false;
    const haystack = normalizeRepairPartSearch(value);
    return modelTerms.every(term => haystack.includes(term));
}

export function productMatchesRepairPartSearch(product: PartSearchProduct, query: string): boolean {
    const terms = searchTerms(query);
    if (terms.length === 0) return false;
    const haystack = productSearchHaystack(product);
    return terms.every(term => haystack.includes(term));
}

/**
 * Drops vendor-only tokens. Products often spell a model differently
 * ("Samsung Galaxy S23 Ultra" versus "Samsung S23 Ultra"), while the model
 * code and variant are stable across those names.
 */
export function getRepairDeviceModelTerms(model: string): string[] {
    const terms = searchTerms(model);
    const specificTerms = terms.filter(term => !DEVICE_BRAND_TOKENS.has(term));
    return specificTerms.length > 0 ? specificTerms : terms;
}

export function productMatchesRepairDeviceModel(product: PartSearchProduct, deviceModel: string): boolean {
    return repairTextMatchesDeviceModel(productSearchHaystack(product), deviceModel);
}

/**
 * Firestore supports only one array filter, so choose a compact, highly
 * selective model/search token. Product indexing stores word, bigram and
 * trigram entries; e.g. "S23 Ultra" is a stable lookup for products named
 * "Samsung Galaxy S23 Ultra".
 */
export function getRepairPartSearchLookupTokens(value: string): string[] {
    const terms = searchTerms(value);
    if (terms.length === 0) return [];

    const numericIndex = terms.findIndex(term => /\d/.test(term));
    const preferredPhrase = numericIndex >= 0
        ? terms.slice(numericIndex, numericIndex + 3).join(' ')
        : '';
    const primaryWord = numericIndex >= 0 ? terms[numericIndex] : terms
        .filter(term => term.length >= 3)
        .toSorted((left, right) => right.length - left.length)[0];

    return Array.from(new Set([preferredPhrase, primaryWord].filter(Boolean))).slice(0, 2);
}

export function getScopedRepairPartSearchValues(categoryIds: string[], searchValue: string): string[] {
    const tokens = getRepairPartSearchLookupTokens(searchValue);
    const categories = Array.from(new Set(categoryIds.filter(Boolean))).slice(0, 10);
    return categories.flatMap(categoryId => tokens.map(token => `${categoryId}::${token}`)).slice(0, 30);
}

export function queryTargetsRepairDeviceModel(query: string, deviceModel: string): boolean {
    const queryTerms = new Set(searchTerms(query));
    return getRepairDeviceModelTerms(deviceModel).some(term => queryTerms.has(term));
}

export function productMatchesRepairPartQuality(product: Product, selectedQuality: string): boolean {
    return normalizeRepairPartSearch(product.quality || '') === normalizeRepairPartSearch(selectedQuality);
}

export function rankRepairPartSearchResults(
    products: Product[],
    query: string,
    deviceModel = '',
): Product[] {
    const normalizedQuery = normalizeRepairPartSearch(query);
    return [...products].toSorted((left, right) => {
        const score = (product: Product) => {
            const name = normalizeRepairPartSearch(product.name || '');
            const matchesModel = deviceModel && productMatchesRepairDeviceModel(product, deviceModel);
            const available = Math.max(0, Number(product.stock) || 0) - Math.max(0, Number(product.held) || 0);
            return (name.includes(normalizedQuery) ? 100 : 0)
                + (matchesModel ? 30 : 0)
                + (available > 0 ? 10 : 0);
        };
        const scoreDelta = score(right) - score(left);
        if (scoreDelta !== 0) return scoreDelta;
        return left.name.localeCompare(right.name, 'vi');
    });
}
