import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { isRateLimited } from '@/lib/rateLimit';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

function getNextMidnightUTC7(): number {
    const now = new Date();
    const utc7Now = new Date(now.getTime() + 7 * 60 * 60_000);
    const tomorrow = new Date(utc7Now);
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return tomorrow.getTime() - 7 * 60 * 60_000;
}

export const POST = withApi({
    name: 'articles/comments',
    onError: (error, context) => {
        const status = getApiErrorStatus(error);
        return context.error(status < 500 ? getApiErrorMessage(error) : 'Lỗi hệ thống. Vui lòng thử lại sau.', status);
    },
}, async (request: NextRequest, context) => {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (await isRateLimited(ip, 'article_comments_minute', 3, 60_000)) {
            return context.json(
                { error: 'Bạn đang gửi quá nhiều bình luận. Vui lòng thử lại sau 1 phút.' },
                { status: 429 }
            );
        }

        const msUntilMidnight = Math.max(1000, getNextMidnightUTC7() - Date.now());
        if (await isRateLimited(ip, 'article_comments_daily', 10, msUntilMidnight)) {
            return context.json(
                { error: 'Bạn đã đạt giới hạn bình luận trong ngày. Vui lòng quay lại ngày mai.' },
                { status: 429 }
            );
        }

        const body = await context.readJson(request);
        if (body.website) {
            return context.json({ error: 'Invalid request' }, { status: 400 });
        }

        if (!isAdminAvailable()) {
            return context.json({ error: 'Service unavailable' }, { status: 503 });
        }

        const articleId = typeof body.articleId === 'string' ? body.articleId.trim() : '';
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
        const content = typeof body.content === 'string' ? body.content.trim() : '';
        const rating = Number(body.rating);

        if (!articleId || articleId.length > 180) {
            return context.json({ error: 'Bài viết không hợp lệ.' }, { status: 400 });
        }
        if (name.length < 2 || name.length > 100) {
            return context.json({ error: 'Vui lòng nhập tên từ 2 đến 100 ký tự.' }, { status: 400 });
        }
        if (phone.length > 20) {
            return context.json({ error: 'Số điện thoại không hợp lệ.' }, { status: 400 });
        }
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return context.json({ error: 'Đánh giá không hợp lệ.' }, { status: 400 });
        }
        if (!content || content.length > 2000) {
            return context.json({ error: 'Bình luận phải có nội dung và tối đa 2000 ký tự.' }, { status: 400 });
        }

        const db = getAdminDb();
        const articleSnap = await db.collection('articles').doc(articleId).get();
        if (!articleSnap.exists) {
            return context.json({ error: 'Bài viết không tồn tại.' }, { status: 404 });
        }

        const docRef = await db.collection('article_comments').add({
            articleId,
            rating,
            name,
            phone,
            content,
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
        });

        return context.json({
            success: true,
            commentId: docRef.id,
            message: 'Bình luận đã được gửi và đang chờ duyệt.',
        });
});
