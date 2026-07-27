import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';
import {
  getCurrentAuthorization,
  isSessionCurrent,
  nextAuthorizationVersion,
} from '@/lib/authorizationLifecycle';
import {
  AUTHORIZATION_PROJECTION_JOBS,
  createPendingAuthorizationProjection,
  markAuthorizationProjectionPending,
  markAuthorizationProjectionSynced,
  syncAuthorizationProjection,
  type AuthorizationProjection,
} from '@/lib/authorizationProjection';
import { verifyPayload, COOKIE_NAME } from '@/lib/sessionCookie';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

const RTDB_ROLE_SYNC_TIMEOUT_MS = 10_000;

function timeoutAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

export const POST = withApi({
  name: 'admin/staff/update',
  onError: (error, context) => context.error(getApiErrorMessage(error, 'Staff update failed'), getApiErrorStatus(error, 500)),
}, async (req: NextRequest, context) => {
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const session = cookie ? await verifyPayload(cookie) : null;
  if (!session) {
    return context.json({ error: 'Unauthorized: missing or expired session' }, { status: 401 });
  }

  const body = await context.readJson(req);
  const { uid, displayName, phone, role, permissions, catalogFieldPermissions } = body;

  if (!uid || typeof uid !== 'string') {
    return context.json({ error: 'Missing or invalid uid' }, { status: 400 });
  }

  const roleClean = typeof role === 'string' && (role === 'admin' || role === 'staff' || role === 'customer')
    ? role
    : 'customer';
  const permissionsClean = Array.isArray(permissions)
    ? permissions.filter((permission): permission is string => typeof permission === 'string')
    : [];

  const updateData: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    role: roleClean,
    permissions: permissionsClean,
  };
  if (typeof displayName === 'string') updateData.displayName = displayName;
  if (typeof phone === 'string') updateData.phone = phone;
  if (catalogFieldPermissions && typeof catalogFieldPermissions === 'object') {
    updateData.catalogFieldPermissions = catalogFieldPermissions;
  }

  const db = getAdminDb();
  const actorRef = db.collection('users').doc(session.uid);
  const targetRef = db.collection('users').doc(uid);
  const jobRef = db.collection(AUTHORIZATION_PROJECTION_JOBS).doc(uid);
  let projection: AuthorizationProjection | null = null;

  await db.runTransaction(async (transaction) => {
    const actorSnap = await transaction.get(actorRef);
    const actorAuthorization = getCurrentAuthorization(actorSnap.exists ? (actorSnap.data() ?? {}) : {});

    if (actorAuthorization.role !== 'admin' || !isSessionCurrent(session, actorAuthorization)) {
      throw new Error('Forbidden: administrator session is no longer current');
    }

    const targetSnap = await transaction.get(targetRef);
    const targetAuthorization = getCurrentAuthorization(targetSnap.exists ? (targetSnap.data() ?? {}) : {});
    const authorizationVersion = nextAuthorizationVersion(targetAuthorization.authorizationVersion);

    projection = {
      uid,
      role: roleClean,
      permissions: permissionsClean,
      authorizationVersion,
    };

    transaction.set(targetRef, {
      ...updateData,
      authorizationVersion,
    }, { merge: true });
    transaction.set(jobRef, createPendingAuthorizationProjection(projection), { merge: true });
  });

  let rtdbRoleSynced = true;
  let rtdbRoleSyncError: string | null = null;
  try {
    await Promise.race([
      syncAuthorizationProjection(projection!),
      timeoutAfter(RTDB_ROLE_SYNC_TIMEOUT_MS, 'RTDB authorization projection timed out'),
    ]);
    await markAuthorizationProjectionSynced(projection!);
  } catch (projectionError) {
    rtdbRoleSynced = false;
    rtdbRoleSyncError = 'RTDB authorization projection is pending reconciliation.';
    console.error('Staff role update RTDB projection is pending reconciliation:', projectionError);
    await markAuthorizationProjectionPending(projection!, projectionError);
  }

  return context.json({
    success: true,
    uid,
    role: roleClean,
    permissions: permissionsClean,
    rtdbRoleSynced,
    rtdbRoleSyncError,
  }, { status: rtdbRoleSynced ? 200 : 202 });
});
