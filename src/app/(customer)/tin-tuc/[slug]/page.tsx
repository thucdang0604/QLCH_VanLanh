'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Clock, User, Tag, ArrowLeft, Eye, Loader2, FileText } from 'lucide-react';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Timestamp } from 'firebase/firestore';
import VideoEmbed from '@/components/VideoEmbed';

function stripHtml(html: string): string {
    return (html || '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatDate(d: any): string {
    if (!d) return '';
    if (d instanceof Timestamp) {
        return d.toDate().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    if (d.seconds) {
        return new Date(d.seconds * 1000).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const typeConfig: Record<string, { label: string; color: string }> = {
    Promo: { label: 'Khuyến mãi', color: 'bg-red-100 text-red-700' },
    News: { label: 'Tin tức', color: 'bg-blue-100 text-blue-700' },
    Tips: { label: 'Mẹo hay', color: 'bg-green-100 text-green-700' },
};

export default function ArticleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params);
    const [article, setArticle] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        const fetchArticle = async () => {
            try {
                const docRef = doc(db, 'articles', slug);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setArticle({ id: snap.id, ...snap.data() });
                    // Increment view count
                    updateDoc(docRef, { views: increment(1) }).catch(() => {});
                } else {
                    setNotFound(true);
                }
            } catch (err) {
                console.error('Error fetching article:', err);
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };
        fetchArticle();
    }, [slug]);

    if (loading) {
        return (
            <div className="max-w-[900px] mx-auto px-2 md:px-4 py-8">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-orange-500" size={40} />
                </div>
            </div>
        );
    }

    if (notFound || !article) {
        return (
            <div className="max-w-[900px] mx-auto px-2 md:px-4 py-8">
                <div className="bg-white rounded-xl shadow-sm py-20 text-center">
                    <FileText size={64} className="mx-auto text-gray-300 mb-4" />
                    <h1 className="text-2xl font-bold text-gray-800">Không tìm thấy bài viết</h1>
                    <p className="text-gray-500 mt-2">Bài viết này không tồn tại hoặc đã bị xóa.</p>
                    <Link href="/tin-tuc" className="mt-6 inline-block px-8 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 transition-colors">
                        ← Tất cả bài viết
                    </Link>
                </div>
            </div>
        );
    }

    const typeInfo = typeConfig[article.type] || { label: article.type, color: 'bg-gray-100 text-gray-600' };

    const canonicalUrl = `https://qlch-vanlanh.web.app/tin-tuc/${article.id}`;
    const seoTitle = `${article.title} | Văn Lành Service`;
    const descriptionSource = (article.excerpt as string) || stripHtml(article.content || '') || (article.title as string);
    const seoDescription = descriptionSource.slice(0, 155);
    const ogImage = article.thumbnail || 'https://qlch-vanlanh.web.app/logo.png';

    const published = article.publishedAt || article.createdAt;
    const publishedIso = published instanceof Timestamp
        ? published.toDate().toISOString()
        : (published?.seconds ? new Date(published.seconds * 1000).toISOString() : undefined);

    const blogPostingSchema = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: article.title,
        description: seoDescription,
        image: article.thumbnail ? [article.thumbnail] : undefined,
        datePublished: publishedIso,
        dateModified: publishedIso,
        author: article.author ? { '@type': 'Person', name: article.author } : { '@type': 'Organization', name: 'Văn Lành Service' },
        publisher: {
            '@type': 'Organization',
            name: 'Văn Lành Service',
            logo: {
                '@type': 'ImageObject',
                url: 'https://qlch-vanlanh.web.app/logo.png',
            },
        },
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': canonicalUrl,
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
                name: 'Bài viết',
                item: 'https://qlch-vanlanh.web.app/tin-tuc',
            },
            {
                '@type': 'ListItem',
                position: 3,
                name: article.title,
                item: canonicalUrl,
            },
        ],
    };

    return (
        <div className="max-w-[900px] mx-auto px-2 md:px-4 py-4 md:py-8">
            {/* SEO */}
            <title>{seoTitle}</title>
            <meta name="description" content={seoDescription} />
            <link rel="canonical" href={canonicalUrl} />
            <meta property="og:type" content="article" />
            <meta property="og:title" content={seoTitle} />
            <meta property="og:description" content={seoDescription} />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="og:image" content={ogImage} />
            <meta property="twitter:card" content="summary_large_image" />
            <meta property="twitter:title" content={seoTitle} />
            <meta property="twitter:description" content={seoDescription} />
            <meta property="twitter:image" content={ogImage} />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
            />

            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
                <Link href="/" className="hover:text-orange-600 transition-colors">Trang chủ</Link>
                <ChevronRight size={14} />
                <Link href="/tin-tuc" className="hover:text-orange-600 transition-colors">Bài viết</Link>
                <ChevronRight size={14} />
                <span className="text-gray-900 font-medium line-clamp-1">{article.title}</span>
            </nav>

            <article className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Thumbnail */}
                {article.thumbnail && (
                    <div className="relative aspect-[21/9] w-full bg-gray-100">
                        <Image
                            src={article.thumbnail}
                            alt={article.title}
                            fill
                            className="object-cover"
                            priority
                        />
                    </div>
                )}

                <div className="p-6 md:p-10">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="flex items-center gap-3 mb-4">
                            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${typeInfo.color}`}>
                                {typeInfo.label}
                            </span>
                            <span className="flex items-center gap-1 text-sm text-gray-400">
                                <Clock size={14} />
                                {formatDate(article.publishedAt || article.createdAt)}
                            </span>
                            {article.views > 0 && (
                                <span className="flex items-center gap-1 text-sm text-gray-400">
                                    <Eye size={14} />
                                    {article.views.toLocaleString()} lượt xem
                                </span>
                            )}
                        </div>

                        <h1 className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight">
                            {article.title}
                        </h1>

                        {article.author && (
                            <div className="flex items-center gap-2 mt-4 text-gray-500">
                                <User size={16} />
                                <span className="text-sm font-medium">{article.author}</span>
                            </div>
                        )}
                    </div>

                    {/* Featured Video */}
                    {article.videoEmbedUrl && (
                        <div className="mb-8">
                            <VideoEmbed url={article.videoEmbedUrl} />
                        </div>
                    )}

                    {/* Article Content (HTML from ReactQuill) */}
                    <div
                        className="prose prose-lg max-w-none text-gray-700
                            prose-headings:text-gray-900 prose-headings:font-bold
                            prose-a:text-orange-600 prose-a:no-underline hover:prose-a:underline
                            prose-img:rounded-xl prose-img:shadow-sm
                            prose-blockquote:border-orange-500 prose-blockquote:bg-orange-50/50 prose-blockquote:rounded-r-xl
                            [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:border-0
                            [&_.ql-video]:w-full [&_.ql-video]:aspect-video [&_.ql-video]:rounded-xl
                        "
                        dangerouslySetInnerHTML={{ __html: article.content }}
                    />

                    {/* Tags */}
                    {article.tags?.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 mt-10 pt-6 border-t border-gray-100">
                            <Tag size={16} className="text-gray-400" />
                            {article.tags.map((tag: string) => (
                                <span key={tag} className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-medium hover:bg-orange-50 hover:text-orange-600 transition-colors">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </article>

            {/* Back link */}
            <div className="mt-6 text-center">
                <Link href="/tin-tuc" className="inline-flex items-center gap-2 text-orange-600 font-medium hover:underline">
                    <ArrowLeft size={16} />
                    Xem tất cả bài viết
                </Link>
            </div>
        </div>
    );
}
