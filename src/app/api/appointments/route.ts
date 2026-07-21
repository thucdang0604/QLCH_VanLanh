import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { isRateLimited } from '@/lib/rateLimit';
import { normalizeVietnamPhone } from '@/lib/phone';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60_000;
type AppointmentRequestBody = {
    website?: string;
    fullName?: string;
    phone?: string;
    date?: string;
    timeSlot?: string;
    store?: string;
    serviceName?: string;
    serviceId?: string;
};

function stripHtml(value: string): string {
    return value.replace(/<[^>]*>/g, '').trim();
}

function canPublicSetCustomerName(currentName: unknown, nextName: string): boolean {
    return Boolean(nextName && nextName !== 'Khách lẻ' && (!currentName || currentName === 'Khách lẻ'));
}

export const POST = withApi({
    name: 'appointments',
    onError: (error, context) => {
        const status = getApiErrorStatus(error);
        return context.error(status < 500 ? getApiErrorMessage(error) : 'Lỗi hệ thống. Vui lòng thử lại sau.', status);
    },
}, async (request: NextRequest, context) => {
        // ── 1. Rate Limiting ──
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (await isRateLimited(ip, 'appointments', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
            return context.json(
                { error: 'Bạn đang gửi quá nhiều yêu cầu. Vui lòng thử lại sau.' },
                { status: 429 }
            );
        }

        const body = await context.readJson<AppointmentRequestBody>(request);

        // ── 2. Honeypot Check ──
        if (body.website) {
            return context.json(
                { error: 'Invalid request' },
                { status: 400 }
            );
        }

        const { fullName, phone, date, timeSlot, store, serviceName, serviceId } = body;
        const safeFullName = typeof fullName === 'string' ? stripHtml(fullName).slice(0, 100) : '';

        // ── 3. Validate required fields ──
        if (safeFullName.length < 2) {
            return context.json(
                { error: 'Vui lòng nhập họ tên (ít nhất 2 ký tự).' },
                { status: 400 }
            );
        }

        if (!phone || typeof phone !== 'string') {
            return context.json(
                { error: 'Vui lòng nhập số điện thoại.' },
                { status: 400 }
            );
        }

        // Validate and normalize Vietnamese phone format.
        const normalizedPhone = normalizeVietnamPhone(phone);
        if (!normalizedPhone) {
            return context.json(
                { error: 'Số điện thoại không hợp lệ (VD: 0901234567).' },
                { status: 400 }
            );
        }

        if (!date || typeof date !== 'string') {
            return context.json(
                { error: 'Vui lòng chọn ngày.' },
                { status: 400 }
            );
        }

        if (!timeSlot || !['morning', 'afternoon', 'evening'].includes(timeSlot)) {
            return context.json(
                { error: 'Vui lòng chọn buổi hẹn.' },
                { status: 400 }
            );
        }

        // ── 4. Create appointment ──
        const appointment = {
            fullName: safeFullName,
            phone: normalizedPhone.local,
            date,
            timeSlot,
            store: (store || '').trim(),
            serviceName: (serviceName || '').trim(),
            serviceId: (serviceId || '').trim(),
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        };

        const db = getAdminDb();
        let appointmentId = '';
        await db.runTransaction(async (transaction) => {
            const appointmentAllocation = await reserveSequentialDocumentId(transaction, db, {
                collectionName: 'appointments',
                prefix: 'DL',
            });
            const customerRef = db.collection('customers').doc(normalizedPhone.local);
            const customerSnap = await transaction.get(customerRef);

            appointmentAllocation.commitCounter();
            transaction.set(appointmentAllocation.ref, { ...appointment });
            appointmentId = appointmentAllocation.id;

            if (!customerSnap.exists) {
                transaction.set(customerRef, {
                    phone: normalizedPhone.local,
                    name: appointment.fullName || 'Khách lẻ',
                    type: 'retail',
                    totalSpent: 0,
                    totalOrders: 0,
                    totalRepairs: 0,
                    totalAppointments: 1,
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
                    totalAppointments: FieldValue.increment(1),
                };
                if (!canPublicSetCustomerName(currentData.name, appointment.fullName)) {
                    appointment.fullName = '';
                }
                if (appointment.fullName && appointment.fullName !== 'Khách lẻ' && appointment.fullName !== currentData.name) {
                    updateData.name = appointment.fullName;
                }
                transaction.update(customerRef, updateData);
            }
        });

        return context.json({
            success: true,
            appointmentId,
            message: 'Đặt lịch thành công!',
        });
});
