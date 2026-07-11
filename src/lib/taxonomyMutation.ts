import type { TaxonomyNode } from './types';

export const TAXONOMY_KINDS = ['retail', 'service', 'component'] as const;
export type TaxonomyKind = typeof TAXONOMY_KINDS[number];
export type TaxonomyTree = Record<TaxonomyKind, TaxonomyNode[]>;

export type TaxonomyMutationRequest = {
    action: 'create' | 'update' | 'delete';
    taxonomyType: TaxonomyKind;
    nodeId?: string;
    parentId?: string | null;
    node?: unknown;
};

export class TaxonomyMutationError extends Error {
    constructor(message: string, readonly status = 400) {
        super(message);
        this.name = 'TaxonomyMutationError';
    }
}

type LocatedNode = {
    node: TaxonomyNode;
    siblings: TaxonomyNode[];
    index: number;
    depth: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, label: string, maxLength: number): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new TaxonomyMutationError(`${label} is required.`);
    }
    const normalized = value.trim();
    if (normalized.length > maxLength) {
        throw new TaxonomyMutationError(`${label} is too long.`);
    }
    return normalized;
}

function optionalString(value: unknown, label: string, maxLength: number): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new TaxonomyMutationError(`${label} must be a string.`);
    if (value.length > maxLength) throw new TaxonomyMutationError(`${label} is too long.`);
    return value.trim();
}

function normalizeSlug(value: unknown): string {
    const slug = requireString(value, 'Slug', 80).toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new TaxonomyMutationError('Slug must contain lowercase letters, numbers, and single dashes only.');
    }
    return slug;
}

function cloneStoredNode(value: unknown, depth = 0): TaxonomyNode {
    if (depth > 2 || !isRecord(value)) {
        throw new TaxonomyMutationError('Stored taxonomy has an invalid tree shape.', 409);
    }

    const id = requireString(value.id, 'Stored taxonomy node id', 320);
    const name = requireString(value.name, 'Stored taxonomy node name', 160);
    const slug = normalizeSlug(value.slug);
    const node: TaxonomyNode = { id, name, slug };

    const icon = optionalString(value.icon, 'Icon', 2048);
    const seoKeywords = optionalString(value.seoKeywords, 'SEO keywords', 1000);
    const seoDescription = optionalString(value.seoDescription, 'SEO description', 1000);
    if (icon !== undefined) node.icon = icon;
    if (seoKeywords !== undefined) node.seoKeywords = seoKeywords;
    if (seoDescription !== undefined) node.seoDescription = seoDescription;

    if (value.warrantyType !== undefined) {
        if (!['none', 'warrantyDevice', 'warrantyRepair', 'warrantyAccessory'].includes(String(value.warrantyType))) {
            throw new TaxonomyMutationError('Stored taxonomy has an invalid warranty type.', 409);
        }
        node.warrantyType = value.warrantyType as TaxonomyNode['warrantyType'];
    }

    if (value.warrantyMonths !== undefined) {
        const warrantyMonths = Number(value.warrantyMonths);
        if (!Number.isInteger(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 120) {
            throw new TaxonomyMutationError('Stored taxonomy has an invalid warranty duration.', 409);
        }
        node.warrantyMonths = warrantyMonths;
    }

    if (value.children !== undefined) {
        if (!Array.isArray(value.children)) {
            throw new TaxonomyMutationError('Stored taxonomy has invalid children.', 409);
        }
        node.children = value.children.map((child) => cloneStoredNode(child, depth + 1));
    }

    return node;
}

function cloneStoredTaxonomy(value: unknown): TaxonomyTree {
    if (!isRecord(value)) {
        throw new TaxonomyMutationError('Taxonomy configuration is missing or invalid. Restore the existing document before editing.', 409);
    }

    const taxonomy = {} as TaxonomyTree;
    for (const kind of TAXONOMY_KINDS) {
        if (!Array.isArray(value[kind])) {
            throw new TaxonomyMutationError(`Taxonomy ${kind} tree is missing or invalid. Restore the existing document before editing.`, 409);
        }
        taxonomy[kind] = value[kind].map((node) => cloneStoredNode(node));
    }
    return taxonomy;
}

function normalizeMutationNode(value: unknown): Omit<TaxonomyNode, 'id' | 'children'> {
    if (!isRecord(value)) throw new TaxonomyMutationError('Taxonomy node payload is required.');

    const node: Omit<TaxonomyNode, 'id' | 'children'> = {
        name: requireString(value.name, 'Name', 160),
        slug: normalizeSlug(value.slug),
    };
    const icon = optionalString(value.icon, 'Icon', 2048);
    const seoKeywords = optionalString(value.seoKeywords, 'SEO keywords', 1000);
    const seoDescription = optionalString(value.seoDescription, 'SEO description', 1000);
    if (icon !== undefined) node.icon = icon;
    if (seoKeywords !== undefined) node.seoKeywords = seoKeywords;
    if (seoDescription !== undefined) node.seoDescription = seoDescription;

    const warrantyType = value.warrantyType === undefined ? 'none' : value.warrantyType;
    if (!['none', 'warrantyDevice', 'warrantyRepair', 'warrantyAccessory'].includes(String(warrantyType))) {
        throw new TaxonomyMutationError('Warranty type is invalid.');
    }
    node.warrantyType = warrantyType as TaxonomyNode['warrantyType'];

    if (value.warrantyMonths !== undefined && value.warrantyMonths !== null && value.warrantyMonths !== '') {
        const warrantyMonths = Number(value.warrantyMonths);
        if (!Number.isInteger(warrantyMonths) || warrantyMonths < 0 || warrantyMonths > 120) {
            throw new TaxonomyMutationError('Warranty duration must be an integer between 0 and 120 months.');
        }
        node.warrantyMonths = warrantyMonths;
    }
    return node;
}

function locateNode(nodes: TaxonomyNode[], id: string, depth = 0): LocatedNode | null {
    for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        if (node.id === id) return { node, siblings: nodes, index, depth };
        if (node.children) {
            const nested = locateNode(node.children, id, depth + 1);
            if (nested) return nested;
        }
    }
    return null;
}

export function mutateTaxonomy(current: unknown, request: TaxonomyMutationRequest): { taxonomy: TaxonomyTree; nodeId: string } {
    if (!request || typeof request !== 'object') {
        throw new TaxonomyMutationError('Taxonomy mutation payload is required.');
    }
    if (!TAXONOMY_KINDS.includes(request.taxonomyType)) {
        throw new TaxonomyMutationError('Taxonomy type is invalid.');
    }

    const taxonomy = cloneStoredTaxonomy(current);
    const nodes = taxonomy[request.taxonomyType];

    if (request.action === 'create') {
        const nodeInput = normalizeMutationNode(request.node);
        const parentId = typeof request.parentId === 'string' && request.parentId.trim() ? request.parentId.trim() : null;
        const parent = parentId ? locateNode(nodes, parentId) : null;
        if (parentId && !parent) throw new TaxonomyMutationError('Parent taxonomy node was not found.', 404);
        if (parent && parent.depth >= 2) throw new TaxonomyMutationError('Taxonomy supports a maximum of three levels.');

        const id = parent ? `${parent.node.id}/${nodeInput.slug}` : nodeInput.slug;
        if (locateNode(nodes, id)) throw new TaxonomyMutationError('A taxonomy node with this path already exists.', 409);

        const node: TaxonomyNode = { id, ...nodeInput, children: [] };
        if (parent) {
            parent.node.children = parent.node.children || [];
            parent.node.children.push(node);
        } else {
            nodes.push(node);
        }
        return { taxonomy, nodeId: id };
    }

    const nodeId = typeof request.nodeId === 'string' ? request.nodeId.trim() : '';
    if (!nodeId) throw new TaxonomyMutationError('Taxonomy node id is required.');
    const existing = locateNode(nodes, nodeId);
    if (!existing) throw new TaxonomyMutationError('Taxonomy node was not found.', 404);

    if (request.action === 'delete') {
        existing.siblings.splice(existing.index, 1);
        return { taxonomy, nodeId };
    }

    if (request.action === 'update') {
        const nodeInput = normalizeMutationNode(request.node);
        if (nodeInput.slug !== existing.node.slug) {
            throw new TaxonomyMutationError('Taxonomy slug is immutable because it is referenced by catalog and workflow data.');
        }
        existing.siblings[existing.index] = {
            ...existing.node,
            ...nodeInput,
            id: existing.node.id,
            slug: existing.node.slug,
            children: existing.node.children || [],
        };
        return { taxonomy, nodeId };
    }

    throw new TaxonomyMutationError('Taxonomy action is invalid.');
}
