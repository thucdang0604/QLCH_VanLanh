'use client';
import { useState, useMemo, useCallback } from 'react';

export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export type PageSize = typeof PAGE_SIZE_OPTIONS[number];

interface UsePaginationReturn<T> {
  paginatedData: T[];
  totalFiltered: number;
  currentPage: number;
  pageSize: PageSize;
  totalPages: number;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
  resetPage: () => void;
}

export function useClientPagination<T>(
  filteredData: T[],
  initialPageSize: PageSize = 20
): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<PageSize>(initialPageSize);

  const totalFiltered = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, safePage, pageSize]);

  const setPage = useCallback(
    (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages))),
    [totalPages]
  );
  const setPageSize = useCallback((size: PageSize) => {
    setPageSizeState(size);
    setCurrentPage(1);
  }, []);
  const resetPage = useCallback(() => setCurrentPage(1), []);

  return { paginatedData, totalFiltered, currentPage: safePage, pageSize, totalPages, setPage, setPageSize, resetPage };
}
