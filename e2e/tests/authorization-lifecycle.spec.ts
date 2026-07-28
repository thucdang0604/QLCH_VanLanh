import { test, expect } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, get, ref, set } from 'firebase/database';
import { E2E_DATABASE_NAMESPACE, E2E_PROJECT_ID, getE2EBaseUrl, getRunId, getScopedId } from '../../scripts/e2e/config';
import { getE2EHarness } from '../../scripts/e2e/harness';
import { bootstrapSession, sessionCookieHeader } from '../../scripts/e2e/session';

async function expectRtdbChatAccessDenied(runId: string, email: string, uid: string, roomId: string): Promise<void> {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (!authHost || !databaseHost) throw new Error('Firebase Emulator hosts must be configured for the authorization lifecycle test.');

  const [databaseHostname, databasePortRaw] = databaseHost.split(':');
  const databasePort = Number(databasePortRaw);
  if (!databaseHostname || !Number.isInteger(databasePort)) throw new Error('FIREBASE_DATABASE_EMULATOR_HOST must contain host and port.');

  const app = initializeApp({
    apiKey: 'e2e-firebase-api-key',
    authDomain: '127.0.0.1',
    projectId: E2E_PROJECT_ID,
    databaseURL: `http://${databaseHost}?ns=${E2E_DATABASE_NAMESPACE}`,
  }, `e2e-rtdb-revocation-${runId}`);

  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    await signInWithEmailAndPassword(auth, email, 'E2E-Only-Password-2026!');

    const database = getDatabase(app);
    connectDatabaseEmulator(database, databaseHostname, databasePort);
    const expectPermissionDenied = async (attempt: () => Promise<unknown>) => {
      await attempt().then(
        () => { throw new Error('Expected RTDB Rules to deny the former administrator.'); },
        (error: unknown) => expect(String((error as { code?: unknown })?.code || error)).toMatch(/permission[-_ ]?denied/i),
      );
    };

    await expectPermissionDenied(() => get(ref(database, `chats/${roomId}`)));
    await expectPermissionDenied(() => set(
      ref(database, `chats/${roomId}/messages/${getScopedId('revocation-message', runId)}`),
      { text: 'E2E stale authorization write', senderId: uid, senderType: 'admin', timestamp: Date.now() },
    ));
  } finally {
    await deleteApp(app);
  }
}

test.describe('Authorization lifecycle', () => {
  test('logout invalidates a copied privileged cookie and the bootstrap token used before logout', async ({ request }) => {
    const runId = getRunId();
    const email = `e2e-${runId}-admin-lifecycle-logout@example.test`;
    const session = await bootstrapSession(request, email, runId);

    expect((await request.get('/api/auth/session')).status()).toBe(200);

    const logout = await request.delete('/api/auth/session', {
      headers: { Authorization: `Bearer ${session.idToken}`, 'x-e2e-run-id': runId },
    });
    expect(logout.status()).toBe(200);

    const staleHeaders = { cookie: sessionCookieHeader(session.cookieValue), 'x-e2e-run-id': runId };
    expect((await request.get('/api/auth/session', { headers: staleHeaders })).status()).toBe(401);

    const staleBootstrap = await request.post('/api/auth/session', {
      headers: { 'x-e2e-run-id': runId },
      data: { idToken: session.idToken },
    });
    expect(staleBootstrap.status()).toBe(401);
  });

  test('a demoted administrator cannot use a previously issued cookie to mutate staff', async ({ playwright }) => {
    const runId = getRunId();
    const adminOneEmail = `e2e-${runId}-admin-lifecycle-one@example.test`;
    const adminTwoEmail = `e2e-${runId}-admin-lifecycle-two@example.test`;
    const targetUid = getScopedId('staff', runId);
    const adminOneUid = getScopedId('admin-lifecycle-one', runId);
    const { db, rtdb } = getE2EHarness();
    const adminOne = await playwright.request.newContext({ baseURL: getE2EBaseUrl() });
    const adminTwo = await playwright.request.newContext({ baseURL: getE2EBaseUrl() });

    try {
      const sessionOne = await bootstrapSession(adminOne, adminOneEmail, runId);
      await bootstrapSession(adminTwo, adminTwoEmail, runId);
      const authorizationVersionBeforeDemotion = (await db.doc(`users/${adminOneUid}`).get()).data()?.authorizationVersion;
      expect(authorizationVersionBeforeDemotion).toEqual(expect.any(Number));

      const demotion = await adminTwo.post('/api/admin/staff/update', {
        headers: { 'x-e2e-run-id': runId },
        data: { uid: adminOneUid, role: 'customer', permissions: [] },
      });
      expect(demotion.status()).toBe(200);
      const expectedAuthorizationVersion = Number(authorizationVersionBeforeDemotion) + 1;
      expect((await db.doc(`users/${adminOneUid}`).get()).data()).toMatchObject({ role: 'customer', authorizationVersion: expectedAuthorizationVersion });
      expect((await rtdb.ref(`admin_roles/${adminOneUid}`).get()).val()).toMatchObject({ role: 'customer', expiresAt: 0, authorizationVersion: expectedAuthorizationVersion });

      const roomId = getScopedId('revocation-room', runId);
      await rtdb.ref(`chats/${roomId}/info`).set({
        displayName: 'E2E revocation fixture',
        lastMessage: 'Authorization rule check',
        botActive: false,
        hasUnread: false,
        channel: 'web',
      });
      await expectRtdbChatAccessDenied(runId, adminOneEmail, adminOneUid, roomId);

      const targetBefore = (await db.doc(`users/${targetUid}`).get()).data();
      const staleMutation = await adminOne.post('/api/admin/staff/update', {
        headers: { cookie: sessionCookieHeader(sessionOne.cookieValue), 'x-e2e-run-id': runId },
        data: { uid: targetUid, role: 'admin', permissions: [] },
      });
      expect(staleMutation.status()).toBe(403);
      expect((await db.doc(`users/${targetUid}`).get()).data()).toMatchObject(targetBefore || {});
    } finally {
      await adminOne.dispose();
      await adminTwo.dispose();
    }
  });
});
