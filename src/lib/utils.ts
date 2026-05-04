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
