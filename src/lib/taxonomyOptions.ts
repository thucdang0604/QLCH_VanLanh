import type { TaxonomyNode } from './types/catalog';

export interface FlatTaxonomyNode {
    id: string;
    name: string;
    fullPath: string;
    depth: number;
    seoKeywords?: string;
}

export function flattenTaxonomyOptions(nodes: TaxonomyNode[], parentPath = '', depth = 0): FlatTaxonomyNode[] {
    const result: FlatTaxonomyNode[] = [];
    for (const node of nodes) {
        const fullPath = parentPath ? `${parentPath} › ${node.name}` : node.name;
        result.push({ id: node.id, name: node.name, fullPath, depth, seoKeywords: node.seoKeywords });
        if (node.children?.length) {
            result.push(...flattenTaxonomyOptions(node.children, fullPath, depth + 1));
        }
    }
    return result;
}

/**
 * Discount rules persist category IDs, so a duplicated ID from separate
 * taxonomy branches cannot represent a distinct selectable value. Keep the
 * first canonical node to make the dropdown and its React keys deterministic.
 */
export function uniqueTaxonomyOptions(nodes: FlatTaxonomyNode[]): FlatTaxonomyNode[] {
    const seenIds = new Set<string>();
    return nodes.filter(node => {
        if (seenIds.has(node.id)) return false;
        seenIds.add(node.id);
        return true;
    });
}
