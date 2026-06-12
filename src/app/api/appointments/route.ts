import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { isRateLimited } from '@/lib/rateLimit';
import { normalizeVietnamPhone } from '@/lib/phone';

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
    try {
        // ── 1. Rate Limiting ──
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (await isRateLimited(ip, 'appointments', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
            return NextResponse.json(
                { error: 'Bạn đang gửi quá nhiều yêu cầu. Vui lòng thử lại sau.' },
                { status: 429 }
            );
        }

        const body = await request.json();

        // ── 2. Honeypot Check ──
        if (body.website) {
            return NextResponse.json(
                { error: 'Invalid request' },
                { status: 400 }
            );
        }

        const { fullName, phone, date, timeSlot, store, serviceName, serviceId } = body;

        // ── 3. Validate required fields ──
        if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
            return NextResponse.json(
                { error: 'Vui lòng nhập họ tên (ít nhất 2 ký tự).' },
                { status: 400 }
            );
        }

        if (!phone || typeof phone !== 'string') {
            return NextResponse.json(
                { error: 'Vui lòng nhập số điện thoại.' },
                { status: 400 }
            );
        }

        // Validate phone format (Vietnamese: 0xxxxxxxxx, 10-11 digits)
        if (!/^0\d{9,10}$/.test(phone.trim())) {
            return NextResponse.json(
                { error: 'Số điện thoại không hợp lệ (VD: 0901234567).' },
                { status: 400 }
            );
        }

        if (!date || typeof date !== 'string') {
            return NextResponse.json(
                { error: 'Vui lòng chọn ngày.' },
                { status: 400 }
            );
        }

        if (!timeSlot || !['morning', 'afternoon', 'evening'].includes(timeSlot)) {
            return NextResponse.json(
                { error: 'Vui lòng chọn buổi hẹn.' },
                { status: 400 }
            );
        }

        // ── 4. Create appointment ──
        const appointment = {
            fullName: fullName.trim(),
            phone: phone.trim(),
            date,
            timeSlot,
            store: (store || '').trim(),
            serviceName: (serviceName || '').trim(),
            serviceId: (serviceId || '').trim(),
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
        };

        const db = getAdminDb();
        const docRef = await db.collection('appointments').add(appointment);

        // --- Customer Sync ---
        const normalizedPhone = normalizeVietnamPhone(phone);
        if (normalizedPhone) {
            const customerRef = db.collection('customers').doc(normalizedPhone.local);
            await db.runTransaction(async (transaction) => {
                const customerSnap = await transaction.get(customerRef);

                if (!customerSnap.exists) {
                    transaction.set(customerRef, {
                        phone: normalizedPhone.local,
                        name: appointment.fullName || 'Khách lẻ',
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
                    if (appointment.fullName && appointment.fullName !== 'Khách lẻ' && appointment.fullName !== currentData.name) {
                        updateData.name = appointment.fullName;
                    }
                    transaction.update(customerRef, updateData);
                }
            }).catch(err => console.error('Failed to sync customer from appointment', err));
        }

        return NextResponse.json({
            success: true,
            appointmentId: docRef.id,
            message: 'Đặt lịch thành công!',
        });
    } catch (error) {
        console.error('Appointment API error:', error);
        return NextResponse.json(
            { error: 'Lỗi hệ thống. Vui lòng thử lại sau.' },
            { status: 500 }
        );
    }
}
