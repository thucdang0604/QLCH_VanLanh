import type { SessionPayload } from './sessionCookie';

export type AuthorizationRole = 'admin' | 'staff' | 'customer';

export type AuthorizationUserData = Partial<{
  role: string;
  permissions: unknown;
  authorizationVersion: unknown;
  lastLogoutAt: unknown;
  lastLogoutAuthTime: unknown;
}>;

export interface CurrentAuthorization {
  role: AuthorizationRole;
  permissions: string[];
  authorizationVersion: number;
  lastLogoutAt: number | null;
  lastLogoutAuthTime: number | null;
}

function normalizeFiniteInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

export function normalizeAuthorizationRole(value: unknown): AuthorizationRole {
  return value === 'admin' || value === 'staff' || value === 'customer'
    ? value
    : 'customer';
}

export function normalizeAuthorizationPermissions(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((permission): permission is string => typeof permission === 'string')
    : [];
}

export function getCurrentAuthorization(data: AuthorizationUserData): CurrentAuthorization {
  return {
    role: normalizeAuthorizationRole(data.role),
    permissions: normalizeAuthorizationPermissions(data.permissions),
    authorizationVersion: normalizeFiniteInteger(data.authorizationVersion),
    lastLogoutAt: typeof data.lastLogoutAt === 'number' && Number.isFinite(data.lastLogoutAt)
      ? data.lastLogoutAt
      : null,
    lastLogoutAuthTime: typeof data.lastLogoutAuthTime === 'number' && Number.isSafeInteger(data.lastLogoutAuthTime)
      ? data.lastLogoutAuthTime
      : null,
  };
}

export function nextAuthorizationVersion(currentVersion: number): number {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 0) {
    return 1;
  }
  if (currentVersion >= Number.MAX_SAFE_INTEGER - 1) {
    throw new Error('Authorization version limit reached');
  }
  return currentVersion + 1;
}

export function shouldApplyRtdbProjection(existingVersion: unknown, desiredVersion: number): boolean {
  const currentVersion = normalizeFiniteInteger(existingVersion, -1);
  return currentVersion <= desiredVersion;
}

function hasSamePermissions(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return right.every((permission) => expected.has(permission));
}

/**
 * Browser cookies are only current while every authorization claim still
 * matches the authoritative Firestore projection.
 */
export function isSessionCurrent(
  session: Pick<SessionPayload, 'role' | 'permissions' | 'authorizationVersion' | 'iat'>,
  current: CurrentAuthorization,
): boolean {
  if (session.authorizationVersion !== current.authorizationVersion) return false;
  if (session.role !== current.role) return false;
  if (!hasSamePermissions(session.permissions, current.permissions)) return false;
  return current.lastLogoutAt === null || session.iat > current.lastLogoutAt;
}

/**
 * Firebase auth_time is issued in seconds. A token created in or before the
 * logout second must not bootstrap a new privileged browser session.
 */
export function isFirebaseTokenCurrent(
  authTimeSeconds: unknown,
  current: CurrentAuthorization,
): boolean {
  if (typeof authTimeSeconds !== 'number' || !Number.isSafeInteger(authTimeSeconds)) {
    return false;
  }
  return current.lastLogoutAuthTime === null || authTimeSeconds > current.lastLogoutAuthTime;
}
