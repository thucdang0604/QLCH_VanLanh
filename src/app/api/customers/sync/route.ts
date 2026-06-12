import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { isRateLimited } from '@/lib/rateLimit';
import { normalizeVietnamPhone } from '@/lib/phone';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
    try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
        if (await isRateLimited(ip, 'customer_sync', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
            return NextResponse.json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }, { status: 429 });
        }

        const body = await request.json().catch(() => ({}));
        const { name, phone, forceUpdateName } = body;

        if (!phone || typeof phone !== 'string') {
            return NextResponse.json({ error: 'Thiếu thông tin số điện thoại.' }, { status: 400 });
        }

        const normalizedPhone = normalizeVietnamPhone(phone);
        if (!normalizedPhone) {
            return NextResponse.json({ error: 'Số điện thoại không hợp lệ.' }, { status: 400 });
        }

        const customerName = typeof name === 'string' ? name.trim() : '';
        const db = getAdminDb();
        const customerRef = db.collection('customers').doc(normalizedPhone.local);

        await db.runTransaction(async (transaction) => {
            const customerSnap = await transaction.get(customerRef);

            if (!customerSnap.exists) {
                transaction.set(customerRef, {
                    phone: normalizedPhone.local,
                    name: customerName || 'Khách lẻ',
                    type: 'retail',
                    totalSpent: 0,
                    totalOrders: 0,
                    totalRepairs: 0,
                    totalAppointments: 0,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    lastVisit: FieldValue.serverTimestamp(),
                    tags: []
                });
            } else {
                const currentData = customerSnap.data()!;
                const updateData: Record<string, unknown> = {
                    updatedAt: FieldValue.serverTimestamp(),
                    lastVisit: FieldValue.serverTimestamp(),
                };

                // Chỉ cập nhật tên nếu:
                // 1. Tên mới hợp lệ
                // 2. VÀ (Có flag forceUpdateName từ Admin HOẶC tên cũ đang là Khách lẻ / rỗng)
                const isRealName = customerName && customerName !== 'Khách lẻ' && customerName !== currentData.name;
                const isCurrentNameEmptyOrGeneric = !currentData.name || currentData.name === 'Khách lẻ';

                if (isRealName && (forceUpdateName || isCurrentNameEmptyOrGeneric)) {
                    updateData.name = customerName;
                }

                transaction.update(customerRef, updateData);
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Customer Sync Error:', error);
        return NextResponse.json({ error: 'Lỗi hệ thống khi đồng bộ khách hàng.' }, { status: 500 });
    }
}
