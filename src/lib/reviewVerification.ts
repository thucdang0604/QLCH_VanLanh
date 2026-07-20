import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { unstable_cache } from 'next/cache';
import { DEFAULT_CONFIG, type GeofenceConfig } from '@/lib/config-defaults';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { normalizePublicGeofence } from '@/lib/geofence';

const scrypt = promisify(nodeScrypt);
const HASH_PREFIX = 'scrypt-v1';
const PRIVATE_REVIEW_CONFIG_ID = 'review_verification';

type LegacyGeofence = GeofenceConfig & { pin?: unknown };

export type ReviewVerificationState = {
    geofence: GeofenceConfig;
    pinHash?: string;
    legacyPin?: string;
    source: 'main_settings' | 'layout_settings' | 'default';
};

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

export function isValidReviewPin(value: string): boolean {
    return /^\d{4,8}$/.test(value);
}

export async function hashReviewPin(pin: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(pin, salt, 64) as Buffer;
    return `${HASH_PREFIX}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyReviewPin(pin: string, hash: string | undefined): Promise<boolean> {
    if (!hash) return false;
    const [prefix, encodedSalt, encodedHash] = hash.split('$');
    if (prefix !== HASH_PREFIX || !encodedSalt || !encodedHash) return false;

    try {
        const expected = Buffer.from(encodedHash, 'base64url');
        const derived = await scrypt(pin, Buffer.from(encodedSalt, 'base64url'), expected.length) as Buffer;
        return expected.length === derived.length && timingSafeEqual(expected, derived);
    } catch {
        return false;
    }
}

export function getLegacyReviewPin(value: unknown): string | undefined {
    const pin = (asRecord(value) as LegacyGeofence | null)?.pin;
    return typeof pin === 'string' && pin.trim().length > 0 ? pin.trim() : undefined;
}

async function readReviewVerificationState(): Promise<ReviewVerificationState> {
    if (!isAdminAvailable()) {
        return { geofence: DEFAULT_CONFIG.geofence, source: 'default' };
    }

    const db = getAdminDb();
    const [mainSnap, layoutSnap, privateSnap] = await db.getAll(
        db.collection('system_config').doc('main_settings'),
        db.collection('system_config').doc('layout_settings'),
        db.collection('private_config').doc(PRIVATE_REVIEW_CONFIG_ID),
    );

    const mainGeofence = mainSnap.data()?.geofence;
    const layoutGeofence = layoutSnap.data()?.geofence;
    const source = asRecord(mainGeofence)
        ? 'main_settings'
        : asRecord(layoutGeofence)
            ? 'layout_settings'
            : 'default';
    const rawGeofence = source === 'main_settings'
        ? mainGeofence
        : source === 'layout_settings'
            ? layoutGeofence
            : undefined;
    const privateData = privateSnap.data() as { pinHash?: unknown } | undefined;

    return {
        geofence: normalizePublicGeofence(rawGeofence),
        pinHash: typeof privateData?.pinHash === 'string' ? privateData.pinHash : undefined,
        // Compatibility read only. The generic config save migrates this value
        // into private_config and deletes it from the public layout document.
        legacyPin: getLegacyReviewPin(rawGeofence),
        source,
    };
}

export const getCachedReviewVerificationState = unstable_cache(
    readReviewVerificationState,
    ['review-verification-state'],
    { revalidate: 60, tags: ['config', 'review-verification'] },
);

export { PRIVATE_REVIEW_CONFIG_ID };
export { normalizePublicGeofence };
