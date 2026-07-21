import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePublicGeofence } from './geofence';

test('normalizePublicGeofence removes legacy secret fields and clamps invalid values', () => {
    const result = normalizePublicGeofence({
        enabled: true,
        lat: 999,
        lng: 106.7,
        radiusMeters: 10,
        pin: '2026',
        internalNote: 'must-not-leak',
    });

    assert.deepEqual(result, {
        enabled: true,
        lat: 10.8078,
        lng: 106.7,
        radiusMeters: 500,
    });
    assert.equal('pin' in result, false);
});
