
import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import { calculateAndSaveCommissionsServer } from '@/lib/commissionCalcServer';
import type { Order } from '@/lib/types';
import { PRODUCT_STATUS, isProductArchived } from '@/lib/productLifecycle';
import { normalizeVietnamPhone } from '@/lib/phone';
import { fetchFifoLogsForDeduction, executeFifoDeductionsWrites, type FifoDeductionResult } from '@/lib/inventoryFifo';

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_orders');

        const body = await request.json();
        const { idempotencyKey, repairTicketId, customer_info, items, discount_amount, total_amount, deposit_amount, payment_method, voucherCode } = body;

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

            // Pre-aggregate for overall stock check
            const preAggregatedForStock = new Map<string, number>();
            // Pre-aggregate for FIFO deduction
            const fifoMap = new Map<string, { productId: string; quantity: number; preferredLotCodes: Map<string, number> }>();

            for (const item of items) {
                if (item.isRepairTicket) continue; // Bỏ qua check kho cho phiếu sửa chữa
                const pid = String(item.productId || '');
                const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
                const lot = item.lotCode ? String(item.lotCode) : undefined;
                
                preAggregatedForStock.set(pid, (preAggregatedForStock.get(pid) || 0) + qty);

                let fifoItem = fifoMap.get(pid);
                if (!fifoItem) {
                    fifoItem = { productId: pid, quantity: 0, preferredLotCodes: new Map<string, number>() };
                    fifoMap.set(pid, fifoItem);
                }
                fifoItem.quantity += qty;
                if (lot) {
                    fifoItem.preferredLotCodes.set(lot, (fifoItem.preferredLotCodes.get(lot) || 0) + qty);
                }
            }

            let fifoResultsMap = new Map<string, FifoDeductionResult[]>();
            let fifoLogsDataMap: Awaited<ReturnType<typeof fetchFifoLogsForDeduction>> = new Map();
            const fifoDeductors = Array.from(fifoMap.values()).map(x => ({ 
                productId: x.productId, 
                quantityToDeduct: x.quantity,
                preferredLotCodes: Array.from(x.preferredLotCodes.entries()).map(([lotCode, quantity]) => ({ lotCode, quantity }))
            }));
            if (fifoDeductors.length > 0) {
                fifoLogsDataMap = await fetchFifoLogsForDeduction(tx, db, fifoDeductors);
            }

            // Fetch products
            const productDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }>();
            for (const productId of preAggregatedForStock.keys()) {
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

            function resolveWarranty(productData: { warrantyType?: string; warrantyMonths?: string | number; category?: string;[key: string]: unknown }): { warrantyType: string, warrantyMonths: number } | null {
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
            for (const [productId, totalQty] of preAggregatedForStock.entries()) {
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

            // ── Voucher Validation for POS ──
            let voucherRef: FirebaseFirestore.DocumentReference | null = null;
            let appliedVoucherCode: string | undefined;
            let appliedPersonalVoucher = false;

            if (voucherCode && typeof voucherCode === 'string') {
                const voucherQuery = await db.collection('vouchers')
                    .where('code', '==', voucherCode.trim().toUpperCase())
                    .where('isActive', '==', true)
                    .limit(1)
                    .get();
                if (!voucherQuery.empty) {
                    voucherRef = voucherQuery.docs[0].ref;
                    const voucherSnap = await tx.get(voucherRef);
                    const voucherData = voucherSnap.data();

                    if (voucherData) {
                        if (voucherData.expiryDate) {
                            const exp = voucherData.expiryDate.toDate ? voucherData.expiryDate.toDate() : new Date(voucherData.expiryDate);
                            if (exp.getTime() < Date.now()) {
                                throw new Error('Mã Voucher đã hết hạn.');
                            }
                        }
                        if (voucherData.usageLimit > 0 && voucherData.usedCount >= voucherData.usageLimit) {
                            throw new Error('Mã Voucher đã hết lượt sử dụng.');
                        }
                        if (voucherData.minOrderValue && serverSubtotal < voucherData.minOrderValue) {
                            throw new Error(`Đơn hàng tối thiểu ${voucherData.minOrderValue.toLocaleString('vi-VN')}đ để sử dụng mã này.`);
                        }
                        if (voucherData.ownerId) {
                            const normalizedPhone = normalizeVietnamPhone(customer_info?.phone || '');
                            const voucherOwnerPhone = normalizeVietnamPhone(String(voucherData.ownerId));
                            if (!normalizedPhone || !voucherOwnerPhone || normalizedPhone.local !== voucherOwnerPhone.local) {
                                throw new Error('Voucher này là phần thưởng cá nhân. Vui lòng nhập đúng Số điện thoại khách hàng.');
                            }
                            appliedPersonalVoucher = true;
                        }
                        appliedVoucherCode = voucherData.code;
                    }
                } else {
                    throw new Error('Mã Voucher không tồn tại hoặc đã bị vô hiệu.');
                }
            }

            // Total cost guard
            if (Math.abs(serverTotal - Number(total_amount)) > 1) {
                console.warn(`POS Checkout mismatch: Client total ${total_amount}, Server total ${serverTotal}`);
                // In POS, we might accept client total or enforce server total. Let's enforce server total.
            }

            const isPending = Number(deposit_amount) > 0 && Number(deposit_amount) < serverTotal;

            // ── Pre-fetch for Transaction Reads ──
            const orderRef = db.collection('orders').doc();
            const orderId = orderRef.id;

            const staffSnap = await tx.get(db.collection('users').doc(caller.uid));
            const sData = staffSnap.data();
            const createdByName = sData?.displayName || sData?.name || (caller as { email?: string }).email || caller.uid;

            let custRef: FirebaseFirestore.DocumentReference | null = null;
            let custSnap: FirebaseFirestore.DocumentSnapshot | null = null;
            let incomingName = '';
            const rawPhone = customer_info?.phone;
            const normalizedPhoneResult = rawPhone ? normalizeVietnamPhone(rawPhone) : null;

            if (normalizedPhoneResult) {
                custRef = db.collection('customers').doc(normalizedPhoneResult.local);
                custSnap = await tx.get(custRef);
                incomingName = (customer_info?.name || '').trim();
            }

            let repairRef: FirebaseFirestore.DocumentReference | null = null;
            let repairSnap: FirebaseFirestore.DocumentSnapshot | null = null;
            if (repairTicketId) {
                repairRef = db.collection('repairs').doc(repairTicketId);
                repairSnap = await tx.get(repairRef);
            }

            // ── Construct Order Object ──
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
                ...(appliedVoucherCode ? { voucherCode: appliedVoucherCode, discountSource: 'voucher' } : {}),
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
                createdByName
            };

            // ── Commission Server-Side Calculation (Reads inside) ──
            if (!isPending) {
                await calculateAndSaveCommissionsServer(tx, { uid: caller.uid, displayName: createdByName as string }, 'order', { id: orderId, ...order } as Order);
            }

            // ==========================================
            // ── ALL WRITES START HERE ──
            // ==========================================

            const checkoutWarnings: string[] = [];

            if (!isPending && fifoDeductors.length > 0) {
                fifoResultsMap = executeFifoDeductionsWrites(tx, fifoDeductors, fifoLogsDataMap);
                
                // Analyze if preferred lots were fully satisfied
                for (const req of fifoDeductors) {
                    const results = fifoResultsMap.get(req.productId) || [];
                    for (const pref of req.preferredLotCodes || []) {
                        const fulfilledQty = results
                            .filter(r => r.lotCode === pref.lotCode)
                            .reduce((sum, r) => sum + r.quantity, 0);
                        
                        if (fulfilledQty < pref.quantity) {
                            const pData = productDocs.get(req.productId)?.data;
                            checkoutWarnings.push(`Sản phẩm "${pData?.name || req.productId}" yêu cầu lô ${pref.lotCode} (SL: ${pref.quantity}) nhưng chỉ có ${fulfilledQty}, phần còn lại lấy từ lô khác theo cấu hình (FIFO).`);
                        }
                    }
                }
            }

            // Stock Deduction
            for (const [productId, totalQty] of preAggregatedForStock.entries()) {
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
                        referenceId: orderId,
                        lotsDeducted: fifoResultsMap.get(productId) || [],
                        createdBy: caller.uid,
                        createdAt: FieldValue.serverTimestamp()
                    });
                }
            }

            tx.set(orderRef, order);

            // ── Increment Voucher Usage ──
            if (appliedVoucherCode && voucherRef && !isPending) {
                tx.update(voucherRef, {
                    usedCount: FieldValue.increment(1),
                });
            }

            // Customer Aggregate
            if (custRef && custSnap) {
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

                    if (appliedPersonalVoucher && appliedVoucherCode && !isPending) {
                        updateData['missions.bounty_redeemed'] = true;
                        updateData['missions.bountyVoucherCode'] = appliedVoucherCode;
                        updateData['missions.redeemedAt'] = FieldValue.serverTimestamp();
                        updateData['missions.redeemedOrderId'] = orderId;
                    }

                    tx.update(custRef, updateData);
                } else {
                    const newCust: Record<string, unknown> = {
                        phone: normalizedPhoneResult!.local,
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
                    };

                    if (appliedPersonalVoucher && appliedVoucherCode && !isPending) {
                        newCust.missions = {
                            bounty_redeemed: true,
                            bountyVoucherCode: appliedVoucherCode,
                            redeemedAt: FieldValue.serverTimestamp(),
                            redeemedOrderId: orderId,
                        };
                    }

                    tx.set(custRef, newCust);
                }

                // Ledger
                tx.set(db.collection('customer_ledger').doc(), {
                    customerId: normalizedPhoneResult!.local,
                    type: isPending ? 'deposit_order' : 'purchase_order',
                    amount: isPending ? (Number(deposit_amount) || 0) : serverTotal,
                    referenceId: orderId,
                    date: FieldValue.serverTimestamp()
                });
            }

            // Repair Ticket Link
            if (!isPending) {
                if (repairTicketId && repairRef && repairSnap && repairSnap.exists) {
                    const repairPrice = items.find((i: Record<string, unknown>) => i.isRepairTicket)?.price || 0;
                    tx.update(repairRef, {
                        'payment.status': 'paid',
                        status: 'out',
                        'payment.method': payment_method || 'CASH',
                        'payment.amount': repairPrice,
                        'payment.paidAt': FieldValue.serverTimestamp(),
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

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'pos_checkout',
                    referenceId: orderId
                });
            }

            return { success: true, orderId: orderId, warnings: checkoutWarnings };
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
