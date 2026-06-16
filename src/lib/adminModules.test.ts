import assert from 'node:assert/strict';
import test from 'node:test';
import { canStaffAccess, findFirstAccessibleRoute, getMatchedAdminRoute } from './adminModules';

test('admin route registry uses longest-prefix matching for nested routes', () => {
    assert.equal(getMatchedAdminRoute('/admin/settings/receipt/edit')?.href, '/admin/settings/receipt');
    assert.equal(getMatchedAdminRoute('/admin/repairs/abc')?.permission, 'manage_repairs');
});

test('staff access is denied by default and granted only by the centralized permission', () => {
    assert.equal(canStaffAccess('/admin/repairs', ['manage_repairs']), true);
    assert.equal(canStaffAccess('/admin/repairs', ['manage_orders']), false);
    assert.equal(canStaffAccess('/admin/unknown', ['manage_settings']), false);
});

test('first accessible route follows the centralized navigation registry', () => {
    assert.equal(findFirstAccessibleRoute(['manage_repairs']), '/admin/repairs');
    assert.equal(findFirstAccessibleRoute([]), '/admin/login');
});
