import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { isRateLimited } from '@/lib/rateLimit';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

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

export const POST = withApi({
    name: 'articles/view',
    onError: (error, context) => {
        const status = getApiErrorStatus(error);
        return context.error(status < 500 ? getApiErrorMessage(error) : 'Lỗi hệ thống. Vui lòng thử lại sau.', status);
    },
}, async (request: NextRequest, context) => {
        const body = await context.readJson<{ slug?: unknown }>(request);
        const slug = typeof body.slug === 'string' ? body.slug.trim() : '';

        if (!slug || slug.length > 180 || slug.includes('/')) {
            return context.json({ error: 'Invalid article slug' }, { status: 400 });
        }

        const cookieName = getViewCookieName(slug);
        if (request.cookies.get(cookieName)?.value === '1') {
            return context.json({ success: true, counted: false, reason: 'already-counted' });
        }

        const ip = getClientIp(request);
        if (await isRateLimited(ip, 'article_view', ARTICLE_VIEW_RATE_LIMIT, ARTICLE_VIEW_RATE_WINDOW_MS)) {
            return context.json({ error: 'Too many requests' }, { status: 429 });
        }

        await getAdminDb().collection('articles').doc(slug).update({
            views: FieldValue.increment(1),
            viewsUpdatedAt: FieldValue.serverTimestamp(),
        });

        const response = context.json({ success: true, counted: true });
        response.cookies.set(cookieName, '1', {
            maxAge: VIEW_TTL_SECONDS,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });
        return response;
});
