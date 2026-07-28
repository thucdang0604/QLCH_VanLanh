import type { APIRequestContext } from '@playwright/test';
import { getE2EAuthHeader } from './config';
import { COOKIE_NAME } from '../../src/lib/sessionCookie';

export type BootstrappedSession = {
  idToken: string;
  cookieValue: string;
};

function sessionCookieFromResponse(headers: Array<{ name: string; value: string }>): string {
  const cookie = headers.find(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith(`${COOKIE_NAME}=`));
  const match = cookie?.value.match(new RegExp(`^${COOKIE_NAME}=([^;]+)`));
  if (!match?.[1]) throw new Error('Session bootstrap did not set an HTTP-only session cookie.');
  return match[1];
}

export async function bootstrapSession(
  request: APIRequestContext,
  email: string,
  runId: string,
): Promise<BootstrappedSession> {
  const authHeaders = await getE2EAuthHeader(email);
  const idToken = authHeaders.Authorization.replace(/^Bearer\s+/i, '');
  const response = await request.post('/api/auth/session', {
    headers: { 'x-e2e-run-id': runId },
    data: { idToken },
  });
  if (response.status() !== 200) {
    throw new Error(`Session bootstrap failed for ${email}: ${response.status()} ${await response.text()}`);
  }
  return { idToken, cookieValue: sessionCookieFromResponse(response.headersArray()) };
}

export function sessionCookieHeader(cookieValue: string): string {
  return `${COOKIE_NAME}=${cookieValue}`;
}
