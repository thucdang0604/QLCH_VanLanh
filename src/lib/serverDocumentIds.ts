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

export type SequentialDocumentIdReservationGroup = ReserveSequentialDocumentIdInput & {
    key: string;
    count: number;
};

export type ReservedSequentialDocumentId = {
    id: string;
    ref: DocumentReference;
    sequence: number;
    counterKey: string;
    commitCounter: () => void;
};

type PreparedReservationGroup = SequentialDocumentIdReservationGroup & {
    dateKey: string;
    prefix: string;
    padLength: number;
    counterKey: string;
    counterRef: DocumentReference;
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

export async function reserveSequentialDocumentIds(
    tx: Transaction,
    db: Firestore,
    input: ReserveSequentialDocumentIdInput & { count: number },
): Promise<ReservedSequentialDocumentId[]> {
    if (!Number.isInteger(input.count) || input.count <= 0) {
        return [];
    }

    const dateKey = formatVietnamDateKey(input.date || new Date());
    const prefix = input.prefix.trim().toUpperCase();
    const padLength = input.padLength || DEFAULT_PAD_LENGTH;
    const counterKey = `${prefix}-${dateKey}`;
    const counterRef = db.collection('system_counters').doc(`document_ids_${counterKey}`);
    const counterSnap = await tx.get(counterRef);
    let sequence = Math.max(0, Number(counterSnap.data()?.sequence) || 0) + 1;
    const allocations: ReservedSequentialDocumentId[] = [];

    for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS && allocations.length < input.count; attempt += 1) {
        const id = buildDocumentId(prefix, dateKey, sequence, padLength);
        const ref = db.collection(input.collectionName).doc(id);
        const reservedSequence = sequence;
        sequence += 1;

        const existingSnap = await tx.get(ref);
        if (!existingSnap.exists) {
            allocations.push({
                id,
                ref,
                sequence: reservedSequence,
                counterKey,
                commitCounter: () => {
                    tx.set(counterRef, {
                        prefix,
                        dateKey,
                        sequence: allocations.at(-1)?.sequence || reservedSequence,
                        updatedAt: FieldValue.serverTimestamp(),
                    }, { merge: true });
                },
            });
        }
    }

    if (allocations.length !== input.count) {
        throw new Error(`Khong the tao ${input.count} ma ${prefix} moi sau ${MAX_COLLISION_ATTEMPTS} lan kiem tra trung.`);
    }

    return allocations;
}

/**
 * Batch-reserve independent sequential ID groups in the transaction read phase.
 *
 * POS checkout creates several document types at once. Reserving each group one
 * by one turns counter reads and collision checks into serial network requests.
 * This helper keeps the existing readable ID contract while batching those reads.
 */
export async function reserveSequentialDocumentIdGroups(
    tx: Transaction,
    db: Firestore,
    groups: SequentialDocumentIdReservationGroup[],
): Promise<Map<string, ReservedSequentialDocumentId[]>> {
    const preparedGroups: PreparedReservationGroup[] = groups
        .filter(group => Number.isInteger(group.count) && group.count > 0)
        .map(group => {
            const dateKey = formatVietnamDateKey(group.date || new Date());
            const prefix = group.prefix.trim().toUpperCase();
            const padLength = group.padLength || DEFAULT_PAD_LENGTH;
            const counterKey = `${prefix}-${dateKey}`;
            return {
                ...group,
                dateKey,
                prefix,
                padLength,
                counterKey,
                counterRef: db.collection('system_counters').doc(`document_ids_${counterKey}`),
            };
        });

    if (preparedGroups.length === 0) return new Map();

    const seenKeys = new Set<string>();
    const seenCounters = new Set<string>();
    for (const group of preparedGroups) {
        if (!group.key.trim() || seenKeys.has(group.key)) {
            throw new Error('Mỗi nhóm cấp mã chứng từ phải có key duy nhất.');
        }
        if (seenCounters.has(group.counterKey)) {
            throw new Error(`Không thể cấp đồng thời hai nhóm dùng chung counter ${group.counterKey}.`);
        }
        seenKeys.add(group.key);
        seenCounters.add(group.counterKey);
    }

    const counterSnapshots = await tx.getAll(...preparedGroups.map(group => group.counterRef));
    const nextSequenceByKey = new Map<string, number>();
    preparedGroups.forEach((group, index) => {
        nextSequenceByKey.set(group.key, Math.max(0, Number(counterSnapshots[index].data()?.sequence) || 0) + 1);
    });

    const allocationsByKey = new Map<string, ReservedSequentialDocumentId[]>();
    preparedGroups.forEach(group => allocationsByKey.set(group.key, []));

    for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt += 1) {
        const candidates: Array<{ group: PreparedReservationGroup; sequence: number; ref: DocumentReference }> = [];
        for (const group of preparedGroups) {
            const allocations = allocationsByKey.get(group.key)!;
            const remaining = group.count - allocations.length;
            const nextSequence = nextSequenceByKey.get(group.key)!;
            for (let offset = 0; offset < remaining; offset += 1) {
                const sequence = nextSequence + offset;
                candidates.push({
                    group,
                    sequence,
                    ref: db.collection(group.collectionName).doc(buildDocumentId(group.prefix, group.dateKey, sequence, group.padLength)),
                });
            }
            nextSequenceByKey.set(group.key, nextSequence + remaining);
        }

        if (candidates.length === 0) break;

        const candidateSnapshots = await tx.getAll(...candidates.map(candidate => candidate.ref));
        candidates.forEach((candidate, index) => {
            if (candidateSnapshots[index].exists) return;
            const allocations = allocationsByKey.get(candidate.group.key)!;
            if (allocations.length >= candidate.group.count) return;
            allocations.push({
                id: candidate.ref.id,
                ref: candidate.ref,
                sequence: candidate.sequence,
                counterKey: candidate.group.counterKey,
                commitCounter: () => {
                    tx.set(candidate.group.counterRef, {
                        prefix: candidate.group.prefix,
                        dateKey: candidate.group.dateKey,
                        sequence: allocations.at(-1)?.sequence || candidate.sequence,
                        updatedAt: FieldValue.serverTimestamp(),
                    }, { merge: true });
                },
            });
        });

        if (preparedGroups.every(group => allocationsByKey.get(group.key)!.length === group.count)) {
            return allocationsByKey;
        }
    }

    const unresolvedGroup = preparedGroups.find(group => allocationsByKey.get(group.key)!.length !== group.count);
    throw new Error(`Khong the tao ${unresolvedGroup?.count || 0} ma ${unresolvedGroup?.prefix || ''} moi sau ${MAX_COLLISION_ATTEMPTS} lan kiem tra trung.`);
}
