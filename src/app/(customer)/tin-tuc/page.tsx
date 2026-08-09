import ClientPage from './page.client';
import { fetchArticles } from '../_lib/server-queries';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

const ARTICLE_TAB_KEYS = new Set(['all', 'Promo', 'News', 'Tips', 'Training']);

export const metadata: Metadata = {
  title: 'Bài viết nổi bật | Văn Lành Service',
  description: 'Cập nhật tin tức mới nhất, chương trình khuyến mãi, mẹo sử dụng thiết bị từ Trung tâm sửa chữa Văn Lành Service.',
  alternates: {
    canonical: `${SITE_URL}/tin-tuc`,
  },
  openGraph: {
    type: 'website',
    title: 'Bài viết nổi bật | Văn Lành Service',
    description: 'Cập nhật tin tức mới nhất, chương trình khuyến mãi, mẹo sử dụng thiết bị từ Trung tâm sửa chữa Văn Lành Service.',
    url: `${SITE_URL}/tin-tuc`,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bài viết nổi bật | Văn Lành Service',
    description: 'Cập nhật tin tức mới nhất, chương trình khuyến mãi, mẹo sử dụng thiết bị từ Trung tâm sửa chữa Văn Lành Service.',
  },
};

type ArticleIndexPageProps = {
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function Page({ searchParams }: ArticleIndexPageProps) {
  const [initialArticles, resolvedSearchParams] = await Promise.all([
    fetchArticles(),
    searchParams,
  ]);
  const requestedTab = typeof resolvedSearchParams.tab === 'string' ? resolvedSearchParams.tab : 'all';
  const initialTab = ARTICLE_TAB_KEYS.has(requestedTab) ? requestedTab : 'all';

  const canonicalUrl = `${SITE_URL}/tin-tuc`;
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Bài Viết Nổi Bật',
    description: metadata.description,
    url: canonicalUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Văn Lành Service',
      url: SITE_URL,
    },
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Bài Viết Nổi Bật', item: canonicalUrl },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <ClientPage initialArticles={initialArticles} initialTab={initialTab} />
    </>
  );
}
