import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { signPayload, COOKIE_NAME } from '@/lib/sessionCookie';

/**
 * POST /api/auth/session
 * Receives a Firebase ID token, verifies it, reads the user's role + permissions,
 * then sets a signed HttpOnly session cookie for middleware RBAC.
 */
export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    // Verify Firebase ID token
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const uid = decoded.uid;

    // Read role + permissions from Firestore
    const snap = await getAdminDb().collection('users').doc(uid).get();
    const data = snap.exists ? (snap.data() as Partial<{ role: string; permissions: string[] }>) : {};

    const roleRaw = typeof data.role === 'string' ? data.role : 'customer';
    const role = roleRaw === 'admin' || roleRaw === 'staff' || roleRaw === 'customer' ? roleRaw : 'customer' as const;
    const permissions = Array.isArray(data.permissions) ? data.permissions.filter((p) => typeof p === 'string') : [];

    // Sign and set cookie
    const cookieValue = await signPayload({ role, permissions });

    const res = NextResponse.json({ success: true });
    res.cookies.set(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 5, // 5 days
    });

    return res;
  } catch (error: unknown) {
    console.error('Session create error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Session creation failed' },
      { status: 401 },
    );
  }
}

/**
 * DELETE /api/auth/session
 * Clears the session cookie.
 */
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
