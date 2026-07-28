import { test, expect } from '@playwright/test';
import { getRunId, getScopedId, E2E_BASE_URL } from '../../scripts/e2e/config';
import { signPayload, COOKIE_NAME } from '../../src/lib/sessionCookie';

test.describe('RBAC Browser Smoke', () => {
  test('unauthenticated access to /admin redirects to /admin/login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('customer user attempt to access /admin is denied by RBAC middleware', async ({ context, page }) => {
    const runId = getRunId();
    const customerUid = getScopedId('customer', runId);

    const cookieValue = await signPayload({
      uid: customerUid,
      role: 'customer',
      permissions: [],
      authorizationVersion: 1,
      iat: Date.now(),
      exp: Date.now() + 20 * 60 * 1000,
    });

    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: cookieValue,
        url: E2E_BASE_URL,
      },
    ]);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('staff user with manage_repairs only is routed to accessible repair route', async ({ context, page }) => {
    const runId = getRunId();
    const staffUid = getScopedId('staff', runId);

    const cookieValue = await signPayload({
      uid: staffUid,
      role: 'staff',
      permissions: ['manage_repairs'],
      authorizationVersion: 1,
      iat: Date.now(),
      exp: Date.now() + 20 * 60 * 1000,
    });

    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: cookieValue,
        url: E2E_BASE_URL,
      },
    ]);

    await page.goto('/admin/repairs');
    await expect(page).toHaveURL(/\/admin\/repairs/);
  });

  test('admin user login has full access to admin dashboard', async ({ context, page }) => {
    const runId = getRunId();
    const adminUid = getScopedId('admin', runId);

    const cookieValue = await signPayload({
      uid: adminUid,
      role: 'admin',
      permissions: ['all'],
      authorizationVersion: 1,
      iat: Date.now(),
      exp: Date.now() + 20 * 60 * 1000,
    });

    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: cookieValue,
        url: E2E_BASE_URL,
      },
    ]);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
  });
});
