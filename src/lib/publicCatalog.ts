type RawCatalogDoc = Record<string, unknown>;

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function asNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asPlainObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

export function toPublicProduct(id: string, data: RawCatalogDoc) {
    const imageUrl = asString(data.imageUrl) || asString(data.image) || '';
    const images = asStringArray(data.images);

    return {
        id,
        name: asString(data.name) || asString(data.title) || '',
        title: asString(data.title),
        slug: asString(data.slug) || id,
        brand: asString(data.brand) || '',
        category: asString(data.category) || '',
        categoryIds: asStringArray(data.categoryIds),
        subCategory: asString(data.subCategory) || '',
        condition: asString(data.condition) || '',
        conditionLabel: asString(data.conditionLabel) || '',
        color: asString(data.color) || '',
        storageCapacity: asString(data.storageCapacity) || '',
        price: asNumber(data.price),
        price_original: asNumber(data.price_original),
        price_promo: asNumber(data.price_promo),
        hidePrice: data.hidePrice === true,
        specs: asPlainObject(data.specs),
        images,
        imageUrl,
        image: imageUrl,
        imageWidth: asNumber(data.imageWidth) || null,
        imageHeight: asNumber(data.imageHeight) || null,
        warranty_text: asString(data.warranty_text) || '',
        warrantyType: asString(data.warrantyType) || 'none',
        warrantyMonths: asNumber(data.warrantyMonths),
        tags: asStringArray(data.tags),
        isFlashSale: data.isFlashSale === true,
        sold: asNumber(data.sold),
        stock: asNumber(data.stock),
        quality: asString(data.quality) || '',
        description: asString(data.description) || '',
        content: asString(data.content) || '',
        seoDescription: asString(data.seoDescription) || '',
        videoEmbedUrl: asString(data.videoEmbedUrl) || '',
        sku: asString(data.sku) || '',
        rating: asNumber(data.rating),
        reviewCount: asNumber(data.reviewCount),
    };
}

export function toPublicService(id: string, data: RawCatalogDoc) {
    const imageUrl = asString(data.imageUrl) || asString(data.image) || '';

    return {
        id,
        name: asString(data.name) || asString(data.title) || '',
        title: asString(data.title),
        slug: asString(data.slug) || id,
        category: asString(data.category) || '',
        categoryIds: asStringArray(data.categoryIds),
        brand: asString(data.brand) || '',
        device_model: asString(data.device_model) || '',
        repair_time: asString(data.repair_time) || '',
        warranty_text: asString(data.warranty_text) || '',
        price: asNumber(data.price),
        price_original: asNumber(data.price_original),
        price_promo: asNumber(data.price_promo),
        hidePrice: data.hidePrice === true,
        imageUrl,
        image: imageUrl,
        images: asStringArray(data.images),
        tags: asStringArray(data.tags),
        isActive: data.isActive !== false,
        isFlashSale: data.isFlashSale === true,
        description: asString(data.description) || '',
        content: asString(data.content) || '',
        seoDescription: asString(data.seoDescription) || '',
        videoEmbedUrl: asString(data.videoEmbedUrl) || '',
        rating: asNumber(data.rating),
        reviewCount: asNumber(data.reviewCount),
    };
}
