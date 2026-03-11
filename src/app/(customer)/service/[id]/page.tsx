'use client';

import { useState, use, useEffect } from 'react';
import Link from 'next/link';
import {
    ChevronRight, Shield, Clock, Phone, User, CalendarClock,
    MapPin, Loader2, ArrowRight, CheckCircle2, X, Wrench,
} from 'lucide-react';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useConfig } from '@/lib/ConfigContext';
import VideoEmbed from '@/components/VideoEmbed';

/* ── Inline Toast ── */
function Toast({ message, type = 'success', onClose }: { message: string; type?: 'success' | 'error'; onClose: () => void }) {
    return (
        <div className="fixed top-6 right-6 z-[100] animate-[fadeIn_0.3s_ease-in-out]">
            <div className={`${type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm`}>
                <CheckCircle2 size={22} className="flex-shrink-0" />
                <span className="text-sm font-medium">{message}</span>
                <button onClick={onClose} className="ml-2 hover:bg-white/20 rounded p-0.5 transition-colors">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}

/* ── Types ── */
interface ServiceData {
    id: string;
    name: string;
    image?: string;
    imageUrl?: string;
    description?: string;
    price?: number;
    price_original?: number;
    price_promo?: number;
    warranty_text?: string;
    repair_time?: string;
    category?: string;
    tags?: string[];
    videoEmbedUrl?: string;
}

const formatPrice = (p: number) => {
    if (p <= 0) return 'Liên hệ';
    return new Intl.NumberFormat('vi-VN').format(p) + 'đ';
};

/* ── Page Component ── */
export default function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { config, formatHotline } = useConfig();
    const branches = config.store_branches || [];

    // Service data
    const [service, setService] = useState<ServiceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    // Booking form
    const [formData, setFormData] = useState({
        fullName: '',
        phone: '',
        date: '',
        timeSlot: '',
        store: branches[0]?.id || '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    // Fetch service document
    useEffect(() => {
        const fetchService = async () => {
            try {
                const docRef = doc(db, 'services', id);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setService({ id: snap.id, ...snap.data() } as ServiceData);
                } else {
                    setNotFound(true);
                }
            } catch (err) {
                console.error('Error fetching service:', err);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };
        fetchService();
    }, [id]);

    // Update store default when branches load
    useEffect(() => {
        if (branches.length > 0 && !formData.store) {
            setFormData(prev => ({ ...prev, store: branches[0].id }));
        }
    }, [branches]);

    // Date options (next 7 days)
    const getDateOptions = () => {
        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() + i);
            const label =
                i === 0 ? 'Hôm nay'
                    : i === 1 ? 'Ngày mai'
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

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.fullName || !formData.phone || !formData.date || !formData.timeSlot) {
            showToast('Vui lòng điền đầy đủ thông tin!', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'appointments'), {
                fullName: formData.fullName,
                phone: formData.phone,
                date: formData.date,
                timeSlot: formData.timeSlot,
                store: formData.store,
                serviceName: service?.name || '',
                serviceId: service?.id || '',
                status: 'pending',
                createdAt: serverTimestamp(),
            });
            showToast('🎉 Đặt lịch thành công! Chúng tôi sẽ liên hệ bạn sớm.');
            setFormData({ fullName: '', phone: '', date: '', timeSlot: '', store: branches[0]?.id || '' });
        } catch (error) {
            console.error('Booking error:', error);
            showToast('Có lỗi xảy ra. Vui lòng thử lại.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Computed prices
    const originalPrice = service?.price_original ?? service?.price ?? 0;
    const promoPrice = service?.price_promo ?? undefined;
    const discount = promoPrice && originalPrice
        ? Math.round(((originalPrice - promoPrice) / originalPrice) * 100)
        : 0;
    const displayImage = service?.image || service?.imageUrl || '';

    /* ── Loading State ── */
    if (loading) {
        return (
            <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
                <div className="bg-white rounded-xl shadow-sm flex items-center justify-center py-20">
                    <Loader2 size={40} className="animate-spin text-copper" />
                </div>
            </div>
        );
    }

    /* ── Not Found ── */
    if (notFound || !service) {
        return (
            <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
                <div className="bg-white rounded-xl shadow-sm flex flex-col items-center justify-center gap-4 py-20">
                    <Wrench size={48} className="text-gray-300" />
                    <p className="text-gray-500 text-lg">Không tìm thấy dịch vụ</p>
                    <Link href="/category/sua-chua" className="text-copper hover:underline">
                        ← Xem tất cả dịch vụ
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
                {/* Toast */}
                {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/" className="hover:text-copper">Trang chủ</Link>
                    <ChevronRight size={14} />
                    <Link href="/category/sua-chua" className="hover:text-copper">Sửa chữa</Link>
                    <ChevronRight size={14} />
                    <span className="text-gray-800 font-medium line-clamp-1">{service.name}</span>
                </nav>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

                    {/* ── LEFT: Service Info (3/5) ── */}
                    <div className="lg:col-span-3 space-y-6">
                        {/* Image */}
                        <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
                            <div className="relative aspect-[16/10] bg-gray-100">
                                {displayImage ? (
                                    <img
                                        src={displayImage}
                                        alt={service.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-copper/10 to-copper/5">
                                        <Wrench size={64} className="text-copper/30" />
                                    </div>
                                )}
                                {discount > 0 && (
                                    <span className="absolute top-4 left-4 bg-accent text-white text-sm font-bold px-3 py-1.5 rounded-lg">
                                        -{discount}%
                                    </span>
                                )}
                            </div>

                            {/* Video Embed */}
                            {service.videoEmbedUrl && (
                                <div className="mt-4">
                                    <VideoEmbed url={service.videoEmbedUrl} />
                                </div>
                            )}
                        </div>

                        {/* Details Card */}
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                            <h1 className="text-2xl font-bold text-gray-900 mb-4">{service.name}</h1>

                            {/* Price */}
                            <div className="mb-6">
                                {promoPrice && promoPrice > 0 ? (
                                    <div className="flex items-baseline gap-3">
                                        <span className="text-3xl font-bold text-accent">{formatPrice(promoPrice)}</span>
                                        {originalPrice > 0 && (
                                            <span className="text-lg text-gray-400 line-through">{formatPrice(originalPrice)}</span>
                                        )}
                                        {discount > 0 && (
                                            <span className="text-sm bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded">
                                                Tiết kiệm {formatPrice(originalPrice - promoPrice)}
                                            </span>
                                        )}
                                    </div>
                                ) : originalPrice > 0 ? (
                                    <span className="text-3xl font-bold text-gray-900">{formatPrice(originalPrice)}</span>
                                ) : (
                                    <span className="text-2xl font-bold text-copper">Liên hệ báo giá</span>
                                )}
                            </div>

                            {/* Badges */}
                            <div className="flex flex-wrap gap-3 mb-6">
                                {service.repair_time && (
                                    <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg">
                                        <Clock size={16} />
                                        <span className="text-sm font-medium">Thời gian: {service.repair_time}</span>
                                    </div>
                                )}
                                {service.warranty_text && (
                                    <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg">
                                        <Shield size={16} />
                                        <span className="text-sm font-medium">Bảo hành: {service.warranty_text}</span>
                                    </div>
                                )}
                            </div>

                            {/* Description */}
                            {service.description && (
                                <div className="prose prose-sm max-w-none text-gray-600 border-t pt-6">
                                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Mô tả dịch vụ</h3>
                                    <p className="whitespace-pre-line">{service.description}</p>
                                </div>
                            )}

                            {/* Tags */}
                            {service.tags && service.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
                                    {service.tags.map(tag => (
                                        <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── RIGHT: Booking Form (2/5) ── */}
                    <div className="lg:col-span-2">
                        <div className="sticky top-28 bg-dark rounded-2xl shadow-lg overflow-hidden">
                            {/* Header */}
                            <div className="px-6 pt-6 pb-4">
                                <div className="inline-flex items-center gap-2 bg-copper/20 text-copper px-3 py-1.5 rounded-full mb-3">
                                    <CalendarClock size={16} />
                                    <span className="text-xs font-medium">Đặt lịch online</span>
                                </div>
                                <h2 className="text-xl font-bold text-white mb-1">ĐẶT LỊCH SỬA CHỮA</h2>
                                <p className="text-sm text-copper/80 bg-copper/10 px-3 py-2 rounded-lg mt-2">
                                    📋 Bạn đang đặt lịch: <span className="font-semibold text-copper">{service.name}</span>
                                </p>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3">
                                {/* Name */}
                                <div className="relative">
                                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Họ và tên *"
                                        value={formData.fullName}
                                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        className="w-full pl-10 pr-4 py-3 bg-dark-light border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-copper transition-colors"
                                        required
                                    />
                                </div>

                                {/* Phone */}
                                <div className="relative">
                                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="tel"
                                        placeholder="Số điện thoại *"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full pl-10 pr-4 py-3 bg-dark-light border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-copper transition-colors"
                                        required
                                    />
                                </div>

                                {/* Date */}
                                <div className="relative">
                                    <CalendarClock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <select
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                        className="w-full pl-10 pr-4 py-3 bg-dark-light border border-gray-700 rounded-xl text-white text-sm appearance-none focus:outline-none focus:border-copper transition-colors"
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

                                {/* Time Slot */}
                                <div>
                                    <label className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
                                        <Clock size={12} />
                                        Chọn buổi *
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {timeSlots.map((slot) => (
                                            <button
                                                key={slot.value}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, timeSlot: slot.value })}
                                                className={`py-2.5 rounded-xl border text-center transition-all ${formData.timeSlot === slot.value
                                                    ? 'border-copper bg-copper/20 text-copper'
                                                    : 'border-gray-700 text-gray-400 hover:border-gray-500'
                                                    }`}
                                            >
                                                <span className="block font-bold text-xs">{slot.label}</span>
                                                <span className="block text-[10px] mt-0.5 opacity-70">{slot.time}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Branch */}
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <select
                                        value={formData.store}
                                        onChange={(e) => setFormData({ ...formData, store: e.target.value })}
                                        className="w-full pl-10 pr-4 py-3 bg-dark-light border border-gray-700 rounded-xl text-white text-sm appearance-none focus:outline-none focus:border-copper transition-colors"
                                    >
                                        {branches.map((branch: any) => (
                                            <option key={branch.id} value={branch.id}>
                                                {branch.name} - {branch.address}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3.5 bg-gradient-to-r from-copper to-copper-dark text-white font-bold text-sm rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-copper/25 flex items-center justify-center gap-2 mt-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            Đang xử lý...
                                        </>
                                    ) : (
                                        <>
                                            XÁC NHẬN ĐẶT LỊCH
                                            <ArrowRight size={18} />
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Branch info */}
                            {branches.length > 0 && (
                                <div className="px-6 pb-6 pt-2 border-t border-gray-800">
                                    <p className="text-xs text-gray-500 mb-2">Chi nhánh:</p>
                                    <div className="space-y-2">
                                        {branches.map((branch: any) => (
                                            <div key={branch.id} className="flex items-start gap-2 text-xs text-gray-400">
                                                <div className="w-1.5 h-1.5 bg-green-400 rounded-full mt-1.5 flex-shrink-0" />
                                                <div>
                                                    <span className="text-white font-medium">{branch.name}</span>
                                                    <span className="block">{branch.address}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
