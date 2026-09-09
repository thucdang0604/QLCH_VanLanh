import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildWorkflowSaveContent,
    validateWorkflowSaveContent,
} from './repairWorkflowAdmin';

const baseInput = {
    repairStatuses: [
        { id: 'intake', label: 'Tiếp nhận', color: 'bg-yellow-100', allowedNext: ['inspect'] },
        { id: 'inspect', label: 'Kiểm tra', color: 'bg-blue-100', allowedNext: ['done'] },
        { id: 'done', label: 'Hoàn tất', color: 'bg-green-100', allowedNext: [], isTerminal: true, terminalAction: 'close' },
    ],
    warrantyStatuses: [
        { id: 'warranty_intake', label: 'Nhận BH', color: 'bg-yellow-100', allowedNext: ['warranty_done'] },
        { id: 'warranty_done', label: 'Xong BH', color: 'bg-green-100', allowedNext: [], isTerminal: true, terminalAction: 'close' },
    ],
    repairEntryStatusId: 'intake',
    warrantyEntryStatusId: 'warranty_intake',
    trackingGroups: [],
    warrantyRules: [{ partType: 'Pin', warrantyMonths: 12 }],
    warrantyNote: 'Bảo hành theo linh kiện.',
};

test('persists explicit entry IDs independently from displayed workflow order', () => {
    const content = buildWorkflowSaveContent({
        ...baseInput,
        repairStatuses: [baseInput.repairStatuses[1], baseInput.repairStatuses[0], baseInput.repairStatuses[2]],
    });

    assert.equal(content.repairEntryStatusId, 'intake');
    assert.deepEqual(validateWorkflowSaveContent(content), []);
});

test('rejects duplicated internal IDs across repair and warranty workflows', () => {
    const content = buildWorkflowSaveContent({
        ...baseInput,
        warrantyStatuses: [
            { id: 'intake', label: 'Nhận BH', color: 'bg-yellow-100', allowedNext: ['warranty_done'] },
            baseInput.warrantyStatuses[1],
        ],
        warrantyEntryStatusId: 'intake',
    });

    assert.match(validateWorkflowSaveContent(content).join(' '), /dùng cho cả Sửa chữa và Bảo hành/);
});
