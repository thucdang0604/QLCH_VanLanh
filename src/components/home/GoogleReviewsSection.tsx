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

const DEFAULT_GOOGLE_PLACE_ID = 'ChIJmWqqJWcpdTERqc7cx-jP2E4';

function getGoogleMapsUrl(placeId: string) {
    const params = new URLSearchParams({
        api: '1',
        query: 'Văn Lành Service',
        query_place_id: placeId || DEFAULT_GOOGLE_PLACE_ID,
    });
    return `https://www.google.com/maps/search/?${params.toString()}`;
}

export default function GoogleReviewsSection() {
    const { config } = useConfig();
    const reviewsConfig = config.homepageReviews;
    const [data, setData] = useState<ReviewsData | null>(null);
    const [loading, setLoading] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const googleMapsUrl = getGoogleMapsUrl(reviewsConfig.googlePlaceId);

    useEffect(() => {
        let cancelled = false;
        const fetchReviews = async () => {
            try {
                const res = await fetch('/api/reviews/google');
                if (res.ok) {
                    const json = await res.json();
                    if (!json.error && !cancelled && Array.isArray(json.reviews) && json.reviews.length > 0) {
                        setData(json);
                    }
                }
            } catch (err) {
                console.error('Failed to load reviews:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchReviews();
        return () => { cancelled = true; };
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
            <section className="py-16 bg-white overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-orange-50 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/3"></div>
                <div className="max-w-[1200px] mx-auto px-4 md:px-6">
                    <div className="rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50 to-white p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <MessageSquareQuote size={20} className="text-orange-500" />
                                <span className="text-orange-600 font-bold text-sm tracking-wider uppercase">{reviewsConfig.eyebrow}</span>
                            </div>
                            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">{reviewsConfig.title}</h2>
                            <p className="text-gray-600 mt-3 max-w-2xl">
                                Xem đánh giá thực tế của khách hàng về Văn Lành Service trực tiếp trên Google Maps.
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
        <section className="py-16 bg-white overflow-hidden relative">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-50 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/3"></div>
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-50 rounded-full blur-3xl -z-10 translate-y-1/3 -translate-x-1/3"></div>

            <div className="max-w-[1200px] mx-auto px-4 md:px-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <MessageSquareQuote size={20} className="text-orange-500" />
                            <span className="text-orange-600 font-bold text-sm tracking-wider uppercase">{reviewsConfig.eyebrow}</span>
                        </div>
                        <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
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
                            onClick={() => scroll('left')}
                            className="w-12 h-12 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 transition-colors bg-white shadow-sm"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <button 
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
                    className="flex overflow-x-auto hide-scrollbar gap-5 pb-8 snap-x"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {data.reviews.map((review, idx) => (
                        <div 
                            key={idx} 
                            className="w-[300px] md:w-[380px] flex-shrink-0 snap-start bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-xl transition-shadow relative"
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
                            
                            <div className="absolute top-6 right-6 text-gray-200 opacity-50">
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
