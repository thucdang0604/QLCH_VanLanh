import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { Order } from '@/lib/types';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_customers');

        const body = await request.json();
        const { customerId, amount, paymentMethod = 'CASH', note } = body;

        const numAmount = Number(amount);
        if (!customerId || isNaN(numAmount) || numAmount <= 0) {
            return NextResponse.json({ error: 'Dữ liệu không hợp lệ (customerId, amount > 0)' }, { status: 400 });
        }

        const db = getAdminDb();
        const custRef = db.collection('customers').doc(customerId);

        const result = await db.runTransaction(async (tx) => {
            const custSnap = await tx.get(custRef);
            if (!custSnap.exists) {
                throw new Error('Khách hàng không tồn tại');
            }

            const currentData = custSnap.data()!;
            const currentDebt = Number(currentData.totalDebt) || 0;

            if (currentDebt <= 0) {
                throw new Error('Khách hàng không có nợ');
            }

            if (numAmount > currentDebt) {
                throw new Error(`Số tiền thu (${numAmount.toLocaleString('vi-VN')}đ) lớn hơn số nợ hiện tại (${currentDebt.toLocaleString('vi-VN')}đ).`);
            }

            // Tìm các đơn hàng đang nợ (FIFO)
            const ordersSnap = await db.collection('orders')
                .where('customer_info.phone', '==', customerId)
                .where('paymentStatus', '==', 'debt')
                .orderBy('createdAt', 'asc')
                .get();

            let remainingAmountToDistribute = numAmount;
            const updatedOrderIds: string[] = [];

            for (const doc of ordersSnap.docs) {
                if (remainingAmountToDistribute <= 0) break;

                const orderData = doc.data() as Order;
                
                // Tính số tiền còn nợ của đơn hàng này
                const totalOrderAmount = orderData.total_amount;
                const paidSoFar = (orderData.paymentHistory || []).reduce((sum, p) => sum + p.amount, 0);
                const orderDebt = totalOrderAmount - paidSoFar;

                if (orderDebt <= 0) {
                    // Đơn này thực ra đã hết nợ nhưng trạng thái chưa cập nhật? Cập nhật luôn.
                    tx.update(doc.ref, { paymentStatus: 'paid', updatedAt: FieldValue.serverTimestamp() });
                    continue;
                }

                const paymentForThisOrder = Math.min(orderDebt, remainingAmountToDistribute);
                remainingAmountToDistribute -= paymentForThisOrder;
                
                const newPaidSoFar = paidSoFar + paymentForThisOrder;
                const isFullyPaid = Math.abs(totalOrderAmount - newPaidSoFar) < 1; // Tolerance 1đ

                tx.update(doc.ref, {
                    paymentStatus: isFullyPaid ? 'paid' : 'debt',
                    paymentHistory: FieldValue.arrayUnion({
                        type: 'debt_payment',
                        amount: paymentForThisOrder,
                        method: paymentMethod,
                        timestamp: Date.now(),
                        note: `Thu nợ (tổng thu: ${numAmount.toLocaleString('vi-VN')}đ)`
                    }),
                    updatedAt: FieldValue.serverTimestamp(),
                    ...(isFullyPaid && !orderData.completedAt ? { completedAt: FieldValue.serverTimestamp() } : {})
                });

                updatedOrderIds.push(doc.id);
            }

            // Cập nhật customer totalDebt
            tx.update(custRef, {
                totalDebt: FieldValue.increment(-numAmount),
                updatedAt: FieldValue.serverTimestamp()
            });

            // Ghi nhận transaction
            const staffSnap = await tx.get(db.collection('users').doc(caller.uid));
            const sData = staffSnap.data();
            const createdByName = sData?.displayName || sData?.name || (caller as { email?: string }).email || caller.uid;

            const txRef = db.collection('customer_transactions').doc();
            tx.set(txRef, {
                customerId,
                customerName: currentData.name || 'Khách lẻ',
                type: 'PAYMENT',
                amount: numAmount,
                orderIds: updatedOrderIds,
                note: note || `Thu nợ bằng ${paymentMethod}`,
                createdBy: caller.uid,
                createdByName,
                createdAt: FieldValue.serverTimestamp()
            });
            incrementRevenueAggregates(tx, db, { orderRevenue: numAmount });

            return { success: true, updatedOrderIds, amountPaid: numAmount, remainingDebt: currentDebt - numAmount };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Collect Debt API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: message.includes('không') ? 400 : 500 });
    }
}
