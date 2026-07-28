import { defineConfig } from '@playwright/test';
import { getE2EBaseUrl, getRunId, getE2EEnvironment } from './scripts/e2e/config';

const runId = process.env.E2E_RUN_ID || getRunId();
const e2eEnv = getE2EEnvironment(runId);

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  outputDir: e2eEnv.PLAYWRIGHT_OUTPUT_DIR || `output/playwright/${runId}`,
  reporter: [['list'], ['html', { outputFolder: `output/e2e/${runId}/report`, open: 'never' }]],
  use: {
    baseURL: e2eEnv.PLAYWRIGHT_BASE_URL || getE2EBaseUrl(),
    headless: process.env.CI === '1',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec next dev -p ${new URL(e2eEnv.PLAYWRIGHT_BASE_URL || getE2EBaseUrl()).port}`,
    url: `${e2eEnv.PLAYWRIGHT_BASE_URL || getE2EBaseUrl()}/admin/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: Object.fromEntries(
      Object.entries({ ...process.env, ...e2eEnv }).filter((pair): pair is [string, string] => typeof pair[1] === 'string')
    ),
  },
});
