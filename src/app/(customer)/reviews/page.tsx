'use client';

import { useState, useEffect } from 'react';
import { Star, MessageSquareQuote, CheckCircle2, UserCircle2 } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Review } from '@/lib/types';

export default function ReviewsPage() {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReviews = async () => {
            try {
                const q = query(
                    collection(db, 'reviews'),
                    where('status', '==', 'approved')
                );

                const snapshot = await getDocs(q);
                const data: Review[] = [];
                snapshot.forEach(doc => {
                    data.push({ id: doc.id, ...doc.data() } as Review);
                });

                data.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
                setReviews(data);
            } catch (error) {
                console.error('Error fetching reviews:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchReviews();
    }, []);

    const formatDate = (timestamp: any) => {
        if (!timestamp) return '';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        }).format(d);
    };

    return (
        <div className="py-4 sm:py-8">
            <div className="max-w-[1200px] mx-auto px-2 md:px-4">
                <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
                    {/* Header */}
                    <div className="max-w-2xl mb-8 sm:mb-10 mx-auto sm:mx-0 text-center sm:text-left">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-orange-100 rounded-full flex items-center justify-center mb-4 mx-auto sm:mx-0">
                            <MessageSquareQuote size={28} className="text-orange-500" />
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 tracking-tight">
                            Khách hàng nói gì về <span className="text-orange-600">Văn Lành Service</span>?
                        </h1>
                        <p className="text-sm sm:text-base text-gray-600">
                            Những đánh giá chân thực từ khách hàng đã sử dụng dịch vụ tại cửa hàng chúng tôi.
                        </p>
                    </div>

                    {/* Loading & Empty States */}
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-gray-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mb-4"></div>
                            <p>Đang tải đánh giá...</p>
                        </div>
                    ) : reviews.length === 0 ? (
                        <div className="text-center py-12 sm:py-16">
                            <p className="text-gray-500 text-sm sm:text-base">
                                Chưa có đánh giá nào được hiển thị. Hãy là người đầu tiên chia sẻ trải nghiệm của bạn!
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 auto-rows-max">
                            {reviews.map((review) => (
                                <article
                                    key={review.id}
                                    className="bg-gray-50 rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 break-inside-avoid hover:shadow-md transition-shadow"
                                >
                                    {/* Rating & Date */}
                                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                                        <div className="flex items-center gap-1 bg-orange-50 px-2 py-1 rounded-lg">
                                            {[...Array(5)].map((_, i) => (
                                                <Star
                                                    key={i}
                                                    size={14}
                                                    className={i < review.rating ? "fill-orange-400 text-orange-400" : "fill-gray-200 text-gray-200"}
                                                />
                                            ))}
                                            <span className="text-xs font-semibold text-orange-700 ml-1">
                                                {review.rating}.0
                                            </span>
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            {formatDate(review.createdAt)}
                                        </span>
                                    </div>

                                    {/* Content */}
                                    <p className="text-gray-700 text-sm leading-relaxed mb-3 sm:mb-4">
                                        “{review.content}”
                                    </p>

                                    {/* Images */}
                                    {review.images && review.images.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-3 sm:mb-4">
                                            {review.images.map((img, idx) => (
                                                <div key={idx} className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden">
                                                    <img
                                                        src={img}
                                                        alt={`Hình ảnh đánh giá ${idx + 1}`}
                                                        className="w-full h-full object-cover"
                                                        loading="lazy"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Customer Info */}
                                    <div className="flex items-center gap-3 pt-3 sm:pt-4 border-t border-gray-100">
                                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shrink-0">
                                            <UserCircle2 size={22} className="text-indigo-600/70" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">
                                                {review.customerName}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2 text-xs mt-0.5">
                                                <span className="text-gray-500 font-mono tracking-wide">
                                                    {review.phone}
                                                </span>
                                                {review.type && (
                                                    <span
                                                        className={`px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${review.type === 'repair'
                                                            ? 'bg-blue-50 text-blue-600'
                                                            : 'bg-green-50 text-green-600'
                                                            }`}
                                                    >
                                                        <CheckCircle2 size={10} />
                                                        {review.type === 'repair' ? 'Đã sửa chữa' : 'Đã mua hàng'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
