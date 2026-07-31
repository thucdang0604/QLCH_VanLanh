/* eslint-disable no-console */
import {
    getDocs as originalGetDocs,
    getDoc as originalGetDoc,
    onSnapshot as originalOnSnapshot,
    getCountFromServer as originalGetCountFromServer,
    Query,
    DocumentReference,
    QuerySnapshot,
    DocumentSnapshot,
    DocumentData,
    Unsubscribe,
    FirestoreError,
    AggregateQuerySnapshot,
    AggregateField
} from 'firebase/firestore';
import { getListenerReadMetrics, getOneShotReadMetrics } from './firestoreReadMetrics';

/**
 * Hàm phân tích Query để lấy tên Collection một cách tương đối
 */
function extractCollectionName(queryOrRef: unknown): string {
    try {
        const q = queryOrRef as { type?: string; path?: string; _query?: { path?: { segments?: string[] } } };
        if (q?.type === 'document' && q?.path) {
            return q.path;
        }
        if (q?.type === 'query' || q?.type === 'collection') {
            // Firebase v9/v10 nội bộ có lưu path
            if (q._query && q._query.path && q._query.path.segments) {
                return q._query.path.segments.join('/');
            }
            if (q.path) {
                return q.path;
            }
        }
        return 'Unknown_Collection';
    } catch {
        return 'Unknown_Collection';
    }
}

/**
 * Style in ra màn hình Console
 */
const logStyle = 'color: #ff9800; font-weight: bold; background: #fff3e0; padding: 2px 4px; border-radius: 4px;';
const countStyle = 'color: #f44336; font-weight: bold; font-size: 14px;';

export async function getDocs<T = DocumentData, R extends DocumentData = DocumentData>(query: Query<T, R>): Promise<QuerySnapshot<T, R>> {
    const start = performance.now();
    const snapshot = await originalGetDocs(query);
    const end = performance.now();
    const time = (end - start).toFixed(0);

    if (process.env.NODE_ENV === 'development') {
        const coll = extractCollectionName(query);
        const metrics = getOneShotReadMetrics(snapshot.size, snapshot.metadata.fromCache);
        console.groupCollapsed(`%c🚨 [FIRESTORE QUERY] getDocs: ${coll}`, logStyle);
        console.log(`Document trả về: %c${metrics.returnedDocuments}`, countStyle);
        console.log(`Nguồn snapshot: ${metrics.source}`);
        console.log(`Document reads ước lượng: %c${metrics.documentReadLowerBound}`, countStyle);
        console.info(metrics.note);
        console.log(`Thời gian query: ${time}ms`);
        console.trace('Nguồn gọi query (Stack trace):');
        console.groupEnd();
    }

    return snapshot;
}

export async function getDoc<T = DocumentData, R extends DocumentData = DocumentData>(ref: DocumentReference<T, R>): Promise<DocumentSnapshot<T, R>> {
    const start = performance.now();
    const snapshot = await originalGetDoc(ref);
    const end = performance.now();
    const time = (end - start).toFixed(0);

    if (process.env.NODE_ENV === 'development') {
        const coll = extractCollectionName(ref);
        const metrics = getOneShotReadMetrics(snapshot.exists() ? 1 : 0, snapshot.metadata.fromCache);
        console.groupCollapsed(`%c🚨 [FIRESTORE QUERY] getDoc: ${coll}`, logStyle);
        console.log(`Document tồn tại: ${snapshot.exists() ? 'có' : 'không'}`);
        console.log(`Nguồn snapshot: ${metrics.source}`);
        console.log(`Document reads ước lượng: %c${metrics.documentReadLowerBound}`, countStyle);
        console.info(metrics.note);
        console.log(`Thời gian query: ${time}ms`);
        console.trace('Nguồn gọi query (Stack trace):');
        console.groupEnd();
    }

    return snapshot;
}

let activeSnapshotListenersCount = 0;
let nextSnapshotListenerId = 1;

export function getActiveSnapshotListenersCount(): number {
    return activeSnapshotListenersCount;
}

// ── onSnapshot overloads ──
// Provide typed signatures so callers get proper inference on snapshot & error callbacks.

export function onSnapshot<T = DocumentData, R extends DocumentData = DocumentData>(
    reference: Query<T, R>,
    onNext: (snapshot: QuerySnapshot<T, R>) => void,
    onError?: (error: FirestoreError) => void,
): Unsubscribe;
export function onSnapshot<T = DocumentData, R extends DocumentData = DocumentData>(
    reference: DocumentReference<T, R>,
    onNext: (snapshot: DocumentSnapshot<T, R>) => void,
    onError?: (error: FirestoreError) => void,
): Unsubscribe;
export function onSnapshot(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reference: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
): Unsubscribe {
    activeSnapshotListenersCount++;
    const listenerId = nextSnapshotListenerId++;
    let receivedServerSnapshot = false;
    if (process.env.NODE_ENV === 'development') {
        const coll = extractCollectionName(reference);

        // Wrap the first function argument to log changes
        const callbackIndex = args.findIndex(arg => typeof arg === 'function');
        if (callbackIndex !== -1) {
            const originalCallback = args[callbackIndex];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args[callbackIndex] = (snapshot: any) => {
                const size = snapshot.size ?? (snapshot.exists && snapshot.exists() ? 1 : 0);
                const fromCache = Boolean(snapshot.metadata?.fromCache);
                const changes = typeof snapshot.docChanges === 'function'
                    ? snapshot.docChanges().reduce((counts: { added: number; modified: number; removed: number }, change: { type: 'added' | 'modified' | 'removed' }) => {
                        counts[change.type] += 1;
                        return counts;
                    }, { added: 0, modified: 0, removed: 0 })
                    : { added: 0, modified: 0, removed: 0 };
                const metrics = getListenerReadMetrics({
                    returnedDocuments: size,
                    fromCache,
                    isInitialSnapshot: !receivedServerSnapshot,
                    changes,
                });
                if (!fromCache) receivedServerSnapshot = true;

                console.groupCollapsed(`%c🚨 [FIRESTORE LISTENER #${listenerId}] onSnapshot: ${coll}`, logStyle);
                console.log(`Document trong snapshot: %c${metrics.returnedDocuments}`, countStyle);
                console.log(`Thay đổi callback: added ${changes.added}, modified ${changes.modified}, removed ${changes.removed}`);
                console.log(`Nguồn snapshot: ${metrics.source}`);
                const readRange = metrics.documentReadLowerBound === metrics.documentReadUpperBound
                    ? String(metrics.documentReadLowerBound)
                    : `${metrics.documentReadLowerBound}–${metrics.documentReadUpperBound}`;
                console.log(`Document reads ước lượng cho callback: %c${readRange}`, countStyle);
                console.info(metrics.note);
                console.log(`Active listeners count: ${activeSnapshotListenersCount}`);
                console.trace('Nguồn gọi listener (Stack trace):');
                console.groupEnd();

                originalCallback(snapshot);
            };
        }
    }

    let unsubscribe: Unsubscribe;
    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        unsubscribe = originalOnSnapshot(reference, ...args);
    } catch (error) {
        activeSnapshotListenersCount = Math.max(0, activeSnapshotListenersCount - 1);
        throw error;
    }

    return () => {
        activeSnapshotListenersCount = Math.max(0, activeSnapshotListenersCount - 1);
        unsubscribe();
    };
}

export async function getCountFromServer<T = DocumentData, R extends DocumentData = DocumentData>(
    query: Query<T, R>
): Promise<AggregateQuerySnapshot<{ count: AggregateField<number> }, T, R>> {
    const start = performance.now();
    const snapshot = await originalGetCountFromServer(query);
    const end = performance.now();
    const time = (end - start).toFixed(0);

    if (process.env.NODE_ENV === 'development') {
        const coll = extractCollectionName(query);
        console.groupCollapsed(`%c🚨 [FIRESTORE AGGREGATE] getCountFromServer: ${coll}`, logStyle);
        console.log(`Kết quả count: %c${snapshot.data().count}`, countStyle);
        console.info('Count là kết quả aggregation, không phải số document reads. SDK không cho biết số index entries đã quét; xem Query Explain hoặc Firebase Usage để kiểm tra billing.');
        console.log(`Thời gian query: ${time}ms`);
        console.trace('Nguồn gọi query (Stack trace):');
        console.groupEnd();
    }

    return snapshot;
}
