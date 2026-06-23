import { Search, Wrench } from 'lucide-react';

interface TechnicianPageHeaderProps {
    activeRepairCount: number;
    doneCount: number;
    searchQuery: string;
    onSearchQueryChange: (value: string) => void;
    viewMode: 'kanban' | 'list';
    onViewModeChange: (value: 'kanban' | 'list') => void;
}

export function TechnicianPageHeader({
    activeRepairCount,
    doneCount,
    searchQuery,
    onSearchQueryChange,
    viewMode,
    onViewModeChange,
}: TechnicianPageHeaderProps) {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Wrench className="text-orange-500" /> Khu vực Kỹ thuật viên
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    {activeRepairCount} máy đang sửa • {doneCount} máy chờ trả
                </p>
            </div>
            <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-64">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        title="Tìm máy, khách..."
                        type="text"
                        placeholder="Tìm máy, khách..."
                        value={searchQuery}
                        onChange={event => onSearchQueryChange(event.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:border-orange-500 focus:outline-none"
                    />
                </div>
                <div className="hidden sm:flex bg-gray-100 rounded-lg p-0.5">
                    <button title="Xem danh sách" onClick={() => onViewModeChange('list')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'}`}>
                        Danh sách
                    </button>
                    <button title="Xem kanban" onClick={() => onViewModeChange('kanban')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-orange-600' : 'text-gray-500'}`}>
                        Kanban
                    </button>
                </div>
            </div>
        </div>
    );
}
