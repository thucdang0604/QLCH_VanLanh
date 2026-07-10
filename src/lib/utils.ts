export function generateSlug(text: string): string {
    return text
        .toString()
        .normalize('NFD') // Normalize to decomposed form
        .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
        .toLowerCase()
        .trim()
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9 -]/g, '') // Remove invalid characters
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/-+/g, '-'); // Replace multiple - with single -
}

// ── Taxonomy Utilities ──

interface TaxonomyNodeLike {
    id: string;
    name: string;
    children?: TaxonomyNodeLike[];
}

/**
 * Resolve a taxonomy node ID into a human-readable breadcrumb path.
 * E.g., "dien-thoai/iphone/iphone-16-series" → "Điện thoại > iPhone > iPhone 16 Series"
 * Returns null if the ID is not found in the tree.
 * Runs on RAM only — zero Firestore reads.
 */
export function getCategoryPath(nodeId: string, trees: TaxonomyNodeLike[]): string | null {
    for (const node of trees) {
        if (node.id === nodeId) return node.name;
        if (node.children) {
            const childPath = getCategoryPath(nodeId, node.children);
            if (childPath) return `${node.name} > ${childPath}`;
        }
    }
    return null;
}

/**
 * Collect all valid node IDs from a taxonomy tree into a Set for O(1) lookups.
 */
export function collectAllNodeIds(trees: TaxonomyNodeLike[]): Set<string> {
    const ids = new Set<string>();
    function walk(nodes: TaxonomyNodeLike[]) {
        for (const n of nodes) {
            ids.add(n.id);
            if (n.children) walk(n.children);
        }
    }
    walk(trees);
    return ids;
}

/**
 * Generate search keywords for Firestore `array-contains` server-side search.
 * Produces lowercase, diacritic-free tokens from the product name.
 * Each word generates prefix substrings (min 2 chars) so that typing
 * "man" matches "Màn hình iPhone 15".
 *
 * Max 60 keywords to stay within Firestore 1500-field limit.
 */
export function generateSearchKeywords(name: string): string[] {
    const normalized = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .trim();

    const words = normalized.split(/\s+/).filter(Boolean);
    const keywords = new Set<string>();

    for (const word of words) {
        // Add full word
        keywords.add(word);
        // Add prefixes (min 2 chars) for typeahead
        for (let i = 2; i < word.length; i++) {
            keywords.add(word.slice(0, i));
        }
    }

    // Also add multi-word prefixes for compound search
    if (words.length > 1) {
        keywords.add(words.join(' '));
        keywords.add(words.slice(0, 2).join(' '));
    }

    // Cap at 60 to avoid Firestore limits
    return Array.from(keywords).slice(0, 60);
}

/**
 * Pick the most specific indexed token for a user-entered catalog search.
 * Multi-word phrases are stored by generateSearchKeywords, so keep the full
 * phrase when available instead of widening every "iPhone 15" query to
 * "iPhone".
 */
export function getSearchKeywordQuery(value: string): string {
    const normalized = value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

    if (!normalized) return '';
    const keywords = generateSearchKeywords(value);
    return keywords.includes(normalized) ? normalized : (keywords[0] || normalized);
}

/**
 * Pre-compute category-and-token entries so an admin search can combine a
 * category with a text token in one Firestore array-contains query.
 */
export function buildCategorySearchKeywords(categoryIds: string[] | undefined, searchKeywords: string[]): string[] {
    const categories = Array.from(new Set((categoryIds || []).filter(Boolean)));
    const keywords = Array.from(new Set(searchKeywords.filter(Boolean)));
    const entries = new Set<string>();

    for (const categoryId of categories) {
        for (const keyword of keywords) {
            entries.add(`${categoryId}::${keyword}`);
        }
    }

    return Array.from(entries).slice(0, 500);
}
