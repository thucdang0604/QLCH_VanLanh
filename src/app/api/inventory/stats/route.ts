import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { isPartCategory } from '@/lib/constants';

export const GET = withApi({
    name: 'inventory/stats',
    onError: (error, context) => {
        const message = getApiErrorMessage(error);
        const fallbackStatus = message.startsWith('Forbidden') ? 403 : 400;
        return context.error(message, getApiErrorStatus(error, fallbackStatus));
    },
}, async (request: NextRequest, context) => {
    await requireAdmin(request);
    const db = getAdminDb();

    const snap = await db.collection('products').get();
    let totalItems = 0;
    let totalHeld = 0;
    let totalAvailable = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let retailCount = 0;
    let componentCount = 0;

    snap.forEach((doc) => {
        const data = doc.data();
        if (data.isProposed || data.status === 'archived') return;

        const stock = Number(data.stock) || 0;
        const held = Math.max(0, Number(data.held) || 0);
        const available = Math.max(0, stock - held);
        const costPrice = Number(data.costPrice) || 0;

        totalItems += stock;
        totalHeld += held;
        totalAvailable += available;
        totalValue += stock * costPrice;

        if (available > 0 && available <= 3) lowStockCount += 1;
        if (available <= 0) outOfStockCount += 1;

        if (isPartCategory(data.category, data.categoryIds)) {
            componentCount += 1;
        } else {
            retailCount += 1;
        }
    });

    return context.json({
        totalProducts: snap.docs.length,
        retailCount,
        componentCount,
        totalItems,
        totalHeld,
        totalAvailable,
        totalValue,
        lowStockCount,
        outOfStockCount,
    });
});
