import type { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';

export type VerifiedUser = {
  uid: string;
  role: 'admin' | 'staff' | 'customer';
  permissions: string[];
};

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

export async function verifyUser(req: NextRequest): Promise<VerifiedUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new Error('Missing Authorization bearer token');
  }

  const decoded = await getAdminAuth().verifyIdToken(token);
  const uid = decoded.uid;

  const snap = await getAdminDb().collection('users').doc(uid).get();
  const data = snap.exists ? (snap.data() as Partial<{ role: string; permissions: string[] }>) : {};

  const roleRaw = typeof data.role === 'string' ? data.role : 'customer';
  const role: VerifiedUser['role'] =
    roleRaw === 'admin' || roleRaw === 'staff' || roleRaw === 'customer' ? roleRaw : 'customer';

  const permissions = Array.isArray(data.permissions) ? data.permissions.filter((p) => typeof p === 'string') : [];

  return { uid, role, permissions };
}

export async function requireAdminOrStaff(req: NextRequest): Promise<VerifiedUser> {
  const user = await verifyUser(req);
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

