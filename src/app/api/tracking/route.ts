import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { isRateLimited } from '@/lib/rateLimit';
import { normalizeVietnamPhone } from '@/lib/phone';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { normalizeWarrantySerial } from '@/lib/orderWarrantyLookup';
import { Timestamp, type Query } from 'firebase-admin/firestore';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const TRACKING_PAGE_SIZE = 10;
type TrackingResource = 'appointments' | 'repairs' | 'orders';
type CursorPayload = { createdAtMs: number; id: string };
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

function decodeCursor(value: unknown): CursorPayload | null {
    if (typeof value !== 'string' || !value) return null;
    try {
        const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as CursorPayload;
        return Number.isFinite(parsed.createdAtMs) && typeof parsed.id === 'string' && parsed.id ? parsed : null;
    } catch {
        return null;
    }
}

function encodeCursor(doc: { id: string; data: () => Record<string, unknown> }): string | null {
    const createdAt = formatTimestamp(doc.data().createdAt);
    if (!createdAt) return null;
    return Buffer.from(JSON.stringify({ createdAtMs: createdAt.seconds * 1000, id: doc.id })).toString('base64url');
}

async function fetchPage(query: Query, cursor: CursorPayload | null) {
    const pagedQuery = cursor
        ? query.startAfter(Timestamp.fromMillis(cursor.createdAtMs))
        : query;
    const docs = (await pagedQuery.limit(TRACKING_PAGE_SIZE + 1).get()).docs;
    const pageDocs = docs.slice(0, TRACKING_PAGE_SIZE);
    return {
        docs: pageDocs,
        nextCursor: docs.length > TRACKING_PAGE_SIZE && pageDocs.length > 0
            ? encodeCursor(pageDocs[pageDocs.length - 1]!)
            : null,
    };
}

function serializeOrder(doc: { id: string; data: () => Record<string, unknown> }) {
    const data = doc.data();
    const repairShipping = data.repairShipping as Record<string, unknown> | undefined;
    return {
        id: doc.id,
        status: data.status,
        createdAt: formatTimestamp(data.createdAt),
        completedAt: formatTimestamp(data.completedAt),
        customer_info: {
            name: maskName(String((data.customer_info as Record<string, unknown> | undefined)?.name || '')),
            phone: maskPhone(String((data.customer_info as Record<string, unknown> | undefined)?.phone || '')),
            note: (data.customer_info as Record<string, unknown> | undefined)?.note,
        },
        items: Array.isArray(data.items) ? data.items.map((item: Record<string, unknown>) => ({
            name: item.name,
            productName: item.productName,
            image: item.image,
            quantity: item.quantity,
            price: item.price,
            color: item.color,
            storage: item.storage,
            warrantyType: item.warrantyType,
            warrantyMonths: Number(item.warrantyMonths || 0),
            warrantyStartedAt: formatTimestamp(item.warrantyStartedAt),
            warrantyExpiresAt: formatTimestamp(item.warrantyExpiresAt),
        })) : [],
        shipping_fee: Number(data.shipping_fee ?? data.shippingFee ?? repairShipping?.customerCharge ?? 0),
        total_amount: Number(data.total_amount || 0),
    };
}

function serializeOrderSummary(doc: { id: string; data: () => Record<string, unknown> }) {
    const data = doc.data();
    return {
        id: doc.id,
        status: data.status,
        createdAt: formatTimestamp(data.createdAt),
        completedAt: formatTimestamp(data.completedAt),
        total_amount: Number(data.total_amount || 0),
    };
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
        const { phone, serial, resource, cursor, orderId } = body;

        if ((!phone || typeof phone !== 'string') && (!serial || typeof serial !== 'string')) {
            return context.json({ error: 'Nhap so dien thoai hoac IMEI/Serial de tra cuu.' }, { status: 400 });
        }

        const normalizedPhone = typeof phone === 'string' ? normalizeVietnamPhone(phone) : null;
        if (phone && !normalizedPhone) {
            return context.json({ error: 'So dien thoai khong hop le.' }, { status: 400 });
        }
        const requestedSerial = normalizeWarrantySerial(serial);
        if (serial && requestedSerial.length < 4) {
            return context.json({ error: 'IMEI/Serial khong hop le.' }, { status: 400 });
        }

        const cleanPhone = normalizedPhone?.local || '';
        const db = getAdminDb();

        if (requestedSerial) {
            const serialDocs = (await db.collection('orders')
                .where('warrantySerials', 'array-contains', requestedSerial)
                .limit(1)
                .get()).docs;
            const orderData = serialDocs[0]?.data();
            const warrantyItem = Array.isArray(orderData?.items)
                ? orderData.items.find((item: Record<string, unknown>) => Array.isArray(item.imeis)
                    && item.imeis.some((imei: unknown) => normalizeWarrantySerial(imei) === requestedSerial)) as Record<string, unknown> | undefined
                : undefined;
            const warrantyExpiresAt = formatTimestamp(warrantyItem?.warrantyExpiresAt);
            const expiresAtMs = warrantyExpiresAt ? warrantyExpiresAt.seconds * 1000 : 0;

            return context.json({
                success: true,
                lookupMode: 'serial',
                warranty: warrantyItem && warrantyExpiresAt ? {
                    productName: String(warrantyItem.productName || warrantyItem.name || 'Sản phẩm'),
                    image: warrantyItem.image || '',
                    warrantyType: warrantyItem.warrantyType || 'none',
                    warrantyMonths: Number(warrantyItem.warrantyMonths || 0),
                    warrantyStartedAt: formatTimestamp(warrantyItem.warrantyStartedAt),
                    warrantyExpiresAt,
                    status: expiresAtMs >= Date.now() ? 'active' : 'expired',
                    remainingDays: Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 86_400_000)),
                } : null,
            });
        }

        if (typeof orderId === 'string' && orderId) {
            const orderDoc = await db.collection('orders').doc(orderId).get();
            const orderPhone = String((orderDoc.data()?.customer_info as Record<string, unknown> | undefined)?.phone || '');
            if (!orderDoc.exists || orderPhone !== cleanPhone) {
                return context.json({ error: 'Không tìm thấy đơn hàng.' }, { status: 404 });
            }
            return context.json({
                success: true,
                lookupMode: 'phone',
                order: serializeOrder({ id: orderDoc.id, data: () => orderDoc.data() as Record<string, unknown> }),
            });
        }

        const requestedResource: TrackingResource | null = ['appointments', 'repairs', 'orders'].includes(resource)
            ? resource as TrackingResource
            : null;
        const pageCursor = decodeCursor(cursor);

        const appointmentPage = !requestedResource || requestedResource === 'appointments'
            ? await fetchPage(db.collection('appointments').where('phone', '==', cleanPhone).orderBy('createdAt', 'desc'), pageCursor)
            : { docs: [], nextCursor: null };
        const appointments = appointmentPage.docs.map(doc => {
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

        const repairPage = !requestedResource || requestedResource === 'repairs'
            ? await fetchPage(db.collection('repairs')
                .where('customer.phone', '==', cleanPhone)
                .orderBy('createdAt', 'desc'), pageCursor)
            : { docs: [], nextCursor: null };
        const repairs = repairPage.docs.map(doc => {
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

        // Serial lookup deliberately has no orderBy: it avoids a composite Firestore index.
        // The small result set is sorted after serialization instead.
        const orderPage = !requestedResource || requestedResource === 'orders'
            ? await fetchPage(db.collection('orders')
                .where('customer_info.phone', '==', cleanPhone)
                .orderBy('createdAt', 'desc'), pageCursor)
            : { docs: [], nextCursor: null };
        const orders = orderPage.docs
            .map(serializeOrderSummary)
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        return context.json({
            success: true,
            appointments,
            repairs,
            orders,
            lookupMode: 'phone',
            pageInfo: {
                appointments: { nextCursor: appointmentPage.nextCursor },
                repairs: { nextCursor: repairPage.nextCursor },
                orders: { nextCursor: orderPage.nextCursor },
            },
        });
});
