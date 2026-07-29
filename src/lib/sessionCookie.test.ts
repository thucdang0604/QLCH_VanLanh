import test from 'node:test';
import assert from 'node:assert/strict';
import { COOKIE_NAME, LEGACY_COOKIE_NAME, signPayload, verifyPayload, SessionPayload } from './sessionCookie';
import { sanitizeAdminRedirectTarget, resolveAdminTargetRoute } from './adminModules';

process.env.SESSION_SECRET = 'test_secret_key_1234567890_super_secret_for_tests';

test('sessionCookie: uses the Firebase Hosting forwarded cookie and retires the previous custom name', () => {
  assert.equal(COOKIE_NAME, '__session');
  assert.equal(LEGACY_COOKIE_NAME, 'vl_admin_session');
  assert.notEqual(COOKIE_NAME, LEGACY_COOKIE_NAME);
});

test('sessionCookie: signs and verifies valid session payload', async () => {
  const now = Date.now();
  const payload: SessionPayload = {
    uid: 'user_admin_123',
    role: 'admin',
    permissions: ['manage_settings', 'manage_orders'],
    authorizationVersion: 1,
    iat: now,
    exp: now + 20 * 60 * 1000,
  };

  const cookie = await signPayload(payload);
  assert.equal(typeof cookie, 'string');
  assert.equal(cookie.split('.').length, 2);

  const verified = await verifyPayload(cookie);
  assert.notEqual(verified, null);
  assert.equal(verified?.uid, 'user_admin_123');
  assert.equal(verified?.role, 'admin');
  assert.deepEqual(verified?.permissions, ['manage_settings', 'manage_orders']);
});

test('sessionCookie: rejects expired payload (exp in the past)', async () => {
  const now = Date.now();
  const expiredPayload: SessionPayload = {
    uid: 'user_staff_456',
    role: 'staff',
    permissions: ['manage_orders'],
    authorizationVersion: 1,
    iat: now - 30 * 60 * 1000,
    exp: now - 10 * 60 * 1000, // Expired 10 min ago
  };

  const cookie = await signPayload(expiredPayload);
  const verified = await verifyPayload(cookie);
  assert.equal(verified, null);
});

test('sessionCookie: rejects tampered signature', async () => {
  const now = Date.now();
  const payload: SessionPayload = {
    uid: 'user_admin_123',
    role: 'admin',
    permissions: [],
    authorizationVersion: 1,
    iat: now,
    exp: now + 20 * 60 * 1000,
  };

  const cookie = await signPayload(payload);
  const [jsonB64] = cookie.split('.');
  const tamperedCookie = `${jsonB64}.tampered_signature_12345`;

  const verified = await verifyPayload(tamperedCookie);
  assert.equal(verified, null);
});

test('sessionCookie: rejects malformed cookie string', async () => {
  assert.equal(await verifyPayload(''), null);
  assert.equal(await verifyPayload('not_a_valid_cookie'), null);
  assert.equal(await verifyPayload('part1.part2.part3'), null);
});

test('sessionCookie: rejects payload missing required fields', async () => {
  // @ts-expect-error testing invalid payload structure
  const invalidPayload: SessionPayload = {
    role: 'admin',
    permissions: [],
    authorizationVersion: 1,
  };

  const cookie = await signPayload(invalidPayload);
  const verified = await verifyPayload(cookie);
  assert.equal(verified, null);
});

test('sanitizeAdminRedirectTarget: accepts valid admin paths', () => {
  assert.equal(sanitizeAdminRedirectTarget('/admin/dashboard'), '/admin/dashboard');
  assert.equal(sanitizeAdminRedirectTarget('/admin/repairs'), '/admin/repairs');
  assert.equal(sanitizeAdminRedirectTarget('  /admin/pos  '), '/admin/pos');
  assert.equal(sanitizeAdminRedirectTarget('/admin/repairs?status=in_progress&page=2'), '/admin/repairs?status=in_progress&page=2');
});

test('sanitizeAdminRedirectTarget: rejects open redirect vectors and self-loops', () => {
  assert.equal(sanitizeAdminRedirectTarget('/admin/login'), '');
  assert.equal(sanitizeAdminRedirectTarget('/admin/login?from=/admin/repairs'), '');
  assert.equal(sanitizeAdminRedirectTarget('https://evil.com'), '');
  assert.equal(sanitizeAdminRedirectTarget('//evil.com'), '');
  assert.equal(sanitizeAdminRedirectTarget('javascript:alert(1)'), '');
  assert.equal(sanitizeAdminRedirectTarget('/customer/orders'), '');
  assert.equal(sanitizeAdminRedirectTarget(null), '');
  assert.equal(sanitizeAdminRedirectTarget(undefined), '');
});

test('resolveAdminTargetRoute: routes admin user to target or /admin', () => {
  assert.deepEqual(resolveAdminTargetRoute('admin', [], null), { target: '/admin' });
  assert.deepEqual(resolveAdminTargetRoute('admin', [], '/admin/settings'), { target: '/admin/settings' });
  assert.deepEqual(resolveAdminTargetRoute('admin', [], '/admin/login'), { target: '/admin' });
});

test('resolveAdminTargetRoute: routes staff user with manage_repairs to /admin/repairs and preserves query strings', () => {
  // Staff with manage_repairs and no from -> lands on /admin/repairs (not /admin or /admin/login)
  const res = resolveAdminTargetRoute('staff', ['manage_repairs'], null);
  assert.equal(res.target, '/admin/repairs');

  // Staff with manage_repairs and valid from -> lands on requested route
  const resWithFrom = resolveAdminTargetRoute('staff', ['manage_repairs'], '/admin/repairs');
  assert.equal(resWithFrom.target, '/admin/repairs');

  // Staff with manage_repairs and valid from with query params -> preserves query string
  const resWithQuery = resolveAdminTargetRoute('staff', ['manage_repairs'], '/admin/repairs?status=in_progress&page=2');
  assert.equal(resWithQuery.target, '/admin/repairs?status=in_progress&page=2');

  // Staff requesting unpermitted route -> falls back to first accessible route
  const resUnpermitted = resolveAdminTargetRoute('staff', ['manage_repairs'], '/admin/settings');
  assert.equal(resUnpermitted.target, '/admin/repairs');
});

test('resolveAdminTargetRoute: returns error for staff with empty permissions', () => {
  const res = resolveAdminTargetRoute('staff', [], null);
  assert.equal(res.target, null);
  assert.ok(res.error?.includes('chưa được phân quyền'));
});
