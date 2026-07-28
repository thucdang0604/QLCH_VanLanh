import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { getE2EEnvironment, getRunId } from './config';
import { cleanupE2EData } from './cleanup';
import { seedE2EData } from './seed';

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const useShell = process.platform === 'win32';
    const child = spawn(command, args, { stdio: 'inherit', shell: useShell, env });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

async function main() {
  let seeded = false;
  try {
    await seedE2EData();
    seeded = true;
    const runId = getRunId();
    process.env.E2E_RUN_ID = runId;
    process.env.NEXT_PUBLIC_E2E_RUN_ID = runId;
    const env = getE2EEnvironment(runId);
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    if (fs.existsSync('.e2e-passed')) fs.unlinkSync('.e2e-passed');
    const exitCode = await run(pnpm, ['exec', 'playwright', 'test'], env);
    if (exitCode === 0) {
      fs.writeFileSync('.e2e-passed', 'OK');
    } else {
      process.exitCode = exitCode;
    }
  } finally {
    if (seeded) await cleanupE2EData();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
