import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { normalizeVietnamPhone } from '@/lib/phone';

type BountyStatus = 'eligible' | 'already_claimed_unused' | 'already_claimed_used';

function isVoucherUnused(data: FirebaseFirestore.DocumentData | undefined) {
    if (!data) return false;
    if (data.isActive === false) return false;
    if (data.expiryDate) {
        const expiry = typeof data.expiryDate.toDate === 'function'
            ? data.expiryDate.toDate()
            : new Date(data.expiryDate);
        if (expiry.getTime() < Date.now()) return false;
    }
    const usageLimit = Number(data.usageLimit) || 0;
    const usedCount = Number(data.usedCount) || 0;
    return usageLimit <= 0 || usedCount < usageLimit;
}

async function getBountyStatus(phone: string): Promise<{ status: BountyStatus; code?: string; message?: string }> {
    const db = getAdminDb();
    const customerRef = db.collection('customers').doc(phone);
    const deterministicVoucherRef = db.collection('vouchers').doc(`bounty_${phone}`);

    const [customerSnap, deterministicVoucherSnap, legacyVoucherSnap] = await Promise.all([
        customerRef.get(),
        deterministicVoucherRef.get(),
        db.collection('vouchers').where('ownerId', '==', phone).limit(1).get(),
    ]);

    const voucherDoc = deterministicVoucherSnap.exists
        ? deterministicVoucherSnap
        : legacyVoucherSnap.docs[0];
    const voucherData = voucherDoc?.data();
    const customerMissions = customerSnap.exists ? customerSnap.data()?.missions : null;
    const hasClaimed = customerMissions?.bounty_claimed === true || !!voucherData;

    if (!hasClaimed) {
        return { status: 'eligible' };
    }

    if (isVoucherUnused(voucherData)) {
        return {
            status: 'already_claimed_unused',
            code: String(voucherData?.code || customerMissions?.bountyVoucherCode || ''),
            message: 'Số điện thoại này đã nhận voucher. Bạn có thể dùng lại mã bên dưới.',
        };
    }

    return {
        status: 'already_claimed_used',
        message: 'Số điện thoại này đã nhận voucher trước đó. Chương trình chỉ áp dụng một lần cho mỗi số điện thoại.',
    };
}

function formatWaitTime(diff: number) {
    if (diff >= 3600_000) return `${Math.ceil(diff / 3600_000)} giờ`;
    if (diff >= 60_000) return `${Math.ceil(diff / 60_000)} phút`;
    return `${Math.ceil(diff / 1000)} giây`;
}

function getLimitDocId(identifier: string, type: 'ip' | 'phone') {
    return `${type}_${identifier.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function isOtpRateLimitDisabled() {
    return process.env.NODE_ENV !== 'production'
        || process.env.BYPASS_BOUNTY_OTP_RATE_LIMIT === 'true';
}

async function readProgressiveRateLimit(identifier: string, type: 'ip' | 'phone'): Promise<{ allowed: boolean; waitTimeStr?: string }> {
    if (isOtpRateLimitDisabled()) return { allowed: true };
    if (identifier === 'unknown') return { allowed: true };

    try {
        const db = getAdminDb();
        const docRef = db.collection('otp_progressive_limits').doc(getLimitDocId(identifier, type));
        const now = Date.now();
        const snap = await docRef.get();
        if (!snap.exists) return { allowed: true };

        const data = snap.data()!;
        if (data.source !== 'firebase_success') return { allowed: true };

        const nextAllowedAt = Number(data.nextAllowedAt) || 0;
        const resetAt = Number(data.resetAt) || 0;

        if (now > resetAt || now >= nextAllowedAt) return { allowed: true };

        return {
            allowed: false,
            waitTimeStr: formatWaitTime(nextAllowedAt - now),
        };
    } catch (error) {
        console.error('Lỗi khi đọc giới hạn OTP:', error);
        return { allowed: true };
    }
}

async function recordSuccessfulOtpSend(identifier: string, type: 'ip' | 'phone') {
    if (isOtpRateLimitDisabled()) return;
    if (identifier === 'unknown') return;

    try {
        const db = getAdminDb();
        const docRef = db.collection('otp_progressive_limits').doc(getLimitDocId(identifier, type));
        const now = Date.now();
        const resetPeriod = 12 * 60 * 60 * 1000;

        await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(docRef);
            if (!snap.exists) {
                transaction.set(docRef, {
                    source: 'firebase_success',
                    count: 1,
                    nextAllowedAt: now + 30_000,
                    resetAt: now + resetPeriod,
                    updatedAt: now,
                });
                return;
            }

            const data = snap.data()!;
            const resetAt = Number(data.resetAt) || 0;
            const currentCount = Number(data.count) || 0;
            const count = now > resetAt ? 1 : currentCount + 1;
            const waitMs = count === 1 ? 30_000 : count === 2 ? 5 * 60 * 1000 : 60 * 60 * 1000;

            transaction.set(docRef, {
                source: 'firebase_success',
                count,
                nextAllowedAt: now + waitMs,
                resetAt: now > resetAt ? now + resetPeriod : resetAt,
                updatedAt: now,
            }, { merge: true });
        });
    } catch (error) {
        console.error('Lỗi khi ghi nhận OTP đã gửi:', error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone, action = 'check' } = body;

        if (!phone || typeof phone !== 'string') {
            return NextResponse.json({ error: 'Thiếu số điện thoại.' }, { status: 400 });
        }

        if (action !== 'check' && action !== 'record') {
            return NextResponse.json({ error: 'Hành động OTP không hợp lệ.' }, { status: 400 });
        }

        const normalizedPhone = normalizeVietnamPhone(phone);
        if (!normalizedPhone) {
            return NextResponse.json({ error: 'Số điện thoại không hợp lệ.' }, { status: 400 });
        }

        const bountyStatus = await getBountyStatus(normalizedPhone.local);
        if (bountyStatus.status !== 'eligible') {
            return NextResponse.json({
                success: true,
                allowedToSendSms: false,
                ...bountyStatus,
            });
        }

        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (action === 'record') {
            await Promise.all([
                recordSuccessfulOtpSend(ip, 'ip'),
                recordSuccessfulOtpSend(normalizedPhone.local, 'phone'),
            ]);

            return NextResponse.json({
                success: true,
                recorded: true,
                phone: normalizedPhone.local,
            });
        }

        const ipCheck = await readProgressiveRateLimit(ip, 'ip');
        if (!ipCheck.allowed) {
            return NextResponse.json(
                { error: `Bạn thao tác quá nhanh. Vui lòng đợi thêm ${ipCheck.waitTimeStr} trước khi gửi lại.` },
                { status: 429 }
            );
        }

        const phoneCheck = await readProgressiveRateLimit(normalizedPhone.local, 'phone');
        if (!phoneCheck.allowed) {
            return NextResponse.json(
                { error: `Số điện thoại này đã được yêu cầu. Vui lòng đợi thêm ${phoneCheck.waitTimeStr} trước khi thử lại.` },
                { status: 429 }
            );
        }

        return NextResponse.json({
            success: true,
            allowedToSendSms: true,
            status: 'eligible',
            phone: normalizedPhone.local,
            e164: normalizedPhone.e164,
            message: 'Được phép gửi SMS',
        });
    } catch (error: unknown) {
        console.error('Lỗi API request-otp:', error);
        return NextResponse.json(
            { error: 'Hệ thống đang bận. Vui lòng thử lại sau.' },
            { status: 500 }
        );
    }
}
