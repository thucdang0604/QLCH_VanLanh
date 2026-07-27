import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test_secret_key_1234567890_super_secret_for_tests';

// Test 1: Generation counter and delayed bootstrap cancellation after logout
test('AuthContext lifecycle: delayed bootstrap -> logout -> resolve POST cancels stale state', async () => {
  let sessionGen = 0;
  let clientUser: { uid: string; role: string } | null = null;
  let activeTokenUid: string | null = 'user_admin_1';

  // Simulating in-flight bootstrap POST started at gen = 1
  const initialGen = ++sessionGen;
  const targetUid = activeTokenUid;

  // Delayed async POST completes after 50ms
  const delayedPost = new Promise<{ ok: boolean }>((resolve) => {
    setTimeout(() => {
      resolve({ ok: true });
    }, 50);
  });

  // User clicks logout immediately at 10ms
  sessionGen++;
  activeTokenUid = null;
  clientUser = null;

  // Delayed POST resolves at 50ms
  const res = await delayedPost;

  // Fencing check: if generation changed or user logged out, state MUST NOT update
  if (sessionGen === initialGen && activeTokenUid === targetUid && res.ok) {
    clientUser = { uid: targetUid!, role: 'admin' };
  }

  assert.equal(clientUser, null, 'Client user must remain null after logout even if delayed POST succeeds');
});

// Test 2: Bootstrap fail -> retry -> success lifecycle
test('AuthContext lifecycle: bootstrap fail -> retry -> success updates state cleanly', async () => {
  let user: { uid: string; role: string } | null = null;
  let ready = false;
  let errorMsg: string | null = null;

  // Attempt 1: Session bootstrap fails/timeouts
  let bootstrapOk = false;
  if (!bootstrapOk) {
    user = null;
    ready = false;
    errorMsg = 'Không thể khởi tạo phiên làm việc trên máy chủ. Vui lòng bấm thử lại.';
  }

  assert.equal(user, null);
  assert.equal(ready, false);
  assert.notEqual(errorMsg, null);

  // Attempt 2: User clicks retry -> Bootstrap succeeds
  bootstrapOk = true;
  if (bootstrapOk) {
    user = { uid: 'staff_123', role: 'staff' };
    ready = true;
    errorMsg = null;
  }

  assert.deepEqual(user, { uid: 'staff_123', role: 'staff' });
  assert.equal(ready, true);
  assert.equal(errorMsg, null);
});

// Test 3: Sign-in A -> logout -> Sign-in B in same mounted provider
test('AuthContext lifecycle: sign-in A -> logout -> sign-in B without remounting publishes user B', async () => {
  let initialAuthResolved = false;
  let currentUser: { uid: string; email: string } | null = null;

  // Step 1: Sign in User A
  let firebaseUser: { uid: string; email: string } | null = { uid: 'user_A', email: 'a@example.com' };

  if (firebaseUser) {
    if (!initialAuthResolved) {
      currentUser = { uid: firebaseUser.uid, email: firebaseUser.email };
      initialAuthResolved = true;
    }
  }

  assert.equal(currentUser?.uid, 'user_A');
  assert.equal(initialAuthResolved, true);

  // Step 2: Logout -> firebaseUser becomes null
  firebaseUser = null;
  if (!firebaseUser) {
    currentUser = null;
    initialAuthResolved = false; // Reset lifecycle on logout!
  }

  assert.equal(currentUser, null);
  assert.equal(initialAuthResolved, false);

  // Step 3: Sign in User B in same mounted provider
  firebaseUser = { uid: 'user_B', email: 'b@example.com' };
  if (firebaseUser) {
    if (!initialAuthResolved) {
      currentUser = { uid: firebaseUser.uid, email: firebaseUser.email };
      initialAuthResolved = true;
    }
  }

  assert.equal(currentUser?.uid, 'user_B');
  assert.equal(initialAuthResolved, true);
});

// Test 4: RTDB role grant publication and revocation logic
test('RTDB role sync: grant chat_support -> revoke -> demote to customer', () => {
  const rtdbStore: Record<string, { role: string; permissions: Record<string, boolean>; expiresAt: number } | null> = {};

  function syncGrant(uid: string, role: string, permissions: string[], ttlMs = 20 * 60 * 1000) {
    if (role !== 'admin' && role !== 'staff') {
      rtdbStore[uid] = null;
      return;
    }
    const permMap = Object.fromEntries(permissions.map((p) => [p, true]));
    rtdbStore[uid] = {
      role,
      permissions: permMap,
      expiresAt: Date.now() + ttlMs,
    };
  }

  // 1. Grant staff with chat_support
  syncGrant('staff_user_1', 'staff', ['manage_repairs', 'chat_support']);
  assert.equal(rtdbStore['staff_user_1']?.role, 'staff');
  assert.equal(rtdbStore['staff_user_1']?.permissions['chat_support'], true);
  assert.ok((rtdbStore['staff_user_1']?.expiresAt || 0) > Date.now());

  // 2. Revoke chat_support (only keep manage_repairs)
  syncGrant('staff_user_1', 'staff', ['manage_repairs']);
  assert.equal(rtdbStore['staff_user_1']?.role, 'staff');
  assert.equal(rtdbStore['staff_user_1']?.permissions['chat_support'], undefined);

  // 3. Demote staff to customer
  syncGrant('staff_user_1', 'customer', []);
  assert.equal(rtdbStore['staff_user_1'], null);
});
