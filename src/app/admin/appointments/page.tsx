'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    where,
    Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    Calendar,
    Clock,
    Search,
    Filter,
    CheckCircle2,
    XCircle,
    Loader2,
    Phone,
    MapPin,
    User,
    CalendarClock,
    MoreHorizontal,
    Wrench
} from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';

// Appointment Interface
interface Appointment {
    id: string;
    fullName: string;
    phone: string;
    date: string;
    timeSlot: string;
    store: string; // store id
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
    serviceName?: string;
    serviceId?: string;
    createdAt: any;
}

const statusConfig: Record<string, { color: string; label: string; icon: any }> = {
    pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Chờ xác nhận', icon: Clock },
    confirmed: { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Đã xác nhận', icon: CheckCircle2 },
    completed: { color: 'bg-green-100 text-green-700 border-green-200', label: 'Hoàn thành', icon: CheckCircle2 },
    cancelled: { color: 'bg-red-100 text-red-700 border-red-200', label: 'Đã hủy', icon: XCircle },
};

const timeSlotLabels: Record<string, string> = {
    morning: 'Sáng (9h - 12h)',
    afternoon: 'Chiều (12h - 17h)',
    evening: 'Tối (17h - 21h)',
};

export default function AppointmentsPage() {
    const { config } = useConfig();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [storeFilter, setStoreFilter] = useState('');

    // Fetch appointments (Real-time)
    useEffect(() => {
        const q = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Appointment[];
            setAppointments(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleUpdateStatus = async (id: string, newStatus: string) => {
        try {
            await updateDoc(doc(db, 'appointments', id), {
                status: newStatus,
            });
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Có lỗi xảy ra khi cập nhật trạng thái.');
        }
    };

    // Derived state for filtering
    const filteredAppointments = appointments.filter((app) => {
        const matchesSearch =
            app.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            app.phone.includes(searchQuery);
        const matchesStatus = !statusFilter || app.status === statusFilter;
        const matchesStore = !storeFilter || app.store === storeFilter;
        return matchesSearch && matchesStatus && matchesStore;
    });

    const getStoreName = (storeId: string) => {
        const branch = config.store_branches?.find(b => b.id === storeId);
        return branch ? branch.name : storeId;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={32} className="animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý đặt lịch</h1>
                    <p className="text-gray-500">Danh sách khách hàng đăng ký sửa chữa</p>
                </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="relative md:col-span-2">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Tìm tên, số điện thoại..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-10 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                    />
                </div>
                <div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full h-10 px-4 border rounded-lg focus:border-orange-500 focus:outline-none bg-white"
                    >
                        <option value="">Tất cả trạng thái</option>
                        {Object.entries(statusConfig).map(([key, value]) => (
                            <option key={key} value={key}>{value.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <select
                        value={storeFilter}
                        onChange={(e) => setStoreFilter(e.target.value)}
                        className="w-full h-10 px-4 border rounded-lg focus:border-orange-500 focus:outline-none bg-white"
                    >
                        <option value="">Tất cả chi nhánh</option>
                        {config.store_branches?.map((branch) => (
                            <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Khách hàng</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Dịch vụ quan tâm</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Lịch hẹn</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Chi nhánh</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Trạng thái</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredAppointments.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                        Không tìm thấy lịch hẹn nào.
                                    </td>
                                </tr>
                            ) : (
                                filteredAppointments.map((app) => {
                                    const status = statusConfig[app.status] || statusConfig.pending;
                                    return (
                                        <tr key={app.id} className={`hover:bg-gray-50 transition-colors ${app.status === 'completed' ? 'opacity-60' : ''}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold">
                                                        {app.fullName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-900">{app.fullName}</p>
                                                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                                            <Phone size={12} />
                                                            {app.phone}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {app.serviceName ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-medium border border-orange-100">
                                                        <Wrench size={12} />
                                                        {app.serviceName}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                                                        <CalendarClock size={16} className="text-gray-400" />
                                                        {new Date(app.date).toLocaleDateString('vi-VN')}
                                                    </div>
                                                    <div className="text-xs text-gray-500 pl-6">
                                                        {timeSlotLabels[app.timeSlot] || app.timeSlot}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-sm text-gray-700">
                                                    <MapPin size={16} className="text-gray-400" />
                                                    {getStoreName(app.store)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${status.color}`}>
                                                    <status.icon size={12} />
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {app.status === 'completed' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-400 bg-gray-100 rounded-full border border-gray-200">
                                                        🔒 Đã hoàn tất
                                                    </span>
                                                ) : (
                                                    <>
                                                        <select
                                                            value={app.status}
                                                            onChange={(e) => handleUpdateStatus(app.id, e.target.value)}
                                                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-orange-300 focus:ring focus:ring-orange-200 focus:ring-opacity-50 py-1 pl-2 pr-8"
                                                        >
                                                            {Object.entries(statusConfig).map(([key, value]) => (
                                                                <option key={key} value={key}>{value.label}</option>
                                                            ))}
                                                        </select>
                                                        {app.status === 'confirmed' && (
                                                            <Link
                                                                href={`/admin/repairs?appointmentId=${app.id}`}
                                                                className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 border border-orange-200 transition-colors whitespace-nowrap"
                                                            >
                                                                <Wrench size={12} />
                                                                Tạo phiếu
                                                            </Link>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
