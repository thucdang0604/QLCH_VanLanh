import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { RepairTicket, WorkflowNode } from '@/lib/types';
import {
    getConfiguredWorkflowEntryNode,
    getConfiguredWorkflow,
    type RepairWorkflowSettings,
    validateWorkflow,
} from '@/lib/repairWorkflowConfig';

export type LoadedRepairWorkflow = {
    workflow: WorkflowNode[];
    entryNode: WorkflowNode;
    revision: number;
};

export function getWorkflowFromSettings(
    settings: RepairWorkflowSettings,
    ticket: Pick<RepairTicket, 'ticketType'>
): WorkflowNode[] {
    const workflow = getConfiguredWorkflow(settings, ticket.ticketType);

    if (!Array.isArray(workflow) || workflow.length === 0) {
        throw new Error('Chưa cấu hình workflow sửa chữa trong Cài đặt > Repairs.');
    }

    const entryNode = getConfiguredWorkflowEntryNode(settings, ticket.ticketType);
    const errors = validateWorkflow(
        workflow,
        ticket.ticketType === 'warranty' ? 'Workflow bảo hành' : 'Workflow sửa chữa',
        entryNode?.id,
    );
    if (errors.length > 0) {
        throw new Error(`Cấu hình workflow không hợp lệ: ${errors.join(' ')}`);
    }

    return workflow;
}

export function getLoadedWorkflowFromSettings(
    settings: RepairWorkflowSettings,
    ticket: Pick<RepairTicket, 'ticketType'>,
): LoadedRepairWorkflow {
    const workflow = getWorkflowFromSettings(settings, ticket);
    const entryNode = getConfiguredWorkflowEntryNode(settings, ticket.ticketType);
    if (!entryNode) {
        throw new Error('Không tìm thấy trạng thái bắt đầu trong workflow đã cấu hình.');
    }

    return {
        workflow,
        entryNode,
        revision: Number.isSafeInteger(settings.workflowRevision) && Number(settings.workflowRevision) >= 0
            ? Number(settings.workflowRevision)
            : 0,
    };
}

export async function loadRepairWorkflowDefinition(
    tx: Transaction,
    db: Firestore,
    ticket: Pick<RepairTicket, 'ticketType'>,
): Promise<LoadedRepairWorkflow> {
    const snap = await tx.get(db.collection('system_config').doc('repairs'));
    if (!snap.exists) {
        throw new Error('Không tìm thấy cấu hình workflow sửa chữa trong Firebase.');
    }

    return getLoadedWorkflowFromSettings((snap.data() ?? {}) as RepairWorkflowSettings, ticket);
}

export async function loadRepairWorkflow(
    tx: Transaction,
    db: Firestore,
    ticket: Pick<RepairTicket, 'ticketType'>
): Promise<WorkflowNode[]> {
    return (await loadRepairWorkflowDefinition(tx, db, ticket)).workflow;
}

export function requireWorkflowNode(workflow: WorkflowNode[], status: string): WorkflowNode {
    const node = workflow.find(item => item.id === status);
    if (!node) {
        throw new Error(`Trạng thái ${status} không tồn tại trong workflow đã cấu hình.`);
    }
    return node;
}

export function workflowNodeHasFeature(node: WorkflowNode, featureId: string): boolean {
    return node.allowedFeatures?.includes(featureId) ?? false;
}
