import assert from 'node:assert/strict';
import test from 'node:test';
import {
    filterAvailableCategoryRecommendations,
    getRecommendedPartCategoryIds,
    getRepairServiceIds,
} from './serviceRecommendations';

test('derives deduplicated service-linked categories from real service ids', () => {
    assert.deepEqual(getRepairServiceIds({ issues: [{ serviceId: 'screen' }, { serviceId: 'screen' }, { serviceId: '' }] }), ['screen']);
    assert.deepEqual(getRecommendedPartCategoryIds([
        { id: 'screen', recommendedPartCategoryIds: ['parts/screen', 'parts/display'] },
        { id: 'battery', recommendedPartCategoryIds: ['parts/display', 'parts/battery'] },
    ]), ['parts/screen', 'parts/display', 'parts/battery']);
});

test('keeps only category-matched recommendations and prioritizes available stock', () => {
    const matched = filterAvailableCategoryRecommendations([
        { id: 'out', categoryIds: ['parts/screen'], stock: 1, held: 1 },
        { id: 'in', categoryIds: ['parts/screen'], stock: 3, held: 1 },
        { id: 'other', categoryIds: ['parts/battery'], stock: 9, held: 0 },
    ], ['parts/screen']);
    assert.deepEqual(matched.map(item => item.id), ['in', 'out']);
});
