import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getRepairDeviceModelTerms,
    getRepairPartSearchLookupTokens,
    getScopedRepairPartSearchValues,
    filterRepairPartCatalogResults,
    filterRepairPartSearchResults,
    productMatchesRepairDeviceModel,
    productMatchesRepairPartSearch,
    queryTargetsRepairDeviceModel,
    rankRepairPartSearchResults,
} from './repairPartSearch';

const s23Screen = {
    id: 's23-screen',
    name: 'Màn hình Samsung Galaxy S23 Ultra Zin',
    category: 'Linh kiện',
    brand: '',
    specs: {},
    images: [],
    status: 'active' as const,
    price_original: 0,
    price_promo: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    quality: 'Zin',
    stock: 1,
    held: 0,
    categoryIds: ['dien-thoai', 'dien-thoai/android', 'dien-thoai/android/man-hinh'],
};

const oppoScreen = {
    ...s23Screen,
    id: 'oppo-screen',
    name: 'Màn hình OPPO A58 Zin',
    stock: 8,
};

test('normalizes device variants and keeps model-specific terms', () => {
    assert.deepEqual(getRepairDeviceModelTerms('Samsung S23 Ultra'), ['s23', 'ultra']);
    assert.equal(productMatchesRepairDeviceModel(s23Screen, 'Samsung S23 Ultra'), true);
    assert.equal(productMatchesRepairDeviceModel(oppoScreen, 'Samsung S23 Ultra'), false);
});

test('uses the stable model code instead of the entire natural-language phrase', () => {
    assert.deepEqual(getRepairPartSearchLookupTokens('màn hình S23'), ['s23']);
    assert.deepEqual(getRepairPartSearchLookupTokens('Samsung S23 Ultra'), ['s23 ultra', 's23']);
    assert.deepEqual(
        getScopedRepairPartSearchValues(['dien-thoai/android/man-hinh', 'dien-thoai/android/pin'], 'Samsung S23 Ultra'),
        [
            'dien-thoai/android/man-hinh::s23 ultra',
            'dien-thoai/android/man-hinh::s23',
            'dien-thoai/android/pin::s23 ultra',
            'dien-thoai/android/pin::s23',
        ],
    );
});

test('matches all typed words locally and ranks the ticket model first', () => {
    assert.equal(productMatchesRepairPartSearch(s23Screen, 'màn hình s23'), true);
    assert.equal(queryTargetsRepairDeviceModel('màn hình s23', 'Samsung S23 Ultra'), true);
    assert.deepEqual(
        rankRepairPartSearchResults([oppoScreen, s23Screen], 'màn hình s23', 'Samsung S23 Ultra').map(item => item.id),
        ['s23-screen', 'oppo-screen'],
    );
});

test('excludes a compatible part for another model instead of showing Firestore order', () => {
    assert.deepEqual(
        filterRepairPartSearchResults([oppoScreen, s23Screen], 'màn hình', 'Samsung S23 Ultra').map(item => item.id),
        ['s23-screen'],
    );
});

test('uses one category, model, quality, and active-status decision for every repair screen', () => {
    const iphoneScreen = {
        ...s23Screen,
        id: 'iphone-13-screen',
        name: 'Màn hình Zin',
        description: 'Tương thích iPhone 13',
        quality: 'Loại 1',
        categoryIds: ['dien-thoai', 'dien-thoai/iphone', 'dien-thoai/iphone/man-hinh'],
    };
    const inactiveIphoneScreen = { ...iphoneScreen, id: 'inactive-iphone', status: 'inactive' as const };

    assert.deepEqual(
        filterRepairPartCatalogResults([s23Screen, iphoneScreen, inactiveIphoneScreen], {
            query: 'màn hình',
            deviceModel: 'iPhone 13',
            quality: 'Loại 1',
            categoryIds: ['dien-thoai/iphone/man-hinh'],
        }).map(item => item.id),
        ['iphone-13-screen'],
    );
});
