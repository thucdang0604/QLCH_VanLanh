import type { TrackingGroup, WarrantyRule, WorkflowNode } from '@/lib/types';
import {
    getWorkflowEntryNode,
    getWorkflowNormalizationOptions,
    normalizeRepairWorkflow,
    normalizeWarrantyWorkflow,
    validateTrackingGroups,
    validateWorkflow,
    WORKFLOW_SCHEMA_VERSION,
} from '@/lib/repairWorkflowConfig';

const WORKFLOW_ACTORS = new Set(['reception', 'technician', 'manager']);
const TERMINAL_ACTIONS = new Set(['handover', 'refund', 'close']);

export type WorkflowSaveContent = {
    repairStatuses: WorkflowNode[];
    warrantyStatuses: WorkflowNode[];
    repairEntryStatusId: string;
    warrantyEntryStatusId: string;
    trackingGroups: TrackingGroup[];
    warrantyRules: WarrantyRule[];
    warrantyNote: string;
    workflowSchemaVersion: number;
};

export type WorkflowBackup = WorkflowSaveContent & {
    id: string;
    createdAtMillis: number;
};

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function strings(value: unknown): string[] {
    return Array.isArray(value)
        ? [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
        : [];
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function coerceWorkflowNodes(value: unknown): WorkflowNode[] {
    if (!Array.isArray(value)) return [];

    return value.map((item) => {
        const raw = asRecord(item);
        const allowedNext = strings(raw.allowedNext);
        const rawActors = asRecord(raw.transitionActors);
        const transitionActors = Object.entries(rawActors).reduce<NonNullable<WorkflowNode['transitionActors']>>((result, [nextId, actors]) => {
            if (!allowedNext.includes(nextId)) return result;
            const validActors = strings(actors).filter((actor): actor is 'reception' | 'technician' | 'manager' => WORKFLOW_ACTORS.has(actor));
            if (validActors.length > 0) result[nextId] = validActors;
            return result;
        }, {});
        const terminalAction = text(raw.terminalAction);
        const node: WorkflowNode = {
            id: text(raw.id),
            label: text(raw.label),
            color: text(raw.color),
            allowedNext,
            allowedFeatures: strings(raw.allowedFeatures),
            isTerminal: raw.isTerminal === true,
        };

        if (Object.keys(transitionActors).length > 0) node.transitionActors = transitionActors;
        if (TERMINAL_ACTIONS.has(terminalAction)) node.terminalAction = terminalAction as NonNullable<WorkflowNode['terminalAction']>;
        return node;
    });
}

function coerceTrackingGroups(value: unknown): TrackingGroup[] {
    if (!Array.isArray(value)) return [];

    return value.map((item, index) => {
        const raw = asRecord(item);
        return {
            id: text(raw.id),
            name: text(raw.name),
            mappedStatuses: strings(raw.mappedStatuses),
            order: Number.isFinite(raw.order) ? Number(raw.order) : index,
            ...(raw.isTerminal === true ? { isTerminal: true } : {}),
        };
    }).sort((left, right) => left.order - right.order);
}

function coerceWarrantyRules(value: unknown): WarrantyRule[] {
    if (!Array.isArray(value)) return [];

    return value.map((item) => {
        const raw = asRecord(item);
        return {
            partType: text(raw.partType),
            warrantyMonths: Math.max(0, Number.isFinite(raw.warrantyMonths) ? Number(raw.warrantyMonths) : 0),
        };
    }).filter(rule => rule.partType.length > 0);
}

function resolveEntryStatusId(workflow: WorkflowNode[], candidate: unknown): string {
    const configured = text(candidate);
    const entry = getWorkflowEntryNode(workflow, configured);
    return entry?.id || '';
}

/** Converts untrusted client input into the exact, small document shape persisted to Firestore. */
export function buildWorkflowSaveContent(data: unknown): WorkflowSaveContent {
    const raw = asRecord(data);
    const persistenceOptions = { useLegacyFallback: false, useInboundArrivalFeatureFallback: false };
    const repairStatuses = normalizeRepairWorkflow(coerceWorkflowNodes(raw.repairStatuses ?? raw.statuses), persistenceOptions);
    const warrantyStatuses = normalizeWarrantyWorkflow(coerceWorkflowNodes(raw.warrantyStatuses), persistenceOptions);

    return {
        repairStatuses,
        warrantyStatuses,
        repairEntryStatusId: resolveEntryStatusId(repairStatuses, raw.repairEntryStatusId),
        warrantyEntryStatusId: resolveEntryStatusId(warrantyStatuses, raw.warrantyEntryStatusId),
        trackingGroups: coerceTrackingGroups(raw.trackingGroups).map((group, index) => ({ ...group, order: index })),
        warrantyRules: coerceWarrantyRules(raw.warrantyRules),
        warrantyNote: text(raw.warrantyNote),
        workflowSchemaVersion: WORKFLOW_SCHEMA_VERSION,
    };
}

/** Reads both legacy and current persisted layouts without rewriting data. */
export function getStoredWorkflowSaveContent(data: unknown): WorkflowSaveContent {
    const raw = asRecord(data);
    const normalizationOptions = getWorkflowNormalizationOptions(raw.workflowSchemaVersion);
    const repairStatuses = normalizeRepairWorkflow(
        coerceWorkflowNodes(Array.isArray(raw.repairStatuses) ? raw.repairStatuses : raw.statuses),
        normalizationOptions,
    );
    const warrantyStatuses = normalizeWarrantyWorkflow(coerceWorkflowNodes(raw.warrantyStatuses), normalizationOptions);

    return {
        repairStatuses,
        warrantyStatuses,
        repairEntryStatusId: resolveEntryStatusId(repairStatuses, raw.repairEntryStatusId),
        warrantyEntryStatusId: resolveEntryStatusId(warrantyStatuses, raw.warrantyEntryStatusId),
        trackingGroups: coerceTrackingGroups(raw.trackingGroups),
        warrantyRules: coerceWarrantyRules(raw.warrantyRules),
        warrantyNote: text(raw.warrantyNote),
        workflowSchemaVersion: WORKFLOW_SCHEMA_VERSION,
    };
}

export function isWorkflowBackup(value: unknown): value is WorkflowBackup {
    const raw = asRecord(value);
    return typeof raw.id === 'string'
        && typeof raw.createdAtMillis === 'number'
        && Array.isArray(raw.repairStatuses)
        && Array.isArray(raw.warrantyStatuses);
}

export function workflowContentsEqual(left: WorkflowSaveContent, right: WorkflowSaveContent): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function validateWorkflowSaveContent(content: WorkflowSaveContent): string[] {
    const errors = [
        ...validateWorkflow(content.repairStatuses, 'Workflow sửa chữa', content.repairEntryStatusId),
        ...validateWorkflow(content.warrantyStatuses, 'Workflow bảo hành', content.warrantyEntryStatusId),
        ...validateTrackingGroups(content.trackingGroups, content.repairStatuses),
    ];

    const repairIds = new Set(content.repairStatuses.map(node => node.id));
    const duplicateAcrossFlows = content.warrantyStatuses.find(node => repairIds.has(node.id));
    if (duplicateAcrossFlows) {
        errors.push(`ID trạng thái ${duplicateAcrossFlows.id} đang được dùng cho cả Sửa chữa và Bảo hành.`);
    }

    return errors;
}
