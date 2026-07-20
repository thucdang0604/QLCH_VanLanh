#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { randomBytes, scrypt as nodeScrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const CONFIRMATION = 'MIGRATE_SYSTEM_CONFIG_20260720';
const scrypt = promisify(nodeScrypt);

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
  const projectId = args.get('project-id')
    || process.env.FIREBASE_ADMIN_PROJECT_ID
    || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || 'qlch-vanlanh';
  if (getApps().length === 0) {
    const serviceAccountPath = args.get('service-account') || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const serviceAccountJson = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
    if (serviceAccountJson) {
      initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), projectId });
    } else if (serviceAccountPath) {
      initializeApp({ credential: cert(JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'))), projectId });
    } else {
      initializeApp({ credential: applicationDefault(), projectId });
    }
  }
  return { db: getFirestore(), projectId };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readNumber(value, fallback, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

function publicGeofence(value) {
  const source = isRecord(value) ? value : {};
  return {
    enabled: source.enabled === true,
    lat: readNumber(source.lat, 10.8078, -90, 90),
    lng: readNumber(source.lng, 106.7, -180, 180),
    radiusMeters: readNumber(source.radiusMeters, 500, 50, 5000),
  };
}

function legacyPin(value) {
  return isRecord(value) && typeof value.pin === 'string' && value.pin.trim()
    ? value.pin.trim()
    : undefined;
}

async function hashPin(pin) {
  const salt = randomBytes(16);
  const derived = await scrypt(pin, salt, 64);
  return `scrypt-v1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function revision(data) {
  return Number.isSafeInteger(data?.configRevision) ? data.configRevision : 0;
}

function workflowStatusIds(value) {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.flatMap((item) => (
    isRecord(item) && typeof item.id === 'string' && item.id.trim()
      ? [item.id.trim()]
      : []
  )));
}

async function inspectLegacyRepairStatuses(db) {
  const [repairConfig, tickets] = await Promise.all([
    db.collection('system_config').doc('repairs').get(),
    db.collection('repairs').select('status', 'ticketType').get(),
  ]);
  const data = repairConfig.data() ?? {};
  const repairStatusIds = workflowStatusIds(data.repairStatuses);
  const warrantyStatusIds = workflowStatusIds(data.warrantyStatuses);
  const legacyStatusIds = workflowStatusIds(data.statuses);
  let missingStatusCount = 0;
  let unknownStatusCount = 0;
  let legacyOnlyStatusCount = 0;
  const samples = [];

  for (const ticket of tickets.docs) {
    const ticketData = ticket.data();
    const ticketType = ticketData.ticketType === 'warranty' ? 'warranty' : 'repair';
    const status = typeof ticketData.status === 'string' && ticketData.status.trim()
      ? ticketData.status.trim()
      : null;
    const configuredIds = ticketType === 'warranty' ? warrantyStatusIds : repairStatusIds;
    let reason;
    if (!status) {
      missingStatusCount += 1;
      reason = 'missing_status';
    } else if (!configuredIds.has(status)) {
      unknownStatusCount += 1;
      if (ticketType === 'repair' && legacyStatusIds.has(status)) {
        legacyOnlyStatusCount += 1;
        reason = 'legacy_only_status';
      } else {
        reason = 'status_not_in_active_workflow';
      }
    }
    if (reason && samples.length < 20) {
      samples.push({ id: ticket.id, ticketType, status, reason });
    }
  }

  return {
    hasLegacyStatuses: Array.isArray(data.statuses),
    repairStatusesCount: repairStatusIds.size,
    legacyStatusesCount: legacyStatusIds.size,
    scannedTickets: tickets.size,
    missingStatusCount,
    unknownStatusCount,
    legacyOnlyStatusCount,
    samples,
    safeToRemove: repairStatusIds.size > 0 && missingStatusCount === 0 && unknownStatusCount === 0,
  };
}

async function removeLegacyRepairStatuses(db) {
  return db.runTransaction(async (tx) => {
    const ref = db.collection('system_config').doc('repairs');
    const snapshot = await tx.get(ref);
    const data = snapshot.data() ?? {};
    if (!Array.isArray(data.statuses)) return { changed: false, reason: 'no_legacy_statuses' };
    if (workflowStatusIds(data.repairStatuses).size === 0) {
      throw new Error('Refusing to remove legacy statuses without a canonical repairStatuses workflow.');
    }

    tx.set(ref, {
      statuses: FieldValue.delete(),
      workflowSchemaVersion: 2,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'script:migrate-system-config',
    }, { merge: true });
    return { changed: true, removedLegacyStatuses: data.statuses.length };
  });
}

async function inspect(db) {
  const [main, layout, privateReview] = await db.getAll(
    db.collection('system_config').doc('main_settings'),
    db.collection('system_config').doc('layout_settings'),
    db.collection('private_config').doc('review_verification'),
  );
  const layoutGeofence = layout.data()?.geofence;
  const mainGeofence = main.data()?.geofence;
  const pin = legacyPin(layoutGeofence);
  const privateHash = privateReview.data()?.pinHash;
  const policy = publicGeofence(layoutGeofence);
  const hasLegacy = isRecord(layoutGeofence);
  const blocked = hasLegacy && !isRecord(mainGeofence) && policy.enabled && !pin && typeof privateHash !== 'string';
  return {
    refs: { main: main.ref, layout: layout.ref, privateReview: privateReview.ref },
    docs: { main: main.data(), layout: layout.data(), privateReview: privateReview.data() },
    hasLegacy,
    movePolicy: hasLegacy && !isRecord(mainGeofence),
    migratePin: Boolean(pin && typeof privateHash !== 'string'),
    deletePublicLegacy: hasLegacy,
    blocked,
    policy,
    pin,
  };
}

async function applyMigration(db) {
  return db.runTransaction(async (tx) => {
    const [main, layout, privateReview] = await Promise.all([
      tx.get(db.collection('system_config').doc('main_settings')),
      tx.get(db.collection('system_config').doc('layout_settings')),
      tx.get(db.collection('private_config').doc('review_verification')),
    ]);
    const layoutGeofence = layout.data()?.geofence;
    if (!isRecord(layoutGeofence)) return { changed: false, reason: 'no_legacy_geofence' };

    const existingMainPolicy = main.data()?.geofence;
    const existingHash = privateReview.data()?.pinHash;
    const pin = legacyPin(layoutGeofence);
    const policy = publicGeofence(layoutGeofence);
    if (!isRecord(existingMainPolicy) && policy.enabled && !pin && typeof existingHash !== 'string') {
      return { changed: false, reason: 'enabled_without_secret' };
    }

    const now = FieldValue.serverTimestamp();
    if (!isRecord(existingMainPolicy)) {
      tx.set(main.ref, {
        geofence: policy,
        configRevision: revision(main.data()) + 1,
        updatedAt: now,
        updatedBy: 'script:migrate-system-config',
      }, { merge: true });
    }
    if (pin && typeof existingHash !== 'string') {
      tx.set(privateReview.ref, {
        pinHash: await hashPin(pin),
        updatedAt: now,
        updatedBy: 'script:migrate-system-config',
      }, { merge: true });
    }
    tx.set(layout.ref, {
      geofence: FieldValue.delete(),
      configRevision: revision(layout.data()) + 1,
      updatedAt: now,
      updatedBy: 'script:migrate-system-config',
    }, { merge: true });

    return {
      changed: true,
      movedPolicy: !isRecord(existingMainPolicy),
      migratedPin: Boolean(pin && typeof existingHash !== 'string'),
    };
  });
}

async function main() {
  const args = readArgs(process.argv);
  if (args.get('help') === true) {
    process.stdout.write('Usage: node scripts/migrate-system-config.mjs [--project-id ID] [--service-account PATH] [--remove-legacy-repair-statuses] [--apply --confirm MIGRATE_SYSTEM_CONFIG_20260720]\n');
    return;
  }
  const apply = args.get('apply') === true;
  const shouldRemoveLegacyRepairStatuses = args.get('remove-legacy-repair-statuses') === true;
  if (apply && args.get('confirm') !== CONFIRMATION) {
    throw new Error(`Refusing to write. Re-run with --apply --confirm ${CONFIRMATION}`);
  }

  const { db, projectId } = await initDb(args);
  const before = await inspect(db);
  const repairLegacy = shouldRemoveLegacyRepairStatuses
    ? await inspectLegacyRepairStatuses(db)
    : undefined;
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    projectId,
    geofence: {
      legacyLayoutField: before.hasLegacy,
      policyWillMoveToMain: before.movePolicy,
      pinWillMoveToPrivateConfig: before.migratePin,
      publicLegacyFieldWillBeDeleted: before.deletePublicLegacy,
      blockedBecauseEnabledWithoutSecret: before.blocked,
    },
    ...(repairLegacy ? { repairWorkflow: repairLegacy } : {}),
  };

  if (apply && before.hasLegacy && !before.blocked) {
    report.result = await applyMigration(db);
  }
  if (apply && shouldRemoveLegacyRepairStatuses) {
    if (!repairLegacy?.safeToRemove) {
      throw new Error('Refusing to remove legacy repair statuses because active tickets are not fully covered by the canonical workflow.');
    }
    report.repairWorkflowResult = await removeLegacyRepairStatuses(db);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
