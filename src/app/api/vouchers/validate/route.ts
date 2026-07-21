import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { normalizeVietnamPhone } from '@/lib/phone';
import { getUniqueActiveVoucherByCode } from '@/lib/voucherServer';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

export const POST = withApi({
    name: 'vouchers/validate',
    onError: (error, context) => {
        const status = getApiErrorStatus(error);
        const message = error instanceof Error && error.message.includes('duplicated')
            ? 'Mã Voucher đang bị trùng dữ liệu. Vui lòng tắt hoặc gộp mã trùng trước khi sử dụng.'
            : status < 500 ? getApiErrorMessage(error) : 'Lỗi hệ thống.';
        return context.json({ valid: false, error: message }, { status });
    },
}, async (request: NextRequest, context) => {
        const { code, subtotal, phone } = await context.readJson(request);

        if (!code || typeof code !== 'string') {
            return context.json({ valid: false, error: 'Vui lòng nhập mã Voucher.' }, { status: 400 });
        }

        const db = getAdminDb();
        const doc = await getUniqueActiveVoucherByCode(db, code);

        if (!doc) {
            return context.json({ valid: false, error: 'Mã Voucher không tồn tại hoặc đã bị vô hiệu.' });
        }

        const v = doc.data();

        if (v.expiryDate) {
            const expiry = v.expiryDate.toDate ? v.expiryDate.toDate() : new Date(v.expiryDate);
            if (expiry.getTime() < Date.now()) {
                return context.json({ valid: false, error: 'Mã Voucher đã hết hạn.' });
            }
        }

        if (v.usageLimit > 0 && v.usedCount >= v.usageLimit) {
            return context.json({ valid: false, error: 'Mã Voucher đã hết lượt sử dụng.' });
        }

        const orderSubtotal = Number(subtotal) || 0;
        if (v.minOrderValue && orderSubtotal < v.minOrderValue) {
            return context.json({
                valid: false,
                error: `Đơn hàng tối thiểu ${v.minOrderValue.toLocaleString('vi-VN')}đ để sử dụng mã này.`,
            });
        }

        if (v.ownerId) {
            const normalizedPhone = typeof phone === 'string' ? normalizeVietnamPhone(phone) : null;
            const normalizedOwnerId = normalizeVietnamPhone(String(v.ownerId));
            if (!normalizedPhone || !normalizedOwnerId || normalizedPhone.local !== normalizedOwnerId.local) {
                return context.json({
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

        return context.json({
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
});
