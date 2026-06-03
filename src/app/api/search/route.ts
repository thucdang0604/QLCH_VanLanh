import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { isRateLimited } from '@/lib/rateLimit';

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

// ── Simple in-memory cache ──
let cachedResults: { products: Record<string, unknown>[]; services: Record<string, unknown>[] } | null = null;
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

    type FirestoreDoc = {
        id: string;
        createdAt?: { toDate?: () => Date } | number;
        updatedAt?: { toDate?: () => Date } | number;
        isActive?: boolean;
        name?: string;
        title?: string;
        category?: string;
        brand?: string;
        description?: string;
        [key: string]: unknown;
    };

    const products = productsSnap.docs.map(doc => {
        const data = doc.data();
        const serialized = { ...data, id: doc.id, _type: 'product' } as FirestoreDoc;
        if (typeof serialized.createdAt === 'object' && serialized.createdAt?.toDate) serialized.createdAt = serialized.createdAt.toDate().getTime();
        if (typeof serialized.updatedAt === 'object' && serialized.updatedAt?.toDate) serialized.updatedAt = serialized.updatedAt.toDate().getTime();
        return serialized as Record<string, unknown>;
    });

    const services = servicesSnap.docs
        .map(doc => {
            const data = doc.data();
            const serialized = { ...data, id: doc.id, _type: 'service' } as FirestoreDoc;
            if (typeof serialized.createdAt === 'object' && serialized.createdAt?.toDate) serialized.createdAt = serialized.createdAt.toDate().getTime();
            if (typeof serialized.updatedAt === 'object' && serialized.updatedAt?.toDate) serialized.updatedAt = serialized.updatedAt.toDate().getTime();
            return serialized;
        })
        .filter((s: FirestoreDoc) => s.isActive !== false)
        .map(s => s as Record<string, unknown>);

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

        if (await isRateLimited(ip, 'search', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
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

        const combined = [...products, ...services].filter((item: Record<string, unknown>) => {
            const name = (String(item.name || item.title || '')).toLowerCase();
            const category = (String(item.category || '')).toLowerCase();
            const brand = (String(item.brand || '')).toLowerCase();
            const description = (String(item.description || '')).toLowerCase();
            return name.includes(keyword) || category.includes(keyword) || brand.includes(keyword) || description.includes(keyword);
        });

        const db = getAdminDb();
        const ordersResult: Record<string, unknown>[] = [];
        const repairsResult: Record<string, unknown>[] = [];

        // Exact match queries for Orders and Repairs (useful for QR codes)
        const [orderDoc, repairDoc] = await Promise.all([
            db.collection('orders').doc(q).get(),
            db.collection('repairs').doc(q).get()
        ]);

        const serializeDoc = (doc: any, type: string) => {
            const data = doc.data();
            const serialized = { ...data, id: doc.id, _type: type };
            if (typeof serialized.createdAt === 'object' && serialized.createdAt?.toDate) serialized.createdAt = serialized.createdAt.toDate().getTime();
            if (typeof serialized.updatedAt === 'object' && serialized.updatedAt?.toDate) serialized.updatedAt = serialized.updatedAt.toDate().getTime();
            if (typeof serialized.completedAt === 'object' && serialized.completedAt?.toDate) serialized.completedAt = serialized.completedAt.toDate().getTime();
            return serialized;
        };

        if (orderDoc.exists) {
            ordersResult.push(serializeDoc(orderDoc, 'order'));
        }
        if (repairDoc.exists) {
            repairsResult.push(serializeDoc(repairDoc, 'repair'));
        }

        // Phone number query
        if (/^\d{8,12}$/.test(q)) {
            const [ordersSnap, repairsSnap] = await Promise.all([
                db.collection('orders').where('customer.phone', '==', q).limit(5).get(),
                db.collection('repairs').where('customer.phone', '==', q).limit(5).get()
            ]);
            ordersSnap.docs.forEach(doc => {
                if (!ordersResult.some(o => o.id === doc.id)) {
                    ordersResult.push(serializeDoc(doc, 'order'));
                }
            });
            repairsSnap.docs.forEach(doc => {
                if (!repairsResult.some(r => r.id === doc.id)) {
                    repairsResult.push(serializeDoc(doc, 'repair'));
                }
            });
        }

        return NextResponse.json({ results: [...combined, ...ordersResult, ...repairsResult] });
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json(
            { error: 'Lỗi hệ thống. Vui lòng thử lại sau.' },
            { status: 500 }
        );
    }
}
