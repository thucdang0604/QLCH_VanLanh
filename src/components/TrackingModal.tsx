'use client';

import { useState } from 'react';
import { Search, Loader2, X, Smartphone, Wrench, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { RepairTicket } from '@/lib/types';
import { REPAIR_STATUS, isRepairStatus } from '@/lib/repairStatus';

interface TrackingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function TrackingModal({ isOpen, onClose }: TrackingModalProps) {
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [repairs, setRepairs] = useState<RepairTicket[]>([]);
    const [searched, setSearched] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    if (!isOpen) return null;

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!phone.trim()) return;
        setLoading(true);
        setSearched(true);
        setError('');
        setRepairs([]);

        try {
            const res = await fetch('/api/tracking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Truy vấn thất bại.');
            }

            const data = await res.json();
            const rData = (data.repairs || []) as RepairTicket[];
            
            // Sort by most recent
            rData.sort((a, b) => {
                const getTime = (v: unknown) => {
                    const obj = v as Record<string, unknown>;
                    if (obj?.seconds && typeof obj.seconds === 'number') return obj.seconds * 1000;
                    if (typeof obj?.toMillis === 'function') return (obj.toMillis as () => number)();
                    return new Date((v as string | number) || 0).getTime();
                };
                return getTime(b.createdAt) - getTime(a.createdAt);
            });
            
            setRepairs(rData);
        } catch (err: unknown) {
            setError((err as Error).message || 'Lỗi hệ thống');
        } finally {
            setLoading(false);
        }
    };

    const fmtDate = (ts: unknown) => {
        if (!ts) return '—';
        const obj = ts as Record<string, unknown>;
        const d = new Date(obj.seconds && typeof obj.seconds === 'number' ? obj.seconds * 1000 : (ts as string | number));
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const repairStatusConfig: Record<string, { label: string; color: string }> = {
        [REPAIR_STATUS.INTAKE]: { label: 'Chờ tiếp nhận', color: 'text-yellow-600' },
        [REPAIR_STATUS.INSPECTION]: { label: 'Đang kiểm tra', color: 'text-blue-600' },
        da_tinh_trang_va_gia: { label: 'Đã báo giá', color: 'text-purple-600' },
        doi_khach_phan_hoi: { label: 'Đợi phản hồi', color: 'text-amber-600' },
        tim_linh_kien: { label: 'Tìm linh kiện', color: 'text-cyan-600' },
        [REPAIR_STATUS.PARTS_ORDERED]: { label: 'Đã đặt linh kiện', color: 'text-indigo-600' },
        dang_sua_chua: { label: 'Đang sửa', color: 'text-orange-600' },
        [REPAIR_STATUS.CUSTOMER_HANDOVER]: { label: 'Chờ giao', color: 'text-green-600' },
        [REPAIR_STATUS.DONE]: { label: 'Hoàn tất', color: 'text-green-600' },
        [REPAIR_STATUS.REFUND]: { label: 'Hoàn phí', color: 'text-red-600' },
        [REPAIR_STATUS.OUT]: { label: 'Trả máy', color: 'text-gray-600' },
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
            <div 
                className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-300"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h3 className="font-bold text-lg text-gray-900">Tra cứu nhanh</h3>
                    <button 
                        title="Đóng"
                        onClick={onClose}
                        className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 max-h-[70vh] overflow-y-auto">
                    <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                        <input
                            type="tel"
                            placeholder="Nhập số điện thoại..."
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="flex-1 h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-orange-500 focus:outline-none transition-all"
                        />
                        <button
                            type="submit"
                            disabled={loading || !phone.trim()}
                            className="h-12 px-5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center shadow-md shadow-orange-500/20 active:scale-95 transition-all"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                        </button>
                    </form>

                    {error && (
                        <div className="text-center py-4 text-red-500 text-sm font-medium bg-red-50 rounded-xl">
                            {error}
                        </div>
                    )}

                    {searched && !loading && !error && (
                        <div className="space-y-3">
                            {repairs.length === 0 ? (
                                <div className="text-center py-8">
                                    <Wrench size={32} className="mx-auto text-gray-300 mb-2" />
                                    <p className="text-sm text-gray-500">Không tìm thấy phiếu sửa chữa nào.</p>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">
                                        Phiếu sửa chữa gần đây ({repairs.length})
                                    </p>
                                    <div className="space-y-3">
                                        {repairs.slice(0, 3).map((ticket) => (
                                            <div key={ticket.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0">
                                                            <Smartphone size={20} />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-900 text-sm">{ticket.deviceInfo?.model || 'Thiết bị Điện tử'}</p>
                                                            <p className="text-xs text-gray-500 mt-0.5">Nhận: {fmtDate(ticket.timing?.receivedAt)}</p>
                                                        </div>
                                                    </div>
                                                    <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase ${
                                                        isRepairStatus(ticket.status, REPAIR_STATUS.DONE) ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {repairStatusConfig[ticket.status]?.label || ticket.status}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button 
                                        onClick={() => {
                                            onClose();
                                            router.push('/tracking');
                                        }}
                                        className="w-full mt-4 flex items-center justify-center gap-2 py-3 text-sm font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors"
                                    >
                                        Xem chi tiết lộ trình <ArrowRight size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
