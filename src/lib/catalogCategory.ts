export type CatalogCategoryReference = {
    category?: string;
    categoryIds?: string[];
};

export type CatalogCategoryStatus = 'valid' | 'orphan' | 'unassigned';

/**
 * Returns the category identifier used to group a catalog item.
 *
 * Taxonomy-aware records store the full hierarchy in `categoryIds`; the
 * deepest node is therefore the authoritative key. Older records only have
 * the legacy `category` string, which remains a supported fallback.
 */
export function getCatalogCategoryKey(item: CatalogCategoryReference): string {
    const categoryIds = item.categoryIds?.filter((id): id is string => typeof id === 'string' && id.trim().length > 0) || [];
    return categoryIds.at(-1) || item.category?.trim() || '';
}

export function getCatalogCategoryStatus(
    item: CatalogCategoryReference,
    validCategoryIds: ReadonlySet<string>,
): CatalogCategoryStatus {
    const categoryIds = item.categoryIds?.filter((id): id is string => typeof id === 'string' && id.trim().length > 0) || [];
    if (categoryIds.length === 0) {
        return item.category?.trim() ? 'orphan' : 'unassigned';
    }

    return validCategoryIds.has(categoryIds.at(-1)!) ? 'valid' : 'orphan';
}
