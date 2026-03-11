'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Star, CheckCircle2, XCircle, Trash2,
    Search, Loader2, Image as ImageIcon,
    Filter, Eye
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import type { Review } from '@/lib/types';

export default function AdminReviewsPage() {
    const { user } = useAuth();
    const router = useRouter();

    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (user?.role === 'staff' && !user?.permissions?.includes('admin_only')) {
            router.replace('/admin');
            return;
        }

        const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: Review[] = [];
            snapshot.forEach(doc => {
                data.push({ id: doc.id, ...doc.data() } as Review);
            });
            setReviews(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, router]);

    const handleApprove = async (id: string) => {
        try {
            await updateDoc(doc(db, 'reviews', id), {
                status: 'approved'
            });
        } catch (error) {
            console.error('Error approving review:', error);
            alert('Lỗi khi duyệt đánh giá');
        }
    };

    const handleReject = async (id: string, currentStatus: string) => {
        try {
            if (currentStatus === 'approved') {
                // If it was approved, hide it by setting back to pending or creating a 'rejected' status. 
                // For now, setting to 'pending' hides it from public.
                await updateDoc(doc(db, 'reviews', id), {
                    status: 'pending'
                });
            } else {
                // If it's already pending, delete it permanently to clean up spam
                if (confirm('Bạn có chắc chắn muốn xóa vĩnh viễn đánh giá rác này không?')) {
                    await deleteDoc(doc(db, 'reviews', id));
                }
            }
        } catch (error) {
            console.error('Error rejecting review:', error);
            alert('Lỗi thao tác');
        }
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(d);
    };

    // Derived state
    const filteredReviews = reviews.filter(r => {
        if (filter !== 'all' && r.status !== filter) return false;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return (
                r.customerName.toLowerCase().includes(term) ||
                r.phone.includes(term) ||
                (r.content && r.content.toLowerCase().includes(term)) ||
                r.referenceId.toLowerCase().includes(term)
            );
        }
        return true;
    });

    const pendingCount = reviews.filter(r => r.status === 'pending').length;

    if (loading) {
        return (
            <div className="flex bg-gray-50 h-[80vh] items-center justify-center">
                <Loader2 className="animate-spin text-orange-500" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        Quản lý Đánh giá
                        {pendingCount > 0 && (
                            <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                                {pendingCount} chờ duyệt
                            </span>
                        )}
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Duyệt hoặc ẩn các đánh giá từ khách hàng</p>
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        Tất cả ({reviews.length})
                    </button>
                    <button
                        onClick={() => setFilter('pending')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${filter === 'pending' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                            }`}
                    >
                        <Clock size={16} /> Chờ duyệt ({pendingCount})
                    </button>
                    <button
                        onClick={() => setFilter('approved')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${filter === 'approved' ? 'bg-green-500 text-white' : 'bg-green-50 text-green-600 hover:bg-green-100'
                            }`}
                    >
                        <CheckCircle2 size={16} /> Đã hiển thị
                    </button>
                </div>

                <div className="relative w-full md:w-64 shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Tìm theo tên SĐT, nội dung..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-1 focus:ring-orange-500 focus:border-orange-500 text-sm"
                    />
                </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="p-4 font-semibold text-gray-600 text-sm w-[250px]">Khách hàng</th>
                                <th className="p-4 font-semibold text-gray-600 text-sm w-[150px]">Đánh giá</th>
                                <th className="p-4 font-semibold text-gray-600 text-sm">Nội dung & Hình ảnh</th>
                                <th className="p-4 font-semibold text-gray-600 text-sm w-[120px]">Trạng thái</th>
                                <th className="p-4 font-semibold text-gray-600 text-sm w-[180px] text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredReviews.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-500">
                                        Không tìm thấy đánh giá nào
                                    </td>
                                </tr>
                            ) : (
                                filteredReviews.map((review) => (
                                    <tr key={review.id} className="hover:bg-gray-50/50 transition-colors">
                                        {/* Customer */}
                                        <td className="p-4 align-top">
                                            <div className="font-bold text-gray-900">{review.customerName}</div>
                                            <div className="text-sm font-mono text-gray-500 mt-1">{review.phone}</div>
                                            <div className="text-xs text-gray-400 mt-1">{formatDate(review.createdAt)}</div>
                                            <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                                {review.type === 'repair' ? 'Phiếu sửa chữa' : 'Đơn hàng'}
                                                <span className="text-gray-400">#{review.referenceId}</span>
                                            </div>
                                        </td>

                                        {/* Rating */}
                                        <td className="p-4 align-top">
                                            <div className="flex gap-0.5">
                                                {[...Array(5)].map((_, i) => (
                                                    <Star
                                                        key={i}
                                                        size={16}
                                                        className={i < review.rating ? "fill-orange-400 text-orange-400" : "fill-gray-200 text-gray-200"}
                                                    />
                                                ))}
                                            </div>
                                            <div className="text-xs font-semibold text-orange-600 mt-1">
                                                {review.rating}/5 Sao
                                            </div>
                                        </td>

                                        {/* Content */}
                                        <td className="p-4 align-top">
                                            <p className="text-sm text-gray-700 whitespace-pre-line mb-3">
                                                {review.content || <span className="text-gray-400 italic">Không có nội dung rext</span>}
                                            </p>

                                            {/* Attached Images */}
                                            {review.images && review.images.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {review.images.map((img, idx) => (
                                                        <a
                                                            key={idx}
                                                            href={img}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="block w-14 h-14 rounded-lg border border-gray-200 overflow-hidden hover:opacity-80 transition-opacity"
                                                        >
                                                            <img src={img} alt="review attachment" className="w-full h-full object-cover" loading="lazy" />
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </td>

                                        {/* Status */}
                                        <td className="p-4 align-top">
                                            {review.status === 'approved' ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                    <CheckCircle2 size={12} /> Đã hiển thị
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                                    Chờ duyệt
                                                </span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="p-4 align-top text-right">
                                            {review.status === 'pending' ? (
                                                <div className="flex flex-col gap-2 items-end">
                                                    <button
                                                        onClick={() => handleApprove(review.id)}
                                                        className="px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600 transition-colors w-full sm:w-auto"
                                                    >
                                                        Duyệt hiển thị
                                                    </button>
                                                    <button
                                                        onClick={() => handleReject(review.id, review.status)}
                                                        className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold rounded-lg transition-colors w-full sm:w-auto"
                                                    >
                                                        Xoá rác
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleReject(review.id, review.status)}
                                                    className="px-3 py-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5"
                                                    title="Ẩn khỏi trang chủ để kiểm tra lại"
                                                >
                                                    <Eye size={14} className="opacity-50" /> Ẩn bình luận
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

// Inline missing icon
function Clock(props: any) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
