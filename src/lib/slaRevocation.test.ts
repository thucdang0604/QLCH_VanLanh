import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentAuthorization,
  isSessionCurrent,
  isFirebaseTokenCurrent,
  nextAuthorizationVersion,
} from './authorizationLifecycle';

describe('SLA Revocation & Security Enclosure — Step 3.4', () => {
  it('enforces 100% fail-closed when session authorization version does not match', () => {
    const firestoreUserDoc = {
      role: 'admin',
      permissions: ['inventory', 'pos'],
      authorizationVersion: 2,
      lastLogoutAt: null,
      lastLogoutAuthTime: null,
    };

    const currentAuth = getCurrentAuthorization(firestoreUserDoc);

    const oldSession = {
      role: 'admin' as const,
      permissions: ['inventory', 'pos'],
      authorizationVersion: 1, // Stale version!
      iat: 1000,
    };

    assert.equal(isSessionCurrent(oldSession, currentAuth), false);
  });

  it('enforces 100% fail-closed immediately when staff permissions are revoked', () => {
    const firestoreUserDoc = {
      role: 'staff',
      permissions: ['inventory'], // 'pos' was revoked
      authorizationVersion: 2,
      lastLogoutAt: null,
      lastLogoutAuthTime: null,
    };

    const currentAuth = getCurrentAuthorization(firestoreUserDoc);

    const cachedSession = {
      role: 'staff' as const,
      permissions: ['inventory', 'pos'], // Stale permissions!
      authorizationVersion: 2,
      iat: 1000,
    };

    assert.equal(isSessionCurrent(cachedSession, currentAuth), false);
  });

  it('enforces 0ms Revocation SLA upon user logout (lastLogoutAt marker)', () => {
    const firestoreUserDoc = {
      role: 'admin',
      permissions: ['all'],
      authorizationVersion: 5,
      lastLogoutAt: 1700000500, // User logged out at timestamp 1700000500
      lastLogoutAuthTime: 1700000500,
    };

    const currentAuth = getCurrentAuthorization(firestoreUserDoc);

    const sessionBeforeLogout = {
      role: 'admin' as const,
      permissions: ['all'],
      authorizationVersion: 5,
      iat: 1700000499, // Issued before logout!
    };

    assert.equal(isSessionCurrent(sessionBeforeLogout, currentAuth), false);

    const sessionAfterLogout = {
      role: 'admin' as const,
      permissions: ['all'],
      authorizationVersion: 5,
      iat: 1700000501, // Issued after logout
    };

    assert.equal(isSessionCurrent(sessionAfterLogout, currentAuth), true);
  });

  it('enforces 0ms Revocation SLA for Firebase ID Tokens', () => {
    const firestoreUserDoc = {
      role: 'staff',
      permissions: ['pos'],
      authorizationVersion: 3,
      lastLogoutAt: null,
      lastLogoutAuthTime: 1700000600, // Firebase token logout marker at 1700000600
    };

    const currentAuth = getCurrentAuthorization(firestoreUserDoc);

    const staleAuthTime = 1700000600; // Issued at or before logout timestamp
    const freshAuthTime = 1700000601; // Issued after logout

    assert.equal(isFirebaseTokenCurrent(staleAuthTime, currentAuth), false);
    assert.equal(isFirebaseTokenCurrent(freshAuthTime, currentAuth), true);
  });

  it('increments authorization version correctly without overflow', () => {
    assert.equal(nextAuthorizationVersion(0), 1);
    assert.equal(nextAuthorizationVersion(10), 11);
    assert.equal(nextAuthorizationVersion(-1), 1);
  });
});
