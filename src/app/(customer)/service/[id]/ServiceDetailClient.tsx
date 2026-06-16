'use client';

import { useState, useEffect } from 'react';
import {
    CalendarClock,
    User,
    Phone,
    MapPin,
    ArrowRight,
    Loader2,
    CheckCircle2,
    X,
    Clock,
    Shield,
    Wrench,
} from 'lucide-react';
import Image from 'next/image';
import { useConfig } from '@/lib/ConfigContext';
import VideoEmbed from '@/components/VideoEmbed';

export interface ServiceData {
    id: string;
    name: string;
    price?: number;
    price_original?: number;
    price_promo?: number;
    image?: string;
    imageUrl?: string;
    images?: string[];
    videoEmbedUrl?: string;
    repair_time?: string;
    warranty_text?: string;
    description?: string;
    tags?: string[];
}

/* ── Inline Toast ── */

function Toast({ message, type = 'success', onClose }: { message: string; type?: 'success' | 'error'; onClose: () => void }) {
    return (
        <div className="fixed top-6 right-6 z-[100] animate-[fadeIn_0.3s_ease-in-out]">
            <div className={`${type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm`}>
                <CheckCircle2 size={22} className="flex-shrink-0" />
                <span className="text-sm font-medium">{message}</span>
                <button onClick={onClose} aria-label="Đóng" title="Đóng" className="ml-2 hover:bg-white/20 rounded p-0.5 transition-colors">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}

const formatPrice = (p: number) => {
    if (p <= 0) return 'Liên hệ';
    return new Intl.NumberFormat('vi-VN').format(p) + 'đ';
};

export default function ServiceDetailClient({ service }: { service: ServiceData }) {
    const { config } = useConfig();
    const branches = config.store_branches || [];
    const [activeImage, setActiveImage] = useState(0);

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

    // Update store default when branches load
    useEffect(() => {
        const currentBranches = config.store_branches || [];
        if (currentBranches.length > 0 && !formData.store) {
            setFormData(prev => ({ ...prev, store: currentBranches[0].id }));
        }
    }, [config.store_branches, formData.store]);

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
            const res = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName: formData.fullName,
                    phone: formData.phone,
                    date: formData.date,
                    timeSlot: formData.timeSlot,
                    store: formData.store,
                    serviceName: service?.name || '',
                    serviceId: service?.id || '',
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data.error || 'Có lỗi xảy ra. Vui lòng thử lại.', 'error');
                return;
            }
            showToast('🎉 Đặt lịch thành công! Chúng tôi sẽ liên hệ bạn sớm.');
            setFormData({ fullName: '', phone: '', date: '', timeSlot: '', store: branches[0]?.id || '' });
        } catch (error) {
            console.error('Booking error:', error);
            showToast('Có lỗi xảy ra. Vui lòng thử lại.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!service) return null;

    // Computed prices
    const originalPrice = service.price_original ?? service.price ?? 0;
    const promoPrice = service.price_promo ?? undefined;
    const discount = promoPrice && originalPrice
        ? Math.round(((originalPrice - promoPrice) / originalPrice) * 100)
        : 0;
    const images = service.images?.length
        ? service.images
        : (service.imageUrl ? [service.imageUrl] : (service.image ? [service.image] : []));
    const displayImage = images[activeImage] || '';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            {/* ── LEFT: Service Info (3/5) ── */}
            <div className="lg:col-span-3 space-y-6">
                {/* Image */}
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100">
                    <div className="relative aspect-[16/10] bg-gray-100">
                        {displayImage ? (
                            <Image
                                src={displayImage}
                                alt={service.name}
                                fill
                                priority
                                unoptimized
                                className="object-cover"
                                sizes="(max-width: 1024px) 100vw, 60vw"
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

                    {images.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto p-4 pt-0">
                            {images.map((img, index) => (
                                <button
                                    key={`${img}-${index}`}
                                    type="button"
                                    onClick={() => setActiveImage(index)}
                                    className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 bg-gray-100 transition-all ${
                                        activeImage === index ? 'border-copper ring-2 ring-copper/15' : 'border-gray-100 hover:border-copper/40'
                                    }`}
                                    aria-label={`Xem ảnh dịch vụ ${index + 1}`}
                                    title={`Xem ảnh dịch vụ ${index + 1}`}
                                >
                                    <Image
                                        src={img}
                                        alt={`${service.name} ${index + 1}`}
                                        fill
                                        unoptimized
                                        className="object-cover"
                                        sizes="80px"
                                    />
                                </button>
                            ))}
                        </div>
                    )}

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
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2 min-w-0">
                                <span className="text-3xl font-bold text-accent break-words">{formatPrice(promoPrice)}</span>
                                {originalPrice > 0 && (
                                    <span className="text-lg text-gray-400 line-through">{formatPrice(originalPrice)}</span>
                                )}
                                {discount > 0 && (
                                    <span className="max-w-full text-sm bg-red-50 text-red-600 font-semibold px-2 py-0.5 rounded whitespace-normal break-words">
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
                            {service.tags.map((tag: string) => (
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
                                aria-label="Chọn ngày hẹn"
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
                                aria-label="Chọn chi nhánh"
                                className="w-full pl-10 pr-4 py-3 bg-dark-light border border-gray-700 rounded-xl text-white text-sm appearance-none focus:outline-none focus:border-copper transition-colors"
                            >
                                {branches.map((branch: { id: string; name: string; address?: string }) => (
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
                                {branches.map((branch: { id: string; name: string; address?: string }) => (
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
    );
}
