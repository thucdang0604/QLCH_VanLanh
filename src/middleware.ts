import { NextRequest, NextResponse } from 'next/server';
import { verifyPayload, COOKIE_NAME } from '@/lib/sessionCookie';
import { getMatchedAdminRoute, sanitizeAdminRedirectTarget } from '@/lib/adminModules';
import { getOrCreateRequestId } from '@/lib/observability';

function buildLoginRedirect(request: NextRequest): URL {
  const { pathname, search } = request.nextUrl;
  const fullTarget = pathname + search;
  const sanitizedTarget = sanitizeAdminRedirectTarget(fullTarget);

  const loginUrl = new URL('/admin/login', request.url);
  if (sanitizedTarget) {
    loginUrl.searchParams.set('from', sanitizedTarget);
  }
  return loginUrl;
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('x-request-id', requestId);
  return response;
}

async function isCurrentServerSession(request: NextRequest, cookie: string, requestId: string): Promise<boolean> {
  try {
    const response = await fetch(new URL('/api/auth/session', request.url), {
      method: 'GET',
      headers: {
        cookie: COOKIE_NAME + '=' + cookie,
        'x-session-validation': 'edge-middleware',
        'x-request-id': requestId,
      },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Next.js Edge Middleware — Server-side RBAC for /admin/* routes.
 * Reads the signed session cookie and blocks unauthorized access
 * BEFORE the page renders (Fail-Closed).
 */
export async function middleware(request: NextRequest) {
  const requestId = getOrCreateRequestId(request.headers);
  const { pathname } = request.nextUrl;

  // Allow login page — no session needed
  if (pathname === '/admin/login') {
    return withRequestId(NextResponse.next(), requestId);
  }

  // Read and verify signed session cookie
  const cookie = request.cookies.get(COOKIE_NAME)?.value;

  // No cookie → Fail-Closed redirect to /admin/login
  if (!cookie) {
    return withRequestId(NextResponse.redirect(buildLoginRedirect(request)), requestId);
  }

  let session: Awaited<ReturnType<typeof verifyPayload>>;
  try {
    session = await verifyPayload(cookie);
  } catch {
    // SESSION_SECRET error or crypto failure → Fail-Closed
    const res = NextResponse.redirect(buildLoginRedirect(request));
    res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return withRequestId(res, requestId);
  }

  if (!session) {
    // Tampered or expired cookie → Fail-Closed & clear cookie
    const res = NextResponse.redirect(buildLoginRedirect(request));
    res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return withRequestId(res, requestId);
  }

  // Cookie integrity only proves who issued it. Confirm its role, permissions,
  // logout marker, and authorization version against the Node runtime before
  // allowing an admin page to render.
  if (!await isCurrentServerSession(request, cookie, requestId)) {
    const res = NextResponse.redirect(buildLoginRedirect(request));
    res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return withRequestId(res, requestId);
  }

  const { role, permissions } = session;

  // Reject non-admin/staff roles
  if (role !== 'admin' && role !== 'staff') {
    const res = NextResponse.redirect(buildLoginRedirect(request));
    res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return withRequestId(res, requestId);
  }

  // Admin bypasses all permission checks
  if (role === 'admin') {
    return withRequestId(NextResponse.next(), requestId);
  }

  // Staff: check route-level permission using the same registry as client-side.
  // Unknown admin routes deny by default for staff.
  const matchedRoute = getMatchedAdminRoute(pathname);
  if (!matchedRoute || !permissions.includes(matchedRoute.permission)) {
    return withRequestId(NextResponse.redirect(buildLoginRedirect(request)), requestId);
  }

  return withRequestId(NextResponse.next(), requestId);
}

export const config = {
  matcher: ['/admin/:path*'],
};
