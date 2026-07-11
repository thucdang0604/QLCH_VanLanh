import assert from 'node:assert/strict';
import test from 'node:test';

import { reserveSequentialDocumentIdGroups } from './serverDocumentIds';

type FakeRef = {
    id: string;
    path: string;
};

test('batch reservation reads counters and candidates once while keeping daily IDs sequential', async () => {
    const reads: FakeRef[][] = [];
    const writes: Array<{ ref: FakeRef; payload: Record<string, unknown> }> = [];
    const db = {
        collection: (collectionName: string) => ({
            doc: (id: string): FakeRef => ({ id, path: `${collectionName}/${id}` }),
        }),
    };
    const tx = {
        getAll: async (...refs: FakeRef[]) => {
            reads.push(refs);
            return refs.map(ref => ({
                ref,
                exists: false,
                data: () => ref.path.startsWith('system_counters/') ? { sequence: ref.id.startsWith('document_ids_IL') ? 7 : 4 } : {},
            }));
        },
        set: (ref: FakeRef, payload: Record<string, unknown>) => {
            writes.push({ ref, payload });
        },
    };

    const allocations = await reserveSequentialDocumentIdGroups(
        tx as never,
        db as never,
        [
            { key: 'logs', collectionName: 'inventory_logs', prefix: 'IL', count: 2, date: new Date('2026-07-10T05:00:00.000Z') },
            { key: 'order', collectionName: 'orders', prefix: 'DH', count: 1, date: new Date('2026-07-10T05:00:00.000Z') },
        ],
    );

    assert.equal(reads.length, 2);
    assert.equal(reads[0].length, 2);
    assert.equal(reads[1].length, 3);
    assert.deepEqual(allocations.get('logs')?.map(item => item.id), ['IL-260710-0008', 'IL-260710-0009']);
    assert.deepEqual(allocations.get('order')?.map(item => item.id), ['DH-260710-0005']);

    allocations.get('logs')?.at(-1)?.commitCounter();
    allocations.get('order')?.at(-1)?.commitCounter();

    assert.equal(writes.length, 2);
    assert.equal(writes.find(write => write.ref.id.startsWith('document_ids_IL'))?.payload.sequence, 9);
    assert.equal(writes.find(write => write.ref.id.startsWith('document_ids_DH'))?.payload.sequence, 5);
});
