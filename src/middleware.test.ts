import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';
import { signPayload, COOKIE_NAME } from './lib/sessionCookie';

process.env.SESSION_SECRET = 'test_secret_key_1234567890_super_secret_for_tests';

const originalFetch = globalThis.fetch;
let validationStatus = 200;
let validationSession: { role: 'admin' | 'staff'; permissions: string[] } | null = {
  role: 'admin',
  permissions: [],
};
let validationCookie = '';

beforeEach(() => {
  validationStatus = 200;
  validationSession = { role: 'admin', permissions: [] };
  validationCookie = '';
  globalThis.fetch = async (_input, init) => {
    validationCookie = new Headers(init?.headers).get('cookie') || '';
    if (validationStatus !== 200 || !validationSession) {
      return new Response(null, { status: validationStatus });
    }
    return Response.json({ valid: true, ...validationSession });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test('middleware: allows /admin/login without session cookie', async () => {
  const req = new NextRequest('http://localhost:3000/admin/login');
  const res = await middleware(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('location'), null);
});

test('middleware: redirects /admin/dashboard to /admin/login when no cookie is present (Fail-Closed)', async () => {
  const req = new NextRequest('http://localhost:3000/admin/dashboard');
  const res = await middleware(req);
  assert.equal(res.status, 307);
  const location = res.headers.get('location');
  assert.notEqual(location, null);
  assert.ok(location?.includes('/admin/login'));
  assert.ok(location?.includes('from=%2Fadmin%2Fdashboard'));
});

test('middleware: redirects and clears cookie when the Node validator rejects it', async () => {
  validationStatus = 401;
  const now = Date.now();
  const expiredCookie = await signPayload({
    uid: 'user_1',
    role: 'admin',
    permissions: [],
    authorizationVersion: 1,
    iat: now - 30 * 60 * 1000,
    exp: now - 10 * 60 * 1000,
  });

  const req = new NextRequest('http://localhost:3000/admin/dashboard', {
    headers: { cookie: `${COOKIE_NAME}=${expiredCookie}` },
  });
  const res = await middleware(req);
  assert.equal(res.status, 307);
  assert.ok(res.headers.get('location')?.includes('/admin/login'));
  const setCookieHeader = res.headers.get('set-cookie');
  assert.ok(setCookieHeader?.includes(`${COOKIE_NAME}=;`));
});

test('middleware: allows admin access to any admin route', async () => {
  const now = Date.now();
  const adminCookie = await signPayload({
    uid: 'admin_user',
    role: 'admin',
    permissions: [],
    authorizationVersion: 1,
    iat: now,
    exp: now + 20 * 60 * 1000,
  });

  const req = new NextRequest('http://localhost:3000/admin/settings', {
    headers: { cookie: `${COOKIE_NAME}=${adminCookie}` },
  });
  const res = await middleware(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('location'), null);
  assert.equal(validationCookie, `${COOKIE_NAME}=${adminCookie}`);
});

test('middleware: allows staff access to route with matching permission', async () => {
  validationSession = { role: 'staff', permissions: ['manage_settings'] };
  const now = Date.now();
  const staffCookie = await signPayload({
    uid: 'staff_user',
    role: 'staff',
    permissions: ['manage_settings'],
    authorizationVersion: 1,
    iat: now,
    exp: now + 20 * 60 * 1000,
  });

  const req = new NextRequest('http://localhost:3000/admin/settings', {
    headers: { cookie: `${COOKIE_NAME}=${staffCookie}` },
  });
  const res = await middleware(req);
  assert.equal(res.status, 200);
});

test('middleware: denies staff access to route with missing permission', async () => {
  validationSession = { role: 'staff', permissions: ['manage_orders'] };
  const now = Date.now();
  const staffCookie = await signPayload({
    uid: 'staff_user',
    role: 'staff',
    permissions: ['manage_orders'], // Missing manage_settings
    authorizationVersion: 1,
    iat: now,
    exp: now + 20 * 60 * 1000,
  });

  const req = new NextRequest('http://localhost:3000/admin/settings', {
    headers: { cookie: `${COOKIE_NAME}=${staffCookie}` },
  });
  const res = await middleware(req);
  assert.equal(res.status, 307);
  assert.ok(res.headers.get('location')?.includes('/admin/login'));
});

test('middleware: rejects an otherwise valid cookie when server authorization has changed', async () => {
  validationStatus = 401;
  const now = Date.now();
  const adminCookie = await signPayload({
    uid: 'demoted_admin',
    role: 'admin',
    permissions: [],
    authorizationVersion: 1,
    iat: now,
    exp: now + 20 * 60 * 1000,
  });

  const req = new NextRequest('http://localhost:3000/admin/settings', {
    headers: { cookie: COOKIE_NAME + '=' + adminCookie },
  });
  const res = await middleware(req);

  assert.equal(res.status, 307);
  assert.ok(res.headers.get('location')?.includes('/admin/login'));
  assert.ok(res.headers.get('set-cookie')?.includes(COOKIE_NAME + '=;'));
});

test('middleware: relies on the validated Node response rather than an Edge SESSION_SECRET', async () => {
  const inheritedSecret = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;

  try {
    const req = new NextRequest('http://localhost:3000/admin/settings', {
      headers: { cookie: `${COOKIE_NAME}=server-validated-session` },
    });
    const res = await middleware(req);
    assert.equal(res.status, 200);
  } finally {
    process.env.SESSION_SECRET = inheritedSecret;
  }
});

test('middleware: sanitizes open redirect attempt in return target', async () => {
  const req = new NextRequest('http://localhost:3000/admin/login?from=https://evil.com');
  const res = await middleware(req);
  assert.equal(res.status, 200);
});

test('middleware: sanitizes open redirect when accessing protected route without cookie', async () => {
  const req = new NextRequest('http://localhost:3000/admin/dashboard?from=https://evil.com');
  const res = await middleware(req);
  assert.equal(res.status, 307);
  const location = res.headers.get('location');
  assert.ok(location?.includes('/admin/login?from=%2Fadmin%2Fdashboard'));
  assert.ok(!location?.includes('evil.com'));
});
