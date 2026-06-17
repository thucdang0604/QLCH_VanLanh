import { Loader2, Search } from 'lucide-react';
import type { WorkflowNode } from '@/lib/types';

export type RepairTicketTypeFilter = 'all' | 'repair' | 'warranty';

interface RepairFiltersProps {
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    showServerSearch: boolean;
    isSearchingDB: boolean;
    onSearchInDatabase: () => void;
    ticketTypeFilter: RepairTicketTypeFilter;
    onTicketTypeFilterChange: (value: RepairTicketTypeFilter) => void;
    statusFilter: string;
    onStatusFilterChange: (value: string) => void;
    techFilter: string;
    onTechFilterChange: (value: string) => void;
    dynamicStatuses: WorkflowNode[];
    warrantyStatuses: WorkflowNode[];
    staffs: { uid: string; displayName: string }[];
}

export function RepairFilters({
    searchTerm,
    onSearchTermChange,
    showServerSearch,
    isSearchingDB,
    onSearchInDatabase,
    ticketTypeFilter,
    onTicketTypeFilterChange,
    statusFilter,
    onStatusFilterChange,
    techFilter,
    onTechFilterChange,
    dynamicStatuses,
    warrantyStatuses,
    staffs,
}: RepairFiltersProps) {
    const statusOptions =
        ticketTypeFilter === 'all'
            ? dynamicStatuses
            : ticketTypeFilter === 'warranty'
                ? warrantyStatuses
                : dynamicStatuses;

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-5 gap-4 print:hidden">
            <div className="relative md:col-span-2 flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Tìm tên, SĐT, IMEI, Model..."
                        value={searchTerm}
                        onChange={event => onSearchTermChange(event.target.value)}
                        className="w-full pl-10 pr-4 h-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />
                </div>
                {showServerSearch && (
                    <button
                        onClick={onSearchInDatabase}
                        disabled={isSearchingDB}
                        className="px-4 py-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors flex items-center justify-center gap-2 text-sm font-medium whitespace-nowrap"
                    >
                        {isSearchingDB ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                        <span className="hidden sm:inline">Tìm Server</span>
                    </button>
                )}
            </div>
            <select
                value={ticketTypeFilter}
                onChange={event => onTicketTypeFilterChange(event.target.value as RepairTicketTypeFilter)}
                aria-label="Loại phiếu"
                title="Loại phiếu"
                className="h-10 px-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white"
            >
                <option value="all">Tất cả loại phiếu</option>
                <option value="repair">Phiếu sửa chữa</option>
                <option value="warranty">Phiếu bảo hành</option>
            </select>
            <select
                value={statusFilter}
                onChange={event => onStatusFilterChange(event.target.value)}
                aria-label="Lọc theo trạng thái"
                title="Lọc theo trạng thái"
                className="h-10 px-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white"
            >
                <option value="all">Tất cả trạng thái</option>
                {statusOptions.map(status => (
                    <option key={status.id} value={status.id}>{status.label}</option>
                ))}
            </select>
            <select
                value={techFilter}
                onChange={event => onTechFilterChange(event.target.value)}
                aria-label="Lọc theo kỹ thuật viên"
                title="Lọc theo kỹ thuật viên"
                className="h-10 px-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 bg-white"
            >
                <option value="all">Tất cả KTV</option>
                {staffs.map(staff => (
                    <option key={staff.uid} value={staff.uid}>{staff.displayName}</option>
                ))}
            </select>
        </div>
    );
}
