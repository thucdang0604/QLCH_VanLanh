'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    collection,
    query,
    QueryConstraint,
    limit,
    startAfter,
    DocumentData,
    QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { getDocs, getCountFromServer } from './firestoreLogger';

export interface UseFirestorePaginatedReturn<T> {
    data: T[];
    loading: boolean;
    loadingMore: boolean;
    totalCount: number;
    currentPage: number;
    totalPages: number;
    pageSize: number;
    hasMore: boolean;
    nextPage: () => void;
    prevPage: () => void;
    goToPage: (page: number) => void;
    setPageSize: (size: number) => void;
    refresh: () => void;
}

export interface FirestorePaginationConfig {
    /**
     * Stable representation of every filter and sort applied to the query.
     * Firestore QueryConstraint instances stringify to "[object Object]", so
     * they cannot be used to detect changes safely.
     */
    queryKey: string;
    whereConstraints?: QueryConstraint[];
    orderByConstraints?: QueryConstraint[];
    pageSize?: number;
    /** Do not issue a query until required filter/config data is available. */
    enabled?: boolean;
    /**
     * Exact totals require an aggregate query across all matching index entries.
     * Cursor-only catalog screens can opt out and use `hasMore` instead.
     */
    includeTotalCount?: boolean;
}

type ActiveQueryConfig = Pick<FirestorePaginationConfig, 'whereConstraints' | 'orderByConstraints'> & {
    queryKey: string;
    enabled: boolean;
};

/** Custom hook for bounded Firestore reads with cursor pagination, optionally including an exact aggregate count. */
export function useFirestorePaginated<T extends DocumentData>(
    collectionName: string,
    config: FirestorePaginationConfig,
): UseFirestorePaginatedReturn<T> {
    const {
        queryKey,
        whereConstraints = [],
        orderByConstraints = [],
        pageSize: initialPageSize = 20,
        enabled = true,
        includeTotalCount = true,
    } = config;

    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(initialPageSize);

    // pageCursors[p] is the last document of page p. page 1 starts at null.
    const pageCursorsRef = useRef<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);
    const queryConfigRef = useRef<ActiveQueryConfig | null>(null);

    const activeQueryKey = `${enabled ? 'enabled' : 'disabled'}:${includeTotalCount ? 'count' : 'cursor-only'}:${queryKey}:page-size:${pageSize}`;
    if (queryConfigRef.current?.queryKey !== activeQueryKey) {
        queryConfigRef.current = {
            queryKey: activeQueryKey,
            whereConstraints,
            orderByConstraints,
            enabled,
        };
    }
    const activeQueryConfig = queryConfigRef.current;

    const isActiveQuery = useCallback(
        () => queryConfigRef.current?.queryKey === activeQueryConfig.queryKey && activeQueryConfig.enabled,
        [activeQueryConfig],
    );

    const getPageSnapshot = useCallback(async (
        cursor: QueryDocumentSnapshot<DocumentData> | null,
        size: number,
    ) => {
        const constraints: QueryConstraint[] = [
            ...(activeQueryConfig.whereConstraints || []),
            ...(activeQueryConfig.orderByConstraints || []),
        ];

        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(size));

        return getDocs(query(collection(db, collectionName), ...constraints));
    }, [activeQueryConfig, collectionName]);

    const fetchTotalCount = useCallback(async () => {
        try {
            const countQuery = query(
                collection(db, collectionName),
                ...(activeQueryConfig.whereConstraints || []),
            );
            const snapshot = await getCountFromServer(countQuery);
            if (!isActiveQuery()) return;
            setTotalCount(snapshot.data().count);
        } catch (err) {
            if (!isActiveQuery()) return;
            console.error(`Error counting ${collectionName}:`, err);
            setTotalCount(0);
        }
    }, [activeQueryConfig, collectionName, isActiveQuery]);

    const fetchPage = useCallback(async (pageNumber: number, size: number) => {
        if (pageNumber < 1 || !isActiveQuery()) return false;

        const isFirstPage = pageNumber === 1;
        if (isFirstPage) setLoading(true);
        else setLoadingMore(true);

        try {
            const cursor = pageCursorsRef.current[pageNumber - 1];
            if (cursor === undefined) return false;

            const snapshot = await getPageSnapshot(cursor, size);
            if (!isActiveQuery()) return false;
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as unknown as T[];

            // Without an aggregate count, a full final page can only be detected
            // when the user asks for its successor. Keep the current page visible
            // if that bounded successor query is empty.
            if (items.length === 0 && pageNumber > 1) {
                setHasMore(false);
                pageCursorsRef.current[pageNumber] = null;
                return false;
            }

            setData(items);
            setHasMore(snapshot.docs.length === size);
            pageCursorsRef.current[pageNumber] = snapshot.docs.at(-1) || null;
            setCurrentPage(pageNumber);
            return true;
        } catch (err) {
            if (!isActiveQuery()) return false;
            console.error(`Error loading page ${pageNumber} of ${collectionName}:`, err);
            return false;
        } finally {
            if (isActiveQuery()) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [collectionName, getPageSnapshot, isActiveQuery]);

    const ensureCursorForPage = useCallback(async (pageNumber: number, size: number) => {
        if (!isActiveQuery()) return false;

        for (let cursorPage = 1; cursorPage < pageNumber; cursorPage += 1) {
            if (pageCursorsRef.current[cursorPage] !== undefined) continue;

            const previousCursor = pageCursorsRef.current[cursorPage - 1];
            if (previousCursor === undefined || (cursorPage > 1 && previousCursor === null)) return false;

            const snapshot = await getPageSnapshot(previousCursor, size);
            if (!isActiveQuery()) return false;
            const lastDocument = snapshot.docs.at(-1) || null;
            pageCursorsRef.current[cursorPage] = lastDocument;
            if (!lastDocument) return false;
        }

        return pageCursorsRef.current[pageNumber - 1] !== undefined;
    }, [getPageSnapshot, isActiveQuery]);

    useEffect(() => {
        if (!enabled) {
            pageCursorsRef.current = [null];
            setData([]);
            setTotalCount(0);
            setHasMore(false);
            setCurrentPage(1);
            setLoading(false);
            setLoadingMore(false);
            return;
        }

        pageCursorsRef.current = [null];
        if (includeTotalCount) void fetchTotalCount();
        else setTotalCount(0);
        void fetchPage(1, pageSize);
    }, [enabled, fetchPage, fetchTotalCount, includeTotalCount, pageSize, queryKey]);

    const totalPages = includeTotalCount
        ? Math.max(1, Math.ceil(totalCount / pageSize))
        : currentPage + (hasMore ? 1 : 0);

    const goToPage = useCallback((page: number) => {
        if (!enabled) return;
        const targetPage = includeTotalCount
            ? Math.max(1, Math.min(page, totalPages))
            : page;
        if (!includeTotalCount && (
            targetPage < 1
            || targetPage > currentPage + 1
            || targetPage < currentPage - 1
            || (targetPage > currentPage && !hasMore)
        )) return;
        if (targetPage === currentPage || loading || loadingMore) return;

        void (async () => {
            setLoadingMore(targetPage > 1);
            try {
                if (await ensureCursorForPage(targetPage, pageSize)) {
                    await fetchPage(targetPage, pageSize);
                }
            } finally {
                setLoadingMore(false);
            }
        })();
    }, [currentPage, enabled, ensureCursorForPage, fetchPage, hasMore, includeTotalCount, loading, loadingMore, pageSize, totalPages]);

    const nextPage = useCallback(() => {
        if (hasMore) goToPage(currentPage + 1);
    }, [currentPage, goToPage, hasMore]);

    const prevPage = useCallback(() => {
        if (currentPage > 1) goToPage(currentPage - 1);
    }, [currentPage, goToPage]);

    const handleSetPageSize = useCallback((size: number) => {
        setPageSize(size);
    }, []);

    const refresh = useCallback(() => {
        if (!enabled) return;
        if (includeTotalCount) void fetchTotalCount();
        void fetchPage(currentPage, pageSize);
    }, [currentPage, enabled, fetchPage, fetchTotalCount, includeTotalCount, pageSize]);

    return {
        data,
        loading,
        loadingMore,
        totalCount,
        currentPage,
        totalPages,
        pageSize,
        hasMore,
        nextPage,
        prevPage,
        goToPage,
        setPageSize: handleSetPageSize,
        refresh,
    };
}
