'use client';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS, PageSize } from '@/lib/useClientPagination';

interface Props {
  currentPage: number;
  totalPages: number;
  pageSize: PageSize;
  totalFiltered: number;
  totalAll?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  entityLabel?: string;
}

export default function PaginationBar({
  currentPage, totalPages, pageSize, totalFiltered, totalAll,
  onPageChange, onPageSizeChange, entityLabel = 'mục',
}: Props) {
  if (totalFiltered === 0) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalFiltered);

  const pages = (): (number | '...')[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const arr: (number | '...')[] = [1];
    if (currentPage > 3) arr.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) arr.push(i);
    if (currentPage < totalPages - 2) arr.push('...');
    arr.push(totalPages);
    return arr;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-gray-50 rounded-b-xl">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>
          {start}–{end} / {totalFiltered} {entityLabel}
          {totalAll !== undefined && totalAll !== totalFiltered && (
            <span className="text-gray-400"> (lọc từ {totalAll})</span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Hiện:</span>
          <select
            title="Số mục mỗi trang"
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value) as PageSize)}
            className="h-8 px-2 border rounded-lg text-sm focus:border-orange-500 focus:outline-none bg-white"
            aria-label="Số mục mỗi trang"
          >
            {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button title="Trang đầu" onClick={() => onPageChange(1)} disabled={currentPage === 1}
            className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Trang đầu">
            <ChevronsLeft size={16} />
          </button>
          <button title="Trang trước" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}
            className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Trang trước">
            <ChevronLeft size={16} />
          </button>
          {pages().map((p, i) =>
            p === '...'
              ? <span key={`e${i}`} className="px-2 py-1 text-sm text-gray-400">…</span>
              : <button key={p} title={`Trang ${p}`} onClick={() => onPageChange(p as number)}
                  className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                    p === currentPage ? 'bg-orange-500 text-white' : 'hover:bg-gray-200 text-gray-700'
                  }`}>{p}</button>
          )}
          <button title="Trang tiếp" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}
            className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Trang tiếp">
            <ChevronRight size={16} />
          </button>
          <button title="Trang cuối" onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages}
            className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Trang cuối">
            <ChevronsRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
