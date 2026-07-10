#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const CONFIRMATION = 'BACKFILL_CATALOG_SEARCH_INDEX';
const VALID_COLLECTIONS = new Set(['products', 'services', 'all']);

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

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function toStringArray(value) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim())
    : [];
}

function normalizeCategoryIds(value) {
  const normalized = new Set();
  for (const categoryId of toStringArray(value)) {
    const segments = categoryId.split('/').map(segment => segment.trim()).filter(Boolean);
    for (let index = 1; index <= segments.length; index += 1) {
      normalized.add(segments.slice(0, index).join('/'));
    }
  }
  return Array.from(normalized);
}

function generateSearchKeywords(values) {
  const keywords = new Set();
  for (const value of values) {
    const normalized = normalize(value);
    if (!normalized) continue;
    const words = normalized.split(' ').filter(Boolean);
    for (const word of words) {
      keywords.add(word);
      for (let index = 2; index < word.length; index += 1) keywords.add(word.slice(0, index));
    }
    if (words.length > 1) {
      keywords.add(words.join(' '));
      keywords.add(words.slice(0, 2).join(' '));
    }
  }
  return Array.from(keywords);
}

function buildPatch(id, data, collectionName) {
  const sourceValues = collectionName === 'products'
    ? [data.name, data.productCode, data.sku, data.barcode]
    : [data.name, data.device_model, ...toStringArray(data.tags)];
  const searchKeywords = Array.from(new Set([
    ...toStringArray(data.searchKeywords),
    ...generateSearchKeywords([id, ...sourceValues]),
  ])).slice(0, 120);
  const categoryIds = normalizeCategoryIds(data.categoryIds);
  const searchCategoryKeywords = Array.from(new Set(
    categoryIds.flatMap(categoryId => searchKeywords.map(keyword => `${categoryId}::${keyword}`)),
  )).slice(0, 500);

  const patch = {};
  if (JSON.stringify(toStringArray(data.searchKeywords)) !== JSON.stringify(searchKeywords)) {
    patch.searchKeywords = searchKeywords;
  }
  if (JSON.stringify(toStringArray(data.categoryIds)) !== JSON.stringify(categoryIds)) {
    patch.categoryIds = categoryIds;
  }
  if (collectionName === 'products'
      && JSON.stringify(toStringArray(data.searchCategoryKeywords)) !== JSON.stringify(searchCategoryKeywords)) {
    patch.searchCategoryKeywords = searchCategoryKeywords;
  }
  return patch;
}

async function initDb(args) {
  if (getApps().length === 0) {
    const serviceAccountPath = args.get('service-account') || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = args.get('project-id') || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'qlch-vanlanh';
    if (serviceAccountPath) {
      const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
      initializeApp({ credential: cert(serviceAccount), projectId });
    } else {
      initializeApp({ credential: applicationDefault(), projectId });
    }
  }
  return getFirestore();
}

async function backfillCollection(db, collectionName, options) {
  const report = { scanned: 0, patched: 0, batches: 0, sampleIds: [] };
  let cursor;

  while (report.scanned < options.limit) {
    const remaining = options.limit - report.scanned;
    let query = db.collection(collectionName)
      .orderBy(FieldPath.documentId())
      .limit(Math.min(options.pageSize, remaining));
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const batch = db.batch();
    let batchHasWrites = false;
    for (const document of snapshot.docs) {
      report.scanned += 1;
      const patch = buildPatch(document.id, document.data(), collectionName);
      if (Object.keys(patch).length === 0) continue;

      report.patched += 1;
      if (report.sampleIds.length < 10) report.sampleIds.push(document.id);
      if (options.apply) {
        batch.update(document.ref, patch);
        batchHasWrites = true;
      }
    }

    if (batchHasWrites) {
      await batch.commit();
      report.batches += 1;
    }
    cursor = snapshot.docs.at(-1);
    if (snapshot.size < options.pageSize) break;
  }

  return report;
}

async function main() {
  const args = readArgs(process.argv);
  const collection = String(args.get('collection') || 'all');
  if (!VALID_COLLECTIONS.has(collection)) {
    throw new Error('--collection must be products, services, or all');
  }

  const apply = args.get('apply') === true;
  if (apply && args.get('confirm') !== CONFIRMATION) {
    throw new Error(`Refusing to write. Re-run with --apply --confirm ${CONFIRMATION}`);
  }

  const requestedLimit = Number(args.get('limit') || Number.MAX_SAFE_INTEGER);
  const requestedPageSize = Number(args.get('page-size') || 200);
  const options = {
    apply,
    limit: Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : Number.MAX_SAFE_INTEGER,
    pageSize: Number.isFinite(requestedPageSize) && requestedPageSize > 0
      ? Math.min(Math.floor(requestedPageSize), 400)
      : 200,
  };

  const db = await initDb(args);
  const collections = collection === 'all' ? ['products', 'services'] : [collection];
  const reports = {};
  for (const collectionName of collections) {
    reports[collectionName] = await backfillCollection(db, collectionName, options);
  }

  process.stdout.write(`${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', reports }, null, 2)}\n`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
