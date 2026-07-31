import { getSearchKeywordQuery } from './utils';

export const MAX_COMPONENT_TAXONOMY_ROOTS = 30;

type ArrayQueryOperator = 'array-contains' | 'array-contains-any';
type PartCatalogQueryField = 'categoryIds' | 'searchCategoryKeywords';

export type PartCatalogQueryPlan =
    | {
        state: 'ready';
        field: PartCatalogQueryField;
        operator: ArrayQueryOperator;
        values: string[];
        searchToken: string;
        selectedCategoryId: string;
        queryKey: string;
    }
    | {
        state: 'blocked';
        reason: 'missing_component_taxonomy' | 'too_many_component_roots' | 'invalid_component_selection';
        queryKey: string;
    };

function uniqueNonEmpty(values: string[]): string[] {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
}

/**
 * Chooses exactly one Firestore array-membership filter for the parts page.
 * Firestore cannot combine categoryIds and searchKeywords array filters, so
 * category + search uses the precomputed `${categoryId}::${token}` entries.
 */
export function buildPartCatalogQueryPlan(input: {
    componentRootIds: string[];
    selectedCategoryIds: string[];
    searchQuery: string;
}): PartCatalogQueryPlan {
    const componentRootIds = uniqueNonEmpty(input.componentRootIds);
    const selectedCategoryIds = uniqueNonEmpty(input.selectedCategoryIds);
    const selectedCategoryId = selectedCategoryIds.at(-1) || '';

    if (componentRootIds.length === 0) {
        return {
            state: 'blocked',
            reason: 'missing_component_taxonomy',
            queryKey: 'parts:missing-component-taxonomy',
        };
    }

    if (componentRootIds.length > MAX_COMPONENT_TAXONOMY_ROOTS) {
        return {
            state: 'blocked',
            reason: 'too_many_component_roots',
            queryKey: `parts:too-many-component-roots:${componentRootIds.length}`,
        };
    }

    if (selectedCategoryId && !componentRootIds.includes(selectedCategoryIds[0] || '')) {
        return {
            state: 'blocked',
            reason: 'invalid_component_selection',
            queryKey: `parts:invalid-component-selection:${selectedCategoryIds.join('|')}`,
        };
    }

    const trimmedSearch = input.searchQuery.trim();
    const searchToken = trimmedSearch.length >= 2 ? getSearchKeywordQuery(trimmedSearch) : '';

    if (searchToken) {
        const values = selectedCategoryId
            ? [`${selectedCategoryId}::${searchToken}`]
            : componentRootIds.map(categoryId => `${categoryId}::${searchToken}`);
        return {
            state: 'ready',
            field: 'searchCategoryKeywords',
            operator: selectedCategoryId ? 'array-contains' : 'array-contains-any',
            values,
            searchToken,
            selectedCategoryId,
            queryKey: JSON.stringify({ field: 'searchCategoryKeywords', values, selectedCategoryId, searchToken }),
        };
    }

    const values = selectedCategoryId ? [selectedCategoryId] : componentRootIds;
    return {
        state: 'ready',
        field: 'categoryIds',
        operator: selectedCategoryId ? 'array-contains' : 'array-contains-any',
        values,
        searchToken: '',
        selectedCategoryId,
        queryKey: JSON.stringify({ field: 'categoryIds', values, selectedCategoryId, searchToken: '' }),
    };
}
