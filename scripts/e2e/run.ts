import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { getE2EEnvironment, sanitizeRunId } from './config';

function createRunId() {
  return `local-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}`;
}

async function main() {
  const rawRunId = (process.env.E2E_RUN_ID || createRunId()).trim();
  const runId = sanitizeRunId(rawRunId);
  const env = {
    ...process.env,
    ...getE2EEnvironment(runId),
  };
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const scriptCmd = '"pnpm exec tsx scripts/e2e/inside-emulator.ts"';
  const child = spawn(pnpm, [
    'exec', 'firebase', 'emulators:exec',
    '--project', 'demo-qlch-e2e',
    '--only', 'auth,firestore,database,storage',
    scriptCmd,
  ], { cwd: process.cwd(), env, stdio: 'inherit', shell: process.platform === 'win32' });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => {
      if (fs.existsSync('.e2e-passed')) {
        process.exitCode = 0;
      } else {
        process.exitCode = code ?? 1;
      }
      resolve();
    });
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
