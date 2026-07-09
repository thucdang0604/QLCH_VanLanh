import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { Order } from '@/lib/types';
import { buildPaymentChannelRevenueDelta, incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';

async function loadDebtOrderDocs(
    tx: FirebaseFirestore.Transaction,
    db: FirebaseFirestore.Firestore,
    customerId: string,
    customerData: FirebaseFirestore.DocumentData,
) {
    const byCustomerIdSnap = await tx.get(
        db.collection('orders')
            .where('customer_info.customerId', '==', customerId)
            .where('paymentStatus', '==', 'debt')
            .orderBy('createdAt', 'asc')
    );

    const debtDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    const seenIds = new Set<string>();
    for (const doc of byCustomerIdSnap.docs) {
        seenIds.add(doc.id);
        debtDocs.push(doc);
    }

    const phoneCandidates = Array.from(new Set([
        customerId,
        customerData.phone,
        customerData.primaryPhone,
        customerData.legacyPhoneId,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));

    for (const phone of phoneCandidates) {
        const byPhoneSnap = await tx.get(
            db.collection('orders')
                .where('customer_info.phone', '==', phone)
                .where('paymentStatus', '==', 'debt')
                .orderBy('createdAt', 'asc')
        );
        for (const doc of byPhoneSnap.docs) {
            if (seenIds.has(doc.id)) continue;
            seenIds.add(doc.id);
            debtDocs.push(doc);
        }
    }
    return debtDocs;
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_customers');

        const body = await request.json();
        const { customerId, amount, paymentMethod = 'CASH', note, idempotencyKey } = body;
        const operationKey = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';

        const numAmount = Number(amount);
        if (!operationKey) {
            return NextResponse.json({ error: 'Missing idempotencyKey' }, { status: 400 });
        }
        if (!customerId || isNaN(numAmount) || numAmount <= 0) {
            return NextResponse.json({ error: 'Dữ liệu không hợp lệ (customerId, amount > 0)' }, { status: 400 });
        }

        const db = getAdminDb();
        const custRef = db.collection('customers').doc(customerId);
        const opRef = db.collection('operation_requests').doc(operationKey);

        const result = await db.runTransaction(async (tx) => {
            const opSnap = await tx.get(opRef);
            if (opSnap.exists) {
                const opData = opSnap.data() || {};
                if (
                    opData.status === 'completed'
                    && opData.type === 'admin_collect_debt'
                    && opData.customerId === customerId
                    && Number(opData.amount) === numAmount
                    && opData.paymentMethod === paymentMethod
                    && opData.actorId === caller.uid
                ) {
                    return {
                        success: true,
                        updatedOrderIds: Array.isArray(opData.updatedOrderIds) ? opData.updatedOrderIds : [],
                        amountPaid: Number(opData.amountPaid) || numAmount,
                        remainingDebt: Number(opData.remainingDebt) || 0,
                        transactionId: typeof opData.referenceId === 'string' ? opData.referenceId : '',
                        fromCache: true,
                    };
                }
                throw new Error('Idempotency key was already used for a different collect-debt request.');
            }

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

            const debtOrderDocs = await loadDebtOrderDocs(tx, db, customerId, currentData);

            let remainingAmountToDistribute = numAmount;
            const updatedOrderIds: string[] = [];
            let posOrderRevenue = 0;
            let webOrderRevenue = 0;
            const staffSnap = await tx.get(db.collection('users').doc(caller.uid));
            const sData = staffSnap.data();
            const createdByName = sData?.displayName || sData?.name || (caller as { email?: string }).email || caller.uid;
            const transactionAllocation = await reserveSequentialDocumentId(tx, db, {
                collectionName: 'customer_transactions',
                prefix: 'CT',
            });

            for (const doc of debtOrderDocs) {
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
                if (orderData.source === 'pos') posOrderRevenue += paymentForThisOrder;
                else webOrderRevenue += paymentForThisOrder;
                
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
            if (remainingAmountToDistribute > 0) {
                throw new Error('Collect-debt amount could not be fully distributed to debt orders.');
            }

            tx.update(custRef, {
                totalDebt: FieldValue.increment(-numAmount),
                updatedAt: FieldValue.serverTimestamp()
            });

            // Ghi nhận transaction
            transactionAllocation.commitCounter();
            tx.set(transactionAllocation.ref, {
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
            incrementRevenueAggregates(tx, db, {
                orderRevenue: numAmount,
                ...buildPaymentChannelRevenueDelta(numAmount, paymentMethod),
                posOrderRevenue,
                webOrderRevenue,
            });
            tx.set(opRef, {
                status: 'completed',
                type: 'admin_collect_debt',
                actorId: caller.uid,
                customerId,
                amount: numAmount,
                amountPaid: numAmount,
                paymentMethod,
                referenceId: transactionAllocation.id,
                updatedOrderIds,
                remainingDebt: currentDebt - numAmount,
                completedAt: FieldValue.serverTimestamp(),
            });

            return {
                success: true,
                updatedOrderIds,
                amountPaid: numAmount,
                remainingDebt: currentDebt - numAmount,
                transactionId: transactionAllocation.id,
                fromCache: false,
            };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Collect Debt API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: message.includes('không') ? 400 : 500 });
    }
}
