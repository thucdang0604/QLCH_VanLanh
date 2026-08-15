import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canTransitionDirectlyToTerminal,
    getAllowedNextWorkflowNodes,
    getConfiguredWorkflow,
    isHandoverTerminalAction,
} from './repairWorkflowConfig';

const workflow = [
    { id: 'bao_gia', label: 'Báo giá', color: '', allowedNext: ['dang_sua', 'bao_gia', 'missing', 'dang_sua'] },
    { id: 'dang_sua', label: 'Đang sửa chữa', color: '', allowedNext: ['cho_ban_giao'] },
    { id: 'cho_ban_giao', label: 'Chờ bàn giao khách', color: '', allowedNext: [] },
];

test('returns only configured outgoing workflow nodes and never the current node', () => {
    assert.deepEqual(
        getAllowedNextWorkflowNodes(workflow, 'bao_gia').map((node) => node.id),
        ['dang_sua'],
    );
});

test('returns the configured next status for an in-progress repair', () => {
    assert.deepEqual(
        getAllowedNextWorkflowNodes(workflow, 'dang_sua').map((node) => node.id),
        ['cho_ban_giao'],
    );
});

test('migrates legacy terminal semantics without relying on them after schema v3 is saved', () => {
    const repairStatuses = [
        { id: 'dang_sua_chua', label: 'Đang sửa', color: '', allowedNext: ['out'] },
        { id: 'out', label: 'Trả máy', color: '', allowedNext: [], isTerminal: true },
    ];

    const legacy = getConfiguredWorkflow({ repairStatuses, workflowSchemaVersion: 2 }, 'repair');
    assert.equal(legacy[0].allowedFeatures?.includes('countsAsActiveRepair'), true);
    assert.equal(legacy[1].terminalAction, 'handover');

    const v3 = getConfiguredWorkflow({ repairStatuses, workflowSchemaVersion: 3 }, 'repair');
    assert.equal(v3[0].allowedFeatures?.includes('countsAsActiveRepair'), false);
    assert.equal(v3[1].terminalAction, undefined);
    assert.equal(Object.hasOwn(v3[1], 'terminalAction'), false);
});

test('keeps explicit v3 node capabilities when status IDs are entirely custom', () => {
    const repairStatuses = [
        { id: 'intake_custom', label: 'Nhận máy', color: '', allowedNext: ['return_custom'] },
        {
            id: 'return_custom',
            label: 'Đã giao',
            color: '',
            allowedNext: [],
            isTerminal: true,
            terminalAction: 'handover' as const,
            allowedFeatures: ['recordCompletion'],
        },
    ];

    const workflowV3 = getConfiguredWorkflow({ repairStatuses, workflowSchemaVersion: 3 }, 'repair');
    assert.equal(workflowV3[1].terminalAction, 'handover');
    assert.equal(workflowV3[1].allowedFeatures?.includes('recordCompletion'), true);
});

test('uses terminalAction rather than status IDs to choose direct and handover exits', () => {
    const closeNode = { id: 'archive_custom', label: 'Lưu trữ', color: '', allowedNext: [], isTerminal: true, terminalAction: 'close' as const };
    const handoverNode = { id: 'return_custom', label: 'Bàn giao', color: '', allowedNext: [], isTerminal: true, terminalAction: 'handover' as const };
    const refundNode = { id: 'refund_custom', label: 'Hoàn phí', color: '', allowedNext: [], isTerminal: true, terminalAction: 'refund' as const };

    assert.equal(canTransitionDirectlyToTerminal(closeNode), true);
    assert.equal(canTransitionDirectlyToTerminal(handoverNode), false);
    assert.equal(canTransitionDirectlyToTerminal(refundNode), false);
    assert.equal(isHandoverTerminalAction(handoverNode.terminalAction), true);
    assert.equal(isHandoverTerminalAction(refundNode.terminalAction), true);
    assert.equal(isHandoverTerminalAction(closeNode.terminalAction), false);
});
