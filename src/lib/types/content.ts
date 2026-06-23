import type { FirestoreDateValue } from './common';

export interface Article {
    id: string;
    title: string;
    content: string; // HTML content
    type: 'News' | 'Promo' | 'Tips';
    thumbnail?: string;
    author?: string;
    tags?: string[];
    videoEmbedUrl?: string;
    publishedAt: Date;
    createdAt: Date;
}

// ── Article Comments / Ratings ──

export interface ArticleComment {
    id: string;
    articleId: string;
    rating: number; // 1-5
    name: string;
    phone?: string;
    content: string;
    status: 'pending' | 'approved';
    reply?: {
        content: string;
        createdAt: FirestoreDateValue;
    };
    createdAt: FirestoreDateValue;
}

// Chat types (Realtime DB)

export interface ChatMessage {
    id: string;
    sessionId: string;
    content: string;
    sender: 'user' | 'bot' | 'staff';
    timestamp: number;
}

export interface ChatSession {
    id: string;
    userId?: string;
    userName?: string;
    status: 'active' | 'closed';
    lastMessage?: string;
    createdAt: FirestoreDateValue;
    updatedAt: FirestoreDateValue;
}

// Repair Ticket types

export interface Review {
    id: string;
    referenceId: string; // ID của đơn hàng hoặc phiếu sửa chữa
    type: 'repair' | 'order';
    customerName: string;
    phone: string; // Chỉ lưu/hiển thị dạng: 098****123
    rating: number; // 1-5 sao
    content: string;
    images: string[];
    status: 'pending' | 'approved';
    createdAt: FirestoreDateValue;
}

export interface ProductReview {
    id: string;
    productId: string;
    customerName: string;
    phone?: string;              // Lưu dạng ẩn: 098****123
    rating: number;              // 1-5 sao
    content: string;
    images?: string[];
    status: 'pending' | 'approved';
    reply?: {
        content: string;
        createdAt: FirestoreDateValue;
    };
    createdAt: FirestoreDateValue;
}

// ── Voucher Stacking Rules ──
