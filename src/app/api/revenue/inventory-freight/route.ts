import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';

function parseDateParam(value: string | null) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value: unknown) {
    const timestamp = value as { toDate?: () => Date } | undefined;
    const date = typeof timestamp?.toDate === 'function' ? timestamp.toDate() : null;
    return date ? date.toISOString() : null;
}

export const GET = withApi({
    name: 'revenue/inventory-freight.get',
    onError: (error, context) => context.error(
        error instanceof Error ? error.message : 'Không thể tải phí ship nhập hàng.',
        getApiErrorStatus(error, 500),
    ),
}, async (request: NextRequest, context) => {
    await requirePermission(request, 'view_revenue');
    const from = parseDateParam(request.nextUrl.searchParams.get('from'));
    const to = parseDateParam(request.nextUrl.searchParams.get('to'));
    const rawLimit = Number(request.nextUrl.searchParams.get('limit'));
    const resultLimit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 200;
    const db = getAdminDb();

    let freightQuery: FirebaseFirestore.Query = db.collection('inventory_freight_expenses');
    if (from) freightQuery = freightQuery.where('createdAt', '>=', Timestamp.fromDate(from));
    if (to) freightQuery = freightQuery.where('createdAt', '<=', Timestamp.fromDate(to));
    const snapshot = await freightQuery.orderBy('createdAt', 'desc').limit(resultLimit).get();

    return context.json({
        expenses: snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                importReceiptId: String(data.importReceiptId || ''),
                amount: Number(data.amount) || 0,
                paymentMethod: String(data.paymentMethod || ''),
                carrierName: typeof data.carrierName === 'string' ? data.carrierName : '',
                trackingNumber: typeof data.trackingNumber === 'string' ? data.trackingNumber : '',
                note: typeof data.note === 'string' ? data.note : '',
                createdByName: typeof data.createdByName === 'string' ? data.createdByName : '',
                createdAt: toIso(data.createdAt),
            };
        }),
    });
});
