import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPartCatalogQueryPlan, MAX_COMPONENT_TAXONOMY_ROOTS } from './partCatalogQuery';

const roots = ['linh-kien-dien-thoai', 'linh-kien-laptop', 'linh-kien-ipad'];

test('parts query plan scopes the initial list to component taxonomy roots', () => {
    const plan = buildPartCatalogQueryPlan({ componentRootIds: roots, selectedCategoryIds: [], searchQuery: '' });

    assert.deepEqual(plan, {
        state: 'ready',
        field: 'categoryIds',
        operator: 'array-contains-any',
        values: roots,
        searchToken: '',
        selectedCategoryId: '',
        queryKey: JSON.stringify({ field: 'categoryIds', values: roots, selectedCategoryId: '', searchToken: '' }),
    });
});

test('parts query plan uses a selected taxonomy node including its descendants', () => {
    const selectedCategoryIds = ['linh-kien-dien-thoai', 'linh-kien-dien-thoai/man-hinh'];
    const plan = buildPartCatalogQueryPlan({ componentRootIds: roots, selectedCategoryIds, searchQuery: '' });

    assert.equal(plan.state, 'ready');
    if (plan.state !== 'ready') return;
    assert.equal(plan.field, 'categoryIds');
    assert.equal(plan.operator, 'array-contains');
    assert.deepEqual(plan.values, ['linh-kien-dien-thoai/man-hinh']);
});

test('parts query plan uses the precomputed combined taxonomy search index', () => {
    const plan = buildPartCatalogQueryPlan({
        componentRootIds: roots,
        selectedCategoryIds: ['linh-kien-dien-thoai', 'linh-kien-dien-thoai/man-hinh'],
        searchQuery: 'Màn iPhone',
    });

    assert.equal(plan.state, 'ready');
    if (plan.state !== 'ready') return;
    assert.equal(plan.field, 'searchCategoryKeywords');
    assert.equal(plan.operator, 'array-contains');
    assert.deepEqual(plan.values, ['linh-kien-dien-thoai/man-hinh::man iphone']);
});

test('parts query plan blocks unsafe taxonomy configuration instead of querying all products', () => {
    const tooManyRoots = Array.from({ length: MAX_COMPONENT_TAXONOMY_ROOTS + 1 }, (_, index) => `component-${index}`);

    assert.equal(buildPartCatalogQueryPlan({ componentRootIds: [], selectedCategoryIds: [], searchQuery: '' }).state, 'blocked');
    assert.deepEqual(
        buildPartCatalogQueryPlan({ componentRootIds: tooManyRoots, selectedCategoryIds: [], searchQuery: '' }),
        {
            state: 'blocked',
            reason: 'too_many_component_roots',
            queryKey: `parts:too-many-component-roots:${MAX_COMPONENT_TAXONOMY_ROOTS + 1}`,
        },
    );
});
