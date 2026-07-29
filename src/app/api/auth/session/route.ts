import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import {
  getCurrentAuthorization,
  isFirebaseTokenCurrent,
  nextAuthorizationVersion,
} from '@/lib/authorizationLifecycle';
import {
  AUTHORIZATION_PROJECTION_JOBS,
  createPendingAuthorizationProjection,
  markAuthorizationProjectionPending,
  markAuthorizationProjectionSynced,
  reconcilePendingAuthorizationProjections,
  grantsRtdbChatAccess,
  syncAuthorizationProjection,
  type AuthorizationProjection,
} from '@/lib/authorizationProjection';
import { getCurrentServerSession } from '@/lib/serverSession';
import { signPayload, verifyPayload, COOKIE_NAME, LEGACY_COOKIE_NAME } from '@/lib/sessionCookie';
import { ApiError, getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

const SESSION_TTL_MS = 20 * 60 * 1000;
const RTDB_ROLE_SYNC_TIMEOUT_MS = 10_000;
const PENDING_PROJECTION_RECONCILE_TIMEOUT_MS = 1_500;

function timeoutAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function resolveLogoutUid(request: NextRequest): Promise<string | null> {
  const bearerToken = getBearerToken(request);
  if (bearerToken) {
    try {
      return (await getAdminAuth().verifyIdToken(bearerToken)).uid;
    } catch {
      // A malformed bearer token must not prevent the valid cookie fallback.
    }
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const session = cookie ? await verifyPayload(cookie) : null;
  return session?.uid || null;
}

/**
 * GET /api/auth/session
 * The Edge middleware uses this Node runtime route to verify that an otherwise
 * valid cookie still matches current Firestore authorization state.
 */
export const GET = withApi({ name: 'auth/session/validate' }, async (request, context) => {
  const session = await getCurrentServerSession(request.cookies.get(COOKIE_NAME)?.value);
  if (!session || (session.session.role !== 'admin' && session.session.role !== 'staff')) {
    return context.json({ valid: false }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  }

  return context.json({
    valid: true,
    role: session.authorization.role,
    permissions: session.authorization.permissions,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...(process.env.E2E_TEST_MODE === '1' ? { 'x-e2e-firestore-read-count': '1' } : {}),
    },
  });
});

/**
 * POST /api/auth/session
 * Receives a Firebase ID token, verifies current authorization, and sets a
 * short-lived signed cookie that includes the authoritative version fence.
 */
export const POST = withApi({
  name: 'auth/session',
  onError: (error, context) => context.error(getApiErrorMessage(error, 'Session creation failed'), getApiErrorStatus(error, 401)),
}, async (req: NextRequest, context) => {
  const { idToken } = await context.readJson(req);
  if (!idToken || typeof idToken !== 'string') {
    return context.json({ error: 'Missing idToken' }, { status: 400 });
  }

  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const uid = decoded.uid;
  const snap = await getAdminDb().collection('users').doc(uid).get();
  const authorization = getCurrentAuthorization(snap.exists ? (snap.data() ?? {}) : {});

  if (!isFirebaseTokenCurrent(decoded.auth_time, authorization)) {
    return context.json({ error: 'Session token invalidated by logout' }, { status: 401 });
  }

  const iat = Date.now();
  const exp = iat + SESSION_TTL_MS;
  const cookieValue = await signPayload({
    uid,
    role: authorization.role,
    permissions: authorization.permissions,
    authorizationVersion: authorization.authorizationVersion,
    iat,
    exp,
  });

  const projection: AuthorizationProjection = {
    uid,
    role: authorization.role,
    permissions: authorization.permissions,
    authorizationVersion: authorization.authorizationVersion,
  };

  let rtdbRoleSynced = false;
  let rtdbRoleSyncError: string | null = null;
  try {
    await Promise.race([
      syncAuthorizationProjection(projection),
      timeoutAfter(RTDB_ROLE_SYNC_TIMEOUT_MS, 'RTDB authorization projection timed out'),
    ]);
    rtdbRoleSynced = true;
  } catch {
    rtdbRoleSyncError = 'RTDB authorization projection is pending reconciliation.';
    console.error('RTDB authorization projection failed during session bootstrap.');
    await getAdminDb().collection(AUTHORIZATION_PROJECTION_JOBS).doc(uid)
      .set(createPendingAuthorizationProjection(projection), { merge: true });
  }

  // Every successful bootstrap is also a bounded retry opportunity for durable
  // revoke jobs. The authenticated internal endpoint can drain the same queue
  // on a schedule when operations need faster recovery.
  try {
    await Promise.race([
      reconcilePendingAuthorizationProjections(5),
      timeoutAfter(PENDING_PROJECTION_RECONCILE_TIMEOUT_MS, 'Pending RTDB reconciliation timed out'),
    ]);
  } catch {
    console.warn('Pending RTDB authorization reconciliation was deferred.');
  }

  const res = context.json({
    success: rtdbRoleSynced,
    role: authorization.role,
    expiresAt: exp,
    rtdbRoleSynced,
    rtdbRoleSyncError,
  }, { status: rtdbRoleSynced ? 200 : 202 });
  res.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  // Firebase Hosting forwards only __session to framework backends. Clear the
  // preceding custom name because it never reaches the SSR function.
  res.cookies.set(LEGACY_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return res;
});

/**
 * DELETE /api/auth/session
 * A Firebase bearer token is preferred so cleanup still works after the page
 * cookie has expired. The authoritative version changes before any RTDB call.
 */
export const DELETE = withApi({ name: 'auth/session/delete' }, async (request: NextRequest, context) => {
  const uid = await resolveLogoutUid(request);
  let rtdbRoleSynced = true;
  let rtdbRoleSyncError: string | null = null;

  if (uid) {
    const db = getAdminDb();
    const userRef = db.collection('users').doc(uid);
    const jobRef = db.collection(AUTHORIZATION_PROJECTION_JOBS).doc(uid);
    const now = Date.now();
    const logoutAuthTime = Math.floor(now / 1000);
    const userBeforeSnap = await userRef.get();
    const userBefore = getCurrentAuthorization(userBeforeSnap.exists ? (userBeforeSnap.data() ?? {}) : {});
    const anticipatedVersion = nextAuthorizationVersion(userBefore.authorizationVersion);
    let projection: AuthorizationProjection | null = null;
    let preRevoked = false;
    let transactionCommitted = false;

    if (grantsRtdbChatAccess(userBefore)) {
      try {
        await Promise.race([
          syncAuthorizationProjection({
            uid,
            role: 'customer',
            permissions: [],
            authorizationVersion: anticipatedVersion,
          }),
          timeoutAfter(RTDB_ROLE_SYNC_TIMEOUT_MS, 'RTDB authorization revoke timed out'),
        ]);
        preRevoked = true;
      } catch {
        throw new ApiError('Unable to safely revoke chat access before logout', 503, 'rtdb_revocation_unavailable');
      }
    }

    try {
      await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        const current = getCurrentAuthorization(userSnap.exists ? (userSnap.data() ?? {}) : {});
        if (preRevoked && current.authorizationVersion !== userBefore.authorizationVersion) {
          throw new ApiError('Authorization changed; retry logout', 409, 'authorization_conflict');
        }
        const authorizationVersion = preRevoked
          ? anticipatedVersion
          : nextAuthorizationVersion(current.authorizationVersion);

        projection = {
          uid,
          role: 'customer',
          permissions: [],
          authorizationVersion,
        };

        transaction.set(userRef, {
          authorizationVersion,
          lastLogoutAt: now,
          lastLogoutAuthTime: logoutAuthTime,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(jobRef, createPendingAuthorizationProjection(projection), { merge: true });
      });
      transactionCommitted = true;
    } catch (error) {
      if (preRevoked && !transactionCommitted) {
        const latestUser = await userRef.get();
        const latestAuthorization = getCurrentAuthorization(latestUser.exists ? (latestUser.data() ?? {}) : {});
        if (latestAuthorization.authorizationVersion === userBefore.authorizationVersion) {
          const restoreProjection: AuthorizationProjection = {
            uid,
            role: userBefore.role,
            permissions: userBefore.permissions,
            authorizationVersion: anticipatedVersion,
          };
          try {
            await syncAuthorizationProjection(restoreProjection);
          } catch {
            await jobRef.set(createPendingAuthorizationProjection(restoreProjection), { merge: true });
          }
        }
      }
      throw error;
    }

    try {
      await Promise.race([
        syncAuthorizationProjection(projection!),
        timeoutAfter(RTDB_ROLE_SYNC_TIMEOUT_MS, 'RTDB authorization revoke timed out'),
      ]);
      await markAuthorizationProjectionSynced(projection!);
    } catch (projectionError) {
      rtdbRoleSynced = false;
      rtdbRoleSyncError = 'RTDB authorization revoke is pending reconciliation.';
      console.error('RTDB authorization revoke is pending reconciliation.');
      await markAuthorizationProjectionPending(projection!, projectionError);
    }
  }

  const res = context.json({
    success: true,
    serverCleanupCompleted: Boolean(uid),
    rtdbRoleSynced,
    rtdbRoleSyncError,
  }, { status: rtdbRoleSynced ? 200 : 202 });
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.cookies.set(LEGACY_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
});
