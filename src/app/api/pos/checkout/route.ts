
import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import { calculateAndSaveCommissionsServer } from '@/lib/commissionCalcServer';
import type { Order } from '@/lib/types';
import { PRODUCT_STATUS, isProductArchived } from '@/lib/productLifecycle';
import { normalizeVietnamPhone } from '@/lib/phone';

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_orders');
        
        const body = await request.json();
        const { idempotencyKey, repairTicketId, customer_info, items, discount_amount, total_amount, deposit_amount, payment_method } = body;

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'Giỏ hàng trống' }, { status: 400 });
        }

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed' && data.referenceId) {
                        return { success: true, fromCache: true, orderId: data.referenceId };
                    }
                }
            }

            // Pre-aggregate
            const preAggregated = new Map<string, number>();
            for (const item of items) {
                if (item.isRepairTicket) continue; // Bỏ qua check kho cho phiếu sửa chữa
                const pid = String(item.productId || '');
                const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
                preAggregated.set(pid, (preAggregated.get(pid) || 0) + qty);
            }

            // Fetch products
            const productDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }>();
            for (const productId of preAggregated.keys()) {
                const pRef = db.collection('products').doc(productId);
                const pSnap = await tx.get(pRef);
                if (!pSnap.exists) {
                    throw new Error(`Sản phẩm (ID: ${productId}) không tồn tại.`);
                }
                productDocs.set(productId, { ref: pRef, data: (pSnap.data() || {}) as FirebaseFirestore.DocumentData });
            }

            // Fetch taxonomy for warranty config
            const taxonomySnap = await tx.get(db.collection('system_config').doc('taxonomy_settings'));
            const retailTrees = taxonomySnap.data()?.taxonomy?.retail || [];

            function resolveWarranty(productData: { warrantyType?: string; warrantyMonths?: string | number; category?: string; [key: string]: unknown }): { warrantyType: string, warrantyMonths: number } | null {
                if (productData.warrantyType && productData.warrantyType !== 'none') {
                    return { warrantyType: productData.warrantyType, warrantyMonths: Number(productData.warrantyMonths) || 0 };
                }
                if (productData.warrantyType === 'none') return null;

                const categoryPath = productData.category || '';
                if (!categoryPath) return null;

                const segments = categoryPath.split('/');
                let currentNodes = retailTrees;
                let lastFoundWarranty: { warrantyType: string, warrantyMonths: number } | null = null;

                for (let i = 0; i < segments.length; i++) {
                    const partialId = segments.slice(0, i + 1).join('/');
                    const node = currentNodes.find((n: { id?: string; slug?: string; warrantyType?: string; warrantyMonths?: string | number; children?: Record<string, unknown>[] }) => n.id === partialId || n.slug === segments[i]);
                    if (!node) break;

                    if (node.warrantyType && node.warrantyType !== 'none') {
                        lastFoundWarranty = { warrantyType: node.warrantyType, warrantyMonths: Number(node.warrantyMonths) || 0 };
                    } else if (node.warrantyType === 'none') {
                        lastFoundWarranty = null;
                    }

                    if (!node.children || node.children.length === 0) break;
                    currentNodes = node.children;
                }
                return lastFoundWarranty;
            }

            // Verify stock
            for (const [productId, totalQty] of preAggregated.entries()) {
                const pSnap = productDocs.get(productId)!;
                const d = pSnap.data;
                if (isProductArchived({ status: String(d.status || '') as 'active' | 'hidden' | 'inactive' }) || d.status !== PRODUCT_STATUS.ACTIVE || d.isProposed === true) {
                    throw new Error(`Sản phẩm "${d.name || productId}" hiện không còn được bán.`);
                }
                const available = (Number(d.stock) || 0) - (Number(d.held) || 0);
                if (available < totalQty) {
                    throw new Error(`Sản phẩm "${d.name}" chỉ còn ${available} khả dụng nhưng yêu cầu ${totalQty}.`);
                }
            }

            // Normalize items & deduct stock
            const normalizedItems = [];
            let serverSubtotal = 0;

            for (const item of items) {
                const pid = String(item.productId);
                const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
                const price = Number(item.price) || 0;
                
                if (item.isRepairTicket) {
                    normalizedItems.push({
                        id: pid,
                        productId: pid,
                        productName: item.productName || '[Phiếu sửa chữa]',
                        price,
                        quantity: qty,
                        image: '',
                        isRepairTicket: true
                    });
                    serverSubtotal += price * qty;
                    continue;
                }

                const pSnap = productDocs.get(pid)!;
                const d = pSnap.data;
                
                const warrantyInfo = resolveWarranty(d);
                const warrantyType = warrantyInfo?.warrantyType || 'none';
                const warrantyMonths = warrantyInfo?.warrantyMonths || 0;

                let imeis: string[] = [];
                if (warrantyType === 'warrantyDevice') {
                    if (Array.isArray(item.imeis)) {
                        imeis = item.imeis.map((x: unknown) => String(x).trim()).filter(Boolean);
                    }
                    // For POS, if not pending deposit, we might require IMEI immediately.
                    // But maybe we just save what is provided and let Admin Details warn if missing?
                    // The plan says "validate độ dài mảng IMEI". Let's enforce it if it's not a pending deposit.
                    // Actually, if it's pending, they might not have the item yet.
                    if (imeis.length > qty) {
                        throw new Error(`Sản phẩm "${d.name}" chỉ mua ${qty} nhưng cung cấp ${imeis.length} IMEI.`);
                    }
                }
                
                normalizedItems.push({
                    id: String(item.id || item.productId),
                    productId: pid,
                    productName: item.productName || d.name,
                    price,
                    quantity: qty,
                    image: d.images?.[0] || d.imageUrl || '',
                    warrantyType,
                    warrantyMonths,
                    imeis,
                });

                serverSubtotal += price * qty;
            }

            const serverTotal = serverSubtotal - (Number(discount_amount) || 0);
            
            // Total cost guard
            if (Math.abs(serverTotal - Number(total_amount)) > 1) {
                console.warn(`POS Checkout mismatch: Client total ${total_amount}, Server total ${serverTotal}`);
                // In POS, we might accept client total or enforce server total. Let's enforce server total.
            }

            const isPending = Number(deposit_amount) > 0 && Number(deposit_amount) < serverTotal;

            // Stock Deduction
            for (const [productId, totalQty] of preAggregated.entries()) {
                const pSnap = productDocs.get(productId)!;
                const d = pSnap.data;
                const currentStock = Number(d.stock) || 0;
                const currentHeld = Number(d.held) || 0;
                
                if (isPending) {
                    tx.update(pSnap.ref, {
                        held: currentHeld + totalQty
                    });
                } else {
                    tx.update(pSnap.ref, {
                        stock: currentStock - totalQty
                    });

                    // Log inventory
                    tx.set(db.collection('inventory_logs').doc(), {
                        productId,
                        productName: d.name,
                        quantity: -totalQty,
                        costPriceAtLog: Number(d.costPrice) || 0,
                        type: 'POS_SALE',
                        referenceType: 'order',
                        createdBy: caller.uid,
                        createdAt: FieldValue.serverTimestamp()
                    });
                }
            }

            // Create Order
            const orderRef = db.collection('orders').doc();
            const orderId = orderRef.id;

            const order: Record<string, unknown> = {
                customer_info: {
                    name: customer_info?.name || 'Khách lẻ',
                    phone: customer_info?.phone || '',
                    email: customer_info?.email || '',
                    address: customer_info?.address || '',
                    note: customer_info?.note || '',
                },
                items: normalizedItems,
                subtotal_amount: serverSubtotal,
                discount_amount: Number(discount_amount) || 0,
                deposit_amount: Number(deposit_amount) || 0,
                total_amount: serverTotal,
                status: isPending ? 'Pending' : 'Completed',
                source: 'pos',
                is_vat_exported: false,
                payment_method: payment_method || 'CASH',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                completedAt: isPending ? null : FieldValue.serverTimestamp(),
                paymentHistory: [{
                    type: isPending ? 'deposit' : 'full',
                    amount: isPending ? Number(deposit_amount) || 0 : serverTotal,
                    timestamp: Date.now(),
                    note: isPending ? `Đặt cọc POS — ${payment_method}` : `Thanh toán POS — ${payment_method}`
                }],
                createdBy: caller.uid,
                createdByName: (caller as { email?: string }).email || caller.uid // will be updated with true name if possible
            };

            // Fetch true staff name
            const staffSnap = await tx.get(db.collection('users').doc(caller.uid));
            if (staffSnap.exists) {
                const sData = staffSnap.data();
                order.createdByName = sData?.displayName || sData?.name || order.createdByName;
            }

            tx.set(orderRef, order);

            // Customer Aggregate
            if ((order as { customer_info: { phone: string, name?: string } }).customer_info.phone) {
                const rawPhone = (order as { customer_info: { phone: string, name?: string } }).customer_info.phone;
                const normalized = normalizeVietnamPhone(rawPhone);
                if (normalized) {
                    const phone = normalized.local;
                    const custRef = db.collection('customers').doc(phone);
                    const custSnap = await tx.get(custRef);
                    const incomingName = ((order as { customer_info: { phone: string, name?: string } }).customer_info.name || '').trim();
                    
                    if (custSnap.exists) {
                        const currentData = custSnap.data()!;
                        const updateData: Record<string, unknown> = {
                            updatedAt: FieldValue.serverTimestamp(),
                            lastVisit: FieldValue.serverTimestamp()
                        };

                        if (incomingName && incomingName !== 'Khách lẻ' && incomingName !== currentData.name) {
                            updateData.name = incomingName;
                        }

                        if (!isPending) {
                            updateData.totalSpent = FieldValue.increment(serverTotal);
                            updateData.totalOrders = FieldValue.increment(1);
                        }
                        tx.update(custRef, updateData);
                    } else {
                        tx.set(custRef, {
                            phone,
                            name: incomingName || 'Khách lẻ',
                            type: 'retail',
                            totalSpent: isPending ? 0 : serverTotal,
                            totalOrders: isPending ? 0 : 1,
                            totalRepairs: 0,
                            totalAppointments: 0,
                            createdAt: FieldValue.serverTimestamp(),
                            updatedAt: FieldValue.serverTimestamp(),
                            lastVisit: FieldValue.serverTimestamp(),
                            tags: []
                        });
                    }

                    // Ledger
                    tx.set(db.collection('customer_ledger').doc(), {
                        customerId: phone,
                        type: isPending ? 'deposit_order' : 'purchase_order',
                        amount: isPending ? (Number(deposit_amount) || 0) : serverTotal,
                        referenceId: orderId,
                        date: FieldValue.serverTimestamp()
                    });
                }
            }

            // Commission Server-Side Calculation (only for completed orders)
            if (!isPending) {
                await calculateAndSaveCommissionsServer(tx, { uid: caller.uid, displayName: order.createdByName as string }, 'order', { id: orderId, ...order } as Order);
                
                if (repairTicketId) {
                    const repairRef = db.collection('repairs').doc(repairTicketId);
                    const repairSnap = await tx.get(repairRef);
                    if (repairSnap.exists) {
                        const repairPrice = items.find((i: Record<string, unknown>) => i.isRepairTicket)?.price || 0;
                        tx.update(repairRef, {
                            'payment.status': 'paid',
                            status: 'out',
                            completedAt: FieldValue.serverTimestamp(),
                            'timing.completedAt': FieldValue.serverTimestamp(),
                            updatedAt: FieldValue.serverTimestamp(),
                            paymentHistory: FieldValue.arrayUnion({
                                type: 'full',
                                amount: repairPrice,
                                method: payment_method || 'CASH',
                                timestamp: Date.now(),
                                note: `Thanh toán gộp hóa đơn POS #${orderId.slice(-6)}`
                            })
                        });
                    }
                }
            }

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'pos_checkout',
                    referenceId: orderId
                });
            }

            return { success: true, orderId };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('POS Checkout API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json(
            { error: message },
            { status: message.includes('không') ? 400 : 500 }
        );
    }
}
