'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FileText, Clock, ArrowRight } from 'lucide-react';
import { collection, query, where, orderBy, limit, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useMemo, useState, useEffect } from 'react';

const typeConfig: Record<string, { label: string; color: string }> = {
    Promo: { label: 'Khuyến mãi', color: 'bg-red-100 text-red-700' },
    News: { label: 'Tin tức', color: 'bg-blue-100 text-blue-700' },
    Tips: { label: 'Mẹo hay', color: 'bg-green-100 text-green-700' },
    Training: { label: 'Đào Tạo', color: 'bg-purple-100 text-purple-700' },
};

type ArticleDoc = {
    id: string;
    title?: string;
    type?: string;
    thumbnail?: string;
    createdAt?: unknown;
};

function formatDate(d: unknown): string {
    if (!d) return '';
    let date: Date | null = null;

    if (d instanceof Timestamp) {
        date = d.toDate();
    } else if (d instanceof Date) {
        date = d;
    } else if (typeof d === 'number' || typeof d === 'string') {
        date = new Date(d);
    } else if (typeof d === 'object' && d !== null) {
        const timestamp = d as { seconds?: unknown; _seconds?: unknown };
        const seconds = timestamp.seconds ?? timestamp._seconds;
        if (typeof seconds === 'number') {
            date = new Date(seconds * 1000);
        }
    }

    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('vi-VN') : '';
}

function ArticleSkeleton() {
    return (
        <div className="bg-white rounded-xl overflow-hidden border border-gray-100 animate-pulse">
            <div className="aspect-[16/9] bg-gray-200" />
            <div className="p-4 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-16" />
                <div className="h-4 bg-gray-200 rounded w-full" />
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-24 mt-2" />
            </div>
        </div>
    );
}

export default function ArticleBlock({ ssrArticles }: { ssrArticles?: ArticleDoc[] }) {
    const [articles, setArticles] = useState<ArticleDoc[]>(
        Array.isArray(ssrArticles) ? ssrArticles : []
    );
    const [loading, setLoading] = useState(!Array.isArray(ssrArticles));

    const constraints = useMemo(() => [
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
        limit(4),
    ], []);

    useEffect(() => {
        // If we received SSR data, we don't need to fetch from Firebase on the client
        if (Array.isArray(ssrArticles) && ssrArticles.length > 0) {
            setLoading(false);
            return;
        }

        let isMounted = true;
        const fetchArticles = async () => {
            try {
                const q = query(collection(db, 'articles'), ...constraints);
                const snapshot = await getDocs(q);
                if (!isMounted) return;
                
                const docs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as ArticleDoc[];
                setArticles(docs);
            } catch (error) {
                console.error("Error fetching articles:", error);
                if (isMounted) setArticles([]);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchArticles();

        return () => {
            isMounted = false;
        };
    }, [constraints, ssrArticles]);

    // Don't render section if no articles and not loading
    if (!loading && articles.length === 0) return null;

    return (
        <section className="home-articles-section py-2">
            <div className="home-articles-container mx-auto max-w-[1080px] px-2 md:px-4">
                <div className="home-articles-card home-section-card rounded-xl border border-gray-100 p-3 shadow-sm sm:p-4" style={{ backgroundColor: 'var(--card-bg, white)' }}>
                    {/* Header */}
                    <div className="home-articles-header mb-3 flex items-center justify-between">
                        <h2 className="home-articles-title text-xl font-bold text-dark flex items-center gap-2">
                            <FileText size={22} className="text-copper" />
                            Bài Viết Nổi Bật
                        </h2>
                        <Link
                            href="/tin-tuc"
                            className="home-articles-cta text-sm text-copper hover:text-copper-dark font-medium flex items-center gap-1 transition-colors"
                        >
                            Xem tất cả <ArrowRight size={14} />
                        </Link>
                    </div>

                    {/* Grid */}
                    {loading ? (
                        <div className="home-articles-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
                            {[...Array(4)].map((_, i) => <ArticleSkeleton key={i} />)}
                        </div>
                    ) : (
                        <div className="home-articles-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
                            {articles.map((article) => {
                                const articleType = article.type || 'News';
                                const typeInfo = typeConfig[articleType] || { label: articleType, color: 'bg-gray-100 text-gray-600' };

                                return (
                                    <Link
                                        key={article.id}
                                        href={`/tin-tuc/${article.id}`}
                                        className="home-articles-item group overflow-hidden rounded-lg border border-gray-100 bg-white transition-all duration-300 hover:border-copper/20 hover:shadow-md"
                                    >
                                        {/* Thumbnail */}
                                            <div className="home-articles-thumbnail relative aspect-[4/3] overflow-hidden bg-gray-50">
                                            {article.thumbnail ? (
                                                <Image
                                                    src={article.thumbnail}
                                                    alt={article.title || 'Bài viết'}
                                                    fill
                                                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                                                    quality={75}
                                                    className="object-contain group-hover:scale-105 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50">
                                                    <FileText size={32} className="text-orange-300" />
                                                </div>
                                            )}
                                            {/* Type Badge */}
                                            <span className={`home-articles-badge absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${typeInfo.color}`}>
                                                {typeInfo.label}
                                            </span>
                                        </div>

                                        {/* Content */}
                                            <div className="home-articles-content p-2.5">
                                            <h3 className="home-articles-item-title mb-1.5 line-clamp-2 min-h-[36px] text-xs font-bold text-gray-900 transition-colors group-hover:text-copper sm:text-sm">
                                                {article.title || 'Bài viết'}
                                            </h3>
                                            <div className="home-articles-meta flex items-center gap-1 text-[11px] text-gray-400">
                                                <Clock size={11} />
                                                {formatDate(article.createdAt)}
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
