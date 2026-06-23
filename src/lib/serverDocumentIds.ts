import { FieldValue, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';

const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_PAD_LENGTH = 4;
const MAX_COLLISION_ATTEMPTS = 100;

type ReserveSequentialDocumentIdInput = {
    collectionName: string;
    prefix: string;
    date?: Date;
    padLength?: number;
};

export type ReservedSequentialDocumentId = {
    id: string;
    ref: DocumentReference;
    sequence: number;
    counterKey: string;
    commitCounter: () => void;
};

export function formatVietnamDateKey(date: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: DEFAULT_TIME_ZONE,
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);

    const year = parts.find(part => part.type === 'year')?.value;
    const month = parts.find(part => part.type === 'month')?.value;
    const day = parts.find(part => part.type === 'day')?.value;

    if (!year || !month || !day) {
        throw new Error('Không thể tạo khóa ngày cho mã chứng từ.');
    }

    return `${year}${month}${day}`;
}

function buildDocumentId(prefix: string, dateKey: string, sequence: number, padLength: number) {
    return `${prefix}-${dateKey}-${String(sequence).padStart(padLength, '0')}`;
}

/**
 * Reserve a readable Firestore document ID inside an existing transaction.
 * Call this after all business reads, then call commitCounter() in the write phase.
 */
export async function reserveSequentialDocumentId(
    tx: Transaction,
    db: Firestore,
    input: ReserveSequentialDocumentIdInput,
): Promise<ReservedSequentialDocumentId> {
    const dateKey = formatVietnamDateKey(input.date || new Date());
    const prefix = input.prefix.trim().toUpperCase();
    const padLength = input.padLength || DEFAULT_PAD_LENGTH;
    const counterKey = `${prefix}-${dateKey}`;
    const counterRef = db.collection('system_counters').doc(`document_ids_${counterKey}`);
    const counterSnap = await tx.get(counterRef);
    let sequence = Math.max(0, Number(counterSnap.data()?.sequence) || 0) + 1;

    for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt += 1) {
        const id = buildDocumentId(prefix, dateKey, sequence, padLength);
        const ref = db.collection(input.collectionName).doc(id);
        const existingSnap = await tx.get(ref);

        if (!existingSnap.exists) {
            return {
                id,
                ref,
                sequence,
                counterKey,
                commitCounter: () => {
                    tx.set(counterRef, {
                        prefix,
                        dateKey,
                        sequence,
                        updatedAt: FieldValue.serverTimestamp(),
                    }, { merge: true });
                },
            };
        }

        sequence += 1;
    }

    throw new Error(`Không thể tạo mã ${prefix} mới sau ${MAX_COLLISION_ATTEMPTS} lần kiểm tra trùng.`);
}
