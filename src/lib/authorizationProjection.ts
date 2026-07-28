import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, syncUserRtdbRoleGrant } from '@/lib/firebaseAdmin';

export const AUTHORIZATION_PROJECTION_JOBS = 'authorization_projection_jobs';

export interface AuthorizationProjection {
  uid: string;
  role: 'admin' | 'staff' | 'customer';
  permissions: string[];
  authorizationVersion: number;
}

export function grantsRtdbChatAccess(projection: Pick<AuthorizationProjection, 'role' | 'permissions'>): boolean {
  return projection.role === 'admin'
    || (projection.role === 'staff' && projection.permissions.includes('chat_support'));
}

/**
 * A Firestore-to-RTDB authorization downgrade must revoke RTDB before the
 * authoritative write commits, otherwise an older RTDB grant stays usable.
 */
export function requiresRtdbChatRevocation(
  current: Pick<AuthorizationProjection, 'role' | 'permissions'>,
  desired: Pick<AuthorizationProjection, 'role' | 'permissions'>,
): boolean {
  return grantsRtdbChatAccess(current) && !grantsRtdbChatAccess(desired);
}

export function createPendingAuthorizationProjection(projection: AuthorizationProjection) {
  return {
    ...projection,
    status: 'pending',
    updatedAt: FieldValue.serverTimestamp(),
    requestedAt: FieldValue.serverTimestamp(),
  };
}

export async function syncAuthorizationProjection(projection: AuthorizationProjection): Promise<void> {
  await syncUserRtdbRoleGrant(
    projection.uid,
    projection.role,
    projection.permissions,
    projection.authorizationVersion,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'Unknown RTDB projection error';
}

export async function markAuthorizationProjectionSynced(projection: AuthorizationProjection): Promise<void> {
  const jobRef = getAdminDb().collection(AUTHORIZATION_PROJECTION_JOBS).doc(projection.uid);
  await getAdminDb().runTransaction(async (transaction) => {
    const jobSnap = await transaction.get(jobRef);
    const storedVersion = jobSnap.exists ? jobSnap.get('authorizationVersion') : null;
    if (storedVersion !== projection.authorizationVersion) return;

    transaction.set(jobRef, {
      status: 'synced',
      authorizationVersion: projection.authorizationVersion,
      syncedAt: FieldValue.serverTimestamp(),
      lastError: FieldValue.delete(),
    }, { merge: true });
  });
}

export async function markAuthorizationProjectionPending(
  projection: AuthorizationProjection,
  error: unknown,
): Promise<void> {
  const jobRef = getAdminDb().collection(AUTHORIZATION_PROJECTION_JOBS).doc(projection.uid);
  await getAdminDb().runTransaction(async (transaction) => {
    const jobSnap = await transaction.get(jobRef);
    const storedVersion = jobSnap.exists ? jobSnap.get('authorizationVersion') : null;
    if (storedVersion !== projection.authorizationVersion) return;

    transaction.set(jobRef, {
      ...createPendingAuthorizationProjection(projection),
      attempts: FieldValue.increment(1),
      lastError: errorMessage(error),
    }, { merge: true });
  });
}

function parsePendingProjection(uid: string, data: Record<string, unknown>): AuthorizationProjection | null {
  const role = data.role;
  const authorizationVersion = data.authorizationVersion;
  if (
    (role !== 'admin' && role !== 'staff' && role !== 'customer') ||
    typeof authorizationVersion !== 'number' ||
    !Number.isSafeInteger(authorizationVersion) ||
    authorizationVersion < 0
  ) {
    return null;
  }

  return {
    uid,
    role,
    permissions: Array.isArray(data.permissions)
      ? data.permissions.filter((permission): permission is string => typeof permission === 'string')
      : [],
    authorizationVersion,
  };
}

export async function reconcilePendingAuthorizationProjections(limit = 25): Promise<{
  attempted: number;
  synced: number;
  pending: number;
  invalid: number;
}> {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const jobs = await getAdminDb()
    .collection(AUTHORIZATION_PROJECTION_JOBS)
    .where('status', '==', 'pending')
    .limit(boundedLimit)
    .get();

  let synced = 0;
  let pending = 0;
  let invalid = 0;

  for (const job of jobs.docs) {
    const projection = parsePendingProjection(job.id, job.data());
    if (!projection) {
      invalid += 1;
      await job.ref.set({
        status: 'invalid',
        lastError: 'Invalid authorization projection payload',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }

    try {
      await syncAuthorizationProjection(projection);
      await markAuthorizationProjectionSynced(projection);
      synced += 1;
    } catch (error) {
      await markAuthorizationProjectionPending(projection, error);
      pending += 1;
    }
  }

  return { attempted: jobs.size, synced, pending, invalid };
}
