import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canCreateCatalogRecord,
    canEditProductField,
    canEditServiceField,
    isCatalogValueMissing,
} from './catalogEditPolicy';

test('treats zero and false as stored catalog data', () => {
    assert.equal(isCatalogValueMissing(0), false);
    assert.equal(isCatalogValueMissing(false), false);
    assert.equal(isCatalogValueMissing(''), true);
    assert.equal(isCatalogValueMissing([]), true);
});

test('locks stock for everyone and keeps supplier write-once', () => {
    assert.equal(canEditProductField('admin', true, 'stock', 0), false);
    assert.equal(canEditProductField('staff', true, 'stock', undefined), false);
    assert.equal(canEditProductField('admin', true, 'supplier', 'Văn Lành'), false);
    assert.equal(canEditProductField('staff', true, 'supplier', ''), true);
});

test('lets staff fill only genuinely missing values', () => {
    assert.equal(canEditProductField('staff', true, 'description', ''), true);
    assert.equal(canEditProductField('staff', true, 'price_original', 0), false);
    assert.equal(canEditServiceField('staff', true, 'tags', []), true);
    assert.equal(canEditServiceField('staff', true, 'description', 'Đã có mô tả'), false);
});

test('honors an explicit admin grant without weakening hard locks', () => {
    assert.equal(canEditProductField('staff', true, 'price_original', 100000, ['price_original']), true);
    assert.equal(canEditProductField('staff', true, 'category', 'Điện thoại', ['categoryIds']), true);
    assert.equal(canEditServiceField('staff', true, 'description', 'Đã có mô tả', ['description']), true);
    assert.equal(canEditProductField('staff', true, 'stock', 0, ['stock']), false);
    assert.equal(canEditProductField('staff', true, 'supplier', 'Nhà cung cấp A', ['supplier']), false);
});

test('only admins create catalog records directly', () => {
    assert.equal(canCreateCatalogRecord('admin'), true);
    assert.equal(canCreateCatalogRecord('staff'), false);
});
