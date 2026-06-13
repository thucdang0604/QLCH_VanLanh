import type { WorkflowNode } from '@/lib/types';

export type RepairWorkflowSettings = {
    repairStatuses?: WorkflowNode[];
    warrantyStatuses?: WorkflowNode[];
};

const REQUIRED_REPAIR_FEATURES: Record<string, string[]> = {
    cho_tiep_nhan: ['allowAssignTech', 'requireChecklist', 'requireAssignedTechnician'],
    dang_kiem_tra: ['requireChecklist', 'requireTechnicianNote'],
    bao_tinh_trang_va_gia: ['allowPartsSelection'],
    dang_tim_linh_kien: ['allowPartsSelection'],
    da_dat_linh_kien: ['requirePartsReady'],
    dang_sua_chua: ['requireTechnicianNote'],
    cho_ban_giao_khach: ['requirePaymentGate'],
    done: ['enableTechnicianCommission', 'enableSellerCommission'],
};

const REQUIRED_WARRANTY_FEATURES: Record<string, string[]> = {
    bh_tiep_nhan: ['allowAssignTech', 'requireAssignedTechnician'],
    bh_dang_kiem_tra: ['requireChecklist', 'requireTechnicianNote'],
    bh_dang_sua: ['allowPartsSelection'],
    bh_refund: ['enableTechnicianCommission'],
};

function unique(values: string[] | undefined): string[] {
    return [...new Set((values ?? []).filter(Boolean))];
}

function normalizeNodes(
    workflow: WorkflowNode[] | undefined,
    requiredFeatures: Record<string, string[]>
): WorkflowNode[] {
    if (!Array.isArray(workflow)) return [];

    return workflow.map(node => {
        const normalized: WorkflowNode = {
            id: node.id,
            label: node.label,
            color: node.color,
            allowedNext: unique(node.allowedNext),
            allowedFeatures: unique([
                ...(node.allowedFeatures ?? []),
                ...(requiredFeatures[node.id] ?? []),
            ]),
            isTerminal: node.isTerminal === true,
        };

        if (typeof node.next === 'string') normalized.next = node.next;
        return normalized;
    });
}

export function normalizeRepairWorkflow(workflow: WorkflowNode[] | undefined): WorkflowNode[] {
    return normalizeNodes(workflow, REQUIRED_REPAIR_FEATURES);
}

export function normalizeWarrantyWorkflow(workflow: WorkflowNode[] | undefined): WorkflowNode[] {
    return normalizeNodes(workflow, REQUIRED_WARRANTY_FEATURES);
}

export function getConfiguredWorkflow(
    settings: RepairWorkflowSettings,
    ticketType: 'repair' | 'warranty' | undefined
): WorkflowNode[] {
    return ticketType === 'warranty'
        ? normalizeWarrantyWorkflow(settings.warrantyStatuses)
        : normalizeRepairWorkflow(settings.repairStatuses);
}

export function validateWorkflow(workflow: WorkflowNode[], name: string): string[] {
    const errors: string[] = [];
    if (workflow.length === 0) return [`${name} chưa có trạng thái nào.`];

    const ids = workflow.map(node => node.id.trim());
    const idSet = new Set(ids);

    if (ids.some(id => !id)) errors.push(`${name} có trạng thái thiếu ID.`);
    if (idSet.size !== ids.length) errors.push(`${name} có ID trạng thái bị trùng.`);
    if (!workflow.some(node => node.isTerminal)) errors.push(`${name} cần ít nhất một trạng thái kết thúc.`);
    if (workflow[0]?.isTerminal) errors.push(`${name} không thể bắt đầu bằng trạng thái kết thúc.`);

    for (const node of workflow) {
        if (!node.label.trim()) errors.push(`Trạng thái ${node.id || '(thiếu ID)'} chưa có tên hiển thị.`);
        if (node.allowedNext.includes(node.id)) errors.push(`Trạng thái ${node.id} không thể tự chuyển đến chính nó.`);
        for (const nextId of node.allowedNext) {
            if (!idSet.has(nextId)) errors.push(`Trạng thái ${node.id} trỏ tới ${nextId} không tồn tại.`);
        }
        if (node.isTerminal && node.allowedNext.length > 0) {
            errors.push(`Trạng thái kết thúc ${node.id} không được có bước tiếp theo.`);
        }
    }

    return errors;
}

export function validateTrackingGroups(
    groups: { name: string; mappedStatuses: string[] }[],
    repairWorkflow: WorkflowNode[]
): string[] {
    const errors: string[] = [];
    const validIds = new Set(repairWorkflow.map(node => node.id));
    const mapped = new Set<string>();

    for (const group of groups) {
        if (!group.name.trim()) errors.push('Có nhóm tra cứu chưa có tên.');
        for (const statusId of group.mappedStatuses) {
            if (!validIds.has(statusId)) errors.push(`Nhóm ${group.name} chứa trạng thái ${statusId} không tồn tại.`);
            if (mapped.has(statusId)) errors.push(`Trạng thái ${statusId} đang nằm trong nhiều nhóm tra cứu.`);
            mapped.add(statusId);
        }
    }

    return errors;
}
