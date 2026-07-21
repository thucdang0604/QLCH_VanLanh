import assert from 'node:assert/strict';
import test from 'node:test';
import {
    STOREFRONT_CONFIG_DOCUMENTS,
    getConfigDocumentForField,
    getConfigDocumentsForAdminRoute,
    splitConfigPatch,
} from './systemConfig';

test('system config registry keeps each dynamic field in one canonical document', () => {
    assert.equal(getConfigDocumentForField('geofence'), 'main_settings');
    assert.equal(getConfigDocumentForField('bountyRewardValue'), 'main_settings');
    assert.equal(getConfigDocumentForField('homeSections'), 'layout_settings');
    assert.equal(getConfigDocumentForField('headerNav'), 'navigation_settings');

    const grouped = splitConfigPatch({
        geofence: { enabled: false },
        homeSections: [],
        headerNav: [],
    });
    assert.deepEqual(Object.keys(grouped.main_settings), ['geofence']);
    assert.deepEqual(Object.keys(grouped.layout_settings), ['homeSections']);
    assert.deepEqual(Object.keys(grouped.navigation_settings), ['headerNav']);
});

test('taxonomy listener is only enabled on admin screens that need its tree', () => {
    assert.equal(getConfigDocumentsForAdminRoute('/admin').includes('taxonomy_settings'), false);
    assert.equal(getConfigDocumentsForAdminRoute('/admin/orders').includes('taxonomy_settings'), false);
    assert.equal(getConfigDocumentsForAdminRoute('/admin/appearance').includes('taxonomy_settings'), true);
    assert.equal(getConfigDocumentsForAdminRoute('/admin/products').includes('taxonomy_settings'), true);
    assert.equal(getConfigDocumentsForAdminRoute('/admin/settings').includes('taxonomy_settings'), true);
});

test('storefront config excludes the taxonomy tree from shared customer payloads', () => {
    assert.deepEqual(STOREFRONT_CONFIG_DOCUMENTS, [
        'main_settings',
        'layout_settings',
        'navigation_settings',
    ]);
});
