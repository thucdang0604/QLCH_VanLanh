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

test('can clear a category warranty override so it inherits its parent policy', () => {
    const current = tree();
    current.retail[0].warrantyType = 'warrantyDevice';
    current.retail[0].warrantyMonths = 12;
    current.retail[0].children![0].warrantyType = 'warrantyDevice';
    current.retail[0].children![0].warrantyMonths = 6;

    const result = mutateTaxonomy(current, {
        action: 'update',
        taxonomyType: 'retail',
        nodeId: 'phone/android',
        node: { name: 'Android', slug: 'android', warrantyType: 'inherit' },
    });

    const child = result.taxonomy.retail[0].children![0];
    assert.equal(child.warrantyType, undefined);
    assert.equal(child.warrantyMonths, undefined);
});

test('applies a parent policy to the entire subtree by clearing descendant overrides', () => {
    const current = tree();
    current.retail[0].children![0].warrantyType = 'warrantyDevice';
    current.retail[0].children![0].warrantyMonths = 6;
    current.retail[0].children![0].children = [{
        id: 'phone/android/pixel', name: 'Pixel', slug: 'pixel', warrantyType: 'warrantyDevice', warrantyMonths: 3,
    }];

    const result = mutateTaxonomy(current, {
        action: 'update',
        taxonomyType: 'retail',
        nodeId: 'phone',
        node: { name: 'Phone', slug: 'phone', warrantyType: 'warrantyDevice', warrantyMonths: 12 },
        applyWarrantyToDescendants: true,
    });

    const child = result.taxonomy.retail[0].children![0];
    assert.equal(child.warrantyType, undefined);
    assert.equal(child.warrantyMonths, undefined);
    assert.equal(child.children![0].warrantyType, undefined);
    assert.equal(child.children![0].warrantyMonths, undefined);
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
