import type { ArticleComment } from '@/lib/types';

export interface Article {
    id: string;
    title: string;
    content: string;
    excerpt?: string;
    type: string;
    status: string;
    thumbnail?: string;
    videoEmbedUrl?: string;
    views: number;
    tags?: string[];
    createdAt: unknown;
    updatedAt?: unknown;
}

export type { ArticleComment };

export const articleTypeColors: Record<string, string> = {
    News: 'bg-blue-100 text-blue-700',
    Promo: 'bg-red-100 text-red-700',
    Tips: 'bg-green-100 text-green-700',
    Training: 'bg-purple-100 text-purple-700',
};

export const articleTypeLabels: Record<string, string> = {
    News: 'Tin tức',
    Promo: 'Khuyến mãi',
    Tips: 'Mẹo hay',
    Training: 'Đào Tạo',
};
