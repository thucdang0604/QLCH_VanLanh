import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';

// ── Rate Limiting (in-memory, per IP, 10 req/min) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return false;
    }

    entry.count++;
    return true;
}

// Cleanup memory every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
}, 5 * 60_000);

// ── Simple in-memory cache ──
let cachedResults: { products: any[]; services: any[] } | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 60s

async function getCachedData() {
    const now = Date.now();
    if (cachedResults && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedResults;
    }

    const db = getAdminDb();

    const [productsSnap, servicesSnap] = await Promise.all([
        db.collection('products').where('status', '==', 'active').get(),
        db.collection('services').get(),
    ]);

    const products = productsSnap.docs.map(doc => {
        const data = doc.data();
        const serialized = { ...data, id: doc.id } as Record<string, any>;
        if (serialized.createdAt?.toDate) serialized.createdAt = serialized.createdAt.toDate().getTime();
        if (serialized.updatedAt?.toDate) serialized.updatedAt = serialized.updatedAt.toDate().getTime();
        return serialized;
    });

    const services = servicesSnap.docs
        .map(doc => {
            const data = doc.data();
            const serialized = { ...data, id: doc.id } as Record<string, any>;
            if (serialized.createdAt?.toDate) serialized.createdAt = serialized.createdAt.toDate().getTime();
            if (serialized.updatedAt?.toDate) serialized.updatedAt = serialized.updatedAt.toDate().getTime();
            return serialized;
        })
        .filter((s: any) => s.isActive !== false);

    cachedResults = { products, services };
    cacheTimestamp = now;
    return cachedResults;
}

export async function GET(request: NextRequest) {
    try {
        // Rate limit
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (!checkRateLimit(ip)) {
            return NextResponse.json(
                { error: 'Bạn đang tìm kiếm quá nhanh. Vui lòng thử lại sau.' },
                { status: 429 }
            );
        }

        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q')?.trim() || '';

        if (!q) {
            return NextResponse.json({ results: [] });
        }

        if (!isAdminAvailable()) {
            return NextResponse.json(
                { error: 'Service unavailable' },
                { status: 503 }
            );
        }

        const { products, services } = await getCachedData();
        const keyword = q.toLowerCase();

        const combined = [...products, ...services].filter((item: any) => {
            const name = (item.name || item.title || '').toLowerCase();
            const category = (item.category || '').toLowerCase();
            const brand = (item.brand || '').toLowerCase();
            const description = (item.description || '').toLowerCase();
            return name.includes(keyword) || category.includes(keyword) || brand.includes(keyword) || description.includes(keyword);
        });

        return NextResponse.json({ results: combined });
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json(
            { error: 'Lỗi hệ thống. Vui lòng thử lại sau.' },
            { status: 500 }
        );
    }
}
