import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrStaff } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { Order } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

type UpdateOrderImeiRequestBody = { itemIndex?: number; imeis?: string[] };

export const POST = withApi({
    name: 'orders/imei',
    onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error)),
}, async (
    request: NextRequest,
    apiContext,
    routeContext: { params: Promise<{ id: string }> },
) => {
        let authResult;
        try {
            authResult = await requireAdminOrStaff(request);
        } catch {
            return apiContext.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const params = await routeContext.params;
        const orderId = params.id;

        const body = await apiContext.readJson<UpdateOrderImeiRequestBody>(request);
        const { itemIndex, imeis } = body;

        if (typeof itemIndex !== 'number' || !Array.isArray(imeis)) {
            return apiContext.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const db = getAdminDb();
        const orderRef = db.collection('orders').doc(orderId);

        return await db.runTransaction(async (tx) => {
            const doc = await tx.get(orderRef);
            if (!doc.exists) {
                return apiContext.json({ error: 'Order not found' }, { status: 404 });
            }

            const order = doc.data() as Order;
            const items = order.items || [];

            if (itemIndex < 0 || itemIndex >= items.length) {
                return apiContext.json({ error: 'Item index out of bounds' }, { status: 400 });
            }

            const item = items[itemIndex];
            if (item.warrantyType !== 'warrantyDevice') {
                return apiContext.json({ error: 'Sản phẩm không thuộc loại thiết bị bảo hành' }, { status: 400 });
            }

            const validImeis = imeis.map((i: string) => i.trim()).filter(Boolean);
            if (validImeis.length !== item.quantity) {
                return apiContext.json({ error: `Vui lòng cung cấp đủ ${item.quantity} IMEI/Serial.` }, { status: 400 });
            }

            item.imeis = validImeis;
            items[itemIndex] = item;

            tx.update(orderRef, {
                items,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: authResult.uid
            });

            return apiContext.json({ success: true, items });
        });

});
