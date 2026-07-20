import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { isRateLimited } from '@/lib/rateLimit';
import { normalizeVietnamPhone } from '@/lib/phone';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const TRACKING_RESULT_LIMIT = 10;

function formatTimestamp(val: unknown): { seconds: number; nanoseconds: number } | null {
    if (!val) return null;
    const obj = val as Record<string, unknown>;
    if (typeof obj.toDate === 'function') {
        const d = (obj.toDate as () => Date)();
        return { seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 };
    }
    if (obj._seconds !== undefined) {
        return { seconds: Number(obj._seconds), nanoseconds: Number(obj._nanoseconds) || 0 };
    }
    if (val instanceof Date) {
        return { seconds: Math.floor(val.getTime() / 1000), nanoseconds: 0 };
    }
    if (typeof val === 'number') {
        return { seconds: Math.floor(val / 1000), nanoseconds: 0 };
    }
    if (typeof val === 'string') {
        const d = new Date(val);
        if (!Number.isNaN(d.getTime())) {
            return { seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 };
        }
    }
    return null;
}

function maskPhone(p: string): string {
    if (!p) return '';
    const clean = p.trim().replace(/\s+/g, '');
    if (clean.length <= 4) return '***';
    return `${clean.substring(0, 3)}***${clean.substring(clean.length - 3)}`;
}

function maskName(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return `${parts[0]!.substring(0, 1)}***`;
    return `${parts[0]} ${parts.slice(1).map(p => `${p[0]}***`).join(' ')}`;
}

function clientIp(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || 'unknown';
}

export const POST = withApi({
    name: 'tracking',
    onError: (error, context) => {
        const status = getApiErrorStatus(error);
        return context.error(status < 500 ? getApiErrorMessage(error) : 'Loi he thong. Vui long thu lai sau.', status);
    },
}, async (request: NextRequest, context) => {
        const ip = clientIp(request);
        if (await isRateLimited(ip, 'tracking', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
            return context.json(
                { error: 'Ban dang tra cuu qua nhieu lan. Vui long thu lai sau.' },
                { status: 429 }
            );
        }

        const body = await context.readJson(request);
        const { phone } = body;

        if (!phone || typeof phone !== 'string') {
            return context.json({ error: 'So dien thoai khong hop le.' }, { status: 400 });
        }

        const normalizedPhone = normalizeVietnamPhone(phone);
        if (!normalizedPhone) {
            return context.json({ error: 'So dien thoai khong hop le.' }, { status: 400 });
        }

        const cleanPhone = normalizedPhone.local;
        const db = getAdminDb();

        const appointmentsSnap = await db.collection('appointments')
            .where('phone', '==', cleanPhone)
            .limit(TRACKING_RESULT_LIMIT)
            .get();
        const appointments = appointmentsSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                fullName: maskName(data.fullName),
                phone: maskPhone(data.phone),
                date: data.date,
                timeSlot: data.timeSlot,
                store: data.store,
                status: data.status,
                createdAt: formatTimestamp(data.createdAt),
            };
        });

        const repairsSnap = await db.collection('repairs')
            .where('customer.phone', '==', cleanPhone)
            .orderBy('createdAt', 'desc')
            .limit(TRACKING_RESULT_LIMIT)
            .get();
        const repairs = repairsSnap.docs.map(doc => {
            const data = doc.data();
            const cleanDeviceInfo = data.deviceInfo ? { ...data.deviceInfo } : {};
            delete cleanDeviceInfo.passcode;
            delete cleanDeviceInfo.imei;

            return {
                id: doc.id,
                ticketType: data.ticketType || 'repair',
                status: data.status,
                deliveryNote: data.deliveryNote || '',
                postRepairMedia: Array.isArray(data.postRepairMedia) ? data.postRepairMedia : [],
                customer: {
                    name: maskName(data.customer?.name),
                    phone: maskPhone(data.customer?.phone),
                },
                deviceInfo: cleanDeviceInfo,
                issue: {
                    description: data.issue?.description || data.issue?.summary || '',
                    status: data.issue?.status || '',
                },
                payment: {
                    status: data.payment?.status || '',
                    totalAmount: Number(data.payment?.totalAmount || 0),
                    paidAmount: Number(data.payment?.paidAmount || 0),
                },
                parts: ((data.parts as Record<string, unknown>[]) || []).map((part) => ({
                    productId: part.productId as string | undefined,
                    productName: part.productName as string | undefined,
                    name: part.name as string | undefined,
                    partName: part.partName as string | undefined,
                    quality: part.quality as string | undefined,
                    quantity: part.quantity as number | undefined,
                    partType: part.partType as string | undefined,
                    status: part.status as string | undefined,
                    warrantyMonths: part.warrantyMonths as number | undefined,
                    warrantyExpiresAt: formatTimestamp(part.warrantyExpiresAt),
                })),
                timing: {
                    receivedAt: formatTimestamp(data.timing?.receivedAt),
                },
                createdAt: formatTimestamp(data.createdAt),
            };
        });

        const ordersSnap = await db.collection('orders')
            .where('customer_info.phone', '==', cleanPhone)
            .orderBy('createdAt', 'desc')
            .limit(TRACKING_RESULT_LIMIT)
            .get();
        const orders = ordersSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                status: data.status,
                createdAt: formatTimestamp(data.createdAt),
                customer_info: {
                    name: maskName(data.customer_info?.name),
                    phone: maskPhone(data.customer_info?.phone),
                    note: data.customer_info?.note,
                },
                items: Array.isArray(data.items) ? data.items.map((item: Record<string, unknown>) => ({
                    name: item.name,
                    productName: item.productName,
                    quantity: item.quantity,
                    price: item.price,
                })) : [],
                shipping_fee: Number(data.shipping_fee || 0),
                total_amount: Number(data.total_amount || 0),
            };
        });

        return context.json({
            success: true,
            appointments,
            repairs,
            orders,
        });
});
