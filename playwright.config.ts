import { defineConfig } from '@playwright/test';
import { getRunId, getE2EEnvironment } from './scripts/e2e/config';

const runId = process.env.E2E_RUN_ID || getRunId();
const e2eEnv = getE2EEnvironment(runId);

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  outputDir: e2eEnv.PLAYWRIGHT_OUTPUT_DIR || `output/playwright/${runId}`,
  reporter: [['list'], ['html', { outputFolder: 'output/e2e-report', open: 'never' }]],
  use: {
    baseURL: e2eEnv.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3101',
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec next dev -p 3101',
    url: 'http://127.0.0.1:3101/admin/login',
    timeout: 120_000,
    reuseExistingServer: false,
    env: Object.fromEntries(
      Object.entries({ ...process.env, ...e2eEnv }).filter((pair): pair is [string, string] => typeof pair[1] === 'string')
    ),
  },
});
