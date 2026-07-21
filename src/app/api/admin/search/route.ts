import { NextRequest } from 'next/server';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { requireAdminOrStaff } from '@/lib/apiAuth';
import { isRateLimited } from '@/lib/rateLimit';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

type AdminSearchResult = {
    id: string;
    _type: 'product' | 'service' | 'order' | 'repair';
    name?: string;
    title?: string;
    category?: string;
    brand?: string;
    customer?: {
        name?: string;
        phone?: string;
    };
};

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const CATALOG_RESULT_LIMIT = 10;

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function customerSummary(data: Record<string, unknown>): AdminSearchResult['customer'] {
    const customer = data.customer && typeof data.customer === 'object'
        ? data.customer as Record<string, unknown>
        : {};

    return {
        name: asString(customer.name),
        phone: asString(customer.phone),
    };
}

function catalogSummary(id: string, type: 'product' | 'service', data: Record<string, unknown>): AdminSearchResult {
    return {
        id,
        _type: type,
        name: asString(data.name),
        title: asString(data.title),
        category: asString(data.category),
        brand: asString(data.brand),
    };
}

function matchesKeyword(item: AdminSearchResult, keyword: string): boolean {
    return [
        item.name,
        item.title,
        item.category,
        item.brand,
    ].join(' ').toLowerCase().includes(keyword);
}

export const GET = withApi({
    name: 'admin/search',
    onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error)),
}, async (request: NextRequest, context) => {
        const user = await requireAdminOrStaff(request);

        if (await isRateLimited(user.uid, 'admin-search', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
            return context.json({ error: 'Too many search requests' }, { status: 429 });
        }

        if (!isAdminAvailable()) {
            return context.json({ error: 'Service unavailable' }, { status: 503 });
        }

        const { searchParams } = new URL(request.url);
        const q = searchParams.get('q')?.trim() || '';
        if (!q) {
            return context.json({ results: [] });
        }

        const db = getAdminDb();
        const keyword = q.toLowerCase();
        const [productsSnap, servicesSnap, orderDoc, repairDoc] = await Promise.all([
            db.collection('products').where('status', '==', 'active').limit(50).get(),
            db.collection('services').limit(50).get(),
            db.collection('orders').doc(q).get(),
            db.collection('repairs').doc(q).get(),
        ]);

        const catalogResults = [
            ...productsSnap.docs.map((doc) => catalogSummary(doc.id, 'product', doc.data())),
            ...servicesSnap.docs
                .filter((doc) => doc.data().isActive !== false)
                .map((doc) => catalogSummary(doc.id, 'service', doc.data())),
        ].filter((item) => matchesKeyword(item, keyword)).slice(0, CATALOG_RESULT_LIMIT);

        const ordersResult: AdminSearchResult[] = [];
        const repairsResult: AdminSearchResult[] = [];

        if (orderDoc.exists) {
            ordersResult.push({
                id: orderDoc.id,
                _type: 'order',
                customer: customerSummary(orderDoc.data() || {}),
            });
        }

        if (repairDoc.exists) {
            repairsResult.push({
                id: repairDoc.id,
                _type: 'repair',
                customer: customerSummary(repairDoc.data() || {}),
            });
        }

        if (/^\d{8,12}$/.test(q)) {
            const [ordersSnap, repairsSnap] = await Promise.all([
                db.collection('orders').where('customer.phone', '==', q).limit(5).get(),
                db.collection('repairs').where('customer.phone', '==', q).limit(5).get(),
            ]);

            ordersSnap.docs.forEach((doc) => {
                if (!ordersResult.some((item) => item.id === doc.id)) {
                    ordersResult.push({
                        id: doc.id,
                        _type: 'order',
                        customer: customerSummary(doc.data()),
                    });
                }
            });

            repairsSnap.docs.forEach((doc) => {
                if (!repairsResult.some((item) => item.id === doc.id)) {
                    repairsResult.push({
                        id: doc.id,
                        _type: 'repair',
                        customer: customerSummary(doc.data()),
                    });
                }
            });
        }

        return context.json({ results: [...catalogResults, ...ordersResult, ...repairsResult] });
});
