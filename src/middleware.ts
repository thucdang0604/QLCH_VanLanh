import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/sessionCookie';
import { getMatchedAdminRoute, sanitizeAdminRedirectTarget } from '@/lib/adminModules';
import { getOrCreateRequestId } from '@/lib/observability';

type ValidatedAdminSession = {
  role: 'admin' | 'staff';
  permissions: string[];
};

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

/**
 * Firebase Hosting does not expose application secrets to the Next Edge
 * bundle. HMAC verification and current-authorization reads remain in the
 * Node route; the Edge layer consumes only its validated projection.
 */
async function getValidatedAdminSession(
  request: NextRequest,
  cookie: string,
  requestId: string,
): Promise<ValidatedAdminSession | null> {
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
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') return null;

    const { valid, role, permissions } = payload as {
      valid?: unknown;
      role?: unknown;
      permissions?: unknown;
    };
    if (
      valid !== true ||
      (role !== 'admin' && role !== 'staff') ||
      !Array.isArray(permissions) ||
      !permissions.every((permission) => typeof permission === 'string')
    ) {
      return null;
    }

    return { role, permissions };
  } catch {
    return null;
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

  // The cookie is validated in the Node runtime below before use.
  const cookie = request.cookies.get(COOKIE_NAME)?.value;

  // No cookie → Fail-Closed redirect to /admin/login
  if (!cookie) {
    return withRequestId(NextResponse.redirect(buildLoginRedirect(request)), requestId);
  }

  const session = await getValidatedAdminSession(request, cookie, requestId);
  if (!session) {
    // Invalid, expired, tampered or revoked session: Fail-Closed and clear it.
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
