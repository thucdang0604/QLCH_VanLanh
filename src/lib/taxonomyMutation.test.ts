import assert from 'node:assert/strict';
import test from 'node:test';
import { TaxonomyMutationError, mutateTaxonomy, type TaxonomyTree } from './taxonomyMutation';

const tree = (): TaxonomyTree => ({
    retail: [{ id: 'phone', name: 'Phone', slug: 'phone', children: [{ id: 'phone/android', name: 'Android', slug: 'android' }] }],
    service: [],
    component: [],
});

test('creates a child from the live parent id without reseeding defaults', () => {
    const result = mutateTaxonomy(tree(), {
        action: 'create',
        taxonomyType: 'retail',
        parentId: 'phone/android',
        node: { name: 'Pixel', slug: 'pixel', warrantyType: 'none' },
    });

    assert.equal(result.nodeId, 'phone/android/pixel');
    assert.equal(result.taxonomy.retail[0].children?.[0].children?.[0].id, 'phone/android/pixel');
});

test('updates only the target node and preserves its descendants', () => {
    const result = mutateTaxonomy(tree(), {
        action: 'update',
        taxonomyType: 'retail',
        nodeId: 'phone',
        node: { name: 'Phones', slug: 'phone', seoDescription: 'Updated' },
    });

    assert.equal(result.taxonomy.retail[0].name, 'Phones');
    assert.equal(result.taxonomy.retail[0].children?.[0].id, 'phone/android');
});

test('rejects a slug rename that would orphan category references', () => {
    assert.throws(
        () => mutateTaxonomy(tree(), {
            action: 'update',
            taxonomyType: 'retail',
            nodeId: 'phone',
            node: { name: 'Phones', slug: 'phones' },
        }),
        TaxonomyMutationError,
    );
});

test('refuses to create a default tree when taxonomy configuration is missing', () => {
    assert.throws(
        () => mutateTaxonomy(null, {
            action: 'create',
            taxonomyType: 'retail',
            node: { name: 'Phone', slug: 'phone' },
        }),
        (error: unknown) => error instanceof TaxonomyMutationError && error.status === 409,
    );
});
