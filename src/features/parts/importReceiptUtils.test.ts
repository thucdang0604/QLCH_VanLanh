import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImportPreviewState } from './importReceiptUtils';
import type { ImportReceipt, ProductWithId } from './importReceiptTypes';

function createReceipt(productId: string, partLineId = 'line-1'): ImportReceipt {
    return {
        id: 'NH-test',
        status: 'ordered',
        receiptType: 'component',
        createdBy: 'test-user',
        createdByName: 'Test',
        createdAt: Date.now(),
        totalAmount: 500000,
        items: [{
            productId,
            partLineId,
            productName: 'Màn hình iPhone 16 Plus Zin',
            quantity: 1,
            importPrice: 500000,
            status: 'ordered',
        }],
    };
}

test('does not classify a linked catalog product as new when its local snapshot is stale', () => {
    const { previewState } = buildImportPreviewState(
        createReceipt('LK-man-hinh-iphone-16-plus-zin'),
        [],
    );

    assert.deepEqual(previewState.newParts, {});
});

test('requires details for an unlinked receipt line', () => {
    const { previewState } = buildImportPreviewState(createReceipt(''), []);

    assert.ok(previewState.newParts['line-1']);
});

test('keeps the detail form for an explicitly proposed catalog record', () => {
    const proposedProduct = {
        id: 'LK-proposed',
        name: 'Linh kiện đề xuất',
        isProposed: true,
    } as ProductWithId;

    const { previewState } = buildImportPreviewState(createReceipt(proposedProduct.id), [proposedProduct]);

    assert.ok(previewState.newParts[proposedProduct.id]);
});
