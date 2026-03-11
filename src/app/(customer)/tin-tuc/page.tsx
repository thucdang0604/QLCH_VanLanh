'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Eye, Clock, Tag, FileText, Loader2 } from 'lucide-react';
import { useFirestoreCollection } from '@/lib/useFirestore';
import { where, orderBy, Timestamp } from 'firebase/firestore';

const typeConfig: Record<string, { label: string; color: string }> = {
    Promo: { label: 'Khuyến mãi', color: 'bg-red-100 text-red-700' },
    News: { label: 'Tin tức', color: 'bg-blue-100 text-blue-700' },
    Tips: { label: 'Mẹo hay', color: 'bg-green-100 text-green-700' },
};

const tabs = [
    { key: 'all', label: 'Tất cả' },
    { key: 'Promo', label: '🔥 Khuyến mãi' },
    { key: 'News', label: '📰 Tin tức' },
    { key: 'Tips', label: '💡 Mẹo hay' },
];

function formatDate(d: any): string {
    if (!d) return '';
    if (d instanceof Timestamp) {
        return d.toDate().toLocaleDateString('vi-VN');
    }
    if (d.seconds) {
        return new Date(d.seconds * 1000).toLocaleDateString('vi-VN');
    }
    return new Date(d).toLocaleDateString('vi-VN');
}

export default function TinTucPage() {
    const [activeTab, setActiveTab] = useState('all');

    const constraints = useMemo(() => [
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
    ], []);

    const { data: articles, loading } = useFirestoreCollection<any>('articles', constraints);

    const filtered = useMemo(() => {
        if (activeTab === 'all') return articles;
        return articles.filter(a => a.type === activeTab);
    }, [articles, activeTab]);

    const seoTitle = 'Bài Viết Nổi Bật | Văn Lành Service';
    const seoDescription =
        'Cập nhật tin tức mới nhất, chương trình khuyến mãi, mẹo sử dụng thiết bị từ Trung tâm sửa chữa Văn Lành Service. Hotline: 0932.242.026';
    const canonicalUrl = 'https://qlch-vanlanh.web.app/tin-tuc';
    const collectionSchema = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Bài Viết Nổi Bật',
        description: seoDescription,
        url: canonicalUrl,
        isPartOf: {
            '@type': 'WebSite',
            name: 'Văn Lành Service',
            url: 'https://qlch-vanlanh.web.app',
        },
    };
    const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'Trang chủ',
                item: 'https://qlch-vanlanh.web.app/',
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: 'Bài Viết Nổi Bật',
                item: canonicalUrl,
            },
        ],
    };

    return (
        <div className="max-w-[1200px] mx-auto px-2 md:px-4 py-8">
            {/* SEO */}
            <title>{seoTitle}</title>
            <meta name="description" content={seoDescription} />
            <link rel="canonical" href={canonicalUrl} />
            <meta property="og:type" content="website" />
            <meta property="og:title" content={seoTitle} />
            <meta property="og:description" content={seoDescription} />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="twitter:card" content="summary_large_image" />
            <meta property="twitter:title" content={seoTitle} />
            <meta property="twitter:description" content={seoDescription} />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
            />
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
                <Link href="/" className="hover:text-orange-600 transition-colors">Trang chủ</Link>
                <ChevronRight size={14} />
                <span className="text-gray-900 font-medium">Bài Viết Nổi Bật</span>
            </nav>

            {/* Page Title */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Bài Viết Nổi Bật</h1>
                <p className="text-gray-500 mt-2">Cập nhật tin tức mới nhất, chương trình khuyến mãi và mẹo hay từ Văn Lành Service</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-5 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${activeTab === tab.key
                            ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-orange-500" size={36} />
                </div>
            )}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
                <div className="text-center py-20">
                    <FileText size={56} className="mx-auto text-gray-300 mb-4" />
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Chưa có bài viết</h3>
                    <p className="text-gray-400">Chúng tôi đang cập nhật nội dung. Hãy quay lại sau nhé!</p>
                </div>
            )}

            {/* Article Grid */}
            {!loading && filtered.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map((article: any) => {
                        const typeInfo = typeConfig[article.type] || { label: article.type, color: 'bg-gray-100 text-gray-600' };

                        return (
                            <Link
                                key={article.id}
                                href={`/tin-tuc/${article.id}`}
                                className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-orange-200"
                            >
                                {/* Thumbnail */}
                                <div className="relative aspect-[16/9] bg-gray-100 overflow-hidden">
                                    {article.thumbnail ? (
                                        <Image
                                            src={article.thumbnail}
                                            alt={article.title}
                                            fill
                                            className="object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50">
                                            <FileText size={40} className="text-orange-300" />
                                        </div>
                                    )}
                                    {/* Type Badge */}
                                    <span className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold ${typeInfo.color} backdrop-blur-sm`}>
                                        {typeInfo.label}
                                    </span>
                                </div>

                                {/* Content */}
                                <div className="p-5">
                                    <h3 className="text-base font-bold text-gray-900 line-clamp-2 group-hover:text-orange-600 transition-colors mb-3">
                                        {article.title}
                                    </h3>

                                    {/* Meta */}
                                    <div className="flex items-center justify-between text-xs text-gray-400">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-1">
                                                <Clock size={12} />
                                                {formatDate(article.createdAt)}
                                            </span>
                                            {article.views > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <Eye size={12} />
                                                    {article.views.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                        {article.tags?.length > 0 && (
                                            <span className="flex items-center gap-1">
                                                <Tag size={12} />
                                                {article.tags[0]}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
