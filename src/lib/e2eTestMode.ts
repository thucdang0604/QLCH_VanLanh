const E2E_PROJECT_ID = 'demo-qlch-e2e';
const LOCALHOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export type FirebaseEmulatorConfig = {
  projectId: typeof E2E_PROJECT_ID;
  host: string;
  authPort: number;
  firestorePort: number;
  databasePort: number;
  storagePort: number;
};

function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid ${name} for E2E Firebase Emulator.`);
  }
  return value;
}

export function isE2ETestMode(): boolean {
  return process.env.E2E_TEST_MODE === '1' || process.env.NEXT_PUBLIC_E2E_TEST_MODE === '1';
}

/**
 * This is deliberately strict: a browser E2E process must not silently fall
 * back to the real Firebase project when an emulator variable is missing.
 */
export function getE2EFirebaseEmulatorConfig(): FirebaseEmulatorConfig | null {
  if (!isE2ETestMode()) return null;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || process.env.FIREBASE_EMULATOR_HOST || '127.0.0.1';
  if (projectId !== E2E_PROJECT_ID) {
    throw new Error(`E2E Firebase project must be ${E2E_PROJECT_ID}, received ${projectId || '(missing)'}.`);
  }
  if (!LOCALHOSTS.has(host)) {
    throw new Error(`E2E Firebase Emulator host must be local, received ${host}.`);
  }

  return {
    projectId: E2E_PROJECT_ID,
    host,
    authPort: readPort('NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT', 9099),
    firestorePort: readPort('NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT', 8080),
    databasePort: readPort('NEXT_PUBLIC_FIREBASE_DATABASE_EMULATOR_PORT', 9000),
    storagePort: readPort('NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT', 9199),
  };
}

export { E2E_PROJECT_ID };
