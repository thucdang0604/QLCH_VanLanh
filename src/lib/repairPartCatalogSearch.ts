import { collection, doc, limit, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getDoc, getDocs } from '@/lib/firestoreLogger';
import type { Product } from '@/lib/types';
import {
    filterRepairPartCatalogResults,
    getRepairPartSearchLookupTokens,
    getScopedRepairPartSearchValues,
    type RepairPartCatalogFilter,
} from '@/lib/repairPartSearch';
import {
    getRecommendedPartCategoryIds,
    getRepairServiceCategoryIds,
    getRepairServiceIds,
    type ServiceBusinessLink,
} from '@/lib/serviceRecommendations';

export const REPAIR_PART_CATALOG_RESULT_LIMIT = 40;

type RepairServiceReference = {
    issues?: Array<{ serviceId?: unknown; categoryPath?: unknown }> | null;
    categoryPath?: unknown;
};

type ActiveServiceBusinessLink = ServiceBusinessLink & {
    categoryIds?: unknown;
    isActive?: unknown;
};

export type RepairPartCatalogSearchInput = RepairPartCatalogFilter;

export type RepairPartCatalogSearchResult = {
    products: Product[];
    categoryIds: string[];
    source: 'linked-index' | 'legacy-linked-index' | 'legacy-linked-category' | 'unscoped-index' | 'none';
};

export type RepairPartSuggestionResult = RepairPartCatalogSearchResult & {
    hint: string;
};

function uniqueNonEmpty(values: readonly string[] | undefined, max = 10): string[] {
    return Array.from(new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))).slice(0, max);
}

function toProducts(snapshot: Awaited<ReturnType<typeof getDocs>>): Product[] {
    return snapshot.docs.map(item => ({ id: item.id, ...(item.data() as Record<string, unknown>) } as Product));
}

async function readActivePartsByIndex(
    field: 'searchKeywords' | 'searchCategoryKeywords',
    values: string[],
): Promise<Product[]> {
    if (values.length === 0) return [];
    const snapshot = await getDocs(query(
        collection(db, 'products'),
        where('status', '==', 'active'),
        where(field, 'array-contains-any', values),
        limit(REPAIR_PART_CATALOG_RESULT_LIMIT),
    ));
    return toProducts(snapshot);
}

/**
 * Last-resort support for catalog records created before search indexes.  The
 * read is still capped and restricted to the component taxonomy selected by
 * the repair service; it never enumerates the product collection.
 */
async function readLegacyLinkedCategoryParts(categoryIds: string[]): Promise<Product[]> {
    if (categoryIds.length === 0) return [];
    const snapshot = await getDocs(query(
        collection(db, 'products'),
        where('categoryIds', 'array-contains-any', categoryIds),
        limit(REPAIR_PART_CATALOG_RESULT_LIMIT),
    ));
    return toProducts(snapshot);
}

/**
 * Central bounded catalog lookup for both reception and technician flows.
 * When the repair has linked component groups, every lookup stays inside those
 * groups. A broad fallback would make a correct suggestion turn into an
 * unrelated manual-search result. Generic lookup is used only when the repair
 * has no configured component group at all.
 */
export async function searchRepairPartCatalog(input: RepairPartCatalogSearchInput): Promise<RepairPartCatalogSearchResult> {
    const categoryIds = uniqueNonEmpty(input.categoryIds);
    const lookupValue = input.query?.trim() || input.deviceModel?.trim() || '';
    const lookupTokens = getRepairPartSearchLookupTokens(lookupValue);
    const baseFilter: RepairPartCatalogFilter = {
        query: input.query,
        deviceModel: input.deviceModel,
        quality: input.quality,
    };

    if (lookupTokens.length === 0) {
        return { products: [], categoryIds, source: 'none' };
    }

    if (categoryIds.length > 0) {
        const scopedValues = getScopedRepairPartSearchValues(categoryIds, lookupValue);
        let products = filterRepairPartCatalogResults(
            await readActivePartsByIndex('searchCategoryKeywords', scopedValues),
            { ...baseFilter, categoryIds },
        );
        if (products.length > 0) return { products, categoryIds, source: 'linked-index' };

        // Some previously saved parts have searchKeywords but not the combined
        // category index.  Continue to enforce the same linked category locally.
        const indexedCandidates = await readActivePartsByIndex('searchKeywords', lookupTokens);
        products = filterRepairPartCatalogResults(indexedCandidates, { ...baseFilter, categoryIds });
        if (products.length > 0) return { products, categoryIds, source: 'legacy-linked-index' };

        products = filterRepairPartCatalogResults(
            await readLegacyLinkedCategoryParts(categoryIds),
            { ...baseFilter, categoryIds },
        );
        if (products.length > 0) return { products, categoryIds, source: 'legacy-linked-category' };

        return { products: [], categoryIds, source: 'none' };
    }

    const products = filterRepairPartCatalogResults(
        await readActivePartsByIndex('searchKeywords', lookupTokens),
        baseFilter,
    );
    return { products, categoryIds, source: products.length > 0 ? 'unscoped-index' : 'none' };
}

/**
 * Resolve the component categories from concrete services and from the repair
 * issue taxonomy.  This is the same source of truth for intake and KTV.
 */
export async function getRepairPartRecommendationCategoryIds(ticket: RepairServiceReference): Promise<string[]> {
    const serviceIds = getRepairServiceIds(ticket);
    const serviceCategoryIds = getRepairServiceCategoryIds(ticket);
    if (serviceIds.length === 0 && serviceCategoryIds.length === 0) return [];

    const [directSnapshots, taxonomySnapshots] = await Promise.all([
        Promise.all(serviceIds.map(serviceId => getDoc(doc(db, 'services', serviceId)))),
        Promise.all(serviceCategoryIds.slice(0, 10).map(categoryId => getDocs(query(
            collection(db, 'services'),
            where('categoryIds', 'array-contains', categoryId),
            limit(20),
        )))),
    ]);

    const services = new Map<string, ActiveServiceBusinessLink>();
    directSnapshots.filter(snapshot => snapshot.exists()).forEach(snapshot => {
        const service = { id: snapshot.id, ...snapshot.data() } as ActiveServiceBusinessLink;
        if (service.isActive !== false) services.set(service.id, service);
    });
    taxonomySnapshots.forEach(snapshot => snapshot.docs.forEach(serviceDoc => {
        const service = { id: serviceDoc.id, ...serviceDoc.data() } as ActiveServiceBusinessLink;
        if (service.isActive !== false) services.set(service.id, service);
    }));

    return getRecommendedPartCategoryIds(Array.from(services.values()));
}

/** Load the initial service-linked recommendation before a user types. */
export async function suggestRepairParts(input: {
    ticket: RepairServiceReference;
    deviceModel: string;
    quality?: string;
}): Promise<RepairPartSuggestionResult> {
    const categoryIds = await getRepairPartRecommendationCategoryIds(input.ticket);
    if (categoryIds.length === 0) {
        return {
            products: [],
            categoryIds,
            source: 'none',
            hint: 'Chưa cấu hình nhóm linh kiện cho danh mục dịch vụ của lỗi này.',
        };
    }
    if (!input.deviceModel.trim()) {
        return {
            products: [],
            categoryIds,
            source: 'none',
            hint: 'Nhập model thiết bị để gợi ý đúng linh kiện tương thích.',
        };
    }

    const result = await searchRepairPartCatalog({
        deviceModel: input.deviceModel,
        quality: input.quality,
        categoryIds,
    });
    return {
        ...result,
        hint: result.products.length === 0
            ? `Chưa có linh kiện ${input.deviceModel.trim()} trong nhóm đã liên kết với dịch vụ.`
            : '',
    };
}
