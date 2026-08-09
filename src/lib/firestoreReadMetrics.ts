export type FirestoreReadSource = 'server' | 'cache';

export interface FirestoreDocumentReadMetrics {
    source: FirestoreReadSource;
    returnedDocuments: number;
    documentReadLowerBound: number;
    documentReadUpperBound: number;
    note: string;
}

export interface ListenerChangeCounts {
    added: number;
    modified: number;
    removed: number;
}

/**
 * Computes a transparent document-read range from data exposed by the Web SDK.
 * It intentionally excludes Security Rules dependent-document and index-entry
 * charges because the client snapshot does not expose either value.
 */
export function getOneShotReadMetrics(
    returnedDocuments: number,
    fromCache: boolean,
): FirestoreDocumentReadMetrics {
    if (fromCache) {
        return {
            source: 'cache',
            returnedDocuments,
            documentReadLowerBound: 0,
            documentReadUpperBound: 0,
            note: 'Snapshot lấy từ cache; lần callback này không cho biết một server read mới.',
        };
    }

    const reads = Math.max(1, returnedDocuments);
    return {
        source: 'server',
        returnedDocuments,
        documentReadLowerBound: reads,
        documentReadUpperBound: reads,
        note: 'Số read cho document trả về (đã tính mức tối thiểu 1 query). Chưa bao gồm chi phí index entries hoặc document phụ do Rules đọc.',
    };
}

export function getListenerReadMetrics(input: {
    returnedDocuments: number;
    fromCache: boolean;
    isInitialSnapshot: boolean;
    changes: ListenerChangeCounts;
}): FirestoreDocumentReadMetrics {
    const { returnedDocuments, fromCache, isInitialSnapshot, changes } = input;

    if (fromCache) {
        return {
            source: 'cache',
            returnedDocuments,
            documentReadLowerBound: 0,
            documentReadUpperBound: 0,
            note: 'Snapshot listener lấy từ cache; không quy thành server read mới.',
        };
    }

    if (isInitialSnapshot) {
        const reads = Math.max(1, returnedDocuments);
        return {
            source: 'server',
            returnedDocuments,
            documentReadLowerBound: reads,
            documentReadUpperBound: reads,
            note: 'Snapshot listener đầu tiên: tính theo document trong kết quả, với mức tối thiểu 1 query.',
        };
    }

    const certainlyBilled = changes.added + changes.modified;
    const possibleRemovedRead = changes.removed;
    return {
        source: 'server',
        returnedDocuments,
        documentReadLowerBound: certainlyBilled,
        documentReadUpperBound: certainlyBilled + possibleRemovedRead,
        note: possibleRemovedRead > 0
            ? 'Added/modified là read; removed có thể là document đổi trạng thái (read) hoặc bị xóa (không bị tính read), nên logger hiển thị khoảng ước lượng.'
            : 'Listener update chỉ tính document added/modified trong callback này, không dùng tổng document của snapshot.',
    };
}
