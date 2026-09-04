import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canTransitionDirectlyToTerminal,
    getFirstNonTerminalWorkflowTransition,
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

test('selects the first non-terminal transition for the technician intake action', () => {
    const intakeWorkflow = [
        { id: 'intake', label: 'Chờ tiếp nhận', color: '', allowedNext: ['return', 'inspect'] },
        { id: 'return', label: 'Trả máy', color: '', allowedNext: [], isTerminal: true, terminalAction: 'handover' as const },
        { id: 'inspect', label: 'Đang kiểm tra', color: '', allowedNext: [] },
    ];

    assert.equal(getFirstNonTerminalWorkflowTransition(intakeWorkflow, 'intake')?.id, 'inspect');
});

test('migrates legacy semantics without relying on them after schema v4 is saved', () => {
    const repairStatuses = [
        { id: 'dang_sua_chua', label: 'Đang sửa', color: '', allowedNext: ['out'] },
        { id: 'out', label: 'Trả máy', color: '', allowedNext: [], isTerminal: true },
    ];

    const legacy = getConfiguredWorkflow({ repairStatuses, workflowSchemaVersion: 2 }, 'repair');
    assert.equal(legacy[0].allowedFeatures?.includes('countsAsActiveRepair'), true);
    assert.equal(legacy[1].terminalAction, 'handover');

    const v4 = getConfiguredWorkflow({ repairStatuses, workflowSchemaVersion: 4 }, 'repair');
    assert.equal(v4[0].allowedFeatures?.includes('countsAsActiveRepair'), false);
    assert.equal(v4[1].terminalAction, undefined);
    assert.equal(Object.hasOwn(v4[1], 'terminalAction'), false);
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

test('migrates the KTV diagnosis capability for old inspection workflow documents only', () => {
    const repairStatuses = [{
        id: 'dang_kiem_tra', label: 'Đang kiểm tra', color: '', allowedNext: [],
        allowedFeatures: ['requireChecklist', 'requireTechnicianNote'],
    }];
    const oldWorkflow = getConfiguredWorkflow({ repairStatuses, workflowSchemaVersion: 3 }, 'repair');
    assert.equal(oldWorkflow[0].allowedFeatures?.includes('allowTechnicianDiagnosis'), true);
    const v4Workflow = getConfiguredWorkflow({ repairStatuses, workflowSchemaVersion: 4 }, 'repair');
    assert.equal(v4Workflow[0].allowedFeatures?.includes('allowTechnicianDiagnosis'), false);
});

test('migrates the inbound-arrival gate from schema v4, then honors the persisted feature in schema v5', () => {
    const repairStatuses = [{
        id: 'cho_tiep_nhan', label: 'Chờ tiếp nhận', color: '', allowedNext: ['dang_kiem_tra'],
    }];

    const v4Workflow = getConfiguredWorkflow({ repairStatuses, workflowSchemaVersion: 4 }, 'repair');
    assert.equal(v4Workflow[0].allowedFeatures?.includes('requireInboundArrival'), true);

    const v5Workflow = getConfiguredWorkflow({ repairStatuses, workflowSchemaVersion: 5 }, 'repair');
    assert.equal(v5Workflow[0].allowedFeatures?.includes('requireInboundArrival'), false);

    const explicitV5Workflow = getConfiguredWorkflow({
        repairStatuses: [{ ...repairStatuses[0], allowedFeatures: ['requireInboundArrival'] }],
        workflowSchemaVersion: 5,
    }, 'repair');
    assert.equal(explicitV5Workflow[0].allowedFeatures?.includes('requireInboundArrival'), true);
});

test('keeps actor permissions only for real configured outgoing transitions', () => {
    const configured = getConfiguredWorkflow({
        workflowSchemaVersion: 3,
        repairStatuses: [{
            id: 'wait_customer',
            label: 'Đợi khách',
            color: '',
            allowedNext: ['approved'],
            transitionActors: {
                approved: ['reception', 'manager'],
                missing: ['technician'],
            },
        }, {
            id: 'approved',
            label: 'Khách duyệt',
            color: '',
            allowedNext: [],
            isTerminal: true,
            terminalAction: 'close',
        }],
    }, 'repair');

    assert.deepEqual(configured[0].transitionActors, { approved: ['reception', 'manager'] });
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
