
import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import { calculateAndSaveCommissionsServer } from '@/lib/commissionCalcServer';
import type { Order, RepairTicket, WorkflowNode } from '@/lib/types';
import { PRODUCT_STATUS, isProductArchived } from '@/lib/productLifecycle';
import { normalizeVietnamPhone } from '@/lib/phone';
import { fetchFifoLogsForDeduction, executeFifoDeductionsWrites, type FifoDeductionResult } from '@/lib/inventoryFifo';
import { buildCompletedOrderRevenueDelta, incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { loadRepairWorkflow, requireWorkflowNode, workflowNodeHasFeature } from '@/lib/repairWorkflowServer';

function resolvePaymentCompletionTarget(workflow: WorkflowNode[], currentStatus: string) {
    const currentNode = requireWorkflowNode(workflow, currentStatus);
    if (currentNode.isTerminal) {
        return { targetStatus: currentNode.id, shouldCountCompletion: false };
    }

    const allowedTerminalNodes = (currentNode.allowedNext || [])
        .map(nextId => workflow.find(node => node.id === nextId))
        .filter((node): node is WorkflowNode => Boolean(node?.isTerminal));

    const commissionTerminal = allowedTerminalNodes.find(node =>
        workflowNodeHasFeature(node, 'enableTechnicianCommission')
        || workflowNodeHasFeature(node, 'enableSellerCommission')
    );
    const targetNode = commissionTerminal || (allowedTerminalNodes.length === 1 ? allowedTerminalNodes[0] : null);

    if (!targetNode) {
        throw new Error(`Trạng thái ${currentStatus} chưa có bước hoàn tất thanh toán hợp lệ trong workflow sửa chữa.`);
    }

    return { targetStatus: targetNode.id, shouldCountCompletion: true };
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_orders');

        const body = await request.json();
        const { idempotencyKey, repairTicketId, repairTicketIds, customer_info, items, discount_amount, total_amount, deposit_amount, payment_method, voucherCode } = body;

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'Giỏ hàng trống' }, { status: 400 });
        }

        const db = getAdminDb();
        const normalizeRepairTicketId = (value: unknown) => {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const syntheticMatch = raw.match(/^(.+)_(?:part_\d+|labor)$/);
            return syntheticMatch?.[1] || raw;
        };
        const normalizeOrderPaymentId = (value: unknown) => {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const syntheticMatch = raw.match(/^order_payment_(.+)$/);
            return syntheticMatch?.[1] || raw;
        };
        const getPaidAmount = (data: FirebaseFirestore.DocumentData) => {
            const history = Array.isArray(data.paymentHistory) ? data.paymentHistory : [];
            const paidFromHistory = history.reduce((sum, entry) => sum + (Number(entry?.amount) || 0), 0);
            return Math.max(Number(data.deposit_amount) || 0, paidFromHistory);
        };

        const result = await db.runTransaction(async (tx) => {
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed' && data.referenceId) {
                        return {
                            success: true,
                            fromCache: true,
                            orderId: data.referenceId,
                            debtOnly: data.debtOnly === true,
                            updatedOrderIds: Array.isArray(data.updatedOrderIds) ? data.updatedOrderIds : [],
                        };
                    }
                }
            }

            // Pre-aggregate for overall stock check
            const preAggregatedForStock = new Map<string, number>();
            // Pre-aggregate for FIFO deduction
            const fifoMap = new Map<string, { productId: string; quantity: number; preferredLotCodes: Map<string, number> }>();

            for (const item of items) {
                if (item.isRepairTicket || item.isOrderPayment) continue; // Bỏ qua check kho cho phiếu sửa chữa/thu nợ
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
            let orderPaymentSubtotal = 0;

            for (const item of items) {
                const pid = String(item.productId);
                const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
                const price = Number(item.price) || 0;

                if (item.isRepairTicket) {
                    const itemRepairTicketId = normalizeRepairTicketId(item.repairTicketId || item.productId);
                    normalizedItems.push({
                        id: pid,
                        productId: pid,
                        repairTicketId: itemRepairTicketId || undefined,
                        productName: item.productName || '[Phiếu sửa chữa]',
                        price,
                        quantity: qty,
                        image: '',
                        isRepairTicket: true
                    });
                    serverSubtotal += price * qty;
                    continue;
                }
                if (item.isOrderPayment) {
                    const itemOrderPaymentId = normalizeOrderPaymentId(item.orderPaymentId || item.productId);
                    normalizedItems.push({
                        id: pid,
                        productId: pid,
                        orderPaymentId: itemOrderPaymentId || undefined,
                        productName: item.productName || '[Thanh toán đơn hàng]',
                        price,
                        quantity: qty,
                        image: '',
                        isOrderPayment: true
                    });
                    const lineTotal = price * qty;
                    serverSubtotal += lineTotal;
                    orderPaymentSubtotal += lineTotal;
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

            const discountableSubtotal = Math.max(0, serverSubtotal - orderPaymentSubtotal);
            const serverDiscount = Math.min(Number(discount_amount) || 0, discountableSubtotal);
            const serverTotal = serverSubtotal - serverDiscount;
            const isDebtCollectionOnly = orderPaymentSubtotal > 0 && discountableSubtotal === 0;
            const hasRepairPayment = normalizedItems.some(item => item.isRepairTicket);
            const paidNow = Number(deposit_amount) || 0;
            const paymentMethodCode = String(payment_method || 'CASH').toUpperCase();

            if (orderPaymentSubtotal > 0 && discountableSubtotal > 0) {
                throw new Error('Vui lòng tách thu nợ đơn cũ và bán hàng mới thành 2 lần thanh toán riêng.');
            }
            if (isDebtCollectionOnly && voucherCode) {
                throw new Error('Không áp dụng voucher cho khoản thu nợ đơn cũ.');
            }

            // ── Voucher Validation for POS ──
            if (hasRepairPayment && !['CASH', 'BANK', 'MOMO'].includes(paymentMethodCode)) {
                throw new Error('Thanh toán phiếu sửa chữa phải thu ngay bằng tiền mặt, chuyển khoản hoặc ví.');
            }
            if (hasRepairPayment && paidNow + 1 < serverTotal) {
                throw new Error(`Thanh toán phiếu sửa chữa còn thiếu ${(serverTotal - paidNow).toLocaleString('vi-VN')}đ. Vui lòng thu đủ trước khi hoàn tất.`);
            }
            if (hasRepairPayment && paidNow - serverTotal > 1) {
                throw new Error(`Số tiền thu vượt tổng cần thanh toán ${serverTotal.toLocaleString('vi-VN')}đ.`);
            }

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
                        if (voucherData.minOrderValue && discountableSubtotal < voucherData.minOrderValue) {
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

            const isPending = !isDebtCollectionOnly && !hasRepairPayment && Number(deposit_amount) > 0 && Number(deposit_amount) < serverTotal;
            if (orderPaymentSubtotal > 0 && paymentMethodCode === 'DEBT') {
                throw new Error('Thu nợ đơn hàng phải thanh toán ngay bằng tiền mặt, chuyển khoản hoặc ví.');
            }

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

            const repairIdSet = new Set<string>();
            if (repairTicketId) repairIdSet.add(normalizeRepairTicketId(repairTicketId));
            if (Array.isArray(repairTicketIds)) {
                repairTicketIds.forEach((id: unknown) => {
                    const normalized = normalizeRepairTicketId(id);
                    if (normalized) repairIdSet.add(normalized);
                });
            }
            for (const item of items) {
                if (!item.isRepairTicket) continue;
                const normalized = normalizeRepairTicketId(item.repairTicketId || item.productId);
                if (normalized) repairIdSet.add(normalized);
            }

            const repairDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; snap: FirebaseFirestore.DocumentSnapshot }>();
            for (const id of repairIdSet) {
                const ref = db.collection('repairs').doc(id);
                const snap = await tx.get(ref);
                if (snap.exists) {
                    repairDocs.set(id, { ref, snap });
                }
            }

            const repairPaymentTotals = new Map<string, number>();
            for (const item of items) {
                if (!item.isRepairTicket) continue;
                const itemRepairTicketId = normalizeRepairTicketId(item.repairTicketId || item.productId);
                if (!itemRepairTicketId || !repairDocs.has(itemRepairTicketId)) continue;
                const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
                const price = Number(item.price) || 0;
                repairPaymentTotals.set(itemRepairTicketId, (repairPaymentTotals.get(itemRepairTicketId) || 0) + price * qty);
            }

            const orderPaymentIdSet = new Set<string>();
            for (const item of items) {
                if (!item.isOrderPayment) continue;
                const normalized = normalizeOrderPaymentId(item.orderPaymentId || item.productId);
                if (normalized) orderPaymentIdSet.add(normalized);
            }

            const orderPaymentDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; snap: FirebaseFirestore.DocumentSnapshot }>();
            for (const id of orderPaymentIdSet) {
                const ref = db.collection('orders').doc(id);
                const snap = await tx.get(ref);
                if (!snap.exists) {
                    throw new Error(`Đơn hàng #${id.slice(-6)} không tồn tại.`);
                }
                orderPaymentDocs.set(id, { ref, snap });
            }

            const orderPaymentRequestedTotals = new Map<string, number>();
            for (const item of items) {
                if (!item.isOrderPayment) continue;
                const itemOrderPaymentId = normalizeOrderPaymentId(item.orderPaymentId || item.productId);
                if (!itemOrderPaymentId || !orderPaymentDocs.has(itemOrderPaymentId)) continue;
                const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
                const price = Number(item.price) || 0;
                orderPaymentRequestedTotals.set(itemOrderPaymentId, (orderPaymentRequestedTotals.get(itemOrderPaymentId) || 0) + price * qty);
            }

            const collectedDebtAmount = isDebtCollectionOnly
                ? (Number(deposit_amount) > 0 ? Number(deposit_amount) : orderPaymentSubtotal)
                : orderPaymentSubtotal;
            if (isDebtCollectionOnly && collectedDebtAmount <= 0) {
                throw new Error('Vui lòng nhập số tiền khách thanh toán.');
            }
            if (isDebtCollectionOnly && collectedDebtAmount - orderPaymentSubtotal > 1) {
                throw new Error(`Số tiền thu nợ vượt số còn lại ${orderPaymentSubtotal.toLocaleString('vi-VN')}đ.`);
            }

            const orderPaymentTotals = new Map<string, number>();
            let remainingDebtCollectionAmount = collectedDebtAmount;
            for (const [id, requestedAmount] of orderPaymentRequestedTotals.entries()) {
                const paymentAmount = isDebtCollectionOnly
                    ? Math.min(requestedAmount, Math.max(0, remainingDebtCollectionAmount))
                    : requestedAmount;
                if (paymentAmount > 0) {
                    orderPaymentTotals.set(id, paymentAmount);
                    remainingDebtCollectionAmount -= paymentAmount;
                }
            }

            for (const [id, paymentAmount] of orderPaymentTotals.entries()) {
                const orderPaymentDoc = orderPaymentDocs.get(id);
                const orderData = orderPaymentDoc?.snap.data() || {};
                const totalOrderAmount = Number(orderData.total_amount) || 0;
                const remainingAmount = Math.max(0, totalOrderAmount - getPaidAmount(orderData));
                if (remainingAmount <= 0) {
                    throw new Error(`Đơn hàng #${id.slice(-6)} đã thanh toán đủ.`);
                }
                if (paymentAmount - remainingAmount > 1) {
                    throw new Error(`Số tiền thu cho đơn #${id.slice(-6)} vượt số còn lại ${remainingAmount.toLocaleString('vi-VN')}đ.`);
                }
            }

            const orderPaymentTotal = Array.from(orderPaymentTotals.values()).reduce((sum, amount) => sum + amount, 0);
            const updatedOrderIds = Array.from(orderPaymentTotals.keys());
            const debtPaymentReferenceId = updatedOrderIds.length === 1 ? updatedOrderIds[0] : (idempotencyKey || orderId);

            const repairCompletionTargets = new Map<string, { targetStatus: string; shouldCountCompletion: boolean }>();
            for (const [id, repairDoc] of repairDocs.entries()) {
                if (!repairPaymentTotals.has(id)) continue;
                const repairTicket = repairDoc.snap.data() as RepairTicket;
                const workflow = await loadRepairWorkflow(tx, db, repairTicket);
                repairCompletionTargets.set(id, resolvePaymentCompletionTarget(workflow, repairTicket.status));
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
                discount_amount: serverDiscount,
                deposit_amount: Number(deposit_amount) || 0,
                total_amount: serverTotal,
                ...(appliedVoucherCode ? { voucherCode: appliedVoucherCode, discountSource: 'voucher' } : {}),
                status: isPending ? 'Pending' : 'Completed',
                source: 'pos',
                containsRepairPayment: repairPaymentTotals.size > 0,
                repairTicketIds: Array.from(repairPaymentTotals.keys()),
                containsOrderPayment: orderPaymentTotals.size > 0,
                orderPaymentIds: Array.from(orderPaymentTotals.keys()),
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
            const commissionableItems = normalizedItems.filter((item) => !item.isOrderPayment);
            const commissionableTotal = Math.max(0, serverTotal - orderPaymentTotal);
            if (!isDebtCollectionOnly && !isPending && commissionableItems.length > 0 && commissionableTotal > 0) {
                await calculateAndSaveCommissionsServer(tx, { uid: caller.uid, displayName: createdByName as string }, 'order', {
                    id: orderId,
                    ...order,
                    items: commissionableItems,
                    subtotal_amount: Math.max(0, serverSubtotal - orderPaymentTotal),
                    total_amount: commissionableTotal,
                } as unknown as Order);
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

            if (!isDebtCollectionOnly) {
                tx.set(orderRef, order);
            }
            if (!isDebtCollectionOnly && !isPending) {
                const retailItems = normalizedItems.filter((item) => !item.isRepairTicket && !item.isOrderPayment);
                const retailSubtotal = retailItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
                const retailDiscount = Math.min(serverDiscount, retailSubtotal);
                const retailTotal = Math.max(0, retailSubtotal - retailDiscount);
                const repairRevenue = Array.from(repairPaymentTotals.values()).reduce((sum, amount) => sum + amount, 0);

                if (retailItems.length > 0) {
                    incrementRevenueAggregates(
                        tx,
                        db,
                        buildCompletedOrderRevenueDelta({
                            id: orderId,
                            ...order,
                            items: retailItems,
                            subtotal_amount: retailSubtotal,
                            discount_amount: retailDiscount,
                            total_amount: retailTotal,
                            paymentHistory: retailTotal > 0 ? [{
                                type: 'full',
                                amount: retailTotal,
                                timestamp: Date.now(),
                                note: `Doanh thu POS retail - ${payment_method || 'CASH'}`
                            }] : [],
                        } as unknown as Order),
                    );
                }
                if (repairRevenue > 0) {
                    const repairCount = Array.from(repairCompletionTargets.values())
                        .filter(target => target.shouldCountCompletion)
                        .length;
                    incrementRevenueAggregates(tx, db, { repairRevenue, repairCount });
                }
            }

            // ── Increment Voucher Usage ──
            if (!isDebtCollectionOnly && appliedVoucherCode && voucherRef && !isPending) {
                tx.update(voucherRef, {
                    usedCount: FieldValue.increment(1),
                });
            }

            // Customer Aggregate
            const customerSpendDelta = !isPending && !isDebtCollectionOnly ? Math.max(0, serverTotal - orderPaymentTotal) : 0;
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

                    if (customerSpendDelta > 0) {
                        updateData.totalSpent = FieldValue.increment(customerSpendDelta);
                        updateData.totalOrders = FieldValue.increment(1);
                    }
                    if (!isPending && orderPaymentTotal > 0) {
                        updateData.totalDebt = FieldValue.increment(-orderPaymentTotal);
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
                        totalSpent: customerSpendDelta,
                        totalOrders: customerSpendDelta > 0 ? 1 : 0,
                        totalRepairs: 0,
                        totalAppointments: 0,
                        totalDebt: 0,
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

                const ledgerPurchaseAmount = isPending ? (Number(deposit_amount) || 0) : customerSpendDelta;
                if (ledgerPurchaseAmount > 0) {
                    tx.set(db.collection('customer_ledger').doc(), {
                        customerId: normalizedPhoneResult!.local,
                        type: isPending ? 'deposit_order' : 'purchase_order',
                        amount: ledgerPurchaseAmount,
                        referenceId: orderId,
                        date: FieldValue.serverTimestamp()
                    });
                }
                if (!isPending && orderPaymentTotal > 0) {
                    tx.set(db.collection('customer_ledger').doc(), {
                        customerId: normalizedPhoneResult!.local,
                        type: 'debt_payment',
                        amount: orderPaymentTotal,
                        referenceId: debtPaymentReferenceId,
                        date: FieldValue.serverTimestamp()
                    });
                }
            }

            // Repair Ticket Link
            if (!isPending) {
                for (const [id, repairPrice] of repairPaymentTotals.entries()) {
                    const repairDoc = repairDocs.get(id);
                    const completionTarget = repairCompletionTargets.get(id);
                    if (!repairDoc) continue;
                    if (!completionTarget) continue;
                    tx.update(repairDoc.ref, {
                        'payment.status': 'paid',
                        status: completionTarget.targetStatus,
                        'payment.method': payment_method || 'CASH',
                        'payment.amount': repairPrice,
                        'payment.paidAt': FieldValue.serverTimestamp(),
                        completedAt: FieldValue.serverTimestamp(),
                        'timing.completedAt': FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                        statusTimeline: FieldValue.arrayUnion({
                            eventType: 'pos_repair_payment',
                            status: completionTarget.targetStatus,
                            timestamp: Date.now(),
                            by: caller.uid,
                            actorId: caller.uid,
                            actorName: createdByName,
                            actorRole: caller.role,
                            fromStatus: repairDoc.snap.data()?.status || null,
                            toStatus: completionTarget.targetStatus,
                            source: 'pos',
                            requestId: idempotencyKey || null,
                            note: `Thanh toán POS #${orderId.slice(-6)}`
                        }),
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

            // Existing order debt payment link
            if (!isPending) {
                for (const [id, paymentAmount] of orderPaymentTotals.entries()) {
                    const orderPaymentDoc = orderPaymentDocs.get(id);
                    if (!orderPaymentDoc) continue;
                    const orderData = orderPaymentDoc.snap.data() || {};
                    const totalOrderAmount = Number(orderData.total_amount) || 0;
                    const paidSoFar = getPaidAmount(orderData);
                    const newPaidSoFar = Math.min(totalOrderAmount, paidSoFar + paymentAmount);
                    const remainingAfterPayment = Math.max(0, totalOrderAmount - newPaidSoFar);
                    const paymentHistory = Array.isArray(orderData.paymentHistory) ? orderData.paymentHistory : [];
                    const paymentIndex = paymentHistory.filter(entry => {
                        const type = String(entry?.type || '');
                        return type === 'debt_payment' || type === 'payment' || type === 'deposit' || type === 'full';
                    }).length + 1;
                    const isFullyPaid = Math.abs(totalOrderAmount - newPaidSoFar) <= 1;

                    tx.update(orderPaymentDoc.ref, {
                        deposit_amount: newPaidSoFar,
                        paymentStatus: isFullyPaid ? 'paid' : 'debt',
                        ...(isFullyPaid ? {
                            status: 'Completed',
                            completedAt: orderData.completedAt || FieldValue.serverTimestamp(),
                        } : {}),
                        updatedAt: FieldValue.serverTimestamp(),
                        paymentHistory: FieldValue.arrayUnion({
                            type: 'debt_payment',
                            amount: paymentAmount,
                            method: payment_method || 'CASH',
                            timestamp: Date.now(),
                            referenceId: idempotencyKey || null,
                            paymentIndex,
                            paidAfter: newPaidSoFar,
                            remainingAfter: remainingAfterPayment,
                            note: `Thu nợ tại POS lần ${paymentIndex}: ${paymentAmount.toLocaleString('vi-VN')}đ`
                        })
                    });
                }

                if (normalizedPhoneResult && orderPaymentTotal > 0) {
                    tx.set(db.collection('customer_transactions').doc(), {
                        customerId: normalizedPhoneResult.local,
                        customerName: incomingName || customer_info?.name || 'Khách lẻ',
                        type: 'PAYMENT',
                        amount: orderPaymentTotal,
                        orderIds: updatedOrderIds,
                        note: 'Thu nợ tại POS',
                        createdBy: caller.uid,
                        createdByName,
                        createdAt: FieldValue.serverTimestamp()
                    });
                }
            }

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: isDebtCollectionOnly ? 'pos_debt_collection' : 'pos_checkout',
                    referenceId: isDebtCollectionOnly ? debtPaymentReferenceId : orderId,
                    debtOnly: isDebtCollectionOnly,
                    updatedOrderIds
                });
            }

            return {
                success: true,
                orderId: isDebtCollectionOnly ? debtPaymentReferenceId : orderId,
                updatedOrderIds,
                debtOnly: isDebtCollectionOnly,
                warnings: checkoutWarnings
            };
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
