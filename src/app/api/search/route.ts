import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { isRateLimited } from '@/lib/rateLimit';
import { toPublicProduct, toPublicService } from '@/lib/publicCatalog';

type PublicSearchResult =
    | (ReturnType<typeof toPublicProduct> & { _type: 'product' })
    | (ReturnType<typeof toPublicService> & { _type: 'service' });

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RESULT_LIMIT = 20;
const SERVICE_FALLBACK_LIMIT = 50;
const MIN_QUERY_LENGTH = 2;

function normalizeSearchText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function searchTokens(query: string): string[] {
    return Array.from(new Set([
        query.toLowerCase().trim(),
        normalizeSearchText(query),
    ].filter(token => token.length >= MIN_QUERY_LENGTH))).slice(0, 2);
}

function matchesKeyword(item: Record<string, unknown>, keyword: string): boolean {
    const haystack = [
        item.name,
        item.title,
        item.category,
        item.brand,
        item.description,
        ...(Array.isArray(item.tags) ? item.tags : []),
    ].join(' ').toLowerCase();

    return normalizeSearchText(haystack).includes(keyword);
}

export async function GET(request: NextRequest) {
    try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (await isRateLimited(ip, 'search', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
            return NextResponse.json({ error: 'Too many search requests' }, { status: 429 });
        }

        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q')?.trim() || '';

        if (q.length < MIN_QUERY_LENGTH) {
            return NextResponse.json({ results: [] });
        }

        if (!isAdminAvailable()) {
            return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
        }

        const tokens = searchTokens(q);
        const primaryToken = tokens[0] || normalizeSearchText(q);
        const db = getAdminDb();

        const [productSnaps, serviceKeywordSnaps] = await Promise.all([
            Promise.all(tokens.map(token => db.collection('products')
                .where('status', '==', 'active')
                .where('searchKeywords', 'array-contains', token)
                .limit(RESULT_LIMIT)
                .get())),
            Promise.all(tokens.map(token => db.collection('services')
                .where('searchKeywords', 'array-contains', token)
                .limit(RESULT_LIMIT)
                .get())),
        ]);

        const results = new Map<string, PublicSearchResult>();

        productSnaps.flatMap(snap => snap.docs).forEach(doc => {
            const data = doc.data();
            if (data.status !== 'active') return;
            results.set(`product:${doc.id}`, { ...toPublicProduct(doc.id, data), _type: 'product' });
        });

        serviceKeywordSnaps.flatMap(snap => snap.docs).forEach(doc => {
            const data = doc.data();
            if (data.isActive === false) return;
            results.set(`service:${doc.id}`, { ...toPublicService(doc.id, data), _type: 'service' });
        });

        return NextResponse.json({ results: Array.from(results.values()).slice(0, RESULT_LIMIT) });
    } catch (error) {
        console.error('Search API error:', error);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
}
