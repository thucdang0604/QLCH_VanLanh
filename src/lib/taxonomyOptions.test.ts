import assert from 'node:assert/strict';
import test from 'node:test';
import { flattenTaxonomyOptions, uniqueTaxonomyOptions } from './taxonomyOptions';

test('keeps a single stable option for duplicated taxonomy IDs', () => {
    const retail = flattenTaxonomyOptions([
        { id: 'dien-thoai', name: 'Điện thoại', slug: 'dien-thoai' },
    ]);
    const component = flattenTaxonomyOptions([
        { id: 'dien-thoai', name: 'Linh kiện điện thoại', slug: 'dien-thoai' },
        { id: 'man-hinh', name: 'Màn hình', slug: 'man-hinh' },
    ]);

    const options = uniqueTaxonomyOptions([...retail, ...component]);

    assert.deepEqual(options.map(option => option.id), ['dien-thoai', 'man-hinh']);
    assert.equal(options[0].name, 'Điện thoại');
});
