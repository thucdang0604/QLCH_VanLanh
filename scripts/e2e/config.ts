import path from 'node:path';

export const E2E_PROJECT_ID = 'demo-qlch-e2e';
export const E2E_DATABASE_NAMESPACE = `${E2E_PROJECT_ID}-default-rtdb`;
export const E2E_PASSWORD = 'E2E-Only-Password-2026!';

type E2EPortName = 'AUTH' | 'FIRESTORE' | 'DATABASE' | 'STORAGE' | 'NEXT';

function getE2EPort(name: E2EPortName, fallback: number): number {
  const value = Number(process.env[`E2E_${name}_PORT`] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid E2E_${name}_PORT.`);
  }
  return value;
}

export function getE2EBaseUrl(): string {
  return `http://127.0.0.1:${getE2EPort('NEXT', 3101)}`;
}

export function sanitizeRunId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
  if (!/^[a-z0-9][a-z0-9_-]{2,72}$/.test(normalized)) {
    throw new Error('E2E_RUN_ID must be 3-73 characters of lowercase letters, numbers, _ or -.');
  }
  return normalized;
}

export function getRunId(): string {
  const value = process.env.E2E_RUN_ID || process.env.NEXT_PUBLIC_E2E_RUN_ID;
  if (value && value.trim()) return sanitizeRunId(value);
  return sanitizeRunId(`e2e-run-${process.pid}`);
}

export function getScopedId(name: string, runId = getRunId()): string {
  return `e2e_${runId}_${name}`;
}

export function getE2EEnvironment(runId: string): NodeJS.ProcessEnv {
  const safeRunId = sanitizeRunId(runId);
  const authPort = getE2EPort('AUTH', 9099);
  const firestorePort = getE2EPort('FIRESTORE', 8080);
  const databasePort = getE2EPort('DATABASE', 9000);
  const storagePort = getE2EPort('STORAGE', 9199);
  const nextPort = getE2EPort('NEXT', 3101);
  return {
    ...process.env,
    CI: '1',
    E2E_RUN_ID: safeRunId,
    NEXT_PUBLIC_E2E_RUN_ID: safeRunId,
    E2E_TEST_MODE: '1',
    SESSION_SECRET: process.env.SESSION_SECRET || 'e2e-session-secret-key-1234567890-super-secret',
    FIREBASE_PROJECT_ID: E2E_PROJECT_ID,
    NEXT_PUBLIC_E2E_TEST_MODE: '1',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: E2E_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_API_KEY: 'e2e-firebase-api-key',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: '127.0.0.1',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${E2E_PROJECT_ID}.appspot.com`,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
    NEXT_PUBLIC_FIREBASE_APP_ID: '1:1234567890:web:e2e',
    NEXT_PUBLIC_FIREBASE_EMULATOR_HOST: '127.0.0.1',
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT: String(authPort),
    NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: String(firestorePort),
    NEXT_PUBLIC_FIREBASE_DATABASE_EMULATOR_PORT: String(databasePort),
    NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT: String(storagePort),
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    FIREBASE_DATABASE_EMULATOR_HOST: `127.0.0.1:${databasePort}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${storagePort}`,
    FIREBASE_DATABASE_URL: `http://127.0.0.1:${databasePort}?ns=${E2E_DATABASE_NAMESPACE}`,
    PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${nextPort}`,
    PLAYWRIGHT_OUTPUT_DIR: path.join('output', 'playwright', safeRunId),
  };
}

export function assertE2EEnvironment(): void {
  const runId = getRunId();
  if (process.env.E2E_TEST_MODE !== '1' || process.env.NEXT_PUBLIC_E2E_TEST_MODE !== '1') {
    throw new Error('E2E_TEST_MODE must be enabled for every Emulator command.');
  }
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== E2E_PROJECT_ID) {
    throw new Error(`Refusing E2E command outside ${E2E_PROJECT_ID}.`);
  }
  for (const name of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
    const value = process.env[name] || '';
    if (!value.startsWith('127.0.0.1:') && !value.startsWith('localhost:')) {
      throw new Error(`${name} must point to localhost before E2E seed/cleanup.`);
    }
  }
  sanitizeRunId(runId);
}

export async function getE2EAuthHeader(email: string): Promise<Record<string, string>> {
  const authPort = getE2EPort('AUTH', 9099);
  const res = await fetch(`http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=e2e-firebase-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: E2E_PASSWORD, returnSecureToken: true }),
  });
  if (!res.ok) {
    throw new Error(`Failed to sign in E2E user ${email}: ${res.statusText}`);
  }
  const data = (await res.json()) as { idToken: string };
  return { Authorization: `Bearer ${data.idToken}` };
}
