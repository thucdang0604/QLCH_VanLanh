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

export function getRepairServiceIds(ticket: { issues?: Array<{ serviceId?: unknown }> | null }) {
    return unique((ticket.issues || [])
        .map(issue => typeof issue.serviceId === 'string' ? issue.serviceId.trim() : '')
        .filter(Boolean));
}

export function getRecommendedPartCategoryIds(services: ServiceBusinessLink[]) {
    return unique(services.flatMap(service => stringIds(service.recommendedPartCategoryIds)));
}

export function getLinkedProductCategoryIds(services: ServiceBusinessLink[]) {
    return unique(services.flatMap(service => stringIds(service.linkedProductCategoryIds)));
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
