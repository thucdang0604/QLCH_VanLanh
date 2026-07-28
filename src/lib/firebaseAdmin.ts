import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getStorage, type Storage } from 'firebase-admin/storage';
import fs from 'node:fs';
import path from 'node:path';
import { shouldApplyRtdbProjection } from '@/lib/authorizationLifecycle';
import { getE2EFirebaseEmulatorConfig, isE2ETestMode } from '@/lib/e2eTestMode';

// Auto-load environment variables from .env.local for standalone scripts
if (typeof window === 'undefined' && !isE2ETestMode()) {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split('\n')) {
        const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if (!process.env[key]) {
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.substring(1, val.length - 1);
            }
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignore in non-Node environments
  }
}

function getRequiredEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : undefined;
}

function parseServiceAccountJson(raw: string): ServiceAccount | null {
  try {
    const parsed = JSON.parse(raw) as Partial<{
      project_id: string;
      client_email: string;
      private_key: string;
      projectId: string;
      clientEmail: string;
      privateKey: string;
    }>;
    const projectId = parsed.projectId || parsed.project_id;
    const clientEmail = parsed.clientEmail || parsed.client_email;
    const privateKey = parsed.privateKey || parsed.private_key;
    if (!projectId || !clientEmail || !privateKey) return null;
    return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') };
  } catch {
    return null;
  }
}

function getServiceAccountFromEnv(): ServiceAccount | null {
  const json = getRequiredEnv('FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON') || getRequiredEnv('FIREBASE_ADMIN_SERVICE_ACCOUNT');
  if (json) {
    return parseServiceAccountJson(json);
  }

  const serviceAccountPath = getRequiredEnv('FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH');
  if (serviceAccountPath) {
    try {
      const resolvedPath = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath
        : path.resolve(process.cwd(), serviceAccountPath);
      return parseServiceAccountJson(fs.readFileSync(resolvedPath, 'utf8'));
    } catch {
      return null;
    }
  }

  const projectId = getRequiredEnv('FIREBASE_ADMIN_PROJECT_ID');
  const clientEmail = getRequiredEnv('FIREBASE_ADMIN_CLIENT_EMAIL');
  const privateKey = getRequiredEnv('FIREBASE_ADMIN_PRIVATE_KEY')?.replace(/\\n/g, '\n');
  return projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : null;
}

/**
 * Kiểm tra xem Firebase Admin SDK có credentials khả dụng không.
 * Trả về false khi chạy local dev mà không có service account hoặc ADC.
 */
export function isAdminAvailable(): boolean {
  if (isE2ETestMode()) return Boolean(getE2EFirebaseEmulatorConfig());
  // Có service account credentials
  if (getServiceAccountFromEnv()) return true;

  // Nếu chạy trên Google Cloud (Cloud Run/Functions), ADC sẽ tự động khả dụng
  // Kiểm tra qua GOOGLE_CLOUD_PROJECT hoặc GCLOUD_PROJECT (được set tự động trên GCP)
  const isGoogleCloud = !!(
    getRequiredEnv('GOOGLE_CLOUD_PROJECT') ||
    getRequiredEnv('GCLOUD_PROJECT') ||
    getRequiredEnv('GOOGLE_APPLICATION_CREDENTIALS')
  );
  if (isGoogleCloud) return true;

  return false;
}

const ADMIN_APP_NAME = 'vanlanh-admin';

function initAdminApp(): App {
  const e2eEmulator = getE2EFirebaseEmulatorConfig();
  if (e2eEmulator) {
    return initializeApp({
      projectId: e2eEmulator.projectId,
      databaseURL: `http://${e2eEmulator.host}:${e2eEmulator.databasePort}?ns=${e2eEmulator.projectId}-default-rtdb`,
      storageBucket: `${e2eEmulator.projectId}.appspot.com`,
    }, ADMIN_APP_NAME);
  }

  const serviceAccount = getServiceAccountFromEnv();
  const projectId = serviceAccount?.projectId || getRequiredEnv('FIREBASE_ADMIN_PROJECT_ID');
  const fallbackProjectId = getRequiredEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID')
    || getRequiredEnv('GOOGLE_CLOUD_PROJECT')
    || getRequiredEnv('GCLOUD_PROJECT');
  const databaseURL = getRequiredEnv('FIREBASE_DATABASE_URL')
    || ((projectId || fallbackProjectId) ? `https://${projectId || fallbackProjectId}-default-rtdb.asia-southeast1.firebasedatabase.app` : undefined);
  const storageBucket = getRequiredEnv('FIREBASE_STORAGE_BUCKET')
    || getRequiredEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');

  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      ...(databaseURL ? { databaseURL } : {}),
      ...(storageBucket ? { storageBucket } : {}),
    }, ADMIN_APP_NAME);
  }

  // Fallback: dùng Application Default Credentials (ADC) khi chạy trên Cloud Run / Cloud Functions
  // ADC tự động nhận credentials từ môi trường Google Cloud, không cần service account key
  // Sử dụng NEXT_PUBLIC_FIREBASE_PROJECT_ID làm fallback projectId cho local dev
  return initializeApp({
    ...(fallbackProjectId ? { projectId: fallbackProjectId } : {}),
    ...(databaseURL ? { databaseURL } : {}),
    ...(storageBucket ? { storageBucket } : {}),
  }, ADMIN_APP_NAME);
}

let cachedAdminApp: App | null = null;
let cachedAdminAuth: Auth | null = null;
let cachedAdminDb: Firestore | null = null;
let cachedAdminRtdb: Database | null = null;
let cachedAdminStorage: Storage | null = null;

export function getAdminApp(): App {
  if (cachedAdminApp) return cachedAdminApp;
  cachedAdminApp = getApps().find(app => app.name === ADMIN_APP_NAME) || initAdminApp();
  return cachedAdminApp;
}

export function getAdminAuth(): Auth {
  if (cachedAdminAuth) return cachedAdminAuth;
  cachedAdminAuth = getAuth(getAdminApp());
  return cachedAdminAuth;
}

export function getAdminDb(): Firestore {
  if (cachedAdminDb) return cachedAdminDb;
  cachedAdminDb = getFirestore(getAdminApp());
  return cachedAdminDb;
}

export function getAdminRtdb(): Database {
  if (cachedAdminRtdb) return cachedAdminRtdb;
  cachedAdminRtdb = getDatabase(getAdminApp());
  return cachedAdminRtdb;
}

export function getAdminStorage(): Storage {
  if (cachedAdminStorage) return cachedAdminStorage;
  cachedAdminStorage = getStorage(getAdminApp());
  return cachedAdminStorage;
}

export async function syncUserRtdbRoleGrant(
  uid: string,
  role: string,
  permissions: string[],
  authorizationVersion: number,
  ttlMs: number = 20 * 60 * 1000
): Promise<void> {
  if (!isAdminAvailable()) {
    throw new Error('Firebase Admin credentials are not configured for RTDB role sync.');
  }
  if (!Number.isSafeInteger(authorizationVersion) || authorizationVersion < 0) {
    throw new Error('Invalid authorization version for RTDB role grant');
  }

  const rtdb = getAdminRtdb();
  const ref = rtdb.ref(`admin_roles/${uid}`);
  const now = Date.now();

  const grant = role === 'admin' || role === 'staff'
    ? {
        role,
        permissions: Object.fromEntries(permissions.map((permission) => [permission, true])),
        expiresAt: now + ttlMs,
        authorizationVersion,
        updatedAt: now,
      }
    : {
        // Keep a versioned tombstone instead of removing the node. A delayed
        // request carrying an older version must never republish a revoked grant.
        role: 'customer',
        permissions: {},
        expiresAt: 0,
        authorizationVersion,
        revokedAt: now,
        updatedAt: now,
      };

  await ref.transaction((current: unknown) => {
    const currentVersion = current
      && typeof current === 'object'
      && Number.isSafeInteger((current as { authorizationVersion?: unknown }).authorizationVersion)
      ? (current as { authorizationVersion: number }).authorizationVersion
      : -1;

    return shouldApplyRtdbProjection(currentVersion, authorizationVersion) ? grant : current;
  });
}
