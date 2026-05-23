'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Star, MessageSquareQuote, X } from 'lucide-react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Review } from '@/lib/types';

export default function FloatingReviews() {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        if (isDismissed) return;

        let isMounted = true;

        const fetchReviews = async () => {
            try {
                // Fetch recent 5-star approved reviews
                const q = query(
                    collection(db, 'reviews'),
                    where('status', '==', 'approved'),
                    where('rating', '==', 5),
                    limit(5)
                );

                const snapshot = await getDocs(q);
                const data: Review[] = [];
                snapshot.forEach(doc => {
                    data.push({ id: doc.id, ...doc.data() } as Review);
                });

                // Sort by date manually if we don't have composite index for rating + createdAt
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
                data.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

                if (isMounted && data.length > 0) {
                    setReviews(data);

                    // Delay showing the widget so it doesn't pop up immediately on load
                    setTimeout(() => {
                        if (isMounted) setIsVisible(true);
                    }, 2000);
                }
            } catch (error) {
                console.error('Error fetching reviews for widget:', error);
            }
        };

        // Defer fetch to not block main thread (INP optimization)
        const deferFn = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
        
        const initDelayTimer = setTimeout(() => {
            deferFn(() => {
                if(isMounted) fetchReviews();
            });
        }, 5000); // Wait 5s before even trying to fetch from Firebase

        return () => {
            isMounted = false;
            clearTimeout(initDelayTimer);
        };
    }, [isDismissed]);

    // Marquee effect logic
    useEffect(() => {
        if (!isVisible || reviews.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % reviews.length);
        }, 8000); // Change review every 8 seconds

        return () => clearInterval(interval);
    }, [isVisible, reviews.length]);

    if (!isVisible || reviews.length === 0 || isDismissed) return null;



    return (
        <div className="fixed bottom-24 left-4 z-40 max-w-[280px] md:max-w-xs animate-in slide-in-from-left-8 fade-in duration-500">
            <div className="bg-white/95 backdrop-blur-md border border-gray-200 shadow-xl rounded-2xl overflow-hidden group">
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-red-500 p-2.5 px-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-white">
                        <MessageSquareQuote size={16} className="fill-white/20" />
                        <span className="text-xs font-bold leading-none">Khách hàng nói gì?</span>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsDismissed(true); }}
                        className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-1 transition-colors"
                        aria-label="Đóng"
                    >
                        <X size={12} strokeWidth={3} />
                    </button>
                </div>

                {/* Content */}
                <Link href="/reviews" className="block p-3 hover:bg-orange-50/50 transition-colors">
                    <div className="relative h-[48px] overflow-hidden">
                        {reviews.map((review, idx) => (
                            <div
                                key={review.id}
                                className={`absolute top-0 left-0 w-full transition-all duration-500 ${idx === currentIndex
                                        ? 'opacity-100 translate-y-0'
                                        : 'opacity-0 translate-y-4 pointer-events-none'
                                    }`}
                            >
                                <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-xs font-bold text-gray-900 truncate pr-2">
                                                {review.customerName || 'Khách hàng'}
                                            </p>
                                            <div className="flex items-center gap-0.5 shrink-0">
                                                {[...Array(5)].map((_, i) => (
                                                    <Star key={i} size={10} className="fill-orange-400 text-orange-400" />
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-600 line-clamp-2 leading-snug">
                                            &ldquo;{review.content || 'Dịch vụ tuyệt vời, nhân viên nhiệt tình!'}&rdquo;
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-center text-orange-600 font-semibold group-hover:text-orange-700">
                        Xem tất cả đánh giá →
                    </div>
                </Link>
            </div>

            <style jsx>{`
                .slide-in-from-left-8 { animation: slideInX 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
                .fade-in { animation: fadeIn 0.5s ease-out; }
                @keyframes slideInX { from { transform: translateX(-2rem); } to { transform: translateX(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>
    );
}
