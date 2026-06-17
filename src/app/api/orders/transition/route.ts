import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import type { Order } from '@/lib/types';
import { calculateAndSaveCommissionsServer, reverseCommissionServer } from '@/lib/commissionCalcServer';
import { buildCompletedOrderRevenueDelta, incrementRevenueAggregates } from '@/lib/revenueAggregateServer';

type FirestoreData = Record<string, unknown>;
type ProductDoc = { ref: DocumentReference; data: FirestoreData };
type OrderUpdate = {
    status: string;
    updatedAt: FieldValue;
    completedAt?: FieldValue;
};

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Internal server error';
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_orders');
        
        const body = await request.json();
        const { orderId, targetStatus, idempotencyKey } = body;

        if (!orderId || !targetStatus) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const db = getAdminDb();
        const isActiveStatus = (s: string) => ['Pending', 'Confirmed', 'Shipping'].includes(s);

        await db.runTransaction(async (tx) => {
            // Optional: Idempotency check with operation_requests could be added here
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed') {
                        // Idempotent return
                        return;
                    }
                }
            }

            const orderRef = db.collection('orders').doc(orderId);
            const orderSnap = await tx.get(orderRef);
            if (!orderSnap.exists) {
                throw new Error('Đơn hàng không tồn tại.');
            }

            const freshOrder = orderSnap.data() as Order;
            const oldStatus = freshOrder.status;

            if (oldStatus === targetStatus) return; // double-submit

            // Stock & Held Changes
            const needsStockChange = 
                (isActiveStatus(oldStatus) && targetStatus === 'Cancelled') ||
                (isActiveStatus(oldStatus) && targetStatus === 'Completed') ||
                (oldStatus === 'Completed' && targetStatus === 'Cancelled') ||
                (oldStatus === 'Cancelled' && isActiveStatus(targetStatus));

            const productDocs = new Map<string, ProductDoc>();
            if (needsStockChange && freshOrder.items) {
                for (const item of freshOrder.items) {
                    if (item.productId && !productDocs.has(item.productId)) {
                        const pRef = db.collection('products').doc(item.productId);
                        const pSnap = await tx.get(pRef);
                        if (pSnap.exists) {
                            productDocs.set(item.productId, { ref: pRef, data: (pSnap.data() || {}) as FirestoreData });
                        }
                    }
                }
            }

            const grouped = new Map<string, { productName: string; totalQty: number }>();
            if (needsStockChange && freshOrder.items) {
                for (const item of freshOrder.items) {
                    if (!item.productId || !productDocs.has(item.productId)) continue;
                    const existing = grouped.get(item.productId);
                    if (existing) {
                        existing.totalQty += item.quantity;
                    } else {
                        grouped.set(item.productId, { productName: item.productName, totalQty: item.quantity });
                    }
                }
            }

            for (const [pid, group] of grouped.entries()) {
                const p = productDocs.get(pid)!;
                const currentStock = Number(p.data.stock) || 0;
                const currentHeld = Number(p.data.held) || 0;

                let logType = '';
                let stockChange = 0;

                if (isActiveStatus(oldStatus) && targetStatus === 'Cancelled') {
                    if (currentHeld < group.totalQty) {
                        throw new Error(`SP "${group.productName}" có số lượng giữ chỗ không khớp (Đang giữ ${currentHeld}, cần giải phóng ${group.totalQty}).`);
                    }
                    tx.update(p.ref, { held: currentHeld - group.totalQty });
                } else if (isActiveStatus(oldStatus) && targetStatus === 'Completed') {
                    if (currentStock < group.totalQty) {
                        throw new Error(`SP "${group.productName}" không đủ tồn kho vật lý (Có ${currentStock}, cần ${group.totalQty}).`);
                    }
                    if (currentHeld < group.totalQty) {
                        throw new Error(`SP "${group.productName}" có số lượng giữ chỗ không khớp (Đang giữ ${currentHeld}, cần giải phóng ${group.totalQty}).`);
                    }
                    tx.update(p.ref, {
                        stock: currentStock - group.totalQty,
                        held: currentHeld - group.totalQty
                    });
                    logType = 'ORDER_COMPLETE';
                    stockChange = -group.totalQty;
                } else if (oldStatus === 'Completed' && targetStatus === 'Cancelled') {
                    tx.update(p.ref, { stock: currentStock + group.totalQty });
                    logType = 'ORDER_CANCEL';
                    stockChange = group.totalQty;
                } else if (oldStatus === 'Cancelled' && isActiveStatus(targetStatus)) {
                    const available = currentStock - currentHeld;
                    if (available < group.totalQty) {
                        throw new Error(`SP "${group.productName}" không đủ khả dụng để kích hoạt lại đơn (Còn ${available}, cần ${group.totalQty}).`);
                    }
                    tx.update(p.ref, { held: currentHeld + group.totalQty });
                }

                if (logType && stockChange !== 0) {
                    const logRef = db.collection('inventory_logs').doc();
                    tx.set(logRef, {
                        productId: pid,
                        productName: group.productName,
                        quantity: stockChange,
                        costPriceAtLog: Number(p.data.costPrice) || 0,
                        type: logType,
                        referenceId: orderId,
                        referenceType: 'order',
                        createdBy: caller.uid,
                        createdAt: FieldValue.serverTimestamp()
                    });
                }
            }

            // Order Updates
            const updateData: OrderUpdate = {
                status: targetStatus,
                updatedAt: FieldValue.serverTimestamp()
            };

            if (targetStatus === 'Completed') {
                updateData.completedAt = FieldValue.serverTimestamp();
            }

            tx.update(orderRef, updateData);

            // Fake update data for calculateAndSaveCommissionsServer
            const docDataForCommission = {
                ...freshOrder,
                status: targetStatus
            } as Order;

            // Customer Aggregate Updates
            if (freshOrder.customer_info?.phone) {
                const phone = freshOrder.customer_info.phone;
                const customerRef = db.collection('customers').doc(phone);
                const custSnap = await tx.get(customerRef);
                const grandTotal = freshOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0) - (freshOrder.discount_amount || 0);

                if (targetStatus === 'Completed' && isActiveStatus(oldStatus)) {
                    if (custSnap.exists) {
                        tx.update(customerRef, {
                            totalSpent: FieldValue.increment(grandTotal),
                            totalOrders: FieldValue.increment(1),
                            updatedAt: FieldValue.serverTimestamp()
                        });
                    }
                    
                    // Add customer ledger
                    const ledgerRef = db.collection('customer_ledger').doc();
                    tx.set(ledgerRef, {
                        customerId: phone,
                        type: 'purchase_order',
                        amount: grandTotal,
                        referenceId: orderId,
                        date: FieldValue.serverTimestamp()
                    });

                    // Tính HOA HỒNG server-side (Decision 2)
                    await calculateAndSaveCommissionsServer(tx, { uid: caller.uid, displayName: '' }, 'order', docDataForCommission);
                    incrementRevenueAggregates(tx, db, buildCompletedOrderRevenueDelta(docDataForCommission));

                } else if (targetStatus === 'Cancelled' && oldStatus === 'Completed') {
                    if (custSnap.exists) {
                        tx.update(customerRef, {
                            totalSpent: FieldValue.increment(-grandTotal),
                            totalOrders: FieldValue.increment(-1),
                            updatedAt: FieldValue.serverTimestamp()
                        });
                    }
                    
                    // Add customer ledger negative
                    const ledgerRef = db.collection('customer_ledger').doc();
                    tx.set(ledgerRef, {
                        customerId: phone,
                        type: 'refund_order',
                        amount: -grandTotal,
                        referenceId: orderId,
                        date: FieldValue.serverTimestamp()
                    });

                    // THU HỒI HOA HỒNG (Fix 12)
                    await reverseCommissionServer(tx, orderId, 'order', caller.uid);
                    incrementRevenueAggregates(tx, db, buildCompletedOrderRevenueDelta(freshOrder, -1));
                }
            }

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'order_transition',
                    referenceId: orderId
                });
            }
        });

        return NextResponse.json({ success: true, message: 'Cập nhật trạng thái thành công' });
    } catch (error: unknown) {
        console.error('Order transition API error:', error);
        const message = errorMessage(error);
        return NextResponse.json(
            { error: message },
            { status: message.includes('không') ? 400 : 500 }
        );
    }
}
