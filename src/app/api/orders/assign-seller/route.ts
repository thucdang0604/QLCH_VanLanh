import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { Order } from '@/lib/types';

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_orders');
        
        const body = await request.json();
        const { orderId, sellerId } = body;

        if (!orderId || !sellerId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
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

        return NextResponse.json({ success: true, message: 'Gán người phụ trách bán hàng thành công' });
    } catch (error: unknown) {
        console.error('Assign seller API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json(
            { error: message },
            { status: message.includes('không') ? 400 : 500 }
        );
    }
}
