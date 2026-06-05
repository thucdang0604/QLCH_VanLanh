import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requireAdminOrStaff } from '@/lib/apiAuth';
import { Order } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        let authResult;
        try {
            authResult = await requireAdminOrStaff(request);
        } catch {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const params = await context.params;
        const orderId = params.id;

        const body = await request.json();
        const { itemIndex, imeis } = body;

        if (typeof itemIndex !== 'number' || !Array.isArray(imeis)) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const db = getAdminDb();
        const orderRef = db.collection('orders').doc(orderId);

        return await db.runTransaction(async (tx) => {
            const doc = await tx.get(orderRef);
            if (!doc.exists) {
                return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            }

            const order = doc.data() as Order;
            const items = order.items || [];

            if (itemIndex < 0 || itemIndex >= items.length) {
                return NextResponse.json({ error: 'Item index out of bounds' }, { status: 400 });
            }

            const item = items[itemIndex];
            if (item.warrantyType !== 'warrantyDevice') {
                return NextResponse.json({ error: 'Sáº£n pháº©m khĂ´ng thuá»™c loáº¡i thiáº¿t bá»‹ báº£o hĂ nh' }, { status: 400 });
            }

            const validImeis = imeis.map((i: string) => i.trim()).filter(Boolean);
            if (validImeis.length !== item.quantity) {
                return NextResponse.json({ error: `Vui lĂ²ng cung cáº¥p Ä‘á»§ ${item.quantity} IMEI/Serial.` }, { status: 400 });
            }

            item.imeis = validImeis;
            items[itemIndex] = item;

            tx.update(orderRef, {
                items,
                updatedAt: FieldValue.serverTimestamp(),
                updatedBy: authResult.uid
            });

            return NextResponse.json({ success: true, items });
        });

    } catch (error) {
        console.error('Error updating IMEI:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
