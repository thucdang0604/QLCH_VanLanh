'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, query, orderBy, doc, updateDoc, serverTimestamp, where, limit, startAfter, DocumentSnapshot, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { onSnapshot, getDocs } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { appAlert } from '@/lib/appDialog';
import {
    Clock,
    Search,
    CheckCircle2,
    XCircle,
    Loader2,
    Phone,
    MapPin,
    CalendarClock,
    Wrench
} from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import type { FirestoreDateValue } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';
import { toastError, toastSuccess } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';

type AppointmentIntakeMethod = 'walk_in' | 'send_to_store';

// Appointment Interface
interface Appointment {
    id: string;
    fullName: string;
    phone: string;
    date: string;
    timeSlot: string;
    store: string; // store id
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
    intakeMethod?: AppointmentIntakeMethod | null;
    serviceName?: string;
    serviceId?: string;
    createdAt: FirestoreDateValue;
}

const APPOINTMENT_SEARCH_LIMIT = 50;

const statusConfig: Record<string, { color: string; label: string; icon: LucideIcon }> = {
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

const intakeMethodConfig: Record<AppointmentIntakeMethod, { label: string; shortLabel: string }> = {
    walk_in: { label: 'Khách đến trực tiếp', shortLabel: 'Đến trực tiếp' },
    send_to_store: { label: 'Khách gửi máy đến cửa hàng', shortLabel: 'Gửi máy' },
};

export default function AppointmentsPage() {
    const { config } = useConfig();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [storeFilter, setStoreFilter] = useState('');

    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isSearchingDB, setIsSearchingDB] = useState(false);
    const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

    // Reset status filter when changing tabs
    useEffect(() => {
        setStatusFilter('');
    }, [activeTab]);

    // Fetch appointments (Real-time with limit)
    useEffect(() => {
        setLoading(true);
        let q;
        if (activeTab === 'completed') {
            q = query(collection(db, 'appointments'), where('status', '==', 'completed'), orderBy('createdAt', 'desc'), limit(20));
        } else {
            q = query(collection(db, 'appointments'), where('status', 'in', ['pending', 'confirmed', 'cancelled']), orderBy('createdAt', 'desc'), limit(20));
        }
        const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
            const data = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Appointment[];
            setAppointments(data);
            setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
            setHasMore(snapshot.docs.length === 50);
            setLoading(false);
        }, (error) => {
            console.error('Fetch errors:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeTab]);

    const loadMoreData = async () => {
        if (!lastDoc || !hasMore) return;
        setLoading(true);
        let q;
        if (activeTab === 'completed') {
            q = query(collection(db, 'appointments'), where('status', '==', 'completed'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(20));
        } else {
            q = query(collection(db, 'appointments'), where('status', 'in', ['pending', 'confirmed', 'cancelled']), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(20));
        }
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[];
            setAppointments(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const newItems = data.filter(d => !existingIds.has(d.id));
                return [...prev, ...newItems];
            });
            setLastDoc(snap.docs[snap.docs.length - 1]);
            setHasMore(snap.docs.length === 50);
        } else {
            setHasMore(false);
        }
        setLoading(false);
    };

    const searchInDatabase = async () => {
        if (!searchQuery.trim()) {
            await appAlert('Vui lòng nhập số điện thoại hoặc tên để tìm trên máy chủ.', { title: 'Thiếu thông tin tìm kiếm' });
            return;
        }
        setIsSearchingDB(true);
        try {
            // Find by phone
            const qPhone = query(collection(db, 'appointments'), where('phone', '==', searchQuery.trim()), limit(APPOINTMENT_SEARCH_LIMIT));
            const snap = await getDocs(qPhone);
            
            if (!snap.empty) {
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Appointment[];
                setAppointments(prev => {
                    const existingIds = new Set(prev.map(p => p.id));
                    const newItems = data.filter(d => !existingIds.has(d.id));
                    return [...prev, ...newItems];
                });
            } else {
                await appAlert('Không tìm thấy dữ liệu trên máy chủ!', { title: 'Không tìm thấy dữ liệu' });
            }
        } catch (e) {
            console.error('Lỗi tìm kiếm DB', e);
            await appAlert('Lỗi tìm kiếm!', { title: 'Tìm kiếm thất bại' });
        }
        setIsSearchingDB(false);
    };

    const handleUpdateStatus = async (id: string, newStatus: string) => {
        try {
            const payload: Record<string, unknown> = {
                status: newStatus,
                updatedAt: serverTimestamp(),
            };
            if (newStatus !== 'confirmed') {
                payload.intakeMethod = null;
            }
            await updateDoc(doc(db, 'appointments', id), payload);
        } catch (error) {
            console.error('Error updating status:', error);
            toastError('Có lỗi xảy ra khi cập nhật trạng thái.');
        }
    };

    const handleCustomerCall = async (appointment: Appointment) => {
        if (appointment.status !== 'pending') return;

        try {
            await updateDoc(doc(db, 'appointments', appointment.id), {
                status: 'confirmed',
                calledAt: serverTimestamp(),
                confirmedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toastSuccess('Đã ghi nhận cuộc gọi xác nhận lịch hẹn.');
        } catch (error) {
            console.error('Error marking appointment call:', error);
            toastError('Có lỗi xảy ra khi ghi nhận cuộc gọi xác nhận.');
        }
    };

    const handleUpdateIntakeMethod = async (appointment: Appointment, intakeMethod: AppointmentIntakeMethod) => {
        if (appointment.status !== 'confirmed') return;

        try {
            await updateDoc(doc(db, 'appointments', appointment.id), {
                intakeMethod,
                updatedAt: serverTimestamp(),
            });
            toastSuccess('Đã ghi nhận cách khách giao máy.');
        } catch (error) {
            console.error('Error updating appointment intake method:', error);
            toastError('Có lỗi xảy ra khi cập nhật cách khách giao máy.');
        }
    };

    const buildRepairHandoffHref = (appointment: Appointment) => {
        const params = new URLSearchParams({
            appointmentId: appointment.id,
            intakeMethod: appointment.intakeMethod || '',
            customerName: appointment.fullName || '',
            customerPhone: appointment.phone || '',
        });
        if (appointment.serviceId) params.set('serviceId', appointment.serviceId);
        if (appointment.serviceName) params.set('serviceName', appointment.serviceName);
        return `/admin/repairs?${params.toString()}`;
    };

    const renderIntakeActions = (appointment: Appointment, variant: 'mobile' | 'desktop') => {
        if (appointment.status !== 'confirmed') return null;

        const selectedMethod = appointment.intakeMethod ? intakeMethodConfig[appointment.intakeMethod] : null;
        const isMobile = variant === 'mobile';

        return (
            <div className={isMobile ? 'space-y-2' : 'mt-2 flex flex-col items-end gap-2'}>
                <div className={isMobile ? 'grid grid-cols-2 gap-2' : 'inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5'}>
                    {(Object.entries(intakeMethodConfig) as [AppointmentIntakeMethod, typeof intakeMethodConfig[AppointmentIntakeMethod]][]).map(([method, configItem]) => {
                        const active = appointment.intakeMethod === method;
                        return (
                            <button
                                key={method}
                                type="button"
                                onClick={() => void handleUpdateIntakeMethod(appointment, method)}
                                className={`${isMobile ? 'rounded-lg border px-2 py-2' : 'rounded-md px-2.5 py-1'} text-xs font-semibold transition-colors ${active ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-200 bg-white text-gray-600 hover:text-orange-700'}`}
                            >
                                {isMobile ? configItem.shortLabel : configItem.label}
                            </button>
                        );
                    })}
                </div>
                {selectedMethod ? (
                    <Link
                        href={buildRepairHandoffHref(appointment)}
                        className={isMobile ? 'inline-flex w-full items-center justify-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-600' : 'inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100'}
                    >
                        <Wrench size={12} />
                        Tạo phiếu - {selectedMethod.shortLabel}
                    </Link>
                ) : (
                    <span className="text-xs text-gray-500">Chọn cách khách giao máy để lên đơn</span>
                )}
            </div>
        );
    };

    const renderStatusGuidance = (appointment: Appointment, variant: 'mobile' | 'desktop') => {
        if (appointment.status === 'pending') {
            return (
                <p className={variant === 'mobile' ? 'rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700' : 'text-xs text-yellow-700'}>
                    Bấm SĐT để gọi và tự ghi nhận đã xác nhận.
                </p>
            );
        }

        if (appointment.status === 'confirmed') {
            return renderIntakeActions(appointment, variant);
        }

        if (appointment.status === 'cancelled') {
            return (
                <span className={variant === 'mobile' ? 'inline-flex rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600' : 'text-xs font-medium text-red-600'}>
                    Lịch hẹn đã hủy
                </span>
            );
        }

        return null;
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

    const { paginatedData: paginatedAppointments, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredAppointments, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery, statusFilter, storeFilter, activeTab]);

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
                    <h1 className="text-lg font-bold text-gray-900">Quản lý đặt lịch</h1>
                    <p className="text-gray-500">Danh sách khách hàng đăng ký sửa chữa</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab('active')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'active' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Đang hoạt động
                </button>
                <button
                    onClick={() => setActiveTab('completed')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'completed' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    Đã hoàn thành
                </button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="relative md:col-span-2">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Tìm tên, số điện thoại..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-8 text-sm pl-8 pr-3 border rounded-lg focus:border-orange-500 focus:outline-none"
                    />
                </div>
                {searchQuery.trim().length > 0 && filteredAppointments.length === 0 && (
                    <div className="md:col-span-1">
                        <button 
                            onClick={searchInDatabase}
                            disabled={isSearchingDB}
                            className="w-full h-8 text-sm px-4 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors flex justify-center items-center gap-2 font-medium"
                        >
                            {isSearchingDB ? <Loader2 className="animate-spin" size={18} /> : <Search size={14} />}
                            Tìm Server
                        </button>
                    </div>
                )}
                <div className={searchQuery.trim().length > 0 && filteredAppointments.length === 0 ? "md:col-span-2 grid grid-cols-2 gap-4" : "md:col-span-2 grid grid-cols-2 gap-4"}>
                    <select
                        title="Chọn trạng thái"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full h-8 text-sm px-4 border rounded-lg focus:border-orange-500 focus:outline-none bg-white"
                    >
                        <option value="">Tất cả trạng thái</option>
                        {Object.entries(statusConfig)
                            .filter(([key]) => activeTab === 'completed' ? key === 'completed' : key !== 'completed')
                            .map(([key, value]) => (
                            <option key={key} value={key}>{value.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <select
                        title="Chọn chi nhánh"
                        value={storeFilter}
                        onChange={(e) => setStoreFilter(e.target.value)}
                        className="w-full h-8 text-sm px-4 border rounded-lg focus:border-orange-500 focus:outline-none bg-white"
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
                {/* Mobile Card View */}
                <div className="block lg:hidden divide-y divide-gray-100">
                    {filteredAppointments.length === 0 ? (
                        <div className="px-6 py-12 text-center text-gray-500">
                            Không tìm thấy lịch hẹn nào.
                        </div>
                    ) : (
                        paginatedAppointments.map((app) => {
                            const status = statusConfig[app.status] || statusConfig.pending;
                            return (
                                <div key={app.id} className={`p-4 space-y-3 hover:bg-gray-50 transition-colors ${app.status === 'completed' ? 'opacity-60' : ''}`}>
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold shrink-0">
                                                {app.fullName.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 text-sm">{app.fullName}</p>
                                                <a href={`tel:${app.phone}`} onClick={() => void handleCustomerCall(app)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-0.5 transition-colors">
                                                    <Phone size={12} />
                                                    {app.phone}
                                                </a>
                                            </div>
                                        </div>
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${status.color}`}>
                                            <status.icon size={12} />
                                            {status.label}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm bg-gray-50/80 p-2.5 rounded-lg">
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase font-medium">Lịch hẹn</p>
                                            <p className="text-gray-900 font-medium text-xs">{new Date(app.date).toLocaleDateString('vi-VN')}</p>
                                            <p className="text-xs text-gray-500">{timeSlotLabels[app.timeSlot] || app.timeSlot}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase font-medium">Chi nhánh</p>
                                            <p className="text-xs text-gray-700">{getStoreName(app.store)}</p>
                                        </div>
                                    </div>
                                    {app.serviceName && (
                                        <div>
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-medium border border-orange-100">
                                                <Wrench size={12} />
                                                {app.serviceName}
                                            </span>
                                        </div>
                                    )}
                                    {app.status !== 'completed' && (
                                        <div className="flex flex-col gap-2">
                                            <select
                                                title="Chọn trạng thái"
                                                value={app.status}
                                                onChange={(e) => handleUpdateStatus(app.id, e.target.value)}
                                                className="hidden"
                                            >
                                                {Object.entries(statusConfig).map(([key, value]) => (
                                                    <option key={key} value={key}>{value.label}</option>
                                                ))}
                                            </select>
                                            {renderStatusGuidance(app, 'mobile')}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full min-w-[1000px]">
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
                                paginatedAppointments.map((app) => {
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
                                                        <a href={`tel:${app.phone}`} onClick={() => void handleCustomerCall(app)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1 transition-colors">
                                                            <Phone size={12} />
                                                            {app.phone}
                                                        </a>
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
                                                            title="Chọn trạng thái"
                                                            value={app.status}
                                                            onChange={(e) => handleUpdateStatus(app.id, e.target.value)}
                                                            className="hidden"
                                                        >
                                                            {Object.entries(statusConfig).map(([key, value]) => (
                                                                <option key={key} value={key}>{value.label}</option>
                                                            ))}
                                                        </select>
                                                        {renderStatusGuidance(app, 'desktop')}
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
                <PaginationBar
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalFiltered={totalFiltered}
                    totalAll={appointments.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    entityLabel="lịch hẹn"
                />
                
                {hasMore && !searchQuery && (
                    <div className="p-4 border-t border-gray-100 flex justify-center">
                        <button 
                            onClick={loadMoreData}
                            className="px-4 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            Tải thêm lịch sử cũ
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
