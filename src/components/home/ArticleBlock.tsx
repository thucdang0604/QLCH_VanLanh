'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FileText, Clock, ArrowRight } from 'lucide-react';
import { useFirestoreCollection } from '@/lib/useFirestore';
import { where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { useMemo } from 'react';

const typeConfig: Record<string, { label: string; color: string }> = {
    Promo: { label: 'Khuyến mãi', color: 'bg-red-100 text-red-700' },
    News: { label: 'Tin tức', color: 'bg-blue-100 text-blue-700' },
    Tips: { label: 'Mẹo hay', color: 'bg-green-100 text-green-700' },
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
    if (d instanceof Timestamp) return d.toDate().toLocaleDateString('vi-VN');
    if (typeof d === 'object' && d !== null && 'seconds' in d) {
        const seconds = (d as { seconds?: unknown }).seconds;
        if (typeof seconds === 'number') return new Date(seconds * 1000).toLocaleDateString('vi-VN');
    }
    return new Date(d as string | number | Date).toLocaleDateString('vi-VN');
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

export default function ArticleBlock() {
    const constraints = useMemo(() => [
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
        limit(4),
    ], []);

    const { data: articles, loading } = useFirestoreCollection<ArticleDoc>('articles', constraints);

    // Don't render section if no articles and not loading
    if (!loading && articles.length === 0) return null;

    return (
        <section className="py-2">
            <div className="max-w-[1200px] mx-auto px-2 md:px-4">
                <div className="rounded-xl shadow-lg p-4 sm:p-6" style={{ backgroundColor: 'var(--card-bg, white)' }}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-xl font-bold text-dark flex items-center gap-2">
                            <FileText size={22} className="text-copper" />
                            Bài Viết Nổi Bật
                        </h2>
                        <Link
                            href="/tin-tuc"
                            className="text-sm text-copper hover:text-copper-dark font-medium flex items-center gap-1 transition-colors"
                        >
                            Xem tất cả <ArrowRight size={14} />
                        </Link>
                    </div>

                    {/* Grid */}
                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[...Array(4)].map((_, i) => <ArticleSkeleton key={i} />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {articles.map((article) => {
                                const articleType = article.type || 'News';
                                const typeInfo = typeConfig[articleType] || { label: articleType, color: 'bg-gray-100 text-gray-600' };

                                return (
                                    <Link
                                        key={article.id}
                                        href={`/tin-tuc/${article.id}`}
                                        className="group bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg hover:border-copper/20 transition-all duration-300"
                                    >
                                        {/* Thumbnail */}
                                        <div className="relative aspect-[16/9] bg-gray-50 overflow-hidden">
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
                                            <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${typeInfo.color}`}>
                                                {typeInfo.label}
                                            </span>
                                        </div>

                                        {/* Content */}
                                        <div className="p-3">
                                            <h3 className="text-sm font-bold text-gray-900 line-clamp-2 group-hover:text-copper transition-colors mb-2 min-h-[40px]">
                                                {article.title || 'Bài viết'}
                                            </h3>
                                            <div className="flex items-center gap-1 text-[11px] text-gray-400">
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
