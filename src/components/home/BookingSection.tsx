'use client';

import { useState, useEffect } from 'react';
import { CalendarClock, Clock, Phone, User, CheckCircle2, X, Search, Loader2, MapPin, ArrowRight, History, XCircle, type LucideIcon } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useConfig } from '@/lib/ConfigContext';
import type { FirestoreDateValue } from '@/lib/types';

// Inline Toast component
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
    return (
        <div className="fixed top-6 right-6 z-[100] animate-[fadeIn_0.3s_ease-in-out]">
            <div className="bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm">
                <CheckCircle2 size={22} className="flex-shrink-0" />
                <span className="text-sm font-medium">{message}</span>
                <button title="Đóng" onClick={onClose} className="ml-2 hover:bg-green-600 rounded p-0.5 transition-colors">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}

// Tracking Result Interface
interface Appointment {
    id: string;
    fullName: string;
    phone: string;
    date: string;
    timeSlot: string;
    store: string;
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
    createdAt: FirestoreDateValue;
}

const statusConfig: Record<string, { color: string; label: string; icon: LucideIcon }> = {
    pending: { color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', label: 'Chờ xác nhận', icon: Clock },
    confirmed: { color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', label: 'Đã xác nhận', icon: CheckCircle2 },
    completed: { color: 'bg-green-500/20 text-green-300 border-green-500/30', label: 'Hoàn thành', icon: CheckCircle2 },
    cancelled: { color: 'bg-red-500/20 text-red-300 border-red-500/30', label: 'Đã hủy', icon: XCircle },
};

const timeSlotLabels: Record<string, string> = {
    morning: 'Sáng (9h - 12h)',
    afternoon: 'Chiều (12h - 17h)',
    evening: 'Tối (17h - 21h)',
};

export default function BookingSection() {
    const { config, formatHotline } = useConfig();
    const branches = config.store_branches || [];

    // View Mode: 'booking' or 'tracking'
    const [viewMode, setViewMode] = useState<'booking' | 'tracking'>('booking');
    const [isFlipping, setIsFlipping] = useState(false);

    // Booking State
    const [formData, setFormData] = useState({
        fullName: '',
        phone: '',
        date: '',
        timeSlot: '',
        store: branches[0]?.id || '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Tracking State
    const [trackPhone, setTrackPhone] = useState('');
    const [isTracking, setIsTracking] = useState(false);
    const [trackResult, setTrackResult] = useState<Appointment[] | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    const [toast, setToast] = useState<string | null>(null);

    // Sync default store when branches are loaded
    useEffect(() => {
        const currentBranches = config.store_branches || [];
        if (currentBranches.length > 0 && !formData.store) {
            setFormData(prev => ({ ...prev, store: currentBranches[0].id }));
        }
    }, [config.store_branches, formData.store]);

    // Toggle Handler
    const handleToggle = () => {
        setIsFlipping(true);
        setTimeout(() => {
            setViewMode(prev => prev === 'booking' ? 'tracking' : 'booking');
            setTrackResult(null);
            setHasSearched(false);
            setIsFlipping(false);
        }, 300); // Wait for half animation
    };

    // Generate next 7 days
    const getDateOptions = () => {
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            const label =
                i === 0
                    ? 'Hôm nay'
                    : i === 1
                        ? 'Ngày mai'
                        : d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' });
            dates.push({ value: d.toISOString().split('T')[0], label });
        }
        return dates;
    };

    const timeSlots = [
        { value: 'morning', label: 'SÁNG', time: '9h - 12h' },
        { value: 'afternoon', label: 'CHIỀU', time: '12h - 17h' },
        { value: 'evening', label: 'TỐI', time: '17h - 21h' },
    ];

    const resetForm = () => {
        setFormData({
            fullName: '',
            phone: '',
            date: '',
            timeSlot: '',
            store: branches[0]?.id || ''
        });
    };

    const showToast = (message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 4000);
    };

    const handleSubmitBooking = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.fullName || !formData.phone || !formData.date || !formData.timeSlot) {
            showToast('Vui lòng điền đầy đủ thông tin!');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: formData.fullName,
                    phone: formData.phone,
                    date: formData.date,
                    timeSlot: formData.timeSlot,
                    store: formData.store,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Không thể đặt lịch.');
            }
            showToast('🎉 Đặt lịch thành công! Chúng tôi sẽ liên hệ bạn sớm.');
            resetForm();
        } catch (error) {
            console.error('Booking error:', error);
            showToast(error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTracking = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!trackPhone.trim()) return;

        setIsTracking(true);
        setHasSearched(true);
        setTrackResult([]);

        try {
            const cleanPhone = trackPhone.trim().replace(/\s+/g, '');
            const q = query(
                collection(db, 'appointments'),
                where('phone', '==', cleanPhone)
            );

            const snapshot = await getDocs(q);
            const data = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Appointment[];

            // Sort client-side to avoid index requirement
            const toMillis = (v: unknown): number => {
                if (!v) return 0;
                if (typeof v === 'object' && v !== null) {
                    if ('toMillis' in v && typeof (v as { toMillis?: unknown }).toMillis === 'function') {
                        return (v as { toMillis: () => number }).toMillis();
                    }
                    if ('toDate' in v && typeof (v as { toDate?: unknown }).toDate === 'function') {
                        return (v as { toDate: () => Date }).toDate().getTime();
                    }
                    if ('seconds' in v && typeof (v as { seconds?: unknown }).seconds === 'number') {
                        return (v as { seconds: number }).seconds * 1000;
                    }
                }
                if (v instanceof Date) return v.getTime();
                if (typeof v === 'number') return v;
                const d = new Date(v as never);
                return Number.isNaN(d.getTime()) ? 0 : d.getTime();
            };
            data.sort((a, b) => {
                return toMillis(b.createdAt) - toMillis(a.createdAt);
            });

            setTrackResult(data);
        } catch (error) {
            console.error('Tracking error:', error);
            showToast('Có lỗi khi tra cứu.');
        } finally {
            setIsTracking(false);
        }
    };

    const getBranchName = (id: string) => {
        return branches.find(b => b.id === id)?.name || id;
    };

    return (
        <section id="booking-section" className="py-2">
            {/* Toast Notification */}
            {toast && <Toast message={toast} onClose={() => setToast(null)} />}

            <div className="max-w-[1200px] mx-auto px-2 md:px-4">
                <div className="rounded-xl shadow-lg overflow-hidden px-6 py-12 relative min-h-[600px] transition-all perspective-[1000px]" style={{ backgroundColor: 'var(--outer-bg, #1a1a2e)' }}>
                    

                    {/* Top Right Toggle Button */}
                    <button
                        onClick={handleToggle}
                        className="absolute top-6 right-6 z-10 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-sm transition-all text-sm font-medium border border-white/10 hover:scale-105 active:scale-95"
                    >
                        {viewMode === 'booking' ? (
                            <>
                                <Search size={16} />
                                <span>Tra cứu lịch hẹn</span>
                            </>
                        ) : (
                            <>
                                <CalendarClock size={16} />
                                <span>Đặt lịch mới</span>
                            </>
                        )}
                    </button>

                    <div
                        className={`max-w-2xl mx-auto transition-all duration-500 ease-in-out transform-style-3d ${isFlipping ? 'opacity-0 rotate-y-90 scale-95' : 'opacity-100 rotate-y-0 scale-100'
                            }`}
                    >

                        {/* Title Section - Updates based on mode */}
                        <div className="text-center mb-8">
                            <div className="inline-flex items-center gap-2 bg-copper/20 text-copper px-4 py-2 rounded-full mb-4">
                                {viewMode === 'booking' ? <CalendarClock size={18} /> : <History size={18} />}
                                <span className="text-sm font-medium">
                                    {viewMode === 'booking' ? 'Đặt lịch online' : 'Tra cứu lịch hẹn'}
                                </span>
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-2">
                                {viewMode === 'booking' ? 'ĐẶT LỊCH SỬA CHỮA' : 'KIỂM TRA LỊCH HẸN'}
                            </h2>
                            <p className="text-gray-400">
                                {viewMode === 'booking'
                                    ? 'Vui lòng nhập thông tin, chúng tôi sẽ liên hệ xác nhận'
                                    : 'Nhập số điện thoại để xem trạng thái lịch hẹn của bạn'}
                            </p>
                        </div>

                        {/* ============ BOOKING FORM ============ */}
                        {viewMode === 'booking' && (
                            <form onSubmit={handleSubmitBooking} className="space-y-4 animate-[fadeIn_0.3s_ease]">
                                {/* Name & Phone */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="relative">
                                        <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Họ và tên *"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                            className="w-full pl-12 pr-4 py-3.5 bg-dark-light border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-copper transition-colors"
                                            required
                                        />
                                    </div>
                                    <div className="relative">
                                        <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="tel"
                                            placeholder="Số điện thoại *"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            className="w-full pl-12 pr-4 py-3.5 bg-dark-light border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-copper transition-colors"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Date + Store Row */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="relative">
                                        <CalendarClock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <select
                                            value={formData.date}
                                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                            aria-label="Chọn ngày hẹn"
                                            className="w-full pl-12 pr-4 py-3.5 bg-dark-light border border-gray-700 rounded-xl text-white appearance-none focus:outline-none focus:border-copper transition-colors"
                                            required
                                        >
                                            <option value="" className="text-gray-500">Chọn ngày *</option>
                                            {getDateOptions().map((d) => (
                                                <option key={d.value} value={d.value} className="text-white bg-dark-light">
                                                    {d.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <select
                                        value={formData.store}
                                        onChange={(e) => setFormData({ ...formData, store: e.target.value })}
                                        aria-label="Chọn chi nhánh"
                                        className="w-full px-4 py-3.5 bg-dark-light border border-gray-700 rounded-xl text-white appearance-none focus:outline-none focus:border-copper transition-colors"
                                    >
                                        {branches.map((branch) => (
                                            <option key={branch.id} value={branch.id}>
                                                {branch.name} - {branch.address}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Time Slot */}
                                <div>
                                    <label className="text-sm text-gray-400 mb-3 flex items-center gap-2">
                                        <Clock size={14} />
                                        Chọn buổi *
                                    </label>
                                    <div className="grid grid-cols-3 gap-3">
                                        {timeSlots.map((slot) => (
                                            <button
                                                key={slot.value}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, timeSlot: slot.value })}
                                                className={`py-3 rounded-xl border text-center transition-all ${formData.timeSlot === slot.value
                                                    ? 'border-copper bg-copper/20 text-copper'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                    }`}
                                            >
                                                <span className="block font-bold text-sm">{slot.label}</span>
                                                <span className="block text-xs mt-0.5 opacity-70">{slot.time}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-4 bg-gradient-to-r from-copper to-copper-dark text-white font-bold text-lg rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-copper/25 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={24} className="animate-spin" />
                                            Đang xử lý...
                                        </>
                                    ) : (
                                        <>
                                            ĐẶT LỊCH SỬA CHỮA
                                            <ArrowRight size={20} />
                                        </>
                                    )}
                                </button>
                            </form>
                        )}

                        {/* ============ TRACKING FORM ============ */}
                        {viewMode === 'tracking' && (
                            <div className="space-y-6 animate-[fadeIn_0.3s_ease]">
                                <form onSubmit={handleTracking} className="relative">
                                    <input
                                        type="tel"
                                        placeholder="Nhập số điện thoại của bạn..."
                                        value={trackPhone}
                                        onChange={(e) => setTrackPhone(e.target.value)}
                                        className="w-full pl-6 pr-32 py-4 bg-dark-light border border-gray-700 rounded-xl text-white text-lg placeholder-gray-500 focus:outline-none focus:border-copper transition-colors"
                                    />
                                    <button
                                        type="submit"
                                        disabled={isTracking || !trackPhone.trim()}
                                        className="absolute right-2 top-2 bottom-2 px-6 bg-gradient-to-r from-copper to-copper-dark text-white font-medium rounded-lg hover:shadow-lg hover:shadow-copper/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                                    >
                                        {isTracking ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                                        Tra cứu
                                    </button>
                                </form>

                                {/* Tracking Results */}
                                {hasSearched && !isTracking && (
                                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {(!trackResult || trackResult.length === 0) ? (
                                            <div className="text-center py-8 bg-white/5 rounded-xl border border-white/5">
                                                <p className="text-gray-400">Không tìm thấy lịch hẹn nào với số điện thoại này.</p>
                                            </div>
                                        ) : (
                                            trackResult.map((app) => {
                                                const status = statusConfig[app.status] || statusConfig.pending;
                                                return (
                                                    <div key={app.id} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-colors">
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-copper/20 flex items-center justify-center text-copper">
                                                                    <CalendarClock size={20} />
                                                                </div>
                                                                <div>
                                                                    <div className="text-white font-bold">
                                                                        {new Date(app.date).toLocaleDateString('vi-VN')}
                                                                    </div>
                                                                    <div className="text-xs text-copper">
                                                                        {timeSlotLabels[app.timeSlot] || app.timeSlot}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${status.color}`}>
                                                                <status.icon size={14} />
                                                                {status.label}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
                                                            <div className="flex items-center gap-2">
                                                                <User size={14} /> {app.fullName}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <MapPin size={14} /> {getBranchName(app.store)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Store Info Footer (Always Visible) */}
                        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-400 pt-8 border-t border-gray-800">
                            {branches.map((branch) => (
                                <div key={branch.id} className="flex items-start gap-3 bg-dark-light p-4 rounded-xl">
                                    <div className="w-2 h-2 bg-green-400 rounded-full mt-1.5 flex-shrink-0" />
                                    <div>
                                        <span className="block text-white font-medium mb-1">{branch.name}</span>
                                        <span className="block">{branch.address}</span>
                                        <a href={`tel:${branch.phone}`} className="text-copper hover:underline">
                                            {formatHotline(branch.phone)}
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

