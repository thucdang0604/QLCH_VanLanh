import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getE2EBaseUrl, getRunId } from '../../scripts/e2e/config';
import { bootstrapSession } from '../../scripts/e2e/session';

const SAMPLE_COUNT = 20;
const WARMUP_COUNT = 3;

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

async function sample(run: () => Promise<void>): Promise<number[]> {
  for (let index = 0; index < WARMUP_COUNT; index += 1) await run();
  const samples: number[] = [];
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const startedAt = performance.now();
    await run();
    samples.push(performance.now() - startedAt);
  }
  return samples;
}

test.describe('Phase 3 — Observability & SLO Baseline', () => {
  test('records reproducible p95 latency and a bounded authorization read count', async ({ request, playwright }) => {
    const runId = getRunId();
    const adminEmail = `e2e-${runId}-admin@example.test`;
    await bootstrapSession(request, adminEmail, runId);

    const customRequestId = `slo_${runId}_trace`;
    const unauthenticated = await playwright.request.newContext({ baseURL: getE2EBaseUrl() });
    try {
      const unauthorized = await unauthenticated.post('/api/revalidate', {
        headers: { 'x-request-id': customRequestId, 'x-e2e-run-id': runId },
        data: { path: '/e2e-observability' },
      });
      expect(unauthorized.status()).toBe(401);
      expect(unauthorized.headers()['x-request-id']).toBe(customRequestId);
    } finally {
      await unauthenticated.dispose();
    }

    const validationSamples = await sample(async () => {
      const response = await request.get('/api/auth/session', { headers: { 'x-e2e-run-id': runId } });
      expect(response.status()).toBe(200);
      expect(response.headers()['x-e2e-firestore-read-count']).toBe('1');
      expect(response.headers()['x-request-id']).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    });

    const report = {
      endpoint: '/api/auth/session',
      samples: SAMPLE_COUNT,
      warmupSamples: WARMUP_COUNT,
      authorizationFirestoreReadsPerRequest: 1,
      minMs: Math.min(...validationSamples),
      p50Ms: percentile(validationSamples, 0.5),
      p95Ms: percentile(validationSamples, 0.95),
      maxMs: Math.max(...validationSamples),
    };
    const p95LimitMs = Number(process.env.E2E_AUTH_SESSION_P95_MS || 2_500);
    expect(report.p95Ms).toBeLessThanOrEqual(p95LimitMs);

    const reportDirectory = path.join(process.cwd(), 'output', 'e2e', runId);
    await mkdir(reportDirectory, { recursive: true });
    await writeFile(path.join(reportDirectory, 'observability-slo.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  });
});
