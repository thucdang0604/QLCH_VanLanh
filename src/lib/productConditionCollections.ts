export type ProductConditionFilter = 'new' | 'used' | 'like-new';

export type ProductConditionCollection = {
    label: string;
    condition: ProductConditionFilter;
};

/**
 * Public collection routes that group products by condition instead of a
 * taxonomy node. Stable paths keep menu links and canonical metadata clean.
 */
const PRODUCT_CONDITION_COLLECTIONS: Record<string, ProductConditionCollection> = {
    'may-cu-99': {
        label: 'Máy cũ 99%',
        condition: 'like-new',
    },
};

export function getProductConditionCollection(slugSegments: readonly string[]): ProductConditionCollection | null {
    if (slugSegments.length !== 1) return null;
    return PRODUCT_CONDITION_COLLECTIONS[slugSegments[0]] || null;
}

const LIKE_NEW_CONDITION_VALUES = [
    'like-new',
    'like new',
    'likenew',
    '99',
    '99%',
    'cu-99',
    'cu-99%',
    'cũ 99%',
] as const;

function isLikeNewCondition(productCondition: string | undefined): boolean {
    const value = productCondition?.trim().toLowerCase();
    return LIKE_NEW_CONDITION_VALUES.includes(value as typeof LIKE_NEW_CONDITION_VALUES[number]);
}

/** Values used for the Firestore query before the final defensive in-memory check. */
export function getProductConditionQueryValues(condition: ProductConditionFilter): readonly string[] {
    if (condition === 'like-new') return LIKE_NEW_CONDITION_VALUES;
    if (condition === 'used') return ['used', ...LIKE_NEW_CONDITION_VALUES];
    return ['new'];
}

/**
 * `used` is the existing broad filter. `like-new` remains exact so the 99%
 * collection never includes ordinary used products.
 */
export function matchesProductCondition(
    productCondition: string | undefined,
    requestedCondition: ProductConditionFilter,
): boolean {
    if (requestedCondition === 'used') {
        return productCondition === 'used' || isLikeNewCondition(productCondition);
    }

    if (requestedCondition === 'like-new') {
        return isLikeNewCondition(productCondition);
    }

    return productCondition === requestedCondition;
}
