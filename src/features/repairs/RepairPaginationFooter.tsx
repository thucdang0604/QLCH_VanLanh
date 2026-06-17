import PaginationBar from '@/components/admin/PaginationBar';

type PageSize = 20 | 50 | 100;

interface RepairPaginationFooterProps {
    currentPage: number;
    totalPages: number;
    pageSize: PageSize;
    totalFiltered: number;
    totalAll: number;
    hasMore: boolean;
    searchTerm: string;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: PageSize) => void;
    onLoadMore: () => void;
}

export function RepairPaginationFooter({
    currentPage,
    totalPages,
    pageSize,
    totalFiltered,
    totalAll,
    hasMore,
    searchTerm,
    onPageChange,
    onPageSizeChange,
    onLoadMore,
}: RepairPaginationFooterProps) {
    return (
        <>
            <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalFiltered={totalFiltered}
                totalAll={totalAll}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
                entityLabel="phiếu"
            />

            {hasMore && !searchTerm && (
                <div className="p-4 border-t border-gray-100 flex justify-center">
                    <button
                        onClick={onLoadMore}
                        className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                        Tải thêm lịch sử cũ
                    </button>
                </div>
            )}
        </>
    );
}
