import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { isRateLimited } from '@/lib/rateLimit';
import { normalizeVietnamPhone } from '@/lib/phone';

const RATE_LIMIT_MAX = 2; // Chỉ gọi 2 lần/phút
const RATE_LIMIT_WINDOW_MS = 60_000;

function generateBountyCode(phone: string) {
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const phoneSuffix = phone.slice(-4);
    return `VDV${phoneSuffix}${randomStr}`;
}

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

export async function POST(request: NextRequest) {
    try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
        if (await isRateLimited(ip, 'bounty_claim', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
            return NextResponse.json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }, { status: 429 });
        }

        const body = await request.json().catch(() => ({}));
        const name = typeof body.name === 'string' ? body.name.trim() : '';

        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Thiếu xác thực. Yêu cầu đăng nhập OTP.' }, { status: 401 });
        }
        const idToken = authHeader.split('Bearer ')[1];

        let decodedToken;
        try {
            const { getAdminAuth } = await import('@/lib/firebaseAdmin');
            decodedToken = await getAdminAuth().verifyIdToken(idToken);
        } catch (err) {
            console.error('Lỗi xác thực token:', err);
            return NextResponse.json({ error: 'Token không hợp lệ hoặc đã hết hạn.' }, { status: 401 });
        }

        const phone = decodedToken.phone_number;

        if (!phone) {
            return NextResponse.json({ error: 'Thiếu thông tin số điện thoại từ token.' }, { status: 400 });
        }

        const normalizedPhone = normalizeVietnamPhone(phone);
        if (!normalizedPhone) {
            return NextResponse.json({ error: 'Số điện thoại không hợp lệ.' }, { status: 400 });
        }

        const db = getAdminDb();
        const customerRef = db.collection('customers').doc(normalizedPhone.local);
        const deterministicVoucherRef = db.collection('vouchers').doc(`bounty_${normalizedPhone.local}`);
        const legacyVoucherQuery = await db.collection('vouchers')
            .where('ownerId', '==', normalizedPhone.local)
            .limit(1)
            .get();
        const legacyVoucherRef = legacyVoucherQuery.docs[0]?.ref;

        // Chạy Transaction để đảm bảo mỗi SĐT chỉ nhận 1 mã
        const result = await db.runTransaction(async (transaction) => {
            const customerSnap = await transaction.get(customerRef);
            const deterministicVoucherSnap = await transaction.get(deterministicVoucherRef);
            const legacyVoucherSnap = legacyVoucherRef && legacyVoucherRef.path !== deterministicVoucherRef.path
                ? await transaction.get(legacyVoucherRef)
                : null;

            // Đọc mức giảm giá từ config
            const configSnap = await transaction.get(db.collection('system_config').doc('site_config'));
            const configData = configSnap.exists ? configSnap.data() : {};
            const rewardType = (configData?.bountyRewardType as string) || 'fixed';
            const rewardValue = (configData?.bountyRewardValue as number) || 50000;
            const rewardMaxDiscount = (configData?.bountyRewardMaxDiscount as number) || undefined;
            const customerData = customerSnap.exists ? (customerSnap.data() || {}) : {};
            const currentMissions = customerData.missions || {};
            const existingVoucherSnap = deterministicVoucherSnap.exists
                ? deterministicVoucherSnap
                : legacyVoucherSnap?.exists
                    ? legacyVoucherSnap
                    : null;
            const existingVoucher = existingVoucherSnap?.data();
            const hasClaimed = currentMissions.bounty_claimed === true || !!existingVoucher;

            if (hasClaimed) {
                const existingCode = String(existingVoucher?.code || currentMissions.bountyVoucherCode || '');
                if (customerSnap.exists) {
                    transaction.update(customerRef, {
                        updatedAt: FieldValue.serverTimestamp(),
                        lastVisit: FieldValue.serverTimestamp(),
                        ...(name && (!customerData.name || customerData.name === 'Khách lẻ') ? { name } : {}),
                        'missions.bounty_claimed': true,
                        ...(existingCode ? { 'missions.bountyVoucherCode': existingCode } : {}),
                        ...(existingVoucherSnap ? { 'missions.bountyVoucherId': existingVoucherSnap.id } : {}),
                    });
                }

                if (isVoucherUnused(existingVoucher)) {
                    return {
                        status: 'already_claimed_unused' as const,
                        code: existingCode,
                        message: 'Số điện thoại này đã nhận voucher. Bạn có thể dùng lại mã bên dưới.',
                    };
                }

                return {
                    status: 'already_claimed_used' as const,
                    code: existingCode,
                    message: 'Số điện thoại này đã nhận voucher trước đó. Chương trình chỉ áp dụng một lần cho mỗi số điện thoại.',
                };
            }

            // Tạo Voucher mới
            const newCode = generateBountyCode(normalizedPhone.local);

            const newVoucher: Record<string, unknown> = {
                code: newCode,
                type: rewardType === 'percentage' ? 'percentage' : 'fixed',
                value: rewardValue,
                ...(rewardType === 'percentage' && rewardMaxDiscount ? { maxDiscount: rewardMaxDiscount } : {}),
                usageLimit: 1,
                usedCount: 0,
                isActive: true,
                ownerId: normalizedPhone.local,
                stackingRules: {
                    isExclusive: false,
                    stackWithPromo: true,
                    stackWithTier: false
                },
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            };

            transaction.set(deterministicVoucherRef, newVoucher);

            // Ghi nhận Customer đã nhận (Upsert)
            if (!customerSnap.exists) {
                transaction.set(customerRef, {
                    phone: normalizedPhone.local,
                    name: name || 'Khách lẻ',
                    address: '',
                    totalSpent: 0,
                    totalOrders: 0,
                    totalRepairs: 0,
                    totalAppointments: 0,
                    lastVisit: FieldValue.serverTimestamp(),
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    tags: ['bounty_otp'],
                    missions: {
                        bounty_claimed: true,
                        bountyVoucherCode: newCode,
                        bountyVoucherId: deterministicVoucherRef.id,
                        claimedAt: FieldValue.serverTimestamp(),
                    }
                });
            } else {
                transaction.update(customerRef, {
                    updatedAt: FieldValue.serverTimestamp(),
                    lastVisit: FieldValue.serverTimestamp(),
                    ...(name && (!customerData.name || customerData.name === 'Khách lẻ') ? { name } : {}),
                    tags: FieldValue.arrayUnion('bounty_otp'),
                    'missions.bounty_claimed': true,
                    'missions.bountyVoucherCode': newCode,
                    'missions.bountyVoucherId': deterministicVoucherRef.id,
                    'missions.claimedAt': FieldValue.serverTimestamp(),
                });
            }

            return {
                status: 'created' as const,
                code: newCode,
                message: 'Tạo voucher thành công.',
            };
        });

        return NextResponse.json(
            result,
            { status: result.status === 'already_claimed_used' ? 409 : 200 }
        );
    } catch (error: unknown) {
        console.error('Bounty claim error:', error);
        return NextResponse.json(
            { error: 'Hệ thống đang bận. Vui lòng thử lại sau.' },
            { status: 500 }
        );
    }
}
