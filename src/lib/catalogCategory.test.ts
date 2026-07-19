import assert from 'node:assert/strict';
import test from 'node:test';
import { getCatalogCategoryKey, getCatalogCategoryStatus } from './catalogCategory';

test('uses the deepest category id as the bulk-reassignment key', () => {
    const service = {
        category: 'Sửa chữa điện thoại',
        categoryIds: ['sua-dien-thoai', 'sua-dien-thoai/ios', 'sua-dien-thoai/ios/thay-pin'],
    };

    assert.equal(getCatalogCategoryKey(service), 'sua-dien-thoai/ios/thay-pin');
    assert.equal(getCatalogCategoryStatus(service, new Set(['sua-chua-dien-thoai'])), 'orphan');
});

test('keeps legacy category strings reassignable and distinguishes unassigned records', () => {
    assert.equal(getCatalogCategoryKey({ category: 'sua-chua-dien-thoai/ios' }), 'sua-chua-dien-thoai/ios');
    assert.equal(getCatalogCategoryStatus({ category: 'sua-chua-dien-thoai/ios' }, new Set()), 'orphan');
    assert.equal(getCatalogCategoryKey({}), '');
    assert.equal(getCatalogCategoryStatus({}, new Set()), 'unassigned');
});

test('recognizes an existing deepest taxonomy node as valid', () => {
    const service = { categoryIds: ['sua-chua-dien-thoai', 'sua-chua-dien-thoai/sua-iphone'] };

    assert.equal(getCatalogCategoryStatus(service, new Set(['sua-chua-dien-thoai', 'sua-chua-dien-thoai/sua-iphone'])), 'valid');
});
