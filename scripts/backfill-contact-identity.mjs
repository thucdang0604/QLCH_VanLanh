#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const CONTACT_TYPES = new Set(['phone', 'zalo', 'facebook', 'email', 'address', 'other']);

function readArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, true);
    } else {
      args.set(key, next);
      i += 1;
    }
  }
  return args;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  const local = digits.startsWith('84') ? `0${digits.slice(2)}` : digits;
  return /^0\d{9,10}$/.test(local) ? local : '';
}

function normalizeContactValue(type, value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (type === 'phone') return normalizePhone(trimmed);
  if (type === 'email') return trimmed.toLowerCase();
  if (type === 'facebook') {
    return trimmed.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
  return trimmed.toLowerCase().replace(/\s+/g, ' ');
}

function generateSearchKeywords(values) {
  const exact = new Set();
  const prefixes = new Set();
  const normalized = values
    .map(value => normalizeContactValue('other', value))
    .filter(Boolean);

  for (const value of normalized) {
    exact.add(value);
    const words = value.split(/\s+/).filter(Boolean);
    for (const word of words) {
      prefixes.add(word);
      for (let i = 2; i < word.length; i += 1) prefixes.add(word.slice(0, i));
    }
    if (words.length > 1) {
      prefixes.add(words.join(' '));
      prefixes.add(words.slice(0, 2).join(' '));
    }
  }
  return Array.from(new Set([...exact, ...prefixes])).slice(0, 80);
}

function addContact(methods, seen, type, value, source = 'migration') {
  const normalizedValue = normalizeContactValue(type, value);
  if (!normalizedValue) return;
  const key = `${type}:${normalizedValue}`;
  if (seen.has(key)) return;
  seen.add(key);
  methods.push({
    type,
    label: type === 'phone' ? 'SDT' : type,
    value: String(value || '').trim(),
    normalizedValue,
    source,
  });
}

function buildContactMethods(data, docId) {
  const methods = [];
  const seen = new Set();

  const existing = Array.isArray(data.contactMethods) ? data.contactMethods : [];
  for (const method of existing) {
    const type = String(method?.type || '');
    if (!CONTACT_TYPES.has(type)) continue;
    addContact(methods, seen, type, method.value || method.normalizedValue || '', method.source || 'migration');
  }

  addContact(methods, seen, 'phone', data.phone || data.primaryPhone || docId);
  addContact(methods, seen, 'email', data.email);
  addContact(methods, seen, 'address', data.address);

  const primaryType = String(data.primaryContactType || data.contactType || '');
  const primaryValue = String(data.primaryContactValue || data.contactValue || '');
  if (CONTACT_TYPES.has(primaryType)) addContact(methods, seen, primaryType, primaryValue);

  const selectedIndex = methods.findIndex(method => method.type === primaryType);
  const fallbackIndex = methods.findIndex(method => CONTACT_TYPES.has(method.type));
  const primaryIndex = selectedIndex >= 0 ? selectedIndex : fallbackIndex >= 0 ? fallbackIndex : 0;

  return methods.map((method, index) => ({
    ...method,
    isPrimary: index === primaryIndex,
  }));
}

function buildCustomerPatch(docId, data) {
  const phone = normalizePhone(data.phone || data.primaryPhone || docId);
  const contactMethods = buildContactMethods(data, docId);
  const primaryContact = contactMethods.find(method => method.isPrimary) || contactMethods[0] || null;
  const values = [
    docId,
    data.code,
    data.name,
    data.phone,
    data.primaryPhone,
    data.email,
    data.address,
    ...contactMethods.flatMap(method => [method.value, method.normalizedValue]),
  ];

  const patch = {
    id: data.id || docId,
    code: data.code || docId,
    primaryPhone: data.primaryPhone || phone || '',
    phone: data.phone || phone || '',
    primaryContactType: data.primaryContactType || primaryContact?.type || null,
    primaryContactValue: data.primaryContactValue || primaryContact?.value || '',
    contactMethods,
    searchKeywords: generateSearchKeywords(values),
  };

  const missing = [];
  for (const [key, value] of Object.entries(patch)) {
    const current = data[key];
    if (Array.isArray(value)) {
      if (!Array.isArray(current) || current.length === 0) missing.push(key);
    } else if (current === undefined || current === null || current === '') {
      missing.push(key);
    }
  }

  return {
    patch: {
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    },
    missing,
    hasPhone: Boolean(phone),
    hasContact: contactMethods.length > 0,
  };
}

async function initDb(args) {
  if (getApps().length === 0) {
    const serviceAccount = args.get('service-account') || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const projectId = args.get('project-id') || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'qlch-vanlanh';
    if (serviceAccount) {
      const raw = JSON.parse(await fs.readFile(serviceAccount, 'utf8'));
      initializeApp({ credential: cert(raw), projectId });
    } else {
      initializeApp({ credential: applicationDefault(), projectId });
    }
  }
  return getFirestore();
}

async function writeReport(report, explicitPath) {
  const reportPath = explicitPath || path.join(
    process.cwd(),
    'roadmap',
    'reports',
    `contact-identity-backfill-dry-run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
}

async function main() {
  const args = readArgs(process.argv);
  const apply = args.get('apply') === true;
  const limit = Number(args.get('limit') || 0);
  const pageSize = Math.max(1, Math.min(Number(args.get('page-size') || 300), 500));
  const db = await initDb(args);

  const report = {
    mode: apply ? 'apply' : 'dry-run',
    collection: 'customers',
    startedAt: new Date().toISOString(),
    scanned: 0,
    wouldPatch: 0,
    patched: 0,
    missingPhone: 0,
    missingContact: 0,
    samples: [],
  };

  let lastDoc = null;
  while (limit <= 0 || report.scanned < limit) {
    let query = db.collection('customers').orderBy('__name__').limit(Math.min(pageSize, limit > 0 ? limit - report.scanned : pageSize));
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};
      const result = buildCustomerPatch(docSnap.id, data);
      report.scanned += 1;
      if (!result.hasPhone) report.missingPhone += 1;
      if (!result.hasContact) report.missingContact += 1;
      if (result.missing.length > 0) {
        report.wouldPatch += 1;
        if (report.samples.length < 30) {
          report.samples.push({
            id: docSnap.id,
            missing: result.missing,
            patchPreview: {
              id: result.patch.id,
              code: result.patch.code,
              primaryPhone: result.patch.primaryPhone,
              primaryContactType: result.patch.primaryContactType,
              primaryContactValue: result.patch.primaryContactValue,
              contactMethods: result.patch.contactMethods,
              searchKeywordsCount: result.patch.searchKeywords.length,
            },
          });
        }
        if (apply) {
          await docSnap.ref.set(result.patch, { merge: true });
          report.patched += 1;
        }
      }
    }

    lastDoc = snap.docs.at(-1);
    if (snap.size < pageSize) break;
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = await writeReport(report, args.get('report'));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
