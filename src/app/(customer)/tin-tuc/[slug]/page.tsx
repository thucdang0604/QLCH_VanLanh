import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Clock, User, Tag, ArrowLeft, Eye, FileText } from 'lucide-react';
import VideoEmbed from '@/components/VideoEmbed';
import { SITE_URL } from "@/lib/constants";
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import ArticleClientParts from './ArticleClientParts';
import { fetchArticleDetail } from '@/app/(customer)/_lib/server-queries';

export const revalidate = 30;

function stripHtml(html: string): string {
    return (html || '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// sanitizeArticleHtml is now imported from '@/lib/sanitizeHtml' as sanitizeHtml

function formatDate(timestampMs?: number): string {
    if (!timestampMs) return '';
    return new Date(timestampMs).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const typeConfig: Record<string, { label: string; color: string }> = {
    Promo: { label: 'Khuyến mãi', color: 'bg-red-100 text-red-700' },
    News: { label: 'Tin tức', color: 'bg-blue-100 text-blue-700' },
    Tips: { label: 'Mẹo hay', color: 'bg-green-100 text-green-700' },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const slug = (await params).slug;
    const article = await fetchArticleDetail(slug);

    if (!article) {
        return {
            title: 'Không tìm thấy bài viết | Văn Lành Service',
        };
    }

    const title = `${article.title || 'Bài viết'} | Văn Lành Service`;
    const descriptionSource = String(article.excerpt || stripHtml(String(article.content || '')) || article.title || 'Bài viết');
    const description = descriptionSource.slice(0, 155);
    const ogImage = String(article.thumbnail || `${SITE_URL}/logo.png`);
    const canonicalUrl = `${SITE_URL}/tin-tuc/${article.id}`;

    return {
        title,
        description,
        alternates: { canonical: canonicalUrl },
        openGraph: {
            title,
            description,
            url: canonicalUrl,
            images: [{ url: ogImage }],
            type: 'article',
            publishedTime: (article.publishedAt || article.createdAt) ? new Date(Number(article.publishedAt || article.createdAt)).toISOString() : undefined,
            authors: article.author ? [String(article.author)] : undefined,
        },
    };
}

export default async function ArticleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const article = await fetchArticleDetail(slug);

    if (!article) {
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

    const typeInfo = typeConfig[String(article.type || '')] || { label: String(article.type || ''), color: 'bg-gray-100 text-gray-600' };

    const canonicalUrl = `${SITE_URL}/tin-tuc/${article.id}`;
    const descriptionSource = String(article.excerpt || stripHtml(String(article.content || '')) || article.title || 'Bài viết');
    const seoDescription = descriptionSource.slice(0, 155);

    const publishedMs = Number(article.publishedAt || article.createdAt || 0);
    const publishedIso = publishedMs ? new Date(publishedMs).toISOString() : undefined;

    const blogPostingSchema = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: article.title || 'Bài viết',
        description: seoDescription,
        image: article.thumbnail ? [article.thumbnail] : undefined,
        datePublished: publishedIso,
        dateModified: publishedIso,
        author: article.author ? { '@type': 'Person', name: String(article.author) } : { '@type': 'Organization', name: 'Văn Lành Service' },
        publisher: {
            '@type': 'Organization',
            name: 'Văn Lành Service',
            logo: {
                '@type': 'ImageObject',
                url: `${SITE_URL}/logo.png`,
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
                item: `${SITE_URL}/`,
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: 'Bài viết',
                item: `${SITE_URL}/tin-tuc`,
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
                <span className="text-gray-900 font-medium line-clamp-1">{String(article.title ?? '')}</span>
            </nav>

            <article className="bg-white rounded-2xl shadow-sm overflow-hidden">
                {/* Thumbnail */}
                {!!(article.thumbnail) && (
                    <div className="relative aspect-video w-full bg-gray-100">
                        <Image
                            src={String(article.thumbnail)}
                            alt={String(article.title || 'Bài viết')}
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
                                {formatDate(Number(article.publishedAt || article.createdAt || 0))}
                            </span>
                            {!!(article.views) && (article.views as number) > 0 && (
                                <span className="flex items-center gap-1 text-sm text-gray-400">
                                    <Eye size={14} />
                                    {Number(article.views).toLocaleString()} lượt xem
                                </span>
                            )}
                        </div>

                        <h1 className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight">
                            {String(article.title ?? '')}
                        </h1>

                        {!!(article.author) && (
                            <div className="flex items-center gap-2 mt-4 text-gray-500">
                                <User size={16} />
                                <span className="text-sm font-medium">{String(article.author)}</span>
                            </div>
                        )}
                    </div>

                    {/* Featured Video */}
                    {!!(article.videoEmbedUrl) && (
                        <div className="mb-8">
                            <VideoEmbed url={String(article.videoEmbedUrl)} />
                        </div>
                    )}

                    {/* Article Content (HTML from ReactQuill) */}
                    <div
                        className="prose prose-lg max-w-none text-gray-700
                            prose-headings:text-gray-900 prose-headings:font-bold
                            prose-a:text-orange-600 prose-a:no-underline hover:prose-a:underline
                            prose-img:rounded-xl prose-img:shadow-sm prose-img:max-w-full prose-img:h-auto prose-img:mx-auto
                            prose-blockquote:border-orange-500 prose-blockquote:bg-orange-50/50 prose-blockquote:rounded-r-xl
                            [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-xl [&_iframe]:border-0
                            [&_.ql-video]:w-full [&_.ql-video]:aspect-video [&_.ql-video]:rounded-xl
                            overflow-hidden break-words
                        "
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(article.content || '')) }}
                    />

                    {/* Tags */}
                    {!!(article.tags) && (article.tags as string[]).length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 mt-10 pt-6 border-t border-gray-100">
                            <Tag size={16} className="text-gray-400" />
                            {(article.tags as string[]).map((tag: string) => (
                                <span key={tag} className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-medium hover:bg-orange-50 hover:text-orange-600 transition-colors">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </article>

            {/* Ratings + Comments (Client Side) */}
            <ArticleClientParts slug={slug} />

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
