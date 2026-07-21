import { DEFAULT_CONFIG, type GeofenceConfig } from '@/lib/config-defaults';

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function asFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
        ? value
        : fallback;
}

/** Public geofence policy only. Legacy secret fields are deliberately omitted. */
export function normalizePublicGeofence(value: unknown): GeofenceConfig {
    const source = asRecord(value);
    const fallback = DEFAULT_CONFIG.geofence;
    return {
        enabled: source?.enabled === true,
        lat: asFiniteNumber(source?.lat, fallback.lat, -90, 90),
        lng: asFiniteNumber(source?.lng, fallback.lng, -180, 180),
        radiusMeters: asFiniteNumber(source?.radiusMeters, fallback.radiusMeters, 50, 5_000),
    };
}
