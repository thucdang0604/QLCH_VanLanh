import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getDatabase, type Database } from 'firebase-admin/database';
import { E2E_DATABASE_NAMESPACE, E2E_PROJECT_ID, assertE2EEnvironment } from './config';

const APP_NAME = 'qlch-e2e-harness';

export type E2EHarness = {
  app: App;
  auth: Auth;
  db: Firestore;
  rtdb: Database;
};

export function getE2EHarness(): E2EHarness {
  assertE2EEnvironment();
  const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (!databaseHost) throw new Error('FIREBASE_DATABASE_EMULATOR_HOST is required for the E2E harness.');
  const app = getApps().find(candidate => candidate.name === APP_NAME)
    || initializeApp({
      projectId: E2E_PROJECT_ID,
      databaseURL: `http://${databaseHost}?ns=${E2E_DATABASE_NAMESPACE}`,
      storageBucket: `${E2E_PROJECT_ID}.appspot.com`,
    }, APP_NAME);
  return { app, auth: getAuth(app), db: getFirestore(app), rtdb: getDatabase(app) };
}

export { FieldValue };
