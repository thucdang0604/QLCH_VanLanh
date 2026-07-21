import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { isRateLimited } from '@/lib/rateLimit';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

function getNextMidnightUTC7(): number {
    const now = new Date();
    // UTC+7 offset
    const utc7Now = new Date(now.getTime() + 7 * 60 * 60_000);
    const tomorrow = new Date(utc7Now);
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    // Convert back from UTC+7 to UTC
    return tomorrow.getTime() - 7 * 60 * 60_000;
}

// ═══ POST: Submit product review ═══
export const POST = withApi({
    name: 'reviews/product',
    onError: (error, context) => {
        const status = getApiErrorStatus(error);
        return context.error(status < 500 ? getApiErrorMessage(error) : 'Lỗi hệ thống. Vui lòng thử lại sau.', status);
    },
}, async (request: NextRequest, context) => {
        // ── 1. Rate Limiting ──
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (await isRateLimited(ip, 'product_reviews_minute', 3, 60_000)) {
            return context.json(
                { error: 'Bạn đang gửi quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.' },
                { status: 429 }
            );
        }

        const msUntilMidnight = Math.max(1000, getNextMidnightUTC7() - Date.now());
        if (await isRateLimited(ip, 'product_reviews_daily', 5, msUntilMidnight)) {
            return context.json(
                { error: 'Bạn đã đạt giới hạn đánh giá trong ngày. Vui lòng quay lại ngày mai.' },
                { status: 429 }
            );
        }

        const body = await context.readJson(request);

        // ── 2. Honeypot Check ──
        if (body.website) {
            return context.json(
                { error: 'Invalid request' },
                { status: 400 }
            );
        }

        const { productId, productName, customerName, phone, rating, content, images } = body;

        if (!isAdminAvailable()) {
            return context.json(
                { error: 'Service unavailable' },
                { status: 503 }
            );
        }

        // ── 3. Validate required fields ──
        if (!productId || typeof productId !== 'string') {
            return context.json(
                { error: 'Thiếu thông tin sản phẩm.' },
                { status: 400 }
            );
        }

        if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 2) {
            return context.json(
                { error: 'Vui lòng nhập tên (ít nhất 2 ký tự).' },
                { status: 400 }
            );
        }

        // Validate rating (1-5)
        const ratingNum = Number(rating);
        if (!ratingNum || ratingNum < 1 || ratingNum > 5 || !Number.isInteger(ratingNum)) {
            return context.json(
                { error: 'Đánh giá không hợp lệ (1-5 sao).' },
                { status: 400 }
            );
        }

        // Validate images (array of strings, max 5)
        const validImages: string[] = [];
        if (Array.isArray(images)) {
            for (const img of images.slice(0, 5)) {
                if (typeof img === 'string' && img.startsWith('http')) {
                    validImages.push(img);
                }
            }
        }

        // ── 4. Create review ──
        const review = {
            productId: productId.trim(),
            productName: productName ? String(productName).trim() : '',
            customerName: customerName.trim(),
            phone: phone ? String(phone).trim() : '',
            rating: ratingNum,
            content: (content || '').trim(),
            images: validImages,
            status: 'pending', // Phải được duyệt mới hiển thị
            createdAt: FieldValue.serverTimestamp(),
        };

        const docRef = await getAdminDb().collection('product_reviews').add(review);

        return context.json({
            success: true,
            reviewId: docRef.id,
            message: 'Đánh giá đã được gửi thành công và đang chờ duyệt!',
        });
});
