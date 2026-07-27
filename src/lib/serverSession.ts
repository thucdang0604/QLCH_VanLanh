import { getCurrentAuthorization, isSessionCurrent, type CurrentAuthorization } from '@/lib/authorizationLifecycle';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { verifyPayload, type SessionPayload } from '@/lib/sessionCookie';

export interface CurrentServerSession {
  session: SessionPayload;
  authorization: CurrentAuthorization;
}

export async function getCurrentAuthorizationForUid(uid: string): Promise<CurrentAuthorization> {
  const snap = await getAdminDb().collection('users').doc(uid).get();
  return getCurrentAuthorization(snap.exists ? (snap.data() ?? {}) : {});
}

/**
 * Validates the HMAC cookie against the current server-side authorization
 * projection. A cookie is never sufficient by itself for a privileged action.
 */
export async function getCurrentServerSession(cookie: string | undefined): Promise<CurrentServerSession | null> {
  if (!cookie) return null;

  const session = await verifyPayload(cookie);
  if (!session) return null;

  const authorization = await getCurrentAuthorizationForUid(session.uid);
  if (!isSessionCurrent(session, authorization)) return null;

  return { session, authorization };
}
