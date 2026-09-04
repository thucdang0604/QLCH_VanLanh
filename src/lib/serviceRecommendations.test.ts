import assert from 'node:assert/strict';
import test from 'node:test';
import {
    filterAvailableCategoryRecommendations,
    getRecommendedPartCategoryIds,
    getRepairServiceCategoryIds,
    getRepairServiceIds,
} from './serviceRecommendations';

test('derives deduplicated service-linked categories from real service ids', () => {
    assert.deepEqual(getRepairServiceIds({ issues: [{ serviceId: 'screen' }, { serviceId: 'screen' }, { serviceId: '' }] }), ['screen']);
    assert.deepEqual(getRecommendedPartCategoryIds([
        { id: 'screen', recommendedPartCategoryIds: ['parts/screen', 'parts/display'] },
        { id: 'battery', recommendedPartCategoryIds: ['parts/display', 'parts/battery'] },
    ]), ['parts/display', 'parts/battery']);
    assert.deepEqual(getRepairServiceCategoryIds({
        categoryPath: ['service/phone', 'service/phone/apple'],
        issues: [
            { categoryPath: ['service/phone', 'service/phone/apple', 'service/phone/apple/screen'] },
            { categoryPath: ['service/phone', 'service/phone/apple', 'service/phone/apple/screen'] },
        ],
    }), ['service/phone/apple', 'service/phone/apple/screen']);
});

test('uses only the deepest linked taxonomy node so generic device categories do not leak into suggestions', () => {
    assert.deepEqual(getRecommendedPartCategoryIds([
        { id: 'screen', recommendedPartCategoryIds: ['dien-thoai', 'dien-thoai/iphone', 'dien-thoai/iphone/man-hinh'] },
        { id: 'battery', recommendedPartCategoryIds: ['dien-thoai', 'dien-thoai/iphone', 'dien-thoai/iphone/pin'] },
    ]), ['dien-thoai/iphone/man-hinh', 'dien-thoai/iphone/pin']);
});

test('keeps only category-matched recommendations and prioritizes available stock', () => {
    const matched = filterAvailableCategoryRecommendations([
        { id: 'out', categoryIds: ['parts/screen'], stock: 1, held: 1 },
        { id: 'in', categoryIds: ['parts/screen'], stock: 3, held: 1 },
        { id: 'other', categoryIds: ['parts/battery'], stock: 9, held: 0 },
    ], ['parts/screen']);
    assert.deepEqual(matched.map(item => item.id), ['in', 'out']);
});
