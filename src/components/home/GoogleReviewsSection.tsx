'use client';

import { useEffect, useState, useRef } from 'react';
import { Star, ChevronLeft, ChevronRight, ExternalLink, MapPin, MessageSquareQuote } from 'lucide-react';
import Image from 'next/image';
import { useConfig } from '@/lib/ConfigContext';

interface GoogleApiReview {
    author_name: string;
    rating: number;
    text: string;
    profile_photo_url?: string;
}

interface ReviewsData {
    rating: number;
    total_ratings: number;
    reviews: GoogleApiReview[];
}

const REVIEWS_REQUEST_TIMEOUT_MS = 8000;

function getGoogleMapsUrl(placeId: string | undefined, siteName: string) {
    const params = new URLSearchParams({
        api: '1',
        query: siteName,
    });
    if (placeId) params.set('query_place_id', placeId);
    return `https://www.google.com/maps/search/?${params.toString()}`;
}

export default function GoogleReviewsSection() {
    const { config } = useConfig();
    const reviewsConfig = config.homepageReviews;
    const siteName = config.siteName || 'Văn Lành Service';
    const [data, setData] = useState<ReviewsData | null>(null);
    const [loading, setLoading] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const googleMapsUrl = getGoogleMapsUrl(reviewsConfig.googlePlaceId, siteName);

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), REVIEWS_REQUEST_TIMEOUT_MS);

        const fetchReviews = async () => {
            try {
                const res = await fetch('/api/reviews/google', { signal: controller.signal });
                if (res.ok) {
                    const json = await res.json();
                    if (!json.error && !cancelled && Array.isArray(json.reviews) && json.reviews.length > 0) {
                        setData(json);
                    }
                }
            } catch (err) {
                if ((err as DOMException).name !== 'AbortError') {
                    console.error('Failed to load reviews:', err);
                }
            } finally {
                window.clearTimeout(timeoutId);
                if (!cancelled) setLoading(false);
            }
        };
        fetchReviews();
        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
            controller.abort();
        };
    }, [reviewsConfig.googlePlaceId]);

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const { current } = scrollContainerRef;
            const scrollAmount = current.clientWidth * 0.8;
            current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
        }
    };

    if (loading) {
        return (
            <section className="py-12 bg-white">
                <div className="max-w-[1200px] mx-auto px-4 text-center">
                    <div className="animate-pulse flex flex-col items-center">
                        <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
                        <div className="flex gap-4 overflow-hidden w-full mt-8">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="w-80 h-48 bg-gray-100 rounded-2xl flex-shrink-0"></div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    if (!data || data.reviews.length === 0) {
        return (
            <section className="relative overflow-hidden bg-white py-10">
                <div className="absolute top-0 right-0 w-64 h-64 bg-orange-50 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/3"></div>
                <div className="mx-auto max-w-[1080px] px-3 md:px-4">
                    <div className="flex flex-col gap-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-white p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <MessageSquareQuote size={20} className="text-orange-500" />
                                <span className="text-orange-600 font-bold text-sm tracking-wider uppercase">{reviewsConfig.eyebrow}</span>
                            </div>
                            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">{reviewsConfig.title}</h2>
                            <p className="text-gray-600 mt-3 max-w-2xl">
                                Xem đánh giá thực tế của khách hàng về {siteName} trực tiếp trên Google Maps.
                            </p>
                        </div>
                        <a
                            href={googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-bold text-white shadow-sm transition-colors hover:bg-orange-600"
                        >
                            <MapPin size={20} />
                            Xem đánh giá trên Google Maps
                            <ExternalLink size={16} />
                        </a>
                    </div>
                </div>
            </section>
        );
    }

    return (
            <section className="relative overflow-hidden bg-white py-10">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-50 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/3"></div>
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-50 rounded-full blur-3xl -z-10 translate-y-1/3 -translate-x-1/3"></div>

            <div className="mx-auto max-w-[1080px] px-3 md:px-4">
                <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <MessageSquareQuote size={20} className="text-orange-500" />
                            <span className="text-orange-600 font-bold text-sm tracking-wider uppercase">{reviewsConfig.eyebrow}</span>
                        </div>
                        <h2 className="text-2xl font-extrabold text-gray-900 md:text-3xl">
                            {reviewsConfig.title}
                        </h2>
                        
                        <div className="flex items-center gap-3 mt-4">
                            <div className="flex bg-gray-50 rounded-lg p-2 items-center gap-2 border border-gray-100">
                                <Image src="/google-logo.png" alt="Google" width={24} height={24} className="object-contain" onError={(e) => e.currentTarget.style.display='none'} />
                                <div className="flex items-center text-orange-400">
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} size={16} fill="currentColor" />
                                    ))}
                                </div>
                                <div className="font-bold text-gray-800 ml-1">
                                    {data.rating} <span className="text-gray-400 font-normal text-sm">/ 5</span>
                                </div>
                                <div className="text-gray-500 text-sm ml-1">
                                    ({data.total_ratings} đánh giá)
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Buttons Desktop */}
                    <div className="hidden md:flex gap-3">
                        <button 
                            title="Quay lại"
                            onClick={() => scroll('left')}
                            className="w-12 h-12 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 transition-colors bg-white shadow-sm"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <button 
                            title="Tiếp theo"
                            onClick={() => scroll('right')}
                            className="w-12 h-12 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 transition-colors bg-white shadow-sm"
                        >
                            <ChevronRight size={24} />
                        </button>
                    </div>
                </div>

                {/* Reviews Slider */}
                <div 
                    ref={scrollContainerRef}
                    className="flex gap-3 overflow-x-auto pb-4 snap-x hide-scrollbar"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {data.reviews.map((review, idx) => (
                        <div 
                            key={idx} 
                            className="relative w-[280px] flex-shrink-0 snap-start rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:w-[320px]"
                        >
                            <div className="flex items-center gap-4 mb-4">
                                {review.profile_photo_url ? (
                                    <Image src={review.profile_photo_url} alt={review.author_name} width={48} height={48} className="w-12 h-12 rounded-full object-cover" />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-lg">
                                        {review.author_name.charAt(0)}
                                    </div>
                                )}
                                <div>
                                    <h4 className="font-bold text-gray-900">{review.author_name}</h4>
                                    <div className="flex text-orange-400 mt-1">
                                        {[...Array(review.rating)].map((_, i) => (
                                            <Star key={i} size={14} fill="currentColor" />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <p className="text-gray-600 text-sm leading-relaxed line-clamp-4">
                                &quot;{review.text}&quot;
                            </p>
                            
                            <div className="absolute right-4 top-4 text-gray-200 opacity-50">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                                </svg>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
