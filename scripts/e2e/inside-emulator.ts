import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
  const runId = getRunId();
  const resultDirectory = path.join(process.cwd(), 'output', 'e2e', runId);
  const writeStatus = async (stage: string) => {
    await mkdir(resultDirectory, { recursive: true });
    await writeFile(path.join(resultDirectory, 'status.json'), `${JSON.stringify({ runId, stage, updatedAt: new Date().toISOString() })}\n`, 'utf8');
  };
  try {
    await writeStatus('seeding');
    await seedE2EData();
    seeded = true;
    process.stdout.write(`[e2e] seeded ${runId}\n`);
    process.env.E2E_RUN_ID = runId;
    process.env.NEXT_PUBLIC_E2E_RUN_ID = runId;
    const env = getE2EEnvironment(runId);
    const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    await writeStatus('testing');
    const exitCode = await run(pnpm, ['exec', 'playwright', 'test'], env);
    if (exitCode !== 0) throw new Error(`Playwright exited with code ${exitCode}.`);
    process.stdout.write(`[e2e] Playwright passed ${runId}\n`);
  } finally {
    if (seeded) {
      await writeStatus('cleaning');
      await cleanupE2EData(step => writeStatus(`cleaning:${step}`));
      process.stdout.write(`[e2e] cleaned ${runId}\n`);
    }
  }

  await writeStatus('passed');
  await mkdir(resultDirectory, { recursive: true });
  await writeFile(path.join(resultDirectory, 'result.json'), `${JSON.stringify({
    runId,
    status: 'passed',
    completedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
}

void main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
