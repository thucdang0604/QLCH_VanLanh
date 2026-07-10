import type { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import type { PermissionId } from '@/lib/adminModules';

export type VerifiedUser = {
  uid: string;
  role: 'admin' | 'staff' | 'customer';
  permissions: string[];
  displayName?: string;
  name?: string;
};

export type VerifyUserTiming = {
  verifyIdTokenMs: number;
  readUserProfileMs: number;
};

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

export async function verifyUser(req: NextRequest, onTiming?: (timing: VerifyUserTiming) => void): Promise<VerifiedUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error('Missing Authorization bearer token');
  }

  const verifyIdTokenStartedAt = Date.now();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const verifyIdTokenMs = Date.now() - verifyIdTokenStartedAt;
  const uid = decoded.uid;

  const readUserProfileStartedAt = Date.now();
  const snap = await getAdminDb().collection('users').doc(uid).get();
  const readUserProfileMs = Date.now() - readUserProfileStartedAt;
  const data = snap.exists ? (snap.data() as Partial<{ role: string; permissions: string[] }>) : {};

  const roleRaw = typeof data.role === 'string' ? data.role : 'customer';
  const role: VerifiedUser['role'] =
    roleRaw === 'admin' || roleRaw === 'staff' || roleRaw === 'customer' ? roleRaw : 'customer';

  const permissions = Array.isArray(data.permissions) ? data.permissions.filter((p) => typeof p === 'string') : [];

  onTiming?.({ verifyIdTokenMs, readUserProfileMs });
  return {
    uid,
    role,
    permissions,
    displayName: typeof (data as { displayName?: unknown }).displayName === 'string'
      ? (data as { displayName: string }).displayName
      : undefined,
    name: typeof (data as { name?: unknown }).name === 'string'
      ? (data as { name: string }).name
      : undefined,
  };
}

export async function requireAdminOrStaff(req: NextRequest, onTiming?: (timing: VerifyUserTiming) => void): Promise<VerifiedUser> {
  const user = await verifyUser(req, onTiming);
  if (user.role !== 'admin' && user.role !== 'staff') {
    throw new Error('Forbidden: admin or staff only');
  }
  return user;
}

export async function requireAdmin(req: NextRequest): Promise<VerifiedUser> {
  const user = await verifyUser(req);
  if (user.role !== 'admin') {
    throw new Error('Forbidden: admin only');
  }
  return user;
}

export async function requirePermission(req: NextRequest, permission: PermissionId, onTiming?: (timing: VerifyUserTiming) => void): Promise<VerifiedUser> {
  const user = await requireAdminOrStaff(req, onTiming);
  if (user.role !== 'admin' && !user.permissions.includes(permission)) {
    throw new Error(`Forbidden: missing ${permission} permission`);
  }
  return user;
}

