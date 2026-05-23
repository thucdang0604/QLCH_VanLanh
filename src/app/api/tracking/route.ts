import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';

// Simple function to format timestamps to match Firestore client library expected structure or raw serialized structure
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
        if (!isNaN(d.getTime())) {
            return { seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 };
        }
    }
    return null;
}

function maskPhone(p: string): string {
    if (!p) return '';
    const clean = p.trim().replace(/\s+/g, '');
    if (clean.length <= 4) return '***';
    return clean.substring(0, 3) + '***' + clean.substring(clean.length - 3);
}

function maskName(name: string): string {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0]!.substring(0, 1) + '***';
    return parts[0] + ' ' + parts.slice(1).map(p => p[0] + '***').join(' ');
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { phone } = body;

        if (!phone || typeof phone !== 'string') {
            return NextResponse.json({ error: 'Số điện thoại không hợp lệ.' }, { status: 400 });
        }

        const cleanPhone = phone.trim().replace(/\s+/g, '');
        const db = getAdminDb();

        // 1. Query Appointments
        const appointmentsRef = db.collection('appointments');
        const appointmentsSnap = await appointmentsRef.where('phone', '==', cleanPhone).get();
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

        // 2. Query Repairs
        const repairsRef = db.collection('repairs');
        const repairsSnap = await repairsRef.where('customer.phone', '==', cleanPhone).get();
        const repairs = repairsSnap.docs.map(doc => {
            const data = doc.data();
            // Deep copy to mutate without side effects
            const cleanDeviceInfo = data.deviceInfo ? { ...data.deviceInfo } : {};
            // Completely strip passcode & imei to avoid PII leak
            delete cleanDeviceInfo.passcode;
            delete cleanDeviceInfo.imei;

            return {
                id: doc.id,
                ticketType: data.ticketType || 'repair',
                status: data.status,
                deliveryNote: data.deliveryNote || '',
                postRepairMedia: data.postRepairMedia || [],
                customer: {
                    name: maskName(data.customer?.name),
                    phone: maskPhone(data.customer?.phone),
                },
                deviceInfo: cleanDeviceInfo,
                issue: data.issue || {},
                payment: data.payment || {},
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

        // 3. Query Orders
        const ordersRef = db.collection('orders');
        const ordersSnap = await ordersRef.where('customer_info.phone', '==', cleanPhone).get();
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
                items: data.items || [],
                shipping_fee: data.shipping_fee || 0,
                total_amount: data.total_amount || 0,
            };
        });

        return NextResponse.json({
            success: true,
            appointments,
            repairs,
            orders,
        });

    } catch (error: unknown) {
        console.error('Tracking API error:', error);
        return NextResponse.json({ error: 'Lỗi hệ thống. Vui lòng thử lại sau.' }, { status: 500 });
    }
}
