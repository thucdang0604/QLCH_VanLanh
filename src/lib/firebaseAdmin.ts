import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// Auto-load environment variables from .env.local for standalone scripts
if (typeof window === 'undefined') {
  try {
    const fs = require('fs');
    const path = require('path');
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
  } catch (e) {
    // Ignore in non-Node environments
  }
}

function getRequiredEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v : undefined;
}

/**
 * Kiểm tra xem Firebase Admin SDK có credentials khả dụng không.
 * Trả về false khi chạy local dev mà không có service account hoặc ADC.
 */
export function isAdminAvailable(): boolean {
  // Có service account credentials
  const hasServiceAccount = !!(
    getRequiredEnv('FIREBASE_ADMIN_PROJECT_ID') &&
    getRequiredEnv('FIREBASE_ADMIN_CLIENT_EMAIL') &&
    getRequiredEnv('FIREBASE_ADMIN_PRIVATE_KEY')
  );
  if (hasServiceAccount) return true;

  // Nếu chạy trên Google Cloud (Cloud Run/Functions), ADC sẽ tự động khả dụng
  // Kiểm tra qua GOOGLE_CLOUD_PROJECT hoặc GCLOUD_PROJECT (được set tự động trên GCP)
  const isGoogleCloud = !!(
    getRequiredEnv('GOOGLE_CLOUD_PROJECT') ||
    getRequiredEnv('GCLOUD_PROJECT') ||
    getRequiredEnv('GOOGLE_APPLICATION_CREDENTIALS')
  );
  if (isGoogleCloud) return true;

  // Fallback cho local dev khi dùng gcloud auth application-default login
  const hasFallbackProject = !!getRequiredEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  return hasFallbackProject;
}

function initAdminApp(): App {
  const projectId = getRequiredEnv('FIREBASE_ADMIN_PROJECT_ID');
  const clientEmail = getRequiredEnv('FIREBASE_ADMIN_CLIENT_EMAIL');
  const privateKey = getRequiredEnv('FIREBASE_ADMIN_PRIVATE_KEY')?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  // Fallback: dùng Application Default Credentials (ADC) khi chạy trên Cloud Run / Cloud Functions
  // ADC tự động nhận credentials từ môi trường Google Cloud, không cần service account key
  // Sử dụng NEXT_PUBLIC_FIREBASE_PROJECT_ID làm fallback projectId cho local dev
  const fallbackProjectId = getRequiredEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  return initializeApp(fallbackProjectId ? { projectId: fallbackProjectId } : undefined);
}

let cachedAdminApp: App | null = null;
let cachedAdminAuth: Auth | null = null;
let cachedAdminDb: Firestore | null = null;

export function getAdminApp(): App {
  if (cachedAdminApp) return cachedAdminApp;
  cachedAdminApp = getApps().length ? getApps()[0]! : initAdminApp();
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

