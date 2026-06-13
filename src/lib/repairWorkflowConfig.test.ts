import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkflowNode } from './types';
import {
    normalizeRepairWorkflow,
    validateTrackingGroups,
    validateWorkflow,
} from './repairWorkflowConfig';

const workflow: WorkflowNode[] = [
    {
        id: 'cho_tiep_nhan',
        label: 'Chờ tiếp nhận',
        color: 'yellow',
        allowedNext: ['dang_kiem_tra', 'dang_kiem_tra'],
        allowedFeatures: ['allowAssignTech'],
    },
    {
        id: 'dang_kiem_tra',
        label: 'Đang kiểm tra',
        color: 'blue',
        allowedNext: ['done'],
    },
    {
        id: 'done',
        label: 'Hoàn tất',
        color: 'green',
        allowedNext: [],
        isTerminal: true,
    },
];

test('normalizer keeps graph and adds required workflow gates', () => {
    const normalized = normalizeRepairWorkflow(workflow);
    assert.deepEqual(normalized[0].allowedNext, ['dang_kiem_tra']);
    assert.ok(normalized[0].allowedFeatures?.includes('requireAssignedTechnician'));
    assert.ok(normalized[0].allowedFeatures?.includes('requireChecklist'));
    assert.ok(normalized[1].allowedFeatures?.includes('requireTechnicianNote'));
});

test('validator rejects broken transitions and terminal nodes with outgoing edges', () => {
    const invalid = normalizeRepairWorkflow(workflow).map(node =>
        node.id === 'done' ? { ...node, allowedNext: ['missing'] } : node
    );
    const errors = validateWorkflow(invalid, 'Workflow sửa chữa');
    assert.ok(errors.some(error => error.includes('không tồn tại')));
    assert.ok(errors.some(error => error.includes('không được có bước tiếp theo')));
});

test('tracking group validator rejects duplicate mappings', () => {
    const errors = validateTrackingGroups([
        { name: 'Một', mappedStatuses: ['cho_tiep_nhan'] },
        { name: 'Hai', mappedStatuses: ['cho_tiep_nhan'] },
    ], workflow);
    assert.ok(errors.some(error => error.includes('nhiều nhóm')));
});
