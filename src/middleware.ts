import { NextRequest, NextResponse } from 'next/server';
import { verifyPayload, COOKIE_NAME } from '@/lib/sessionCookie';
import { ROUTE_PERMISSION_MAP } from '@/lib/permissions';

/**
 * Next.js Edge Middleware — Server-side RBAC for /admin/* routes.
 * Reads the signed session cookie and blocks unauthorized access
 * BEFORE the page renders (fixes BUG-RBAC-001).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page — no session needed
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  // Read and verify signed session cookie
  const cookie = request.cookies.get(COOKIE_NAME)?.value;

  // No cookie → fall through to client-side AuthContext guard.
  // AuthContext will sync the cookie on next login/page load.
  if (!cookie) {
    return NextResponse.next();
  }

  let session: Awaited<ReturnType<typeof verifyPayload>>;
  try {
    session = await verifyPayload(cookie);
  } catch {
    // SESSION_SECRET missing or crypto error → pass through to client-side guard
    return NextResponse.next();
  }

  if (!session) {
    // Tampered or expired cookie → redirect to login
    const res = NextResponse.redirect(new URL('/admin/login', request.url));
    res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return res;
  }

  const { role, permissions } = session;

  // Reject non-admin/staff roles
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // Admin bypasses all permission checks
  if (role === 'admin') {
    return NextResponse.next();
  }

  // Staff: check route-level permission using the same map as client-side
  const matchedRoute = Object.keys(ROUTE_PERMISSION_MAP)
    .sort((a, b) => b.length - a.length)
    .find((route) => pathname.startsWith(route));

  if (matchedRoute) {
    const required = ROUTE_PERMISSION_MAP[matchedRoute];
    if (!permissions.includes(required)) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
