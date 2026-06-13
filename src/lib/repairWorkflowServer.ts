import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { RepairTicket, WorkflowNode } from '@/lib/types';
import {
    getConfiguredWorkflow,
    type RepairWorkflowSettings,
    validateWorkflow,
} from '@/lib/repairWorkflowConfig';

export function getWorkflowFromSettings(
    settings: RepairWorkflowSettings,
    ticket: Pick<RepairTicket, 'ticketType'>
): WorkflowNode[] {
    const workflow = getConfiguredWorkflow(settings, ticket.ticketType);

    if (!Array.isArray(workflow) || workflow.length === 0) {
        throw new Error('Chưa cấu hình workflow sửa chữa trong Cài đặt > Repairs.');
    }

    const errors = validateWorkflow(workflow, ticket.ticketType === 'warranty' ? 'Workflow bảo hành' : 'Workflow sửa chữa');
    if (errors.length > 0) {
        throw new Error(`Cấu hình workflow không hợp lệ: ${errors.join(' ')}`);
    }

    return workflow;
}

export async function loadRepairWorkflow(
    tx: Transaction,
    db: Firestore,
    ticket: Pick<RepairTicket, 'ticketType'>
): Promise<WorkflowNode[]> {
    const snap = await tx.get(db.collection('system_config').doc('repairs'));
    if (!snap.exists) {
        throw new Error('Không tìm thấy cấu hình workflow sửa chữa trong Firebase.');
    }

    return getWorkflowFromSettings((snap.data() ?? {}) as RepairWorkflowSettings, ticket);
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
