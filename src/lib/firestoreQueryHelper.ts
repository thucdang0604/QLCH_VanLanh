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
}

type ActiveQueryConfig = Pick<FirestorePaginationConfig, 'whereConstraints' | 'orderByConstraints'> & {
    queryKey: string;
};

/** Custom hook for bounded Firestore reads with cursor pagination and aggregate count. */
export function useFirestorePaginated<T extends DocumentData>(
    collectionName: string,
    config: FirestorePaginationConfig,
): UseFirestorePaginatedReturn<T> {
    const {
        queryKey,
        whereConstraints = [],
        orderByConstraints = [],
        pageSize: initialPageSize = 20,
    } = config;

    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(initialPageSize);

    // pageCursors[p] is the last document of page p. page 1 starts at null.
    const pageCursorsRef = useRef<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);
    const queryConfigRef = useRef<ActiveQueryConfig | null>(null);

    if (queryConfigRef.current?.queryKey !== queryKey) {
        queryConfigRef.current = { queryKey, whereConstraints, orderByConstraints };
    }
    const activeQueryConfig = queryConfigRef.current;

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
            setTotalCount(snapshot.data().count);
        } catch (err) {
            console.error(`Error counting ${collectionName}:`, err);
            setTotalCount(0);
        }
    }, [activeQueryConfig, collectionName]);

    const fetchPage = useCallback(async (pageNumber: number, size: number) => {
        if (pageNumber < 1) return false;

        const isFirstPage = pageNumber === 1;
        if (isFirstPage) setLoading(true);
        else setLoadingMore(true);

        try {
            const cursor = pageCursorsRef.current[pageNumber - 1];
            if (cursor === undefined) return false;

            const snapshot = await getPageSnapshot(cursor, size);
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as unknown as T[];

            setData(items);
            pageCursorsRef.current[pageNumber] = snapshot.docs.at(-1) || null;
            setCurrentPage(pageNumber);
            return true;
        } catch (err) {
            console.error(`Error loading page ${pageNumber} of ${collectionName}:`, err);
            return false;
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [collectionName, getPageSnapshot]);

    const ensureCursorForPage = useCallback(async (pageNumber: number, size: number) => {
        for (let cursorPage = 1; cursorPage < pageNumber; cursorPage += 1) {
            if (pageCursorsRef.current[cursorPage] !== undefined) continue;

            const previousCursor = pageCursorsRef.current[cursorPage - 1];
            if (previousCursor === undefined || (cursorPage > 1 && previousCursor === null)) return false;

            const snapshot = await getPageSnapshot(previousCursor, size);
            const lastDocument = snapshot.docs.at(-1) || null;
            pageCursorsRef.current[cursorPage] = lastDocument;
            if (!lastDocument) return false;
        }

        return pageCursorsRef.current[pageNumber - 1] !== undefined;
    }, [getPageSnapshot]);

    useEffect(() => {
        pageCursorsRef.current = [null];
        void fetchTotalCount();
        void fetchPage(1, pageSize);
    }, [fetchPage, fetchTotalCount, pageSize, queryKey]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const hasMore = currentPage < totalPages;

    const goToPage = useCallback((page: number) => {
        const targetPage = Math.max(1, Math.min(page, totalPages));
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
    }, [currentPage, ensureCursorForPage, fetchPage, loading, loadingMore, pageSize, totalPages]);

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
        void fetchTotalCount();
        void fetchPage(currentPage, pageSize);
    }, [currentPage, fetchPage, fetchTotalCount, pageSize]);

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
