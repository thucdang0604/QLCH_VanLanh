import { test, expect } from '@playwright/test';
import { getE2EBaseUrl, getRunId } from '../../scripts/e2e/config';
import { bootstrapSession } from '../../scripts/e2e/session';
import { COOKIE_NAME } from '../../src/lib/sessionCookie';

test.describe('RBAC Browser Smoke', () => {
  test('unauthenticated access to /admin redirects to /admin/login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('customer user attempt to access /admin is denied by RBAC middleware', async ({ request, context, page }) => {
    const runId = getRunId();
    const { cookieValue } = await bootstrapSession(request, `e2e-${runId}-customer@example.test`, runId);

    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: cookieValue,
        url: getE2EBaseUrl(),
      },
    ]);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('staff user with manage_repairs only is routed to accessible repair route', async ({ request, context, page }) => {
    const runId = getRunId();
    const { cookieValue } = await bootstrapSession(request, `e2e-${runId}-staff@example.test`, runId);

    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: cookieValue,
        url: getE2EBaseUrl(),
      },
    ]);

    await page.goto('/admin/repairs');
    await expect(page).toHaveURL(/\/admin\/repairs/);
  });

  test('admin user login has full access to admin dashboard', async ({ request, context, page }) => {
    const runId = getRunId();
    const { cookieValue } = await bootstrapSession(request, `e2e-${runId}-admin@example.test`, runId);

    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: cookieValue,
        url: getE2EBaseUrl(),
      },
    ]);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
  });
});
