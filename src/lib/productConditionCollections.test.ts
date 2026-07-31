import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getProductConditionCollection,
    getProductConditionQueryValues,
    matchesProductCondition,
} from './productConditionCollections';

test('the 99 percent collection has a stable route and exact like-new filter', () => {
    assert.deepEqual(getProductConditionCollection(['may-cu-99']), {
        label: 'Máy cũ 99%',
        condition: 'like-new',
    });
});

test('the exact 99 percent filter excludes ordinary used items', () => {
    assert.equal(matchesProductCondition('like-new', 'like-new'), true);
    assert.equal(matchesProductCondition('99%', 'like-new'), true);
    assert.equal(matchesProductCondition('used', 'like-new'), false);
});

test('the exact 99 percent query includes canonical and legacy stored values', () => {
    assert.deepEqual(getProductConditionQueryValues('like-new'), [
        'like-new',
        'like new',
        'likenew',
        '99',
        '99%',
        'cu-99',
        'cu-99%',
        'cũ 99%',
    ]);
});

test('the legacy used collection still includes both used and like-new items', () => {
    assert.equal(matchesProductCondition('used', 'used'), true);
    assert.equal(matchesProductCondition('like-new', 'used'), true);
});
