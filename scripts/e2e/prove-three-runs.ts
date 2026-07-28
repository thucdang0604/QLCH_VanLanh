import { spawn } from 'node:child_process';
import { getE2EEnvironment } from './config';

function runOnce(index: number): Promise<void> {
  const runId = `proof-${index}-${process.pid}`;
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const useShell = process.platform === 'win32';
  return new Promise((resolve, reject) => {
    const child = spawn(pnpm, ['test:e2e'], {
      cwd: process.cwd(),
      env: getE2EEnvironment(runId),
      stdio: 'inherit',
      shell: useShell,
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`E2E proof run ${index} failed with exit code ${code}.`)));
  });
}

async function main() {
  for (const index of [1, 2, 3]) await runOnce(index);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
