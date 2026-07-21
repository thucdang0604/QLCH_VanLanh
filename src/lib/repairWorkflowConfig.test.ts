import assert from 'node:assert/strict';
import test from 'node:test';
import { getAllowedNextWorkflowNodes } from './repairWorkflowConfig';

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
