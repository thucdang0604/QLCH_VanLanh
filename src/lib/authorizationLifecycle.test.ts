import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentAuthorization,
  isFirebaseTokenCurrent,
  isSessionCurrent,
  nextAuthorizationVersion,
  shouldApplyRtdbProjection,
} from './authorizationLifecycle';

const currentAdmin = getCurrentAuthorization({
  role: 'admin',
  permissions: ['manage_staff'],
  authorizationVersion: 7,
});

test('authorization lifecycle: rejects a pre-demotion cookie after the authorization version changes', () => {
  const staleSession = {
    role: 'admin' as const,
    permissions: ['manage_staff'],
    authorizationVersion: 7,
    iat: 10_000,
  };
  const demoted = getCurrentAuthorization({
    role: 'customer',
    permissions: [],
    authorizationVersion: nextAuthorizationVersion(currentAdmin.authorizationVersion),
  });

  assert.equal(isSessionCurrent(staleSession, demoted), false);
});

test('authorization lifecycle: rejects a copied cookie after logout even if its expiry has not elapsed', () => {
  const copiedSession = {
    role: 'admin' as const,
    permissions: ['manage_staff'],
    authorizationVersion: 7,
    iat: 10_000,
  };
  const loggedOut = getCurrentAuthorization({
    role: 'admin',
    permissions: ['manage_staff'],
    authorizationVersion: 7,
    lastLogoutAt: 10_000,
  });

  assert.equal(isSessionCurrent(copiedSession, loggedOut), false);
  assert.equal(isSessionCurrent({ ...copiedSession, iat: 10_001 }, loggedOut), true);
});

test('authorization lifecycle: rejects a Firebase token authenticated at or before logout', () => {
  const loggedOut = getCurrentAuthorization({
    role: 'staff',
    authorizationVersion: 4,
    lastLogoutAuthTime: 1_000,
  });

  assert.equal(isFirebaseTokenCurrent(1_000, loggedOut), false);
  assert.equal(isFirebaseTokenCurrent(999, loggedOut), false);
  assert.equal(isFirebaseTokenCurrent(1_001, loggedOut), true);
});

test('authorization lifecycle: requires current role and permission projection, not just a matching version', () => {
  const stalePermissions = {
    role: 'admin' as const,
    permissions: ['manage_staff', 'manage_settings'],
    authorizationVersion: 7,
    iat: 10_000,
  };

  assert.equal(isSessionCurrent(stalePermissions, currentAdmin), false);
});

test('authorization lifecycle: rejects an older RTDB projection after a newer revoke tombstone exists', () => {
  assert.equal(shouldApplyRtdbProjection(8, 7), false);
  assert.equal(shouldApplyRtdbProjection(8, 8), true);
  assert.equal(shouldApplyRtdbProjection(undefined, 1), true);
});
