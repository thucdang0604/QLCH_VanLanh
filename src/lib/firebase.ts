import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import type { Database } from 'firebase/database';
import type { FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}-default-rtdb.asia-southeast1.firebasedatabase.app`,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Firestore - Main Database (eagerly loaded — used everywhere)
export const db = getFirestore(app);

// ── Lazy Singletons ──
// Auth, RTDB, Storage are loaded on-demand to keep initial bundle small.
// This cuts ~100-150KB from customer-facing pages that don't need these SDKs.

let _auth: Auth | null = null;
export async function getAuthInstance(): Promise<Auth> {
    if (!_auth) {
        const { getAuth } = await import('firebase/auth');
        _auth = getAuth(app);
    }
    return _auth;
}

let _rtdb: Database | null = null;
export async function getRtdbInstance(): Promise<Database> {
    if (!_rtdb) {
        const { getDatabase } = await import('firebase/database');
        _rtdb = getDatabase(app);
    }
    return _rtdb;
}

let _storage: FirebaseStorage | null = null;
export async function getStorageInstance(): Promise<FirebaseStorage> {
    if (!_storage) {
        const { getStorage } = await import('firebase/storage');
        _storage = getStorage(app);
    }
    return _storage;
}

export default app;
