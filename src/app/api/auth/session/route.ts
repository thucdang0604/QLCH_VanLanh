import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb, getAdminRtdb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { signPayload, COOKIE_NAME } from '@/lib/sessionCookie';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

const RTDB_ROLE_SYNC_TIMEOUT_MS = 10000;

function timeoutAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * POST /api/auth/session
 * Receives a Firebase ID token, verifies it, reads the user's role + permissions,
 * then sets a signed HttpOnly session cookie for middleware RBAC.
 */
export const POST = withApi({
  name: 'auth/session',
  onError: (error, context) => context.error(getApiErrorMessage(error, 'Session creation failed'), getApiErrorStatus(error, 401)),
}, async (req: NextRequest, context) => {
    const { idToken } = await context.readJson(req);
    if (!idToken || typeof idToken !== 'string') {
      return context.json({ error: 'Missing idToken' }, { status: 400 });
    }

    // Verify Firebase ID token. Revocation checks require extra Firebase Auth
    // IAM permissions on the Cloud Functions service account; the signed
    // session cookie is short-lived and role authorization is read from
    // Firestore below.
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const uid = decoded.uid;

    // Read role + permissions from Firestore
    const snap = await getAdminDb().collection('users').doc(uid).get();
    const data = snap.exists ? (snap.data() as Partial<{ role: string; permissions: string[] }>) : {};

    const roleRaw = typeof data.role === 'string' ? data.role : 'customer';
    const role = roleRaw === 'admin' || roleRaw === 'staff' || roleRaw === 'customer' ? roleRaw : 'customer' as const;
    const permissions = Array.isArray(data.permissions) ? data.permissions.filter((p) => typeof p === 'string') : [];

    // Sign and set cookie
    const cookieValue = await signPayload({ role, permissions });

    let rtdbRoleSynced = false;
    let rtdbRoleSyncError: string | null = null;

    if (role === 'admin' || role === 'staff') {
      const permissionMap = Object.fromEntries(permissions.map((permission) => [permission, true]));
      if (!isAdminAvailable()) {
        rtdbRoleSyncError = 'Firebase Admin credentials are not configured for RTDB role sync.';
      } else {
        try {
          await Promise.race([
            getAdminRtdb().ref(`admin_roles/${uid}`).set({
              role,
              permissions: permissionMap,
              expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 5,
              updatedAt: Date.now(),
            }),
            timeoutAfter(RTDB_ROLE_SYNC_TIMEOUT_MS, 'RTDB admin role sync timed out'),
          ]);
          rtdbRoleSynced = true;
        } catch (roleSyncError) {
          console.error('Admin RTDB role sync failed:', roleSyncError);
          rtdbRoleSyncError = roleSyncError instanceof Error ? roleSyncError.message : String(roleSyncError);
        }
      }
    }

    const res = context.json({ success: true, role, rtdbRoleSynced, rtdbRoleSyncError });
    res.cookies.set(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 5, // 5 days
    });

    return res;
});

/**
 * DELETE /api/auth/session
 * Clears the session cookie.
 */
export const DELETE = withApi({ name: 'auth/session/delete' }, async (_request, context) => {
  const res = context.json({ success: true });
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
});
