'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    collection,
    query,
    QueryConstraint,
    limit,
    startAfter,
    DocumentData,
    QueryDocumentSnapshot
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
    whereConstraints?: QueryConstraint[];
    orderByConstraints?: QueryConstraint[];
    pageSize?: number;
}

/**
 * Custom hook for cursor-based Firestore pagination with server-side document count
 */
export function useFirestorePaginated<T extends DocumentData>(
    collectionName: string,
    config: FirestorePaginationConfig = {}
): UseFirestorePaginatedReturn<T> {
    const { whereConstraints = [], orderByConstraints = [], pageSize: initialPageSize = 20 } = config;

    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(initialPageSize);

    // Caching document snapshots (cursors) to allow backwards navigation
    // pageCursors[1] = null (page 1 starts from beginning)
    // pageCursors[p] = last document of page (p - 1)
    const pageCursorsRef = useRef<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);
    
    // Maintain a stable string representation of query constraints to detect actual filter changes
    const serializedConstraints = JSON.stringify([
        ...whereConstraints.map(c => c.toString()),
        ...orderByConstraints.map(c => c.toString())
    ]);

    // Fetch the total count of documents matching the filters (runs only when filters change)
    const fetchTotalCount = useCallback(async () => {
        try {
            const countQuery = query(collection(db, collectionName), ...whereConstraints);
            const snapshot = await getCountFromServer(countQuery);
            setTotalCount(snapshot.data().count);
        } catch (err) {
            console.error(`Error counting ${collectionName}:`, err);
            setTotalCount(0);
        }
    }, [collectionName, serializedConstraints]); // eslint-disable-next-line react-hooks/exhaustive-deps

    // Fetch data for a specific page using cursor
    const fetchPage = useCallback(async (pageNumber: number, size: number) => {
        if (pageNumber < 1) return;
        
        const isFirstPage = pageNumber === 1;
        if (isFirstPage) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const cursor = pageCursorsRef.current[pageNumber - 1] || null;
            const queryParams: QueryConstraint[] = [
                ...whereConstraints,
                ...orderByConstraints
            ];

            if (cursor && !isFirstPage) {
                queryParams.push(startAfter(cursor));
            }
            queryParams.push(limit(size));

            const pageQuery = query(collection(db, collectionName), ...queryParams);
            const snapshot = await getDocs(pageQuery);

            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as unknown as T[];

            setData(items);

            // Store the last document snapshot as the cursor for the NEXT page
            const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
            pageCursorsRef.current[pageNumber] = lastDoc;

            setCurrentPage(pageNumber);
        } catch (err) {
            console.error(`Error loading page ${pageNumber} of ${collectionName}:`, err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [collectionName, serializedConstraints]); // eslint-disable-next-line react-hooks/exhaustive-deps

    // Reset pagination and fetch new count + first page when query filters or page size changes
    useEffect(() => {
        pageCursorsRef.current = [null];
        fetchTotalCount();
        fetchPage(1, pageSize);
    }, [serializedConstraints, pageSize, fetchTotalCount, fetchPage]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const hasMore = currentPage < totalPages;

    const nextPage = useCallback(() => {
        if (hasMore && !loading && !loadingMore) {
            fetchPage(currentPage + 1, pageSize);
        }
    }, [hasMore, currentPage, pageSize, loading, loadingMore, fetchPage]);

    const prevPage = useCallback(() => {
        if (currentPage > 1 && !loading && !loadingMore) {
            fetchPage(currentPage - 1, pageSize);
        }
    }, [currentPage, pageSize, loading, loadingMore, fetchPage]);

    const goToPage = useCallback((page: number) => {
        const targetPage = Math.max(1, Math.min(page, totalPages));
        if (targetPage !== currentPage && !loading && !loadingMore) {
            // Ensure we have cursors for pages up to targetPage
            // If not, we have to reset or sequentially load (standard Firestore constraint)
            if (pageCursorsRef.current[targetPage - 1] !== undefined || targetPage === 1) {
                fetchPage(targetPage, pageSize);
            } else {
                // If cursor is missing, go to page 1
                pageCursorsRef.current = [null];
                fetchPage(1, pageSize);
            }
        }
    }, [currentPage, totalPages, pageSize, loading, loadingMore, fetchPage]);

    const handleSetPageSize = useCallback((size: number) => {
        setPageSize(size);
    }, []);

    const refresh = useCallback(() => {
        fetchTotalCount();
        fetchPage(currentPage, pageSize);
    }, [currentPage, pageSize, fetchTotalCount, fetchPage]);

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
        refresh
    };
}
