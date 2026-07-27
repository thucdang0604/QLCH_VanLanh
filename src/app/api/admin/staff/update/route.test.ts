import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { signPayload, COOKIE_NAME } from '@/lib/sessionCookie';

process.env.SESSION_SECRET = 'test_secret_key_1234567890_super_secret_for_tests';

type Ref = {
  collectionName: string;
  id: string;
  get: () => Promise<{ exists: boolean; data: () => UserRecord | undefined }>;
};
type UserRecord = {
  role: 'admin' | 'staff' | 'customer';
  permissions: string[];
  authorizationVersion: number;
  lastLogoutAt?: number;
  lastLogoutAuthTime?: number;
};

const users = new Map<string, UserRecord>();
const writes: Array<{ ref: Ref; data: Record<string, unknown> }> = [];
const syncedProjections: Array<Record<string, unknown>> = [];

const fakeDb = {
  collection: (collectionName: string) => ({
    doc: (id: string): Ref => ({
      collectionName,
      id,
      get: async () => ({
        exists: collectionName === 'users' && users.has(id),
        data: () => users.get(id),
      }),
    }),
  }),
  runTransaction: async (callback: (transaction: {
    get: (ref: Ref) => Promise<{ exists: boolean; data: () => UserRecord | undefined }>;
    set: (ref: Ref, data: Record<string, unknown>) => void;
  }) => Promise<void>) => callback({
    get: async (ref) => ref.get(),
    set: (ref, data) => {
      writes.push({ ref, data });
    },
  }),
};

const moduleMocksAvailable = typeof mock.module === 'function';

if (moduleMocksAvailable) {
  mock.module('@/lib/firebaseAdmin', {
    namedExports: {
      getAdminDb: () => fakeDb,
      getAdminAuth: () => ({
        verifyIdToken: async () => ({ uid: 'logout_admin', auth_time: 2_000 }),
      }),
    },
  });

  mock.module('@/lib/authorizationProjection', {
    namedExports: {
      AUTHORIZATION_PROJECTION_JOBS: 'authorization_projection_jobs',
      createPendingAuthorizationProjection: (projection: Record<string, unknown>) => ({
        ...projection,
        status: 'pending',
      }),
      markAuthorizationProjectionPending: async () => undefined,
      markAuthorizationProjectionSynced: async () => undefined,
      reconcilePendingAuthorizationProjections: async () => ({
        attempted: 0,
        synced: 0,
        pending: 0,
        invalid: 0,
      }),
      syncAuthorizationProjection: async (projection: Record<string, unknown>) => {
        syncedProjections.push(projection);
      },
    },
  });
}

async function getPost() {
  return (await import('./route')).POST;
}

async function getSessionHandlers() {
  const sessionRoute = await import('../../../auth/session/route');
  return { GET: sessionRoute.GET, POST: sessionRoute.POST, DELETE: sessionRoute.DELETE };
}

function resetState() {
  users.clear();
  writes.length = 0;
  syncedProjections.length = 0;
}

function createRequest(cookie: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/staff/update', {
    method: 'POST',
    headers: {
      cookie: COOKIE_NAME + '=' + cookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      uid: 'target_staff',
      role: 'staff',
      permissions: ['chat_support'],
    }),
  });
}

test('staff update: rejects a pre-demotion admin cookie at the real route boundary', { skip: !moduleMocksAvailable }, async () => {
  resetState();
  users.set('former_admin', {
    role: 'customer',
    permissions: [],
    authorizationVersion: 2,
  });
  const now = Date.now();
  const staleCookie = await signPayload({
    uid: 'former_admin',
    role: 'admin',
    permissions: ['manage_staff'],
    authorizationVersion: 1,
    iat: now,
    exp: now + 60_000,
  });

  const response = await (await getPost())(createRequest(staleCookie), { params: Promise.resolve({}) });

  assert.equal(response.status, 403);
  assert.equal(writes.length, 0);
  assert.equal(syncedProjections.length, 0);
});

test('staff update: accepts a current admin and advances the target authorization version', { skip: !moduleMocksAvailable }, async () => {
  resetState();
  users.set('current_admin', {
    role: 'admin',
    permissions: ['manage_staff'],
    authorizationVersion: 4,
  });
  users.set('target_staff', {
    role: 'customer',
    permissions: [],
    authorizationVersion: 9,
  });
  const now = Date.now();
  const currentCookie = await signPayload({
    uid: 'current_admin',
    role: 'admin',
    permissions: ['manage_staff'],
    authorizationVersion: 4,
    iat: now,
    exp: now + 60_000,
  });

  const response = await (await getPost())(createRequest(currentCookie), { params: Promise.resolve({}) });
  const body = await response.json() as { success: boolean; rtdbRoleSynced: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.rtdbRoleSynced, true);
  assert.equal(writes.some((write) =>
    write.ref.collectionName === 'users'
      && write.ref.id === 'target_staff'
      && write.data.authorizationVersion === 10,
  ), true);
  assert.deepEqual(syncedProjections, [{
    uid: 'target_staff',
    role: 'staff',
    permissions: ['chat_support'],
    authorizationVersion: 10,
  }]);
});

test('session validation: rejects an HMAC-valid cookie after its authorization version changes', { skip: !moduleMocksAvailable }, async () => {
  resetState();
  users.set('revoked_admin', {
    role: 'customer',
    permissions: [],
    authorizationVersion: 5,
  });
  const now = Date.now();
  const staleCookie = await signPayload({
    uid: 'revoked_admin',
    role: 'admin',
    permissions: ['manage_staff'],
    authorizationVersion: 4,
    iat: now,
    exp: now + 60_000,
  });

  const { GET } = await getSessionHandlers();
  const response = await GET(new NextRequest('http://localhost:3000/api/auth/session', {
    headers: { cookie: COOKIE_NAME + '=' + staleCookie },
  }), { params: Promise.resolve({}) });

  assert.equal(response.status, 401);
});

test('session logout: bearer identity advances the version and writes a revoke projection', { skip: !moduleMocksAvailable }, async () => {
  resetState();
  users.set('logout_admin', {
    role: 'admin',
    permissions: ['manage_staff'],
    authorizationVersion: 6,
  });

  const { DELETE } = await getSessionHandlers();
  const response = await DELETE(new NextRequest('http://localhost:3000/api/auth/session', {
    method: 'DELETE',
    headers: { authorization: 'Bearer retained-firebase-id-token' },
  }), { params: Promise.resolve({}) });
  const body = await response.json() as { success: boolean; serverCleanupCompleted: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.serverCleanupCompleted, true);
  assert.equal(writes.some((write) =>
    write.ref.collectionName === 'users'
      && write.ref.id === 'logout_admin'
      && write.data.authorizationVersion === 7
      && typeof write.data.lastLogoutAt === 'number',
  ), true);
  assert.deepEqual(syncedProjections, [{
    uid: 'logout_admin',
    role: 'customer',
    permissions: [],
    authorizationVersion: 7,
  }]);
});

test('session bootstrap: rejects a Firebase token authenticated before the recorded logout', { skip: !moduleMocksAvailable }, async () => {
  resetState();
  users.set('logout_admin', {
    role: 'admin',
    permissions: ['manage_staff'],
    authorizationVersion: 7,
    lastLogoutAt: Date.now(),
    lastLogoutAuthTime: 2_000,
  });

  const { POST } = await getSessionHandlers();
  const response = await POST(new NextRequest('http://localhost:3000/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: 'retained-firebase-id-token' }),
  }), { params: Promise.resolve({}) });

  assert.equal(response.status, 401);
  assert.equal(syncedProjections.length, 0);
});
