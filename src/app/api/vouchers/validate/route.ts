import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { normalizeVietnamPhone } from '@/lib/phone';
import { getUniqueActiveVoucherByCode } from '@/lib/voucherServer';

export async function POST(request: NextRequest) {
    try {
        const { code, subtotal, phone } = await request.json();

        if (!code || typeof code !== 'string') {
            return NextResponse.json({ valid: false, error: 'Vui lòng nhập mã Voucher.' }, { status: 400 });
        }

        const db = getAdminDb();
        const doc = await getUniqueActiveVoucherByCode(db, code);

        if (!doc) {
            return NextResponse.json({ valid: false, error: 'Mã Voucher không tồn tại hoặc đã bị vô hiệu.' });
        }

        const v = doc.data();

        if (v.expiryDate) {
            const expiry = v.expiryDate.toDate ? v.expiryDate.toDate() : new Date(v.expiryDate);
            if (expiry.getTime() < Date.now()) {
                return NextResponse.json({ valid: false, error: 'Mã Voucher đã hết hạn.' });
            }
        }

        if (v.usageLimit > 0 && v.usedCount >= v.usageLimit) {
            return NextResponse.json({ valid: false, error: 'Mã Voucher đã hết lượt sử dụng.' });
        }

        const orderSubtotal = Number(subtotal) || 0;
        if (v.minOrderValue && orderSubtotal < v.minOrderValue) {
            return NextResponse.json({
                valid: false,
                error: `Đơn hàng tối thiểu ${v.minOrderValue.toLocaleString('vi-VN')}đ để sử dụng mã này.`,
            });
        }

        if (v.ownerId) {
            const normalizedPhone = typeof phone === 'string' ? normalizeVietnamPhone(phone) : null;
            const normalizedOwnerId = normalizeVietnamPhone(String(v.ownerId));
            if (!normalizedPhone || !normalizedOwnerId || normalizedPhone.local !== normalizedOwnerId.local) {
                return NextResponse.json({
                    valid: false,
                    error: 'Voucher này là phần thưởng cá nhân. Vui lòng nhập đúng số điện thoại đã làm nhiệm vụ.',
                });
            }
        }

        let discountPreview = 0;
        if (v.type === 'fixed') {
            discountPreview = Math.min(v.value, orderSubtotal);
        } else {
            discountPreview = Math.round(orderSubtotal * v.value / 100);
            if (v.maxDiscount && discountPreview > v.maxDiscount) {
                discountPreview = v.maxDiscount;
            }
        }

        return NextResponse.json({
            valid: true,
            code: v.code,
            type: v.type,
            value: v.value,
            maxDiscount: v.maxDiscount || null,
            minOrderValue: v.minOrderValue || null,
            discountPreview,
            stackingRules: v.stackingRules || { isExclusive: false, stackWithPromo: true, stackWithTier: false },
            isPersonal: !!v.ownerId,
        });
    } catch (error) {
        console.error('Voucher validate error:', error);
        const message = error instanceof Error && error.message.includes('duplicated')
            ? 'Mã Voucher đang bị trùng dữ liệu. Vui lòng tắt hoặc gộp mã trùng trước khi sử dụng.'
            : 'Lỗi hệ thống.';
        return NextResponse.json({ valid: false, error: message }, { status: 500 });
    }
}
