import fs from 'node:fs';
import path from 'node:path';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../src/lib/firebaseAdmin';
import {
    normalizeRepairWorkflow,
    normalizeWarrantyWorkflow,
    validateTrackingGroups,
    validateWorkflow,
} from '../src/lib/repairWorkflowConfig';
import type { TrackingGroup, WorkflowNode } from '../src/lib/types';

async function main() {
    const shouldApply = process.argv.includes('--apply');
    const db = getAdminDb();
    const ref = db.collection('system_config').doc('repairs');
    const snap = await ref.get();

    if (!snap.exists) throw new Error('Không tìm thấy system_config/repairs.');

    const data = snap.data() ?? {};
    const repairStatuses = normalizeRepairWorkflow(data.repairStatuses as WorkflowNode[] | undefined);
    const warrantyStatuses = normalizeWarrantyWorkflow(data.warrantyStatuses as WorkflowNode[] | undefined);
    const trackingGroups = (data.trackingGroups ?? []) as TrackingGroup[];
    const errors = [
        ...validateWorkflow(repairStatuses, 'Workflow sửa chữa'),
        ...validateWorkflow(warrantyStatuses, 'Workflow bảo hành'),
        ...validateTrackingGroups(trackingGroups, repairStatuses),
    ];

    if (errors.length > 0) throw new Error(errors.join('\n'));

    const changedRepairNodes = repairStatuses.filter((node, index) =>
        JSON.stringify(node) !== JSON.stringify(data.repairStatuses?.[index])
    ).map(node => node.id);
    const changedWarrantyNodes = warrantyStatuses.filter((node, index) =>
        JSON.stringify(node) !== JSON.stringify(data.warrantyStatuses?.[index])
    ).map(node => node.id);

    console.warn(JSON.stringify({
        mode: shouldApply ? 'apply' : 'dry-run',
        changedRepairNodes,
        changedWarrantyNodes,
        legacyStatusesPreserved: Array.isArray(data.statuses),
        repairStatusCount: repairStatuses.length,
        warrantyStatusCount: warrantyStatuses.length,
    }, null, 2));

    if (!shouldApply) return;

    const scratchDir = path.resolve(process.cwd(), 'scratch');
    fs.mkdirSync(scratchDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(scratchDir, `repair-workflow-before-v2-${stamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf8');

    await ref.set({
        repairStatuses,
        warrantyStatuses,
        workflowSchemaVersion: 2,
        workflowFeatureSemantics: 'exit-gates-v1',
        workflowMigratedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    console.warn(`Đã cập nhật Firestore. Backup: ${backupPath}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
