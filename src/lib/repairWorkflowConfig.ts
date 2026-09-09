import type { RepairWorkflowActor, WorkflowNode } from '@/lib/types';

export type RepairWorkflowSettings = {
    repairStatuses?: WorkflowNode[];
    warrantyStatuses?: WorkflowNode[];
    /** Explicit entry nodes keep display reordering from changing new-ticket behavior. */
    repairEntryStatusId?: string;
    warrantyEntryStatusId?: string;
    /** Monotonic audit value written when an administrator changes the workflow. */
    workflowRevision?: number;
    workflowSchemaVersion?: number;
};

export const WORKFLOW_SCHEMA_VERSION = 5;

export type WorkflowNormalizationOptions = {
    /**
     * Version-2 settings did not persist all feature semantics.  Keep this
     * only while reading them; saving from Settings writes the inferred values
     * explicitly as schema v4.
     */
    useLegacyFallback?: boolean;
    /**
     * Version-4 workflow documents predate the inbound-device gate. Infer it
     * only for the former default intake node until Settings saves the feature
     * explicitly to Firestore as schema v5.
     */
    useInboundArrivalFeatureFallback?: boolean;
};

const REQUIRED_REPAIR_FEATURES: Record<string, string[]> = {
    cho_tiep_nhan: ['allowAssignTech', 'requireAssignedTechnician'],
    dang_kiem_tra: ['requireChecklist', 'requireTechnicianNote', 'allowTechnicianDiagnosis'],
    bao_tinh_trang_va_gia: ['allowPartsSelection'],
    dang_tim_linh_kien: ['allowPartsSelection'],
    da_dat_linh_kien: ['requirePartsReady'],
    dang_sua_chua: ['requireTechnicianNote', 'reserveSelectedParts', 'countsAsActiveRepair'],
    cho_ban_giao_khach: ['requirePaymentGate', 'consumeSelectedParts'],
    done: ['enableTechnicianCommission', 'enableSellerCommission', 'recordCompletion'],
    refund: ['releaseHeldParts'],
};

const REQUIRED_WARRANTY_FEATURES: Record<string, string[]> = {
    bh_tiep_nhan: ['allowAssignTech', 'requireAssignedTechnician'],
    bh_dang_kiem_tra: ['requireChecklist', 'requireTechnicianNote', 'allowTechnicianDiagnosis'],
    bh_dang_sua: ['allowPartsSelection', 'reserveSelectedParts'],
    bh_hoan_tat: ['recordCompletion'],
    bh_refund: ['enableTechnicianCommission', 'releaseHeldParts'],
};

const LEGACY_INBOUND_ARRIVAL_FEATURES: Record<string, string[]> = {
    cho_tiep_nhan: ['requireInboundArrival'],
};

const LEGACY_TERMINAL_ACTIONS: Record<string, NonNullable<WorkflowNode['terminalAction']>> = {
    out: 'handover',
    refund: 'refund',
    bh_hoan_tat: 'handover',
    bh_tu_choi: 'handover',
    bh_refund: 'refund',
};

function unique(values: string[] | undefined): string[] {
    return [...new Set((values ?? []).filter(Boolean))];
}

const WORKFLOW_ACTORS: RepairWorkflowActor[] = ['reception', 'technician', 'manager'];

function normalizeTransitionActors(node: WorkflowNode, allowedNext: string[]) {
    const configured = node.transitionActors;
    if (!configured || typeof configured !== 'object') return undefined;

    const normalized = Object.entries(configured).reduce<Partial<Record<string, RepairWorkflowActor[]>>>((result, [nextId, actors]) => {
        if (!allowedNext.includes(nextId) || !Array.isArray(actors)) return result;
        const validActors = [...new Set(actors.filter((actor): actor is RepairWorkflowActor => WORKFLOW_ACTORS.includes(actor as RepairWorkflowActor)))];
        if (validActors.length > 0) result[nextId] = validActors;
        return result;
    }, {});

    return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeNodes(
    workflow: WorkflowNode[] | undefined,
    requiredFeatures: Record<string, string[]>,
    options: WorkflowNormalizationOptions = {},
): WorkflowNode[] {
    if (!Array.isArray(workflow)) return [];

    return workflow.map(node => {
        const terminalAction = node.terminalAction
            ?? (options.useLegacyFallback !== false ? LEGACY_TERMINAL_ACTIONS[node.id] : undefined);
        const allowedNext = unique(node.allowedNext);
        const normalized: WorkflowNode = {
            id: node.id,
            label: node.label,
            color: node.color,
            allowedNext,
            allowedFeatures: unique([
                ...(node.allowedFeatures ?? []),
                ...(options.useLegacyFallback === true ? (requiredFeatures[node.id] ?? []) : []),
                ...(options.useInboundArrivalFeatureFallback === true ? (LEGACY_INBOUND_ARRIVAL_FEATURES[node.id] ?? []) : []),
            ]),
            isTerminal: node.isTerminal === true,
        };

        // Firestore rejects undefined field values.  Omit optional semantics
        // entirely until the administrator has explicitly configured them.
        if (terminalAction) normalized.terminalAction = terminalAction;
        const transitionActors = normalizeTransitionActors(node, allowedNext);
        if (transitionActors) normalized.transitionActors = transitionActors;
        if (typeof node.next === 'string') normalized.next = node.next;
        return normalized;
    });
}

export function normalizeRepairWorkflow(workflow: WorkflowNode[] | undefined, options?: WorkflowNormalizationOptions): WorkflowNode[] {
    return normalizeNodes(workflow, REQUIRED_REPAIR_FEATURES, options);
}

export function normalizeWarrantyWorkflow(workflow: WorkflowNode[] | undefined, options?: WorkflowNormalizationOptions): WorkflowNode[] {
    return normalizeNodes(workflow, REQUIRED_WARRANTY_FEATURES, options);
}

export function getWorkflowNormalizationOptions(schemaVersion: unknown): WorkflowNormalizationOptions {
    const version = typeof schemaVersion === 'number' ? schemaVersion : 0;
    return {
        useLegacyFallback: version < 4,
        useInboundArrivalFeatureFallback: version < WORKFLOW_SCHEMA_VERSION,
    };
}

export function getConfiguredWorkflow(
    settings: RepairWorkflowSettings,
    ticketType: 'repair' | 'warranty' | undefined
): WorkflowNode[] {
    const options = getWorkflowNormalizationOptions(settings.workflowSchemaVersion);
    return ticketType === 'warranty'
        ? normalizeWarrantyWorkflow(settings.warrantyStatuses, options)
        : normalizeRepairWorkflow(settings.repairStatuses, options);
}

/**
 * The entry step is business configuration, not the visual order of cards in
 * Settings. Older documents have no explicit value, so retain their first
 * node as the backwards-compatible entry point.
 */
export function getWorkflowEntryNode(
    workflow: WorkflowNode[],
    configuredEntryStatusId?: string,
): WorkflowNode | undefined {
    const entryId = configuredEntryStatusId?.trim();
    if (entryId) return workflow.find(node => node.id === entryId);
    return workflow[0];
}

export function getConfiguredWorkflowEntryNode(
    settings: RepairWorkflowSettings,
    ticketType: 'repair' | 'warranty' | undefined,
): WorkflowNode | undefined {
    const workflow = getConfiguredWorkflow(settings, ticketType);
    return getWorkflowEntryNode(
        workflow,
        ticketType === 'warranty' ? settings.warrantyEntryStatusId : settings.repairEntryStatusId,
    );
}

/**
 * Resolves only real, configured outgoing transitions for a workflow node.
 * Invalid, duplicate and self-referential IDs are ignored defensively so the UI
 * can never offer a transition back to the ticket's current status.
 */
export function getAllowedNextWorkflowNodes(
    workflow: WorkflowNode[],
    currentStatusId: string,
): WorkflowNode[] {
    const currentNode = workflow.find((node) => node.id === currentStatusId);
    if (!currentNode) return [];

    const nodesById = new Map(workflow.map((node) => [node.id, node]));
    return unique(currentNode.allowedNext)
        .filter((nextId) => nextId !== currentStatusId)
        .map((nextId) => nodesById.get(nextId))
        .filter((node): node is WorkflowNode => Boolean(node));
}

/**
 * Resolves the first non-terminal branch from a workflow node. The technician
 * screen uses this for the single "Bắt đầu kiểm tra" action at intake, without
 * coupling the behavior to a particular status id or display label.
 */
export function getFirstNonTerminalWorkflowTransition(
    workflow: WorkflowNode[],
    currentStatusId: string,
): WorkflowNode | undefined {
    return getAllowedNextWorkflowNodes(workflow, currentStatusId)
        .find(node => !node.isTerminal);
}

/**
 * End-node business semantics are stored in `terminalAction`, never inferred
 * from an arbitrary status ID chosen by an administrator.
 */
export function isHandoverTerminalAction(action: WorkflowNode['terminalAction'] | undefined): boolean {
    return action === 'handover' || action === 'refund';
}

export function canTransitionDirectlyToTerminal(node: WorkflowNode): boolean {
    return node.isTerminal !== true || node.terminalAction === 'close';
}

export function validateWorkflow(workflow: WorkflowNode[], name: string, entryStatusId?: string): string[] {
    const errors: string[] = [];
    if (workflow.length === 0) return [`${name} chưa có trạng thái nào.`];

    const ids = workflow.map(node => node.id.trim());
    const idSet = new Set(ids);

    if (ids.some(id => !id)) errors.push(`${name} có trạng thái thiếu ID.`);
    if (idSet.size !== ids.length) errors.push(`${name} có ID trạng thái bị trùng.`);
    if (!workflow.some(node => node.isTerminal)) errors.push(`${name} cần ít nhất một trạng thái kết thúc.`);
    const entryNode = getWorkflowEntryNode(workflow, entryStatusId);
    if (!entryNode) {
        errors.push(`${name} chưa chọn trạng thái bắt đầu.`);
    } else if (entryNode.isTerminal) {
        errors.push(`${name} không thể bắt đầu bằng trạng thái kết thúc.`);
    }

    for (const node of workflow) {
        if (!node.label.trim()) errors.push(`Trạng thái ${node.id || '(thiếu ID)'} chưa có tên hiển thị.`);
        if (node.allowedNext.includes(node.id)) errors.push(`Trạng thái ${node.id} không thể tự chuyển đến chính nó.`);
        for (const nextId of node.allowedNext) {
            if (!idSet.has(nextId)) errors.push(`Trạng thái ${node.id} trỏ tới ${nextId} không tồn tại.`);
        }
        if (node.isTerminal && node.allowedNext.length > 0) {
            errors.push(`Trạng thái kết thúc ${node.id} không được có bước tiếp theo.`);
        }
        if (node.terminalAction && !node.isTerminal) {
            errors.push(`Trạng thái ${node.id} có hành động kết thúc nhưng chưa được đánh dấu là điểm kết thúc.`);
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
