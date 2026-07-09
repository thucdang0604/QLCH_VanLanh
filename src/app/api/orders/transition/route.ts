import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import type { Order } from '@/lib/types';
import { calculateAndSaveCommissionsServer, reverseCommissionServer } from '@/lib/commissionCalcServer';
import { buildCompletedOrderRevenueDelta, incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentIds } from '@/lib/serverDocumentIds';

type FirestoreData = Record<string, unknown>;
type ProductDoc = { ref: DocumentReference; data: FirestoreData };
type OrderUpdate = {
    status: string;
    updatedAt: FieldValue;
    completedAt?: FieldValue;
    paymentStatus?: 'paid' | 'unpaid' | 'debt' | 'refunded';
    refundedAt?: FieldValue;
    refundAmount?: number;
    paymentHistory?: FieldValue;
};
const ORDER_STATUSES = ['Pending', 'Confirmed', 'Shipping', 'Completed', 'Cancelled'] as const;
const ORDER_TRANSITIONS: Record<string, string[]> = {
    Pending: ['Confirmed', 'Cancelled'],
    Confirmed: ['Shipping', 'Completed', 'Cancelled'],
    Shipping: ['Completed', 'Cancelled'],
    Completed: ['Cancelled'],
    Cancelled: [],
};

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Internal server error';
}

function isValidOrderStatus(status: unknown): status is Order['status'] {
    return typeof status === 'string' && ORDER_STATUSES.includes(status as Order['status']);
}

function assertAllowedOrderTransition(oldStatus: Order['status'], targetStatus: Order['status']) {
    if (oldStatus === targetStatus) return;
    const allowedNext = ORDER_TRANSITIONS[oldStatus] || [];
    if (!allowedNext.includes(targetStatus)) {
        throw new Error(`Khong cho phep chuyen don hang tu ${oldStatus} sang ${targetStatus}.`);
    }
}

function getOrderPaymentTotal(order: Order) {
    return (order.paymentHistory || []).reduce((sum, payment) => {
        return payment.type === 'refund' ? sum - (payment.amount || 0) : sum + (payment.amount || 0);
    }, 0);
}

function isRepairOrderItem(item: Order['items'][number] & { isRepairTicket?: boolean; repairTicketId?: string }) {
    return item.isRepairTicket === true || Boolean(item.repairTicketId);
}

function getOrderRetailTotal(order: Order) {
    const items = (order.items || []) as (Order['items'][number] & { isRepairTicket?: boolean; repairTicketId?: string; isOrderPayment?: boolean; orderPaymentId?: string })[];
    if (items.length === 0) return Number(order.total_amount) || 0;

    const retailSubtotal = items
        .filter(item => !isRepairOrderItem(item) && item.isOrderPayment !== true && !item.orderPaymentId)
        .reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
    if (retailSubtotal <= 0) return Number(order.total_amount) || 0;

    const retailDiscount = Math.min(Number(order.discount_amount) || 0, retailSubtotal);
    return Math.max(0, retailSubtotal - retailDiscount);
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
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed') {
                        if (
                            data.type === 'order_transition' &&
                            data.referenceId === orderId &&
                            data.targetStatus === targetStatus
                        ) {
                            return;
                        }
                        throw new Error('Idempotency key da duoc dung cho thao tac khac.');
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
            if (!isValidOrderStatus(oldStatus) || !isValidOrderStatus(targetStatus)) {
                throw new Error('Trang thai don hang khong hop le.');
            }
            assertAllowedOrderTransition(oldStatus, targetStatus);

            // Stock & Held Changes
            const needsStockChange = 
                (isActiveStatus(oldStatus) && targetStatus === 'Cancelled') ||
                (isActiveStatus(oldStatus) && targetStatus === 'Completed') ||
                (oldStatus === 'Completed' && targetStatus === 'Cancelled');

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

            const writesInventoryLog =
                (isActiveStatus(oldStatus) && targetStatus === 'Completed') ||
                (oldStatus === 'Completed' && targetStatus === 'Cancelled');
            const voucherCode = typeof freshOrder.voucherCode === 'string' ? freshOrder.voucherCode.trim().toUpperCase() : '';
            const shouldReturnVoucher = targetStatus === 'Cancelled' && Boolean(voucherCode);
            let voucherRef: DocumentReference | null = null;
            let voucherUsedCount = 0;
            if (shouldReturnVoucher) {
                const voucherSnap = await tx.get(
                    db.collection('vouchers')
                        .where('code', '==', voucherCode)
                        .limit(2)
                );
                if (voucherSnap.size > 1) {
                    throw new Error('Ma Voucher dang bi trung du lieu. Vui long tat hoac gop ma trung truoc khi huy don.');
                }
                const voucherDoc = voucherSnap.docs[0];
                if (voucherDoc) {
                    voucherRef = voucherDoc.ref;
                    voucherUsedCount = Math.max(0, Number(voucherDoc.data()?.usedCount) || 0);
                }
            }
            const inventoryLogAllocations = await reserveSequentialDocumentIds(tx, db, {
                collectionName: 'inventory_logs',
                prefix: 'IL',
                count: writesInventoryLog ? grouped.size : 0,
            });
            const writesCustomerLedger = Boolean(
                freshOrder.customer_info?.phone &&
                (
                    (targetStatus === 'Completed' && isActiveStatus(oldStatus)) ||
                    (targetStatus === 'Cancelled' && oldStatus === 'Completed')
                ),
            );
            let customerLedgerCount = 0;
            if (writesCustomerLedger) {
                if (targetStatus === 'Completed') {
                    customerLedgerCount = 1 + (Number(freshOrder.deposit_amount || 0) > 0 ? 1 : 0);
                } else {
                    customerLedgerCount = 1;
                }
            }
            const customerLedgerAllocations = await reserveSequentialDocumentIds(tx, db, {
                collectionName: 'customer_ledger',
                prefix: 'CL',
                count: customerLedgerCount,
            });
            const customerPhone = freshOrder.customer_info?.phone || '';
            const customerRef = customerPhone ? db.collection('customers').doc(customerPhone) : null;
            const custSnap = customerRef ? await tx.get(customerRef) : null;
            let inventoryLogAllocationIndex = 0;

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
                }

                if (logType && stockChange !== 0) {
                    const logRef = inventoryLogAllocations[inventoryLogAllocationIndex++].ref;
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
            if (oldStatus === 'Completed' && targetStatus === 'Cancelled') {
                const historyRefundAmount = Math.max(0, getOrderPaymentTotal(freshOrder));
                const legacyPaidAmount = freshOrder.paymentStatus === 'debt' || freshOrder.payment_method === 'Debt'
                    ? Math.max(0, Number(freshOrder.deposit_amount) || 0)
                    : getOrderRetailTotal(freshOrder);
                const refundAmount = Array.isArray(freshOrder.paymentHistory) && freshOrder.paymentHistory.length > 0
                    ? historyRefundAmount
                    : legacyPaidAmount;
                updateData.paymentStatus = refundAmount > 0 ? 'refunded' : 'unpaid';
                updateData.refundedAt = FieldValue.serverTimestamp();
                updateData.refundAmount = refundAmount;
                if (refundAmount > 0) {
                    updateData.paymentHistory = FieldValue.arrayUnion({
                        amount: refundAmount,
                        method: freshOrder.payment_method || 'unknown',
                        type: 'refund',
                        timestamp: Date.now(),
                        referenceId: orderId,
                        paidAfter: 0,
                        remainingAfter: 0,
                        note: 'Hoan tien khi huy don da hoan thanh',
                    });
                }
            }

            tx.update(orderRef, updateData);
            if (voucherRef) {
                tx.update(voucherRef, {
                    usedCount: Math.max(0, voucherUsedCount - 1),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }

            // Fake update data for calculateAndSaveCommissionsServer
            const docDataForCommission = {
                ...freshOrder,
                status: targetStatus
            } as Order;

            // Customer Aggregate Updates
            if (customerPhone && customerRef) {
                const phone = customerPhone;
                const grandTotal = freshOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0) - (freshOrder.discount_amount || 0);
                const isDebt = freshOrder.paymentStatus === 'debt' || freshOrder.payment_method === 'Debt';
                const debtAmount = isDebt ? Math.max(0, grandTotal - (Number(freshOrder.deposit_amount || 0))) : 0;

                if (targetStatus === 'Completed' && isActiveStatus(oldStatus)) {
                    if (custSnap?.exists) {
                        const customerUpdates: Record<string, unknown> = {
                            totalSpent: FieldValue.increment(grandTotal),
                            totalOrders: FieldValue.increment(1),
                            updatedAt: FieldValue.serverTimestamp()
                        };
                        if (debtAmount > 0) {
                            customerUpdates.totalDebt = FieldValue.increment(debtAmount);
                        }
                        tx.update(customerRef, customerUpdates);
                    }
                    
                    let customerLedgerAllocationIndex = 0;
                    // Add customer ledger (purchase_order)
                    tx.set(customerLedgerAllocations[customerLedgerAllocationIndex++].ref, {
                        customerId: phone,
                        type: 'purchase_order',
                        amount: grandTotal,
                        referenceId: orderId,
                        date: FieldValue.serverTimestamp()
                    });

                    // Add customer ledger (purchase_payment) if deposited
                    if (Number(freshOrder.deposit_amount || 0) > 0) {
                        tx.set(customerLedgerAllocations[customerLedgerAllocationIndex++].ref, {
                            customerId: phone,
                            type: 'purchase_payment',
                            amount: Number(freshOrder.deposit_amount),
                            referenceId: orderId,
                            date: FieldValue.serverTimestamp()
                        });
                    }

                    // Tính HOA HỒNG server-side (Decision 2)
                    await calculateAndSaveCommissionsServer(tx, { uid: caller.uid, displayName: '' }, 'order', docDataForCommission);
                    incrementRevenueAggregates(tx, db, buildCompletedOrderRevenueDelta(docDataForCommission));

                } else if (targetStatus === 'Cancelled' && oldStatus === 'Completed') {
                    if (custSnap?.exists) {
                        const customerUpdates: Record<string, unknown> = {
                            totalSpent: FieldValue.increment(-grandTotal),
                            totalOrders: FieldValue.increment(-1),
                            updatedAt: FieldValue.serverTimestamp()
                        };
                        if (debtAmount > 0) {
                            customerUpdates.totalDebt = FieldValue.increment(-debtAmount);
                        }
                        tx.update(customerRef, customerUpdates);
                    }
                    
                    // Add customer ledger negative
                    const ledgerRef = customerLedgerAllocations[0].ref;
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
                    referenceId: orderId,
                    targetStatus
                });
            }
            inventoryLogAllocations.at(-1)?.commitCounter();
            customerLedgerAllocations.at(-1)?.commitCounter();
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
