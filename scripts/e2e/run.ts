import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getE2EEnvironment, sanitizeRunId } from './config';

type E2EPorts = {
  auth: number;
  firestore: number;
  database: number;
  storage: number;
  next: number;
};

function createRunId() {
  return `local-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${process.pid}`;
}

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate an E2E port.')));
        return;
      }
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function allocatePorts(): Promise<E2EPorts> {
  const [auth, firestore, database, storage, next] = await Promise.all([
    findAvailablePort(), findAvailablePort(), findAvailablePort(), findAvailablePort(), findAvailablePort(),
  ]);
  return { auth, firestore, database, storage, next };
}

function resultPath(runId: string): string {
  return path.join(process.cwd(), 'output', 'e2e', runId, 'result.json');
}

async function writeEmulatorConfig(runId: string, ports: E2EPorts): Promise<string> {
  const configPath = path.join(process.cwd(), `.e2e-firebase-${runId}.json`);
  const config = {
    firestore: {
      rules: 'firestore.rules',
      indexes: 'firestore.indexes.json',
    },
    database: { rules: 'database.rules.json' },
    storage: { rules: 'storage.rules' },
    emulators: {
      auth: { host: '127.0.0.1', port: ports.auth },
      firestore: { host: '127.0.0.1', port: ports.firestore },
      database: { host: '127.0.0.1', port: ports.database },
      storage: { host: '127.0.0.1', port: ports.storage },
      ui: { enabled: false },
      singleProjectMode: true,
    },
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return configPath;
}

async function main() {
  const rawRunId = (process.env.E2E_RUN_ID || createRunId()).trim();
  const runId = sanitizeRunId(rawRunId);
  const ports = await allocatePorts();
  Object.assign(process.env, {
    E2E_AUTH_PORT: String(ports.auth),
    E2E_FIRESTORE_PORT: String(ports.firestore),
    E2E_DATABASE_PORT: String(ports.database),
    E2E_STORAGE_PORT: String(ports.storage),
    E2E_NEXT_PORT: String(ports.next),
  });
  const env = getE2EEnvironment(runId);
  const markerPath = resultPath(runId);
  await rm(markerPath, { force: true });
  const emulatorConfigPath = await writeEmulatorConfig(runId, ports);
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const scriptCmd = '"pnpm exec tsx scripts/e2e/inside-emulator.ts"';
  try {
    const child = spawn(pnpm, [
      'exec', 'firebase', '--config', emulatorConfigPath, 'emulators:exec',
      '--project', 'demo-qlch-e2e',
      '--only', 'auth,firestore,database,storage',
      scriptCmd,
    ], { cwd: process.cwd(), env, stdio: 'inherit', shell: process.platform === 'win32' });
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => resolve(code ?? 1));
    });
    if (exitCode !== 0) throw new Error(`Firebase E2E process exited with code ${exitCode}.`);

    const result = JSON.parse(await readFile(markerPath, 'utf8')) as { runId?: string; status?: string };
    if (result.runId !== runId || result.status !== 'passed') {
      throw new Error('E2E did not produce a successful run-scoped result artifact.');
    }
  } finally {
    await rm(emulatorConfigPath, { force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
