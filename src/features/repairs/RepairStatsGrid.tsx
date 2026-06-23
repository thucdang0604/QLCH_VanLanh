import { CheckCircle2, ClipboardList, TrendingUp, Wrench } from 'lucide-react';

import { formatRepairPrice } from './repairPageUtils';

interface RepairStats {
    total: number;
    processing: number;
    completed: number;
    revenue: number;
}

export function RepairStatsGrid({ stats }: { stats: RepairStats }) {
    const items = [
        { label: 'Tổng phiếu', value: stats.total, icon: ClipboardList, color: 'text-blue-600 bg-blue-50' },
        { label: 'Đang xử lý', value: stats.processing, icon: Wrench, color: 'text-orange-600 bg-orange-50' },
        { label: 'Hoàn thành', value: stats.completed, icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
        { label: 'Doanh thu', value: formatRepairPrice(stats.revenue), icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
            {items.map((item) => (
                <div key={item.label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}>
                            <item.icon size={20} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">{item.label}</p>
                            <p className="text-lg font-bold text-gray-900">{item.value}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
