import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import {
    buildWorkflowSaveContent,
    getStoredWorkflowSaveContent,
    isWorkflowBackup,
    validateWorkflowSaveContent,
    workflowContentsEqual,
    type WorkflowBackup,
} from '@/lib/repairWorkflowAdmin';

const WORKFLOW_BACKUP_LIMIT = 5;
const FIRESTORE_IN_QUERY_LIMIT = 30;

type WorkflowSaveRequest = Record<string, unknown> & {
    expectedWorkflowRevision?: unknown;
};

function revisionOf(value: unknown): number {
    return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function removedActiveStatusIds(
    previous: ReturnType<typeof getStoredWorkflowSaveContent>,
    next: ReturnType<typeof buildWorkflowSaveContent>,
): string[] {
    const nextIds = new Set([
        ...next.repairStatuses.map(node => node.id),
        ...next.warrantyStatuses.map(node => node.id),
    ]);

    return [...previous.repairStatuses, ...previous.warrantyStatuses]
        .filter(node => !node.isTerminal && !nextIds.has(node.id))
        .map(node => node.id);
}

async function findOpenTicketUsingRemovedStatus(
    tx: Transaction,
    db: Firestore,
    statusIds: string[],
): Promise<{ id: string; status: string } | null> {
    for (let index = 0; index < statusIds.length; index += FIRESTORE_IN_QUERY_LIMIT) {
        const ids = statusIds.slice(index, index + FIRESTORE_IN_QUERY_LIMIT);
        if (ids.length === 0) continue;
        const snapshot = await tx.get(db.collection('repairs').where('status', 'in', ids).limit(1));
        const ticket = snapshot.docs[0];
        if (ticket) {
            return { id: ticket.id, status: String(ticket.data().status || '') };
        }
    }
    return null;
}

export const POST = withApi({
    name: 'admin/repairs/workflow',
    onError: (error, context) => context.error(getApiErrorMessage(error, 'Không thể lưu workflow sửa chữa.'), getApiErrorStatus(error, 400)),
}, async (request: NextRequest, context) => {
    const caller = await requirePermission(request, 'manage_settings');
    const body = await context.readJson<WorkflowSaveRequest>(request);
    const nextContent = buildWorkflowSaveContent(body);
    const validationErrors = validateWorkflowSaveContent(nextContent);
    if (validationErrors.length > 0) {
        return context.error(validationErrors[0], 400);
    }

    const db = getAdminDb();
    const result = await db.runTransaction(async (tx) => {
        const configRef = db.collection('system_config').doc('repairs');
        const configSnap = await tx.get(configRef);
        const configData = configSnap.data() ?? {};
        const currentRevision = revisionOf(configData.workflowRevision);
        const expectedRevision = revisionOf(body.expectedWorkflowRevision);

        if (body.expectedWorkflowRevision !== undefined && expectedRevision !== currentRevision) {
            throw new Error('Workflow đã được người khác cập nhật. Vui lòng tải lại Cài đặt trước khi lưu.');
        }

        const currentContent = getStoredWorkflowSaveContent(configData);
        const changed = !configSnap.exists || !workflowContentsEqual(currentContent, nextContent);
        if (!changed) {
            return {
                changed: false,
                workflowRevision: currentRevision,
                workflowBackups: Array.isArray(configData.workflowBackups)
                    ? configData.workflowBackups.filter(isWorkflowBackup).slice(0, WORKFLOW_BACKUP_LIMIT)
                    : [],
            };
        }

        const conflict = await findOpenTicketUsingRemovedStatus(
            tx,
            db,
            removedActiveStatusIds(currentContent, nextContent),
        );
        if (conflict) {
            throw new Error(`Không thể xóa trạng thái ${conflict.status} vì phiếu đang xử lý #${conflict.id.slice(-6).toUpperCase()} vẫn sử dụng trạng thái này.`);
        }

        const existingBackups = Array.isArray(configData.workflowBackups)
            ? configData.workflowBackups.filter(isWorkflowBackup)
            : [];
        const workflowBackups: WorkflowBackup[] = configSnap.exists
            ? [{
                id: `workflow_${Date.now()}`,
                createdAtMillis: Date.now(),
                ...currentContent,
            }, ...existingBackups].slice(0, WORKFLOW_BACKUP_LIMIT)
            : existingBackups.slice(0, WORKFLOW_BACKUP_LIMIT);
        const workflowRevision = currentRevision + 1;

        tx.set(configRef, {
            ...nextContent,
            workflowFeatureSemantics: 'node-capabilities-v2',
            workflowBackups,
            workflowRevision,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.create(db.collection('workflow_audit_logs').doc(), {
            action: 'workflow_saved',
            actorId: caller.uid,
            actorName: caller.displayName || caller.name || caller.uid,
            workflowRevision,
            repairEntryStatusId: nextContent.repairEntryStatusId,
            warrantyEntryStatusId: nextContent.warrantyEntryStatusId,
            updatedAt: FieldValue.serverTimestamp(),
        });

        return { changed: true, workflowRevision, workflowBackups };
    });

    return context.json({ success: true, ...result });
});
