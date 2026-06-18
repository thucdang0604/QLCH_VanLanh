import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { isRateLimited } from '@/lib/rateLimit';

const VIEW_TTL_SECONDS = 60 * 60 * 24;
const ARTICLE_VIEW_RATE_LIMIT = 120;
const ARTICLE_VIEW_RATE_WINDOW_MS = 60_000;

function getClientIp(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
}

function getViewCookieName(slug: string): string {
    const digest = createHash('sha256').update(slug).digest('hex').slice(0, 24);
    return `vl_article_view_${digest}`;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({})) as { slug?: unknown };
        const slug = typeof body.slug === 'string' ? body.slug.trim() : '';

        if (!slug || slug.length > 180 || slug.includes('/')) {
            return NextResponse.json({ error: 'Invalid article slug' }, { status: 400 });
        }

        const cookieName = getViewCookieName(slug);
        if (request.cookies.get(cookieName)?.value === '1') {
            return NextResponse.json({ success: true, counted: false, reason: 'already-counted' });
        }

        const ip = getClientIp(request);
        if (await isRateLimited(ip, 'article_view', ARTICLE_VIEW_RATE_LIMIT, ARTICLE_VIEW_RATE_WINDOW_MS)) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        await getAdminDb().collection('articles').doc(slug).update({
            views: FieldValue.increment(1),
            viewsUpdatedAt: FieldValue.serverTimestamp(),
        });

        const response = NextResponse.json({ success: true, counted: true });
        response.cookies.set(cookieName, '1', {
            maxAge: VIEW_TTL_SECONDS,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });
        return response;
    } catch (error) {
        console.error('Article view tracking error:', error);
        return NextResponse.json({ error: 'Unable to track article view' }, { status: 500 });
    }
}
