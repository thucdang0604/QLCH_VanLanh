import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { isRateLimited } from '@/lib/rateLimit';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';
import { getCachedReviewVerificationState, verifyReviewPin } from '@/lib/reviewVerification';

// ── Haversine distance (meters) ──
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371_000; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

// ── Fetch geofence config from Firestore ──
interface GeofenceData {
    enabled: boolean;
    lat: number;
    lng: number;
    radiusMeters: number;
}

async function getGeofenceConfig(): Promise<GeofenceData> {
    return (await getCachedReviewVerificationState()).geofence;
}

// ═══ GET: Return public geofence config (for client pre-check) ═══
export const GET = withApi({ name: 'reviews/geofence' }, async (_request, context) => {
    const geo = await getGeofenceConfig();
    // Only expose public fields — never expose PIN
    return context.json({
        enabled: geo.enabled,
        lat: geo.lat,
        lng: geo.lng,
        radiusMeters: geo.radiusMeters,
    });
});

// ═══ POST: Submit review ═══
export const POST = withApi({
    name: 'reviews/submit',
    onError: (error, context) => {
        const status = getApiErrorStatus(error);
        return context.error(status < 500 ? getApiErrorMessage(error) : 'Lỗi hệ thống. Vui lòng thử lại sau.', status);
    },
}, async (request: NextRequest, context) => {
        // ── 1. Rate Limiting ──
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (await isRateLimited(ip, 'reviews_minute', 3, 60_000)) {
            return context.json(
                { error: 'Bạn đang gửi quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.' },
                { status: 429 }
            );
        }

        const msUntilMidnight = Math.max(1000, getNextMidnightUTC7() - Date.now());
        if (await isRateLimited(ip, 'reviews_daily', 3, msUntilMidnight)) {
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

        const { referenceId, type, customerName, phone, rating, content, images, lat, lng, pin } = body;

        if (!isAdminAvailable()) {
            return context.json(
                { error: 'Service unavailable' },
                { status: 503 }
            );
        }

        // ── 3. Validate required fields ──
        if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 2) {
            return context.json(
                { error: 'Vui lòng nhập tên (ít nhất 2 ký tự).' },
                { status: 400 }
            );
        }

        if (!phone || typeof phone !== 'string' || phone.trim().length < 4) {
            return context.json(
                { error: 'Số điện thoại không hợp lệ.' },
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

        // ── 4. Geofence verification ──
        const verificationState = await getCachedReviewVerificationState();
        const geo = verificationState.geofence;
        let verifiedWithPin = false;
        if (geo.enabled) {
            // PIN bypass: if client provides a valid PIN, skip geo check
            if (pin && typeof pin === 'string' && (
                await verifyReviewPin(pin, verificationState.pinHash)
                || (verificationState.legacyPin !== undefined && pin === verificationState.legacyPin)
            )) {
                verifiedWithPin = true;
                // PIN verified — pass
            } else if (typeof lat === 'number' && typeof lng === 'number') {
                // Geo check via Haversine
                const distance = haversineMeters(lat, lng, geo.lat, geo.lng);
                if (distance > geo.radiusMeters) {
                    return context.json(
                        { error: `Bạn đang ngoài phạm vi cửa hàng (${Math.round(distance)}m). Vui lòng đến cửa hàng hoặc nhập mã PIN.` },
                        { status: 403 }
                    );
                }
            } else {
                return context.json(
                    { error: 'Vui lòng bật định vị hoặc nhập mã PIN để xác minh.' },
                    { status: 403 }
                );
            }
        }

        // ── 5. Create review ──
        const review = {
            referenceId: (referenceId || '').trim(),
            type: type === 'repair' ? 'repair' : 'general',
            customerName: customerName.trim(),
            phone: phone.trim(),
            rating: ratingNum,
            content: (content || '').trim(),
            images: validImages,
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            ...(geo.enabled && {
                verification: verifiedWithPin ? 'pin' : 'geolocation',
            }),
        };

        const db = getAdminDb();
        const reviewId = await db.runTransaction(async (tx) => {
            const reviewAllocation = await reserveSequentialDocumentId(tx, db, {
                collectionName: 'reviews',
                prefix: 'RV',
            });
            reviewAllocation.commitCounter();
            tx.set(reviewAllocation.ref, review);
            return reviewAllocation.id;
        });

        return context.json({
            success: true,
            reviewId,
            message: 'Đánh giá đã được gửi thành công!',
        });
});
