'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import {
    Search, Loader2, Calendar, Clock, MapPin, CheckCircle2, Phone,
    XCircle, User, Wrench, ShoppingCart, Package, AlertCircle,
    Smartphone, Star, PlayCircle, Image as ImageIcon, CircleDot,
    Camera, X, HeartHandshake, Shield
} from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import { uploadMedia } from '@/lib/storage';
import type { RepairTicket, TrackingGroup, FirestoreDateValue, WorkflowNode } from '@/lib/types';
import { isYouTubeUrl, getYouTubeEmbedUrl } from '@/lib/workflowFeatures';
import type { LucideIcon } from 'lucide-react';
import { SITE_URL } from "@/lib/constants";

/* ─── Appointment ─── */
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

const appointmentStatusConfig: Record<string, { color: string; label: string; icon: LucideIcon }> = {
    pending: { color: 'bg-yellow-50 text-yellow-700 border-yellow-200', label: 'Chờ xác nhận', icon: Clock },
    confirmed: { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Đã xác nhận', icon: CheckCircle2 },
    completed: { color: 'bg-green-50 text-green-700 border-green-200', label: 'Hoàn thành', icon: CheckCircle2 },
    cancelled: { color: 'bg-red-50 text-red-700 border-red-200', label: 'Đã hủy', icon: XCircle },
};

const timeSlotLabels: Record<string, string> = {
    morning: 'Sáng (9h - 12h)',
    afternoon: 'Chiều (12h - 17h)',
    evening: 'Tối (17h - 21h)',
};

const repairStatusConfig: Record<string, { label: string; color: string }> = {
    cho_tiep_nhan: { label: 'Chờ tiếp nhận', color: 'text-yellow-600' },
    dang_kiem_tra: { label: 'Đang kiểm tra', color: 'text-blue-600' },
    da_tinh_trang_va_gia: { label: 'báo tình trạng và giá sau kiểm tra', color: 'text-purple-600' },
    doi_khach_phan_hoi: { label: 'Đợi khách phản hồi', color: 'text-amber-600' },
    tim_linh_kien: { label: 'Tìm linh kiện', color: 'text-cyan-600' },
    da_dat_linh_kien: { label: 'Đã đặt linh kiện', color: 'text-indigo-600' },
    dang_sua_chua: { label: 'Đang sửa chữa', color: 'text-orange-600' },
    cho_ban_giao_khach: { label: 'Chờ bàn giao khách', color: 'text-green-600' },
    done: { label: 'Hoàn tất đơn', color: 'text-green-600' },
    refund: { label: 'Hoàn phí', color: 'text-red-600' },
    out: { label: 'Trả máy', color: 'text-gray-600' },
};

const paymentLabels: Record<string, string> = {
    unpaid: 'Chưa thanh toán',
    deposit: 'Đã cọc',
    paid: 'Đã thanh toán',
    pay_later: 'Thanh toán sau',
    refunded: 'Đã hoàn tiền',
};

interface OrderItem {
    productName: string;
    image?: string;
    color?: string;
    storage?: string;
    quantity: number;
    price: number;
}

interface Order {
    id: string;
    status: string;
    createdAt: FirestoreDateValue;
    customer_info: { phone: string; name?: string; note?: string };
    items?: OrderItem[];
    shipping_fee?: number;
    total_amount: number;
}

const TERMINAL_STATUSES = ['done', 'refund', 'out'];

/* ─── Helpers ─── */
const fmtDate = (ts: unknown) => {
    if (!ts) return '—';
    const maybe = ts as { toDate?: () => Date };
    const d = typeof maybe?.toDate === 'function' ? maybe.toDate() : new Date(ts as string | number | Date);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtPrice = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';

/* ─────────────────────── */
export default function TrackingPage() {
    const seoTitle = 'Tra cứu thông tin | Văn Lành Service';
    const seoDescription = 'Tra cứu phiếu sửa chữa, lịch hẹn và thông tin liên quan theo số điện thoại tại Văn Lành Service.';
    const canonicalUrl = `${SITE_URL}/tracking`;
    const { config } = useConfig();
    const [activeTab, setActiveTab] = useState<'appointment' | 'repair' | 'order'>('repair');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    // Data
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [repairs, setRepairs] = useState<RepairTicket[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [trackingGroups, setTrackingGroups] = useState<TrackingGroup[]>([]);
    const [reviewedTickets, setReviewedTickets] = useState<string[]>([]);
    const [dynamicStatuses, setDynamicStatuses] = useState<WorkflowNode[]>([]);
    const [warrantyStatuses, setWarrantyStatuses] = useState<WorkflowNode[]>([]);

    const getWorkflowForTicket = (ticket: RepairTicket): WorkflowNode[] => {
        return ticket.ticketType === 'warranty' ? warrantyStatuses : dynamicStatuses;
    };

    // Review Modal States
    const [reviewModal, setReviewModal] = useState<RepairTicket | null>(null);
    const [rating, setRating] = useState(5);
    const [hoverRating, setHoverRating] = useState(0);
    const [content, setContent] = useState('');
    const [images, setImages] = useState<File[]>([]);
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [submittingReview, setSubmittingReview] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const fetchSystemConfig = async () => {
            try {
                const snap = await getDoc(doc(db, 'system_config', 'repairs'));
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.trackingGroups) {
                        const groups = data.trackingGroups as TrackingGroup[];
                        groups.sort((a, b) => a.order - b.order);
                        setTrackingGroups(groups);
                    }
                    setDynamicStatuses(data.repairStatuses ?? data.statuses ?? []);
                    setWarrantyStatuses(data.warrantyStatuses ?? []);
                }
            } catch (err) {
                console.error("Config fetch error:", err);
            }
        };
        fetchSystemConfig();
    }, []);

    /* ── Search ── */
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!phone.trim()) return;

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

        setLoading(true);
        setSearched(true);
        setAppointments([]);
        setRepairs([]);
        setOrders([]);

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

            const aData = (data.appointments || []) as Appointment[];
            aData.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            setAppointments(aData);

            const rData = (data.repairs || []) as RepairTicket[];
            rData.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            setRepairs(rData);

            const oData = (data.orders || []) as Order[];
            oData.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            setOrders(oData);
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStoreName = (storeId: string) => {
        const branches = (config.store_branches || []) as Array<Partial<{ id: string; name: string }>>;
        const branch = branches.find((b) => b.id === storeId);
        return branch?.name || storeId;
    };

    /* ── Review Logic ── */
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            const validFiles = filesArray.filter(f => f.size <= 5 * 1024 * 1024);
            if (validFiles.length < filesArray.length) {
                alert('Một số ảnh vượt quá dung lượng 5MB và đã bị loại bỏ.');
            }
            setImages(prev => [...prev, ...validFiles].slice(0, 5));
            validFiles.forEach(file => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (e.target?.result) {
                        setImageUrls(prev => [...prev, e.target!.result as string].slice(0, 5));
                    }
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
        setImageUrls(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reviewModal) return;

        if (!content.trim() && images.length === 0 && rating < 5) {
            alert('Vui lòng chia sẻ thêm nội dung đánh giá để chúng tôi phục vụ tốt hơn.');
            return;
        }

        setSubmittingReview(true);
        try {
            const uploadedUrls: string[] = [];
            for (const file of images) {
                const url = await uploadMedia(file, 'reviews');
                uploadedUrls.push(url);
            }

            // Submit review via API route (rate limited)
            const res = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    referenceId: reviewModal.id,
                    type: 'repair',
                    customerName: reviewModal.customer.name,
                    phone: reviewModal.customer.phone,
                    rating,
                    content: content.trim(),
                    images: uploadedUrls,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.error || 'Có lỗi xảy ra khi gửi đánh giá. Vui lòng thử lại.');
                return;
            }

            setReviewedTickets(prev => [...prev, reviewModal.id]);
            setReviewModal(null);
            alert('Cảm ơn bạn đã đánh giá dịch vụ!');
        } catch (error) {
            console.error('Error submitting review:', error);
            alert('Có lỗi xảy ra khi gửi đánh giá. Vui lòng thử lại.');
        } finally {
            setSubmittingReview(false);
        }
    };

    const closeReviewModal = () => {
        setReviewModal(null);
        setRating(5);
        setContent('');
        setImages([]);
        setImageUrls([]);
    };

    /* ── Component: Vertical Timeline (Tracking Groups) ── */
    const RepairTimeline = ({ ticket, isTerminal, currentStatus }: { ticket: RepairTicket, isTerminal: boolean, currentStatus: WorkflowNode | undefined }) => {
        // Determinate active group
        let currentGroupIndex = -1;

        if (isTerminal) {
            currentGroupIndex = trackingGroups.length; // Max out
        } else {
            const foundIndex = trackingGroups.findIndex(g => g.mappedStatuses.includes(ticket.status));
            currentGroupIndex = foundIndex >= 0 ? foundIndex : 0; // default to 0 if weird state
        }

        return (
            <div className="mt-6 flex flex-col gap-6">

                {/* --- TERMINAL BANNER --- */}
                {isTerminal && (
                    <div className={`overflow-hidden rounded-2xl border-2 shadow-sm ${ticket.status.includes('done')
                        ? 'border-green-200 bg-green-50'
                        : ticket.status.includes('refund') || ticket.status === 'hoan_phi'
                            ? 'border-red-200 bg-red-50'
                            : 'border-gray-200 bg-gray-50'
                        }`}>
                        <div className="p-4 md:p-5 flex flex-col items-center text-center gap-3">
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${ticket.status.includes('done')
                                ? 'bg-green-100 text-green-600'
                                : ticket.status.includes('refund') || ticket.status === 'hoan_phi'
                                    ? 'bg-red-100 text-red-600'
                                    : 'bg-gray-200 text-gray-600'
                                }`}>
                                {ticket.status.includes('done') ? <CheckCircle2 size={32} /> : ticket.status.includes('refund') || ticket.status === 'hoan_phi' ? <XCircle size={32} /> : <Package size={32} />}
                            </div>
                            <div>
                                <h3 className={`font-bold text-lg ${ticket.status.includes('done')
                                    ? 'text-green-800'
                                    : ticket.status.includes('refund') || ticket.status === 'hoan_phi'
                                        ? 'text-red-800'
                                        : 'text-gray-800'
                                    }`}>
                                    Phiếu đã kết thúc
                                </h3>
                                <p className="text-sm font-medium mt-1">
                                    Trạng thái cuối:
                                    <span className="ml-1 uppercase tracking-wide opacity-90">
                                        {currentStatus?.label || repairStatusConfig[ticket.status]?.label || ticket.status}
                                    </span>
                                </p>
                            </div>

                            {/* Delivery Note */}
                            {ticket.deliveryNote && (
                                <p className="text-sm bg-white/60 px-4 py-2 rounded-lg mt-1 inline-block border border-white">
                                    📝 <b>Ghi chú:</b> {ticket.deliveryNote}
                                </p>
                            )}
                        </div>

                        {/* Media Terminal Review Area */}
                        {ticket.postRepairMedia?.length > 0 && (
                            <div className="bg-white/80 border-t border-black/5 p-4 md:p-5">
                                <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-2 uppercase tracking-wider">
                                    <PlayCircle size={14} className="text-blue-500" />
                                    Hình ảnh / Video Trả máy
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {ticket.postRepairMedia.map((url: string, i: number) => (
                                        <div key={i} className="rounded-xl overflow-hidden border border-gray-200 bg-black aspect-video relative group shadow-sm">
                                            {isYouTubeUrl(url) ? (
                                                <iframe src={getYouTubeEmbedUrl(url) || ''} title={`YouTube ${i + 1}`}
                                                    className="w-full h-full" frameBorder="0"
                                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                                            ) : url.includes('.mp4') || url.includes('video') ? (
                                                <video controls src={url} className="w-full h-full object-contain" />
                                            ) : (
                                                <Image src={url} alt={`Bàn giao ${i + 1}`} width={300} height={300} className="w-full h-full object-contain bg-gray-50" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- VERTICAL TIMELINE --- */}
                {trackingGroups.length > 0 ? (
                    <div className="px-2 pt-2 pb-4">
                        <div className="relative pl-6 ml-1 space-y-8 border-l-2 border-gray-100 before:absolute before:inset-y-0 before:-left-[2px] before:w-[2px] before:bg-gradient-to-b before:from-green-500 before:to-gray-100"
                            style={{
                                '--tw-gradient-to': 'transparent',
                                '--tw-gradient-stops': `var(--tw-gradient-from) ${Math.max(0, currentGroupIndex / Math.max(1, trackingGroups.length - 1)) * 100}%, var(--tw-gradient-to)`
                            } as React.CSSProperties}
                        >
                            {trackingGroups.map((group, index) => {
                                const isCurrentGroupTerminal = trackingGroups[currentGroupIndex]?.isTerminal;
                                const isDone = isTerminal || index < currentGroupIndex || (index === currentGroupIndex && isCurrentGroupTerminal);
                                const isCurrent = !isTerminal && index === currentGroupIndex && !isCurrentGroupTerminal;


                                return (
                                    <div key={group.id} className="relative group">
                                        {/* Timeline Dot */}
                                        <div className={`absolute -left-[35px] w-5 h-5 rounded-full flex items-center justify-center transition-all bg-white shadow-[0_0_0_4px_white] ${isDone ? 'text-green-500 scale-100' :
                                            isCurrent ? 'text-blue-600 scale-125 shadow-[0_0_0_4px_white,0_0_12px_rgba(37,99,235,0.4)] animate-pulse' :
                                                'text-gray-300 scale-90'
                                            }`}>
                                            {isDone ? <CheckCircle2 className="w-full h-full fill-current" /> :
                                                isCurrent ? <CircleDot className="w-full h-full stroke-[3]" /> :
                                                    <div className="w-2.5 h-2.5 bg-gray-300 rounded-full" />}
                                        </div>

                                        {/* Timeline Content - NO TIME STAMPS! */}
                                        <div className={`transition-all ${isDone ? 'opacity-80' :
                                            isCurrent ? 'opacity-100 transform translate-x-1' :
                                                'opacity-40'
                                            }`}>
                                            <h4 className={`text-base font-medium tracking-wide ${isCurrent ? 'font-bold text-blue-700' :
                                                isDone ? 'text-gray-800' : 'text-gray-500'
                                                }`}>
                                                {group.name}
                                            </h4>

                                            {isCurrent && (
                                                <p className="text-xs text-blue-500/80 font-medium tracking-wider mt-1 uppercase flex items-center gap-1.5">
                                                    <Loader2 size={12} className="animate-spin" /> Đang xử lý
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6 border border-dashed rounded-xl border-gray-200">
                        <p className="text-xs font-semibold text-gray-400">Chưa có cấu hình Nhóm Tra Cứu từ hệ thống.</p>
                    </div>
                )}

                {/* --- MEDIA BÀN GIAO (HIỂN THỊ KHI NHÓM CUỐI HOẶC TRẠNG THÁI CUỐI) --- */}
                {(!isTerminal && trackingGroups[currentGroupIndex]?.isTerminal && ticket.postRepairMedia?.length > 0) && (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm mt-2">
                        <div className="p-4 md:p-5">
                            <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <PlayCircle size={16} className="text-blue-500" />
                                Hình ảnh / Video thực tế sau sửa chữa:
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {ticket.postRepairMedia.map((url: string, i: number) => (
                                    <div key={i} className="rounded-xl overflow-hidden border border-gray-200 bg-black aspect-video relative group shadow-sm">
                                        {isYouTubeUrl(url) ? (
                                            <iframe src={getYouTubeEmbedUrl(url) || ''} title={`YouTube ${i + 1}`}
                                                className="w-full h-full" frameBorder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                                        ) : url.includes('.mp4') || url.includes('video') ? (
                                            <video controls src={url} className="w-full h-full object-contain" />
                                        ) : (
                                            <Image src={url} alt={`Bàn giao ${i + 1}`} width={300} height={300} className="w-full h-full object-contain bg-gray-50" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-[80vh] max-w-[1200px] mx-auto px-2 md:px-4 py-2">
            {/* SEO (noindex for personal lookup page) */}
            <title>{seoTitle}</title>
            <meta name="description" content={seoDescription} />
            <meta name="robots" content="noindex,follow" />
            <link rel="canonical" href={canonicalUrl} />
            <meta property="og:type" content="website" />
            <meta property="og:title" content={seoTitle} />
            <meta property="og:description" content={seoDescription} />
            <meta property="og:url" content={canonicalUrl} />
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
                <div className="max-w-xl mx-auto space-y-8">
                    {/* Header */}
                    <div className="text-center space-y-4">
                        <h1 className="text-3xl font-bold text-gray-900">Tra cứu thông tin</h1>
                        <p className="text-gray-500 text-sm md:text-base">Nhập số điện thoại để xem lịch sử sửa chữa, đơn hàng và lịch hẹn cá nhân.</p>
                    </div>

                    {/* Search Box */}
                    <div className="bg-white p-6 rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100">
                        <form onSubmit={handleSearch} className="relative flex flex-col sm:flex-row gap-3">
                            <input
                                type="tel"
                                placeholder="Nhập số điện thoại..."
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="flex-1 h-14 px-6 bg-gray-50 border-2 border-transparent rounded-xl text-lg focus:bg-white focus:border-orange-500 focus:outline-none transition-all"
                            />
                            <button
                                type="submit"
                                disabled={loading || !phone.trim()}
                                className="h-14 px-8 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2 w-full sm:w-auto active:scale-95"
                            >
                                {loading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                                Tra cứu
                            </button>
                        </form>
                    </div>

                    {/* Results */}
                    {searched && !loading && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                            {/* Tabs with count badges */}
                            <div className="flex p-1 bg-gray-100 rounded-xl">
                                <button
                                    onClick={() => setActiveTab('repair')}
                                    className={`flex-1 py-3 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'repair' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Sửa chữa
                                    {repairs.length > 0 && <span className="w-5 h-5 text-[10px] bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold">{repairs.length}</span>}
                                </button>
                                <button
                                    onClick={() => setActiveTab('order')}
                                    className={`flex-1 py-3 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'order' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Đơn hàng
                                    {orders.length > 0 && <span className="w-5 h-5 text-[10px] bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold">{orders.length}</span>}
                                </button>
                                <button
                                    onClick={() => setActiveTab('appointment')}
                                    className={`flex-1 py-3 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'appointment' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Lịch hẹn
                                    {appointments.length > 0 && <span className="w-5 h-5 text-[10px] bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold">{appointments.length}</span>}
                                </button>
                            </div>

                            {/* Tab Content */}
                            <div>
                                {/* ── REPAIR TAB ── */}
                                {activeTab === 'repair' && (
                                    <div className="space-y-6">
                                        {repairs.length === 0 ? (
                                            <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
                                                <div className="w-20 h-20 bg-gray-50 rounded-full flex flex-col items-center justify-center mx-auto mb-4 border border-gray-100">
                                                    <Wrench size={32} className="text-gray-300" />
                                                </div>
                                                <h3 className="text-lg font-bold text-gray-900">Không có phiếu sửa chữa</h3>
                                                <p className="text-gray-500 mt-1 text-sm">Không tìm thấy thông tin trên hệ thống.</p>
                                            </div>
                                        ) : (
                                            repairs.map((ticket) => {
                                                const workflow = getWorkflowForTicket(ticket);
                                                const st = workflow.find(s => s.id === ticket.status);
                                                const isTerminal = st?.isTerminal ?? TERMINAL_STATUSES.includes(ticket.status);

                                                return (
                                                    <div key={ticket.id} className="bg-white rounded-[2rem] shadow-xl shadow-black/5 border border-gray-100 overflow-hidden relative">
                                                        {/* Sticky Header Label for fast tracking */}
                                                        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-orange-400 to-red-500 opacity-80" />

                                                        {/* Ticket Basic Info Header */}
                                                        <div className="p-6 pb-0">
                                                            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 shadow-inner">
                                                                        <Smartphone size={28} />
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-extrabold text-xl text-gray-900 tracking-tight">{ticket.deviceInfo?.model || 'Thiết bị Điện tử'}</p>
                                                                        <div className="flex items-center gap-2 mt-0.5">
                                                                            <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Mã PHIẾU: #{ticket.id.slice(-6)}</p>
                                                                            {ticket.ticketType === 'warranty' && (
                                                                                <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                                                                                    Bảo Hành
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {ticket.status === 'done' && (
                                                                        reviewedTickets.includes(ticket.id) ? (
                                                                            <span className="text-xs font-bold text-green-600 bg-green-50 px-4 py-2 rounded-xl border border-green-200 flex items-center gap-1.5">
                                                                                <CheckCircle2 size={14} /> Đã đánh giá
                                                                            </span>
                                                                        ) : (
                                                                            <button
                                                                                onClick={() => setReviewModal(ticket)}
                                                                                className="text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-red-500 px-4 py-2 rounded-xl hover:shadow-lg hover:shadow-orange-500/30 transition-all flex items-center gap-1.5 active:scale-95"
                                                                            >
                                                                                <Star size={14} className="fill-current" /> Đánh giá dịch vụ
                                                                            </button>
                                                                        )
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Information Grid */}
                                                            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                                                                {ticket.issue?.description && (
                                                                    <div className="flex items-start gap-2.5 text-sm">
                                                                        <AlertCircle size={18} className="text-orange-500 flex-shrink-0" />
                                                                        <span className="text-gray-700 font-medium">Báo lỗi: {ticket.issue.description}</span>
                                                                    </div>
                                                                )}
                                                                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 border-dashed mt-3 text-sm">
                                                                    <div className="flex items-center gap-2 font-medium text-gray-600">
                                                                        <Calendar size={16} className="text-gray-400" />
                                                                        <span>Nhận: {fmtDate(ticket.timing?.receivedAt)}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 font-medium">
                                                                        <span className="text-gray-500">Phí: <b className="text-orange-600">{fmtPrice(ticket.payment?.amount || 0)}</b></span>
                                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold ${ticket.payment?.status === 'paid'
                                                                            ? 'bg-green-100 text-green-700'
                                                                            : ticket.payment?.status === 'deposit'
                                                                                ? 'bg-yellow-100 text-yellow-700'
                                                                                : 'bg-gray-200 text-gray-600'
                                                                            }`}>
                                                                            {paymentLabels[ticket.payment?.status || 'unpaid']}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Timeline Area */}
                                                        <div className="p-6">
                                                            <RepairTimeline ticket={ticket} isTerminal={isTerminal} currentStatus={st} />
                                                        </div>

                                                        {/* ── Warranty Info (only for completed tickets with warranty parts) ── */}
                                                        {isTerminal && (() => {
                                                            const warrantyParts = (ticket.parts || []).filter(p =>
                                                                p.status === 'selected' && (p as { warrantyMonths?: number }).warrantyMonths && (p as { warrantyMonths?: number }).warrantyMonths! > 0
                                                            );
                                                            if (warrantyParts.length === 0) return null;
                                                            const now = Date.now();
                                                            return (
                                                                <div className="mx-6 mb-6 bg-emerald-50 rounded-2xl border border-emerald-200 overflow-hidden">
                                                                    <div className="flex items-center gap-2 px-5 py-3 bg-emerald-100/60 border-b border-emerald-200">
                                                                        <Shield size={18} className="text-emerald-600" />
                                                                        <span className="font-bold text-emerald-800 text-sm">Điều khoản Bảo hành Linh kiện</span>
                                                                    </div>
                                                                    <div className="overflow-x-auto">
                                                                        <table className="w-full text-sm">
                                                                            <thead>
                                                                                <tr className="text-left text-xs text-emerald-700 uppercase">
                                                                                    <th className="px-5 py-2">Linh kiện</th>
                                                                                    <th className="px-3 py-2">Loại</th>
                                                                                    <th className="px-3 py-2 text-center">BH</th>
                                                                                    <th className="px-3 py-2">Hết hạn</th>
                                                                                    <th className="px-3 py-2 text-center">Trạng thái</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-emerald-100">
                                                                                {warrantyParts.map((p, i) => {
                                                                                    const ext = p as { warrantyMonths?: number; warrantyExpiresAt?: { toDate?: () => Date } | number; partType?: string };
                                                                                    const expiresTs = typeof ext.warrantyExpiresAt === 'number'
                                                                                        ? ext.warrantyExpiresAt
                                                                                        : (ext.warrantyExpiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
                                                                                    const isActive = expiresTs > now;
                                                                                    const expiresDate = expiresTs ? new Date(expiresTs).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
                                                                                    return (
                                                                                        <tr key={i} className="text-gray-700">
                                                                                            <td className="px-5 py-2.5 font-medium">{p.productName}</td>
                                                                                            <td className="px-3 py-2.5 text-gray-500">{ext.partType || '—'}</td>
                                                                                            <td className="px-3 py-2.5 text-center font-semibold">{ext.warrantyMonths} tháng</td>
                                                                                            <td className="px-3 py-2.5 text-gray-600">{expiresDate}</td>
                                                                                            <td className="px-3 py-2.5 text-center">
                                                                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                                                                    isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                                                                                                }`}>
                                                                                                    {isActive ? <><CheckCircle2 size={12} /> Còn BH</> : <><XCircle size={12} /> Hết BH</>}
                                                                                                </span>
                                                                                            </td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* [WARRANTY TH3] Thông tin hoàn tiền */}
                                                        {ticket.ticketType === 'warranty' && ticket.status.includes('refund') && (() => {
                                                            const wc = ticket.warrantyClaim as { refundedParts?: { productName: string; refundAmount: number }[] } | undefined;
                                                            if (!wc?.refundedParts?.length) return null;
                                                            const totalRefund = wc.refundedParts.reduce((s, rp) => s + (rp.refundAmount || 0), 0);
                                                            return (
                                                                <div className="mx-6 mb-6 bg-red-50 rounded-2xl border border-red-200 overflow-hidden">
                                                                    <div className="flex items-center gap-2 px-5 py-3 bg-red-100/60 border-b border-red-200">
                                                                        <AlertCircle size={18} className="text-red-600" />
                                                                        <span className="font-bold text-red-800 text-sm">Thông tin Hoàn tiền Bảo hành</span>
                                                                    </div>
                                                                    <div className="p-5 space-y-2">
                                                                        {wc.refundedParts.map((rp, i) => (
                                                                            <div key={i} className="flex justify-between text-sm">
                                                                                <span className="text-gray-700">{rp.productName}</span>
                                                                                <span className="font-semibold text-emerald-700">+{fmtPrice(rp.refundAmount)}</span>
                                                                            </div>
                                                                        ))}
                                                                        <div className="flex justify-between pt-2 border-t border-red-200 font-bold">
                                                                            <span className="text-gray-900">Tổng hoàn tiền</span>
                                                                            <span className="text-emerald-700 text-lg">{fmtPrice(totalRefund)}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {/* ── APPOINTMENT TAB ── */}
                                {activeTab === 'appointment' && (
                                    <div className="space-y-4">
                                        {appointments.length === 0 ? (
                                            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-100">
                                                <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                                                <h3 className="text-lg font-bold text-gray-900">Không có lịch hẹn</h3>
                                                <p className="text-gray-500 mt-1">Bạn chưa đặt lịch hẹn nào qua hệ thống liên lạc.</p>
                                            </div>
                                        ) : (
                                            appointments.map((app) => {
                                                const status = appointmentStatusConfig[app.status] || appointmentStatusConfig.pending;
                                                return (
                                                    <div key={app.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                                                        <div className="flex flex-wrap items-start justify-between gap-4 mb-4 pb-4 border-b border-gray-50">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                                                                    <Calendar size={24} />
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-gray-900 text-lg">
                                                                        {new Date(app.date).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                                    </p>
                                                                    <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5 font-medium">
                                                                        <Clock size={16} className="text-orange-400" />
                                                                        {timeSlotLabels[app.timeSlot] || app.timeSlot}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider border ${status.color}`}>
                                                                <status.icon size={16} />
                                                                {status.label}
                                                            </span>
                                                        </div>
                                                        <div className="grid md:grid-cols-2 gap-4 text-sm font-medium">
                                                            <div className="space-y-3">
                                                                <div className="flex items-center gap-3 text-gray-600">
                                                                    <User size={18} className="text-gray-400" />
                                                                    <span className="text-gray-900">{app.fullName}</span>
                                                                </div>
                                                                <div className="flex items-center gap-3 text-gray-600">
                                                                    <Phone size={18} className="text-gray-400" />
                                                                    <span>{app.phone}</span>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-3">
                                                                <div className="flex items-start gap-3 text-gray-600">
                                                                    <MapPin size={18} className="text-gray-400 mt-0.5 flex-shrink-0" />
                                                                    <span className="leading-tight">{getStoreName(app.store)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}

                                {/* ── ORDER TAB ── */}
                                {activeTab === 'order' && (
                                    <div className="space-y-4">
                                        {orders.length === 0 ? (
                                            <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-100">
                                                <ShoppingCart size={48} className="mx-auto text-gray-300 mb-4" />
                                                <h3 className="text-lg font-bold text-gray-900">Không có đơn hàng</h3>
                                                <p className="text-gray-500 mt-1">Bạn chưa có đơn đặt mua sản phẩm nào trên hệ thống.</p>
                                            </div>
                                        ) : (
                                            orders.map((order) => {
                                                const statusMap: Record<string, { color: string; label: string; icon: LucideIcon }> = {
                                                    'Pending': { color: 'bg-yellow-50 text-yellow-700 border-yellow-200', label: 'Chờ xác nhận', icon: Clock },
                                                    'Processing': { color: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Đang xử lý', icon: Loader2 },
                                                    'Completed': { color: 'bg-green-50 text-green-700 border-green-200', label: 'Hoàn thành', icon: CheckCircle2 },
                                                    'Cancelled': { color: 'bg-red-50 text-red-700 border-red-200', label: 'Đã hủy', icon: XCircle },
                                                };
                                                const st = statusMap[order.status] || statusMap['Pending'];
                                                
                                                return (
                                                    <div key={order.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                                                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-50 pb-4 mb-4">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600">
                                                                    <Package size={24} />
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-gray-900 text-lg">Đơn hàng #{order.id.slice(-6).toUpperCase()}</p>
                                                                    <p className="text-sm font-medium text-gray-500 mt-0.5">{fmtDate(order.createdAt)}</p>
                                                                </div>
                                                            </div>
                                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase border ${st.color}`}>
                                                                <st.icon size={14} className={order.status === 'Processing' ? "animate-spin" : ""} />
                                                                {st.label}
                                                            </span>
                                                        </div>
                                                        
                                                        {/* Items */}
                                                        <div className="space-y-3 mb-4">
                                                            {order.items?.map((item: OrderItem, idx: number) => (
                                                                <div key={idx} className="flex gap-3 items-center bg-gray-50 p-2 rounded-lg">
                                                                    {item.image ? (
                                                                        <Image src={item.image} alt={item.productName} width={48} height={48} className="w-12 h-12 object-cover rounded-md flex-shrink-0" />
                                                                    ) : (
                                                                        <div className="w-12 h-12 bg-gray-200 rounded-md flex items-center justify-center flex-shrink-0"><ImageIcon size={16} className="text-gray-400" /></div>
                                                                    )}
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="font-medium text-sm text-gray-900 truncate">{item.productName}</p>
                                                                        <div className="text-xs text-gray-500 mt-0.5">
                                                                            {item.color && <span>Màu: {item.color}</span>}
                                                                            {item.storage && <span className="ml-2">DL: {item.storage}</span>}
                                                                            <span className="ml-2 block sm:inline">SL: {item.quantity}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="font-bold text-sm text-gray-900 whitespace-nowrap pl-4">
                                                                        {fmtPrice(item.price)}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Footer */}
                                                        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-100">
                                                            <div className="text-sm">
                                                                <span className="text-gray-500">Phí giao hàng: </span>
                                                                <span className="font-medium text-gray-900">{fmtPrice(order.shipping_fee || 0)}</span>
                                                            </div>
                                                            <div className="text-base">
                                                                <span className="text-gray-500 mr-2">Tổng thanh toán:</span>
                                                                <span className="font-bold text-orange-600 text-lg">{fmtPrice(order.total_amount)}</span>
                                                            </div>
                                                        </div>
                                                        {order.customer_info?.note && (
                                                            <div className="mt-4 text-sm bg-yellow-50 text-yellow-800 p-3 rounded-lg border border-yellow-100 flex items-start gap-2">
                                                                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                                                                <span className="font-medium">{order.customer_info.note}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- REVIEW MODAL --- */}
            {reviewModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                        <div className="relative p-5 text-center bg-gradient-to-br from-orange-50 to-orange-100/50 border-b border-orange-100">
                            <button onClick={closeReviewModal} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-white rounded-full p-1 shadow-sm">
                                <X size={20} />
                            </button>
                            <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-orange-500/30 mb-3">
                                <HeartHandshake className="text-white" size={28} />
                            </div>
                            <h2 className="text-xl font-bold text-gray-900">Đánh giá Dịch vụ</h2>
                            <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider font-semibold">Mã phiếu: #{reviewModal.id.slice(-6)}</p>
                        </div>

                        <form onSubmit={handleSubmitReview} className="p-5 overflow-y-auto space-y-6">

                            {/* Stars */}
                            <div className="flex flex-col items-center gap-2">
                                <p className="text-sm font-medium text-gray-700">Chất lượng dịch vụ thế nào?</p>
                                <div className="flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            className="focus:outline-none transition-transform hover:scale-110 active:scale-95 p-1"
                                            onClick={() => setRating(s)}
                                            onMouseEnter={() => setHoverRating(s)}
                                            onMouseLeave={() => setHoverRating(0)}
                                        >
                                            <Star
                                                size={36}
                                                strokeWidth={1.5}
                                                className={`transition-colors ${s <= (hoverRating || rating)
                                                    ? 'fill-orange-400 text-orange-400 drop-shadow-sm'
                                                    : 'fill-gray-100 text-gray-200'
                                                    }`}
                                            />
                                        </button>
                                    ))}
                                </div>
                                <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
                                    {rating === 5 ? 'Tuyệt vời' : rating === 4 ? 'Rất tốt' : rating === 3 ? 'Bình thường' : rating === 2 ? 'Kém' : 'Rất tệ'}
                                </span>
                            </div>

                            {/* Content */}
                            <div>
                                <textarea
                                    className="w-full p-4 border border-gray-200 rounded-xl focus:ring-1 focus:ring-orange-500 focus:border-orange-500 bg-gray-50 hover:bg-white transition-colors text-sm resize-none"
                                    placeholder="Chia sẻ thêm cảm nhận của bạn... (không bắt buộc)"
                                    rows={3}
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                ></textarea>
                            </div>

                            {/* Images */}
                            <div>
                                <div className="flex flex-wrap gap-2">
                                    {imageUrls.map((url, idx) => (
                                        <div key={idx} className="relative w-16 h-16 rounded-xl border border-gray-200 overflow-hidden group">
                                            <Image src={url} alt={`preview-${idx}`} width={64} height={64} className="w-full h-full object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => removeImage(idx)}
                                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    {images.length < 5 && (
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-500 hover:border-orange-500 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                                        >
                                            <Camera size={20} />
                                        </button>
                                    )}
                                </div>
                                <input type="file" accept="image/*" className="hidden" multiple ref={fileInputRef} onChange={handleImageChange} />
                            </div>

                            <button
                                type="submit"
                                disabled={submittingReview}
                                className="w-full h-12 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-bold flex items-center justify-center text-base hover:shadow-lg hover:shadow-orange-500/30 disabled:opacity-70 transition-all active:scale-95"
                            >
                                {submittingReview ? <Loader2 size={20} className="animate-spin mr-2" /> : 'Gửi đánh giá'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
