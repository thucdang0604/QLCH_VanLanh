import { test, expect } from '@playwright/test';
import { getRunId, getE2EAuthHeader } from '../../scripts/e2e/config';

test.describe('Phase 3 — Observability & SLO Baseline Benchmark', () => {
  test('verifies x-request-id, 100% unauthorized block, and captures latency baselines', async ({ request }) => {
    const runId = getRunId();
    const adminEmail = `e2e-${runId}-admin@example.test`;
    const authHeaders = await getE2EAuthHeader(adminEmail);

    const latencies: Record<string, number> = {};

    // 1. Security Enclosure: 100% unauthorized request must return 401 with 0 admin data
    const startUnauth = Date.now();
    const resUnauthorized = await request.post('/api/revalidate', {
      headers: {
        'x-e2e-run-id': runId,
      },
      data: {},
    });
    latencies['/api/revalidate (unauthorized 401)'] = Date.now() - startUnauth;
    expect(resUnauthorized.status()).toBe(401);
    const unauthBody = await resUnauthorized.json().catch(() => ({}));
    expect(unauthBody).not.toHaveProperty('adminSecret');
    expect(unauthBody).not.toHaveProperty('users');

    // Verify x-request-id header is returned even on 401 responses
    const unauthReqId = resUnauthorized.headers()['x-request-id'];
    expect(unauthReqId).toBeTruthy();
    expect(unauthReqId.startsWith('req_')).toBe(true);

    // 2. Auth session check with bearer token
    const startAuthSession = Date.now();
    const resAuthSession = await request.get('/api/auth/session', {
      headers: {
        ...authHeaders,
        'x-e2e-run-id': runId,
      },
    });
    latencies['/api/auth/session (get)'] = Date.now() - startAuthSession;
    // Unauthorized without cookie, returns 401 with { valid: false } and x-request-id header
    expect(resAuthSession.status()).toBe(401);
    const authSessionReqId = resAuthSession.headers()['x-request-id'];
    expect(authSessionReqId).toBeTruthy();

    // 3. Custom Request ID propagation check
    const customReqId = `req_custom_e2e_${runId}_${Date.now()}`;
    const startCustomReq = Date.now();
    const resCustomReq = await request.post('/api/revalidate', {
      headers: {
        'x-request-id': customReqId,
        'x-e2e-run-id': runId,
      },
      data: {},
    });
    latencies['/api/revalidate (custom req id)'] = Date.now() - startCustomReq;
    expect(resCustomReq.headers()['x-request-id']).toBe(customReqId);

    // Output Observability Baseline Summary Table
    // eslint-disable-next-line no-console
    console.log('\n======================================================');
    // eslint-disable-next-line no-console
    console.log('       OBSERVABILITY & SLO BASELINE LATENCY REPORT     ');
    // eslint-disable-next-line no-console
    console.log('======================================================');
    for (const [endpoint, ms] of Object.entries(latencies)) {
      // eslint-disable-next-line no-console
      console.log(`  ${endpoint.padEnd(35)} : ${ms} ms`);
    }
    // eslint-disable-next-line no-console
    console.log('======================================================\n');
  });
});
