import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transaction } from 'firebase-admin/firestore';
import { executeFifoDeductionsWrites } from './inventoryFifo';

test('uses the exact inventory lot selected by a QR trace before normal FIFO order', () => {
    const updates: string[] = [];
    const transaction = {
        update: (ref: { id: string }) => updates.push(ref.id),
    } as unknown as Transaction;
    const olderLot = { id: 'LOT-260910-0001' };
    const scannedLot = { id: 'LOT-260910-0002' };

    const results = executeFifoDeductionsWrites(transaction, [{
        productId: 'SP-001',
        quantityToDeduct: 1,
        preferredLotIds: [{ lotId: scannedLot.id, quantity: 1 }],
    }], new Map([['SP-001', [
        { ref: olderLot, data: { lotCode: 'PN-2609-1111', remainingQuantity: 5, supplierId: 'NCC-A' } },
        { ref: scannedLot, data: { lotCode: 'PN-2609-1111', remainingQuantity: 2, supplierId: 'NCC-A' } },
    ]]]) as never);

    assert.deepEqual(updates, [scannedLot.id]);
    assert.deepEqual(results.get('SP-001'), [{
        lotId: scannedLot.id,
        lotCode: 'PN-2609-1111',
        supplierId: 'NCC-A',
        quantity: 1,
        logId: scannedLot.id,
    }]);
});
