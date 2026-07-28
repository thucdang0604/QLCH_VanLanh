import { NextRequest } from 'next/server';
import { reconcilePendingAuthorizationProjections } from '@/lib/authorizationProjection';
import { withApi } from '@/lib/api/handler';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.AUTHORIZATION_RECONCILE_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === 'Bearer ' + secret;
}

export const POST = withApi({ name: 'internal/authorization-projections/reconcile' }, async (request, context) => {
  if (!isAuthorized(request)) {
    return context.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 25);
  const result = await reconcilePendingAuthorizationProjections(requestedLimit);
  return context.json(result, { status: result.pending === 0 ? 200 : 202 });
});
