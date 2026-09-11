import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';

export type RepairPartRequestDraftItem = {
    partLineId: string;
    productId: string;
    productName: string;
    quantity: number;
    quality: string;
    importPrice: number;
    ticketId: string;
    requestKey: string;
};

type RepairRequestDraft = {
    status: string;
    source: string;
    supplierId: string;
    totalAmount: number;
    items: Array<Record<string, unknown>>;
    createdAt?: FieldValue;
    createdBy?: string;
    note?: string;
};

/**
 * Keeps every repair-part shortage in the same draft import receipt, whether
 * it was discovered by reception while opening the ticket or later by KTV.
 * Call only after all transaction reads other than this receipt are complete.
 */
export async function syncRepairPartRequestDraft(input: {
    tx: Transaction;
    db: Firestore;
    actorId: string;
    requestedItems: RepairPartRequestDraftItem[];
    removedPartLineIds?: Iterable<string>;
}) {
    const removedPartLineIds = new Set(Array.from(input.removedPartLineIds || []).filter(Boolean));
    if (input.requestedItems.length === 0 && removedPartLineIds.size === 0) return;

    const receiptsRef = input.db.collection('import_receipts');
    const draftSnap = await input.tx.get(
        receiptsRef.where('status', '==', 'draft')
            .where('source', '==', 'repair_request')
            .limit(1),
    );
    if (draftSnap.empty && input.requestedItems.length === 0) return;

    const allocation = draftSnap.empty
        ? await reserveSequentialDocumentId(input.tx, input.db, { collectionName: 'import_receipts', prefix: 'NH' })
        : null;
    const draftRef = draftSnap.empty ? allocation?.ref : draftSnap.docs[0].ref;
    if (!draftRef) throw new Error('Không thể tạo phiếu nhập nháp từ yêu cầu linh kiện.');

    const draft = draftSnap.empty
        ? {
            status: 'draft',
            source: 'repair_request',
            supplierId: '',
            totalAmount: 0,
            items: [],
            createdAt: FieldValue.serverTimestamp(),
            createdBy: input.actorId,
            note: 'Phiếu nhập tự động từ yêu cầu linh kiện sửa chữa',
        } satisfies RepairRequestDraft
        : draftSnap.docs[0].data() as RepairRequestDraft;
    const requestKeys = new Set(input.requestedItems.map(item => item.requestKey));
    const requestedLineIds = new Set(input.requestedItems.map(item => item.partLineId));
    draft.items = [
        ...(draft.items || []).filter(item => {
            const partLineId = typeof item.partLineId === 'string' ? item.partLineId : '';
            const requestKey = typeof item.requestKey === 'string'
                ? item.requestKey
                : `${typeof item.ticketId === 'string' ? item.ticketId : ''}:${partLineId}`;
            return !removedPartLineIds.has(partLineId)
                && !requestKeys.has(requestKey)
                && !requestedLineIds.has(partLineId);
        }),
        ...input.requestedItems,
    ];

    input.tx.set(draftRef, draft, { merge: true });
    allocation?.commitCounter();
}
