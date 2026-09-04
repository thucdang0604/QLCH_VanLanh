export type ServiceBusinessLink = {
    id: string;
    recommendedPartCategoryIds?: unknown;
    linkedProductCategoryIds?: unknown;
};

export type CatalogRecommendationCandidate = {
    id: string;
    categoryIds?: unknown;
    stock?: unknown;
    held?: unknown;
};

function stringIds(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
}

function unique(values: string[]) {
    return Array.from(new Set(values));
}

function getLeafCategoryId(value: unknown): string {
    if (!Array.isArray(value)) return '';
    for (let index = value.length - 1; index >= 0; index -= 1) {
        const item = value[index];
        if (typeof item === 'string' && item.trim()) return item.trim();
    }
    return '';
}

export function getRepairServiceIds(ticket: { issues?: Array<{ serviceId?: unknown }> | null }) {
    return unique((ticket.issues || [])
        .map(issue => typeof issue.serviceId === 'string' ? issue.serviceId.trim() : '')
        .filter(Boolean));
}

/**
 * A repair intake can stop at a service taxonomy (without choosing a concrete
 * service record). Keep that path usable for business links by looking up
 * services that belong to its most-specific selected category.
 */
export function getRepairServiceCategoryIds(ticket: {
    categoryPath?: unknown;
    issues?: Array<{ categoryPath?: unknown }> | null;
}) {
    return unique([
        getLeafCategoryId(ticket.categoryPath),
        ...(ticket.issues || []).map(issue => getLeafCategoryId(issue.categoryPath)),
    ].filter(Boolean));
}

export function getRecommendedPartCategoryIds(services: ServiceBusinessLink[]) {
    // CategoryTaxonomySelector stores the full ancestry. A business link must
    // target only its deepest node: querying the parent "Điện thoại / iPhone"
    // would incorrectly suggest every iPhone component (camera, sensors, etc.).
    return unique(services
        .map(service => getLeafCategoryId(service.recommendedPartCategoryIds))
        .filter(Boolean));
}

export function getLinkedProductCategoryIds(services: ServiceBusinessLink[]) {
    // Keep POS bundle suggestions equally specific for the same reason.
    return unique(services
        .map(service => getLeafCategoryId(service.linkedProductCategoryIds))
        .filter(Boolean));
}

export function filterAvailableCategoryRecommendations<T extends CatalogRecommendationCandidate>(
    candidates: T[],
    categoryIds: string[],
) {
    const wantedCategories = new Set(categoryIds);
    return candidates
        .filter(candidate => stringIds(candidate.categoryIds).some(categoryId => wantedCategories.has(categoryId)))
        .toSorted((left, right) => {
            const leftAvailable = Math.max(0, Number(left.stock) || 0) - Math.max(0, Number(left.held) || 0);
            const rightAvailable = Math.max(0, Number(right.stock) || 0) - Math.max(0, Number(right.held) || 0);
            return rightAvailable - leftAvailable;
        });
}
