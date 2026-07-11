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
        console.groupCollapsed(`%c🚨 [FIRESTORE READ] getDocs: ${coll}`, logStyle);
        console.log(`Số document đọc (Reads): %c${snapshot.size}`, countStyle);
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
        console.groupCollapsed(`%c🚨 [FIRESTORE READ] getDoc: ${coll}`, logStyle);
        console.log(`Số document đọc (Reads): %c1`, countStyle);
        console.log(`Thời gian query: ${time}ms`);
        console.trace('Nguồn gọi query (Stack trace):');
        console.groupEnd();
    }

    return snapshot;
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
    if (process.env.NODE_ENV === 'development') {
        const coll = extractCollectionName(reference);

        // Wrap the first function argument to log changes
        const callbackIndex = args.findIndex(arg => typeof arg === 'function');
        if (callbackIndex !== -1) {
            const originalCallback = args[callbackIndex];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args[callbackIndex] = (snapshot: any) => {
                const size = snapshot.size ?? (snapshot.exists && snapshot.exists() ? 1 : 0);

                console.groupCollapsed(`%c🚨 [FIRESTORE REALTIME] onSnapshot: ${coll}`, logStyle);
                console.log(`Cập nhật dữ liệu - Số document kéo về: %c${size}`, countStyle);
                console.trace('Nguồn gọi listener (Stack trace):');
                console.groupEnd();

                originalCallback(snapshot);
            };
        }
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return originalOnSnapshot(reference, ...args);
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
        console.groupCollapsed(`%c🚨 [FIRESTORE READ] getCountFromServer: ${coll}`, logStyle);
        console.log(`Số lượng đếm (Count): %c${snapshot.data().count}`, countStyle);
        console.log(`Thời gian query: ${time}ms`);
        console.trace('Nguồn gọi query (Stack trace):');
        console.groupEnd();
    }

    return snapshot;
}
