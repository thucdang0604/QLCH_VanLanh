#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const CONFIRMATION = 'BACKFILL_PRODUCT_INVENTORY_TRACKING';

function readArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) args.set(key, true);
    else {
      args.set(key, next);
      index += 1;
    }
  }
  return args;
}

async function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const raw = await fs.readFile(envPath, 'utf8').catch(() => '');
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1].trim()]) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function initDb(args) {
  await loadLocalEnv();
  const configuredProjectId = args.get('project-id')
    || process.env.FIREBASE_ADMIN_PROJECT_ID
    || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || 'qlch-vanlanh';
  if (getApps().length === 0) {
    const serviceAccountPath = args.get('service-account') || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const serviceAccountJson = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;

    if (serviceAccountJson) {
      initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId: configuredProjectId });
    } else if (serviceAccountPath) {
      const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
      initializeApp({ credential: cert(serviceAccount), projectId: configuredProjectId });
    } else {
      initializeApp({ credential: applicationDefault(), projectId: configuredProjectId });
    }
  }
  return { db: getFirestore(), projectId: getApps()[0]?.options.projectId || configuredProjectId };
}

function getRequestedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

async function collectActiveLotProductIds(db) {
  const snapshot = await db.collection('inventory_lots')
    .where('status', '==', 'active')
    .select('productId')
    .get();
  return new Set(snapshot.docs
    .map((document) => document.data().productId)
    .filter((productId) => typeof productId === 'string' && productId.trim()));
}

async function classifyProductInTransaction(db, productRef) {
  return db.runTransaction(async (tx) => {
    const activeLotsQuery = db.collection('inventory_lots')
      .where('productId', '==', productRef.id)
      .where('status', '==', 'active')
      .limit(1);
    const [productSnap, activeLotsSnap] = await Promise.all([
      tx.get(productRef),
      tx.get(activeLotsQuery),
    ]);

    if (!productSnap.exists) return { classified: false, skipped: 'missing' };
    const existingMode = productSnap.data()?.inventoryTrackingMode;
    if (existingMode === 'legacy' || existingMode === 'fifo') {
      return { classified: false, skipped: 'already-classified' };
    }

    const inventoryTrackingMode = activeLotsSnap.empty ? 'legacy' : 'fifo';
    tx.update(productRef, { inventoryTrackingMode });
    return { classified: true, inventoryTrackingMode };
  });
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = [];
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      results.push(await worker(item));
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const args = readArgs(process.argv);
  const apply = args.get('apply') === true;
  if (apply && args.get('confirm') !== CONFIRMATION) {
    throw new Error(`Refusing to write. Re-run with --apply --confirm ${CONFIRMATION}`);
  }

  const limit = getRequestedNumber(args.get('limit'), Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = getRequestedNumber(args.get('page-size'), 200, 1, 400);
  const concurrency = getRequestedNumber(args.get('concurrency'), 10, 1, 20);
  const { db, projectId } = await initDb(args);
  const activeLotProductIds = await collectActiveLotProductIds(db);
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    activeLotProductCount: activeLotProductIds.size,
    scanned: 0,
    alreadyClassified: 0,
    candidatesAtScan: 0,
    legacyCandidatesAtScan: 0,
    fifoCandidatesAtScan: 0,
    classified: 0,
    classifySkipped: 0,
    samples: [],
  };

  let cursor;
  while (report.scanned < limit) {
    const remaining = limit - report.scanned;
    let query = db.collection('products')
      .orderBy(FieldPath.documentId())
      .limit(Math.min(pageSize, remaining));
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;

    const candidates = [];
    for (const productSnap of snapshot.docs) {
      report.scanned += 1;
      const existingMode = productSnap.data().inventoryTrackingMode;
      if (existingMode === 'legacy' || existingMode === 'fifo') {
        report.alreadyClassified += 1;
        continue;
      }
      const inventoryTrackingMode = activeLotProductIds.has(productSnap.id) ? 'fifo' : 'legacy';
      report.candidatesAtScan += 1;
      report[`${inventoryTrackingMode}CandidatesAtScan`] += 1;
      if (report.samples.length < 10) report.samples.push({ productId: productSnap.id, inventoryTrackingMode });
      if (apply) candidates.push(productSnap.ref);
    }

    if (apply && candidates.length > 0) {
      const results = await mapWithConcurrency(candidates, concurrency, (productRef) => classifyProductInTransaction(db, productRef));
      for (const result of results) {
        if (result.classified) report.classified += 1;
        else report.classifySkipped += 1;
      }
    }

    cursor = snapshot.docs.at(-1);
    if (snapshot.size < pageSize) break;
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
