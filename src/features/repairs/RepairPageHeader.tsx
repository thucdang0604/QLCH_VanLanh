import { Plus } from 'lucide-react';

interface RepairPageHeaderProps {
    onCreate: () => void;
    totalCount?: number | null;
}

export function RepairPageHeader({ onCreate, totalCount }: RepairPageHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Quản lý Sửa chữa</h1>
                <p className="text-gray-500">
                    {totalCount !== undefined && totalCount !== null
                        ? `Tổng số ${totalCount.toLocaleString('vi-VN')} phiếu sửa chữa trong DB`
                        : 'Theo dõi phiếu sửa chữa — chuyển trạng thái nhanh'}
                </p>
            </div>
            <button
                onClick={onCreate}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/25 font-semibold"
            >
                <Plus size={20} /> Tạo phiếu mới
            </button>
        </div>
    );
}
