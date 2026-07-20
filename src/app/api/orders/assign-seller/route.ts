import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { Order } from '@/lib/types';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

export const POST = withApi({
    name: 'orders/assign-seller',
    onError: (error, context) => {
        const message = getApiErrorMessage(error);
        const normalizedMessage = message.toLowerCase();
        const fallbackStatus = normalizedMessage.includes('không') || normalizedMessage.includes('khong') ? 400 : 500;
        return context.error(message, getApiErrorStatus(error, fallbackStatus));
    },
}, async (request: NextRequest, context) => {
        const caller = await requirePermission(request, 'manage_orders');
        
        const body = await context.readJson(request);
        const { orderId, sellerId } = body;

        if (!orderId || !sellerId) {
            return context.error('Missing parameters');
        }

        const db = getAdminDb();

        await db.runTransaction(async (tx) => {
            const orderRef = db.collection('orders').doc(orderId);
            const orderSnap = await tx.get(orderRef);
            
            if (!orderSnap.exists) {
                throw new Error('Đơn hàng không tồn tại.');
            }

            const order = orderSnap.data() as Order;
            
            if (order.status === 'Completed' || order.status === 'Cancelled') {
                throw new Error(`Không thể gán nhân viên bán hàng khi đơn đã ở trạng thái ${order.status}`);
            }

            // Fetch the staff document to get the true name
            const staffRef = db.collection('users').doc(sellerId);
            const staffSnap = await tx.get(staffRef);
            
            if (!staffSnap.exists) {
                throw new Error('Nhân viên không tồn tại.');
            }
            
            const staffData = staffSnap.data();
            if (staffData?.role !== 'admin' && staffData?.role !== 'staff') {
                throw new Error('Người được gán không phải là nhân viên.');
            }

            const sellerName = staffData?.displayName || staffData?.name || staffData?.email || 'Unknown';

            tx.update(orderRef, {
                assignedSellerId: sellerId,
                assignedSellerName: sellerName,
                assignedSellerAt: FieldValue.serverTimestamp(),
                assignedBy: caller.uid,
                updatedAt: FieldValue.serverTimestamp()
            });
        });

        return context.json({ success: true, message: 'Gán người phụ trách bán hàng thành công' });
});
