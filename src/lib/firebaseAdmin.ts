import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getDatabase, type Database } from 'firebase-admin/database';
import fs from 'node:fs';
import path from 'node:path';

// Auto-load environment variables from .env.local for standalone scripts
if (typeof window === 'undefined') {
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
  const serviceAccount = getServiceAccountFromEnv();
  const projectId = serviceAccount?.projectId || getRequiredEnv('FIREBASE_ADMIN_PROJECT_ID');
  const fallbackProjectId = getRequiredEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID')
    || getRequiredEnv('GOOGLE_CLOUD_PROJECT')
    || getRequiredEnv('GCLOUD_PROJECT');
  const databaseURL = getRequiredEnv('FIREBASE_DATABASE_URL')
    || ((projectId || fallbackProjectId) ? `https://${projectId || fallbackProjectId}-default-rtdb.asia-southeast1.firebasedatabase.app` : undefined);

  if (serviceAccount) {
    return initializeApp({
      credential: cert(serviceAccount),
      ...(databaseURL ? { databaseURL } : {}),
    }, ADMIN_APP_NAME);
  }

  // Fallback: dùng Application Default Credentials (ADC) khi chạy trên Cloud Run / Cloud Functions
  // ADC tự động nhận credentials từ môi trường Google Cloud, không cần service account key
  // Sử dụng NEXT_PUBLIC_FIREBASE_PROJECT_ID làm fallback projectId cho local dev
  return initializeApp({
    ...(fallbackProjectId ? { projectId: fallbackProjectId } : {}),
    ...(databaseURL ? { databaseURL } : {}),
  }, ADMIN_APP_NAME);
}

let cachedAdminApp: App | null = null;
let cachedAdminAuth: Auth | null = null;
let cachedAdminDb: Firestore | null = null;
let cachedAdminRtdb: Database | null = null;

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

