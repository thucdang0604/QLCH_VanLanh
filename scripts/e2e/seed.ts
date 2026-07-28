import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { E2E_PASSWORD, getRunId, getScopedId } from './config';
import { FieldValue, getE2EHarness } from './harness';
import { writeManifest, type E2EManifest } from './manifest';

type SeedUser = { uid: string; email: string; role: 'admin' | 'staff' | 'customer'; permissions: string[]; displayName: string };

function seedUsers(runId: string): SeedUser[] {
  return [
    { uid: getScopedId('admin', runId), email: `e2e-${runId}-admin@example.test`, role: 'admin', permissions: [], displayName: 'E2E Admin' },
    { uid: getScopedId('staff', runId), email: `e2e-${runId}-staff@example.test`, role: 'staff', permissions: ['manage_repairs'], displayName: 'E2E Repair Staff' },
    { uid: getScopedId('customer', runId), email: `e2e-${runId}-customer@example.test`, role: 'customer', permissions: [], displayName: 'E2E Customer' },
  ];
}

export async function seedE2EData(): Promise<void> {
  const runId = getRunId();
  const { auth, db, rtdb } = getE2EHarness();
  const users = seedUsers(runId);
  const productId = getScopedId('pos-product', runId);
  const repairPartId = getScopedId('repair-part', runId);
  const shiftId = getScopedId('cashier-shift', runId);
  const customerId = getScopedId('customer-record', runId);
  const taxonomyPath = path.join(process.cwd(), 'roadmap', 'repair_workflow_settings.json');
  const repairWorkflow = JSON.parse(await readFile(taxonomyPath, 'utf8')) as Record<string, unknown>;

  for (const user of users) {
    try { await auth.deleteUser(user.uid); } catch (error: unknown) {
      if (!(typeof error === 'object' && error && (error as { code?: string }).code === 'auth/user-not-found')) throw error;
    }
    await auth.createUser({ uid: user.uid, email: user.email, password: E2E_PASSWORD, displayName: user.displayName });
  }

  const staticDocumentPaths: string[] = [];
  const remember = (documentPath: string) => { staticDocumentPaths.push(documentPath); return db.doc(documentPath); };
  const batch = db.batch();

  for (const user of users) {
    batch.set(remember(`users/${user.uid}`), {
      uid: user.uid,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      displayName: user.displayName,
      authorizationVersion: 1,
      e2eRunId: runId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  batch.set(remember(`products/${productId}`), {
    id: productId,
    name: 'E2E POS FIFO Product',
    sku: getScopedId('sku', runId),
    category: 'accessory',
    status: 'active',
    stock: 10,
    held: 0,
    costPrice: 50_000,
    price_original: 120_000,
    price_promo: 120_000,
    inventoryTrackingMode: 'fifo',
    e2eRunId: runId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(remember(`inventory_lots/${getScopedId('pos-lot', runId)}`), {
    productId,
    lotCode: getScopedId('pos-lot-code', runId),
    supplierId: getScopedId('supplier', runId),
    remainingQuantity: 10,
    status: 'active',
    e2eRunId: runId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(remember(`products/${repairPartId}`), {
    id: repairPartId,
    name: 'E2E Repair Part',
    category: 'component',
    partType: 'Pin',
    status: 'active',
    stock: 5,
    held: 1,
    costPrice: 80_000,
    price_original: 180_000,
    price_promo: 180_000,
    inventoryTrackingMode: 'fifo',
    e2eRunId: runId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(remember(`inventory_lots/${getScopedId('repair-lot', runId)}`), {
    productId: repairPartId,
    lotCode: getScopedId('repair-lot-code', runId),
    supplierId: getScopedId('supplier', runId),
    remainingQuantity: 5,
    status: 'active',
    e2eRunId: runId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(remember(`customers/${customerId}`), {
    id: customerId,
    code: customerId,
    name: 'E2E Customer Record',
    phone: '',
    primaryPhone: '',
    contactMethods: [{ type: 'email', value: `e2e-${runId}@example.test`, isPrimary: true }],
    totalDebt: 0,
    totalSpent: 0,
    totalOrders: 0,
    totalRepairs: 0,
    e2eRunId: runId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(remember(`cashier_shifts/${shiftId}`), {
    status: 'open',
    openingCashAmount: 0,
    openingBankAmount: 0,
    cashSalesAmount: 0,
    bankSalesAmount: 0,
    otherSalesAmount: 0,
    tallyVersion: 1,
    openedBy: users[0].uid,
    openedByName: users[0].displayName,
    e2eRunId: runId,
    openedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(remember('system_counters/active_cashier_shift'), {
    activeShiftId: shiftId,
    e2eRunId: runId,
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(remember('system_config/repairs'), {
    ...repairWorkflow,
    e2eRunId: runId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(remember('system_config/taxonomy_settings'), {
    taxonomy: {
      service: [{ id: 'e2e-service', name: 'E2E Service', warrantyMonths: 6, children: [] }],
      product: [],
    },
    e2eRunId: runId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  for (const user of users) {
    if (user.role === 'admin' || user.role === 'staff') {
      await rtdb.ref(`admin_roles/${user.uid}`).set({
        role: user.role,
        permissions: user.permissions.reduce((acc, p) => ({ ...acc, [p]: true }), {}),
        expiresAt: Date.now() + 60 * 60 * 1000,
        authorizationVersion: 1,
      });
    }
  }

  const manifest: E2EManifest = {
    runId,
    userUids: users.map(user => user.uid),
    staticDocumentPaths: staticDocumentPaths.sort(),
    dynamicDocumentPaths: [],
    createdAt: new Date().toISOString(),
  };
  await writeManifest(manifest);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/seed.ts')) {
  seedE2EData().catch(error => { console.error(error); process.exitCode = 1; });
}
