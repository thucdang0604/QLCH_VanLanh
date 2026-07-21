
import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import { calculateAndSaveCommissionsServer, getActiveRulesServer } from '@/lib/commissionCalcServer';
import type { Order, Product, RepairTicket, WorkflowNode } from '@/lib/types';
import { PRODUCT_STATUS, isProductArchived } from '@/lib/productLifecycle';
import { normalizeVietnamPhone } from '@/lib/phone';
import { buildContactMethods, buildContactSearchKeywords, buildContactlessDocumentBaseId, getPrimaryContact, hasDebtSafeContact, mergeContactMethods } from '@/lib/contactIdentity';
import type { ContactMethod, ContactMethodType } from '@/lib/types/contact';
import { fetchFifoLogsForDeduction, executeFifoDeductionsWrites, type FifoDeductionResult, type FifoDeductor, type FifoReadMetric } from '@/lib/inventoryFifo';
import { buildCompletedOrderRevenueDelta, buildPaymentChannelRevenueDelta, incrementRevenueAggregates, mergeRevenueAggregateDeltas } from '@/lib/revenueAggregateServer';
import { getWorkflowFromSettings, requireWorkflowNode, workflowNodeHasFeature } from '@/lib/repairWorkflowServer';
import { isSelectedRepairPart } from '@/lib/repairStatus';
import { reserveSequentialDocumentIdGroups, type ReservedSequentialDocumentId } from '@/lib/serverDocumentIds';
import { queueCashierShiftTally } from '@/lib/cashierShiftTallyServer';
import type { RepairWorkflowSettings } from '@/lib/repairWorkflowConfig';
import type { RevenueAggregateDelta } from '@/lib/revenueAggregate';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

type CheckoutItemInput = Record<string, unknown> & {
    isRepairTicket?: boolean;
    isOrderPayment?: boolean;
    productId?: unknown;
    quantity?: unknown;
    price?: unknown;
    lotCode?: unknown;
    repairTicketId?: unknown;
    orderPaymentId?: unknown;
    productName?: unknown;
    id?: unknown;
    imeis?: unknown;
};

function readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeIncomingContactType(value: unknown): ContactMethodType | undefined {
    const raw = readString(value).toLowerCase();
    if (!raw) return undefined;
    if (['phone', 'sdt', 'sđt', 'so dien thoai', 'số điện thoại'].includes(raw)) return 'phone';
    if (raw === 'zalo') return 'zalo';
    if (['facebook', 'messenger', 'fb'].includes(raw)) return 'facebook';
    if (raw === 'email') return 'email';
    if (['address', 'dia chi', 'địa chỉ'].includes(raw)) return 'address';
    if (['note', 'ghi chu', 'ghi chú'].includes(raw)) return 'note';
    if (['other', 'khac', 'khác'].includes(raw)) return 'other';
    return undefined;
}

function buildIncomingCustomerContact(customerInfo: Record<string, unknown>) {
    return {
        name: readString(customerInfo.name),
        phone: readString(customerInfo.phone),
        zalo: readString(customerInfo.zalo),
        facebook: readString(customerInfo.facebook),
        email: readString(customerInfo.email),
        address: readString(customerInfo.address),
        note: readString(customerInfo.note),
        other: readString(customerInfo.otherContact || customerInfo.other),
        primaryType: normalizeIncomingContactType(customerInfo.primaryContactType),
        source: 'pos' as const,
    };
}

function getCustomerContactMethodsFromData(data: FirebaseFirestore.DocumentData | undefined): ContactMethod[] {
    return Array.isArray(data?.contactMethods) ? data.contactMethods as ContactMethod[] : [];
}

function getCashierShiftChannel(paymentMethodCode: string): 'cash' | 'bank' | 'none' {
    const normalized = paymentMethodCode.trim().toUpperCase();
    if (normalized === 'CASH') return 'cash';
    if (normalized === 'BANK' || normalized === 'QR' || normalized === 'CARD' || normalized === 'MOMO') return 'bank';
    return 'none';
}

const ACTIVE_SHIFT_LOCK_COLLECTION = 'system_counters';
const ACTIVE_SHIFT_LOCK_ID = 'active_cashier_shift';

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

function readNonNegativeAmount(value: unknown, label: string): number {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${label} khong hop le.`);
    }
    return amount;
}

function readOptionalNonNegativeAmount(value: unknown, label: string): number {
    if (value === undefined || value === null || value === '') return 0;
    return readNonNegativeAmount(value, label);
}

function readPositiveQuantity(value: unknown, label: string): number {
    if (value === undefined || value === null || value === '') return 1;
    const quantity = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`${label} khong hop le.`);
    }
    const normalizedQuantity = Math.floor(quantity);
    if (normalizedQuantity <= 0) {
        throw new Error(`${label} khong hop le.`);
    }
    return normalizedQuantity;
}

function getRepairPaymentAmount(ticket: RepairTicket, ticketId: string): number {
    const amount = readNonNegativeAmount(ticket.payment?.amount, `So tien phieu sua chua #${ticketId.slice(-6)}`);
    if (amount <= 0) {
        throw new Error(`Phieu sua chua #${ticketId.slice(-6)} khong co so tien can thu hop le.`);
    }
    return amount;
}

function getRepairPaidAmount(ticket: RepairTicket): number {
    const paidFromHistory = (ticket.paymentHistory || []).reduce((sum, payment) => {
        const amount = Math.max(0, Number(payment.amount) || 0);
        return payment.type === 'refund' ? sum - amount : sum + amount;
    }, 0);
    return Math.max(0, Math.max(Number(ticket.payment?.depositAmount) || 0, paidFromHistory));
}

export const POST = withApi({
    name: 'pos/checkout',
    onError: (error, context) => {
        const message = getApiErrorMessage(error);
        const normalizedMessage = message.toLowerCase();
        const fallbackStatus = normalizedMessage.includes('mở ca thu ngân') || normalizedMessage.includes('mo ca thu ngan')
            ? 409
            : normalizedMessage.includes('không') || normalizedMessage.includes('khong')
                ? 400
                : 500;
        return context.error(message, getApiErrorStatus(error, fallbackStatus));
    },
}, async (request: NextRequest, context) => {
    const startedAt = Date.now();
    const debugTiming: Record<string, unknown> = {};
    let lastTimingMark = startedAt;
    const markTiming = (key: string) => {
        const now = Date.now();
        debugTiming[key] = now - lastTimingMark;
        lastTimingMark = now;
    };
    const transactionAttempts: Array<{ attempt: number; steps: Record<string, number>; fifoReads: FifoReadMetric[]; fifoSkippedLegacyProductIds: string[]; callbackMs: number }> = [];
    let activeTransactionAttempt: { attempt: number; startedAt: number; lastMark: number; steps: Record<string, number>; fifoReads: FifoReadMetric[]; fifoSkippedLegacyProductIds: string[] } | null = null;
    const beginTransactionAttempt = () => {
        const now = Date.now();
        activeTransactionAttempt = {
            attempt: transactionAttempts.length + 1,
            startedAt: now,
            lastMark: now,
            steps: {},
            fifoReads: [],
            fifoSkippedLegacyProductIds: [],
        };
    };
    const markTransaction = (key: string) => {
        if (!activeTransactionAttempt) return;
        const now = Date.now();
        activeTransactionAttempt.steps[key] = now - activeTransactionAttempt.lastMark;
        activeTransactionAttempt.lastMark = now;
    };
    const recordTransactionDuration = (key: string, durationMs: number) => {
        if (!activeTransactionAttempt) return;
        activeTransactionAttempt.steps[key] = durationMs;
    };
    const recordFifoRead = (metric: FifoReadMetric) => {
        activeTransactionAttempt?.fifoReads.push(metric);
    };
    const recordSkippedLegacyFifoProduct = (productId: string) => {
        if (!activeTransactionAttempt || activeTransactionAttempt.fifoSkippedLegacyProductIds.includes(productId)) return;
        activeTransactionAttempt.fifoSkippedLegacyProductIds.push(productId);
    };
    const finishTransactionAttempt = () => {
        if (!activeTransactionAttempt) return;
        transactionAttempts.push({
            attempt: activeTransactionAttempt.attempt,
            steps: activeTransactionAttempt.steps,
            fifoReads: activeTransactionAttempt.fifoReads.sort((left, right) => left.productId.localeCompare(right.productId)),
            fifoSkippedLegacyProductIds: activeTransactionAttempt.fifoSkippedLegacyProductIds.sort(),
            callbackMs: Date.now() - activeTransactionAttempt.startedAt,
        });
        activeTransactionAttempt = null;
    };
    try {
        const caller = await requirePermission(request, 'manage_orders', (authSteps) => {
            debugTiming.authSteps = authSteps;
        });
        markTiming('auth');

        const body = await context.readJson(request);
        const { idempotencyKey, repairTicketId, repairTicketIds, customer_info, items, discount_amount, total_amount, deposit_amount, deposit_payment_method, payment_method, voucherCode, use_surplus_to_pay_debt, cashierShiftId } = body;
        markTiming('parseBody');

        if (!Array.isArray(items) || items.length === 0) {
            return context.error('Giỏ hàng trống');
        }

        const checkoutItems = items.map((item: unknown, index: number) => {
            if (!item || typeof item !== 'object') {
                throw new Error(`Dong hang #${index + 1} khong hop le.`);
            }
            return item as CheckoutItemInput;
        });
        const submittedDiscountAmount = readOptionalNonNegativeAmount(discount_amount, 'Giam gia');
        const submittedDepositAmount = readOptionalNonNegativeAmount(deposit_amount, 'So tien khach tra');
        const submittedTotalAmount = total_amount === undefined || total_amount === null || total_amount === ''
            ? null
            : readNonNegativeAmount(total_amount, 'Tong tien');

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

        const customerInfoRecord = (customer_info && typeof customer_info === 'object' ? customer_info : {}) as Record<string, unknown>;
        const incomingContactInput = buildIncomingCustomerContact(customerInfoRecord);
        const incomingContactMethods = buildContactMethods(incomingContactInput);
        const incomingPrimaryContact = getPrimaryContact(incomingContactMethods);
        const requestedCustomerId = readString(customerInfoRecord.customerId || customerInfoRecord.id);
        const rawPhone = incomingContactInput.phone;
        const normalizedPhoneResult = rawPhone ? normalizeVietnamPhone(rawPhone) : null;
        const resolvedCustomerId = normalizedPhoneResult?.local
            || requestedCustomerId
            || (
                incomingContactMethods.length > 0 && incomingContactInput.name && incomingContactInput.name !== 'Khách lẻ'
                    ? buildContactlessDocumentBaseId('KH', incomingContactInput)
                    : ''
            );
        const requestedCashierShiftId = readString(cashierShiftId);
        const repairIdSet = new Set<string>();
        if (repairTicketId) repairIdSet.add(normalizeRepairTicketId(repairTicketId));
        if (Array.isArray(repairTicketIds)) {
            repairTicketIds.forEach((id: unknown) => {
                const normalized = normalizeRepairTicketId(id);
                if (normalized) repairIdSet.add(normalized);
            });
        }
        for (const item of checkoutItems) {
            if (!item.isRepairTicket) continue;
            const normalized = normalizeRepairTicketId(item.repairTicketId || item.productId);
            if (normalized) repairIdSet.add(normalized);
        }
        const orderPaymentIdSet = new Set<string>();
        for (const item of checkoutItems) {
            if (!item.isOrderPayment) continue;
            const normalized = normalizeOrderPaymentId(item.orderPaymentId || item.productId);
            if (normalized) orderPaymentIdSet.add(normalized);
        }
        const retailProductIds = Array.from(new Set(checkoutItems
            .filter(item => !item.isRepairTicket && !item.isOrderPayment)
            .map(item => String(item.productId || ''))));
        const shouldCalculateCommission = checkoutItems.some(item => !item.isOrderPayment);
        let activeCommissionRulesPromise: ReturnType<typeof getActiveRulesServer> | null = null;

        const result = await db.runTransaction(async (tx) => {
            beginTransactionAttempt();
            try {
            const opRef = idempotencyKey ? db.collection('operation_requests').doc(idempotencyKey) : null;
            const productRefs = retailProductIds.map(productId => db.collection('products').doc(productId));
            const customerRef = resolvedCustomerId ? db.collection('customers').doc(resolvedCustomerId) : null;
            const repairRefs = Array.from(repairIdSet, id => db.collection('repairs').doc(id));
            const orderPaymentRefs = Array.from(orderPaymentIdSet, id => db.collection('orders').doc(id));
            const requestedCashierShiftRef = requestedCashierShiftId
                ? db.collection('cashier_shifts').doc(requestedCashierShiftId)
                : null;
            const activeShiftLockRef = db.collection(ACTIVE_SHIFT_LOCK_COLLECTION).doc(ACTIVE_SHIFT_LOCK_ID);
            const taxonomyRef = db.collection('system_config').doc('taxonomy_settings');
            const repairSettingsRef = repairRefs.length > 0 ? db.collection('system_config').doc('repairs') : null;
            const coreReadRefs = [
                ...(opRef ? [opRef] : []),
                taxonomyRef,
                ...productRefs,
                ...(customerRef ? [customerRef] : []),
                ...repairRefs,
                ...orderPaymentRefs,
                ...(requestedCashierShiftRef ? [activeShiftLockRef] : []),
                ...(requestedCashierShiftRef ? [requestedCashierShiftRef] : []),
                ...(repairSettingsRef ? [repairSettingsRef] : []),
            ];
            const coreSnapshots = await tx.getAll(...coreReadRefs);
            const snapshotsByPath = new Map(coreSnapshots.map(snapshot => [snapshot.ref.path, snapshot]));
            const getCoreSnapshot = (ref: FirebaseFirestore.DocumentReference) => snapshotsByPath.get(ref.path);
            markTransaction('readCoreDocuments');

            const opSnap = opRef ? getCoreSnapshot(opRef) : null;
            if (opSnap?.exists) {
                const data = opSnap.data();
                if (data?.status === 'completed' && data.referenceId) {
                    return {
                        success: true,
                        fromCache: true,
                        orderId: data.referenceId,
                        debtOnly: data.debtOnly === true,
                        cashierShiftChanged: data.cashierShiftChanged === true,
                        updatedOrderIds: Array.isArray(data.updatedOrderIds) ? data.updatedOrderIds : [],
                    };
                }
            }
            if (shouldCalculateCommission && !activeCommissionRulesPromise) {
                activeCommissionRulesPromise = getActiveRulesServer();
            }

            // Pre-aggregate for overall stock check
            const preAggregatedForStock = new Map<string, number>();
            const repairAggregatedForStock = new Map<string, { quantity: number; reservedQuantity: number; productName: string }>();
            // Pre-aggregate for FIFO deduction
            const fifoMap = new Map<string, { productId: string; quantity: number; preferredLotCodes: Map<string, number> }>();
            const addFifoDeduction = (productId: string, quantity: number, lotCode?: string) => {
                let fifoItem = fifoMap.get(productId);
                if (!fifoItem) {
                    fifoItem = { productId, quantity: 0, preferredLotCodes: new Map<string, number>() };
                    fifoMap.set(productId, fifoItem);
                }
                fifoItem.quantity += quantity;
                if (lotCode) {
                    fifoItem.preferredLotCodes.set(lotCode, (fifoItem.preferredLotCodes.get(lotCode) || 0) + quantity);
                }
            };

            for (const item of checkoutItems) {
                if (item.isRepairTicket || item.isOrderPayment) continue; // Bỏ qua check kho cho phiếu sửa chữa/thu nợ
                const pid = String(item.productId || '');
                const qty = readPositiveQuantity(item.quantity, `So luong san pham ${pid || 'khong ro'}`);
                const lot = item.lotCode ? String(item.lotCode) : undefined;
                
                preAggregatedForStock.set(pid, (preAggregatedForStock.get(pid) || 0) + qty);

                addFifoDeduction(pid, qty, lot);
            }

            let fifoResultsMap = new Map<string, FifoDeductionResult[]>();
            let fifoLogsDataMap: Awaited<ReturnType<typeof fetchFifoLogsForDeduction>> = new Map();
            let fifoDeductors: FifoDeductor[] = [];
            let fifoLotReadDeductors: FifoDeductor[] = [];
            const inventoryTrackingModeUpdates = new Map<string, 'legacy' | 'fifo'>();

            const productDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }>();
            for (const pRef of productRefs) {
                const pSnap = getCoreSnapshot(pRef);
                if (!pSnap?.exists) {
                    throw new Error(`Sản phẩm (ID: ${pRef.id}) không tồn tại.`);
                }
                productDocs.set(pRef.id, { ref: pRef, data: (pSnap.data() || {}) as FirebaseFirestore.DocumentData });
            }
            const taxonomySnap = getCoreSnapshot(taxonomyRef);
            const retailTrees = taxonomySnap?.data()?.taxonomy?.retail || [];
            const createdByName = caller.displayName || caller.name || (caller as { email?: string }).email || caller.uid;
            const custRef = customerRef;
            const custSnap = customerRef ? getCoreSnapshot(customerRef) || null : null;
            const incomingName = customerRef ? incomingContactInput.name : '';
            const repairDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; snap: FirebaseFirestore.DocumentSnapshot }>();
            for (const ref of repairRefs) {
                const snap = getCoreSnapshot(ref);
                if (!snap?.exists) {
                    throw new Error(`Phieu sua chua #${ref.id.slice(-6)} khong ton tai.`);
                }
                repairDocs.set(ref.id, { ref, snap });
            }
            const orderPaymentDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; snap: FirebaseFirestore.DocumentSnapshot }>();
            for (const ref of orderPaymentRefs) {
                const snap = getCoreSnapshot(ref);
                if (!snap?.exists) {
                    throw new Error(`Đơn hàng #${ref.id.slice(-6)} không tồn tại.`);
                }
                orderPaymentDocs.set(ref.id, { ref, snap });
            }
            const requestedCashierShiftSnap = requestedCashierShiftRef ? getCoreSnapshot(requestedCashierShiftRef) || null : null;
            const activeShiftLockSnap = getCoreSnapshot(activeShiftLockRef) || null;
            const repairSettingsSnap = repairSettingsRef ? getCoreSnapshot(repairSettingsRef) || null : null;

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

            for (const item of checkoutItems) {
                const pid = String(item.productId);
                const qty = readPositiveQuantity(item.quantity, `So luong san pham ${pid || 'khong ro'}`);
                const price = readNonNegativeAmount(item.price, `Gia dong hang ${pid || 'khong ro'}`);

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
            const serverDiscount = Math.min(submittedDiscountAmount, discountableSubtotal);
            const currentOrderTotal = Math.max(0, discountableSubtotal - serverDiscount);
            const serverTotal = currentOrderTotal + orderPaymentSubtotal;
            const isDebtCollectionOnly = orderPaymentSubtotal > 0 && discountableSubtotal === 0;
            const paymentMethodCode = String(payment_method || 'CASH').toUpperCase();
            // If payment method is not DEBT, and deposit is not provided/0, treat as fully paid for the whole POS receipt.
            const paymentReceived = (paymentMethodCode !== 'DEBT' && submittedDepositAmount === 0)
                ? serverTotal
                : submittedDepositAmount;
            const paidNow = !isDebtCollectionOnly ? Math.min(paymentReceived, currentOrderTotal) : 0;
            const depositPaymentMethodCode = String(deposit_payment_method || '').trim().toUpperCase();
            const receivedPaymentMethodCode = paymentMethodCode === 'DEBT' && paidNow > 0
                ? depositPaymentMethodCode
                : paymentMethodCode;

            if (paymentMethodCode === 'DEBT' && paidNow > 0 && !['CASH', 'BANK', 'MOMO', 'QR', 'CARD'].includes(receivedPaymentMethodCode)) {
                throw new Error('Vui lòng chọn kênh tiền mặt hoặc chuyển khoản/QR cho khoản khách đã đưa.');
            }

            if (paymentMethodCode === 'DEBT' && orderPaymentSubtotal > 0 && discountableSubtotal > 0) {
                throw new Error('Vui lòng tách thu nợ đơn cũ và bán hàng mới thành 2 lần thanh toán riêng.');
            }
            if (isDebtCollectionOnly && voucherCode) {
                throw new Error('Không áp dụng voucher cho khoản thu nợ đơn cũ.');
            }

            markTransaction('normalizeTotals');

            let voucherRef: FirebaseFirestore.DocumentReference | null = null;
            let appliedVoucherCode: string | undefined;
            let appliedPersonalVoucher = false;

            if (voucherCode && typeof voucherCode === 'string') {
                const voucherQuery = await tx.get(db.collection('vouchers')
                    .where('code', '==', voucherCode.trim().toUpperCase())
                    .where('isActive', '==', true)
                    .limit(2));
                if (voucherQuery.size > 1) {
                    throw new Error('Mã Voucher đang bị trùng dữ liệu. Vui lòng tắt hoặc gộp mã trùng trước khi sử dụng.');
                }
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
            markTransaction('voucher');

            // Total cost guard
            if (submittedTotalAmount !== null && Math.abs(serverTotal - submittedTotalAmount) > 1) {
                console.warn(`POS Checkout mismatch: Client total ${total_amount}, Server total ${serverTotal}`);
                // In POS, we might accept client total or enforce server total. Let's enforce server total.
            }

            const isPending = false;
            if (orderPaymentSubtotal > 0 && paymentMethodCode === 'DEBT') {
                throw new Error('Thu nợ đơn hàng phải thanh toán ngay bằng tiền mặt, chuyển khoản hoặc ví.');
            }

            const repairPaymentRequestedTotals = new Map<string, number>();
            const repairPaymentTotals = new Map<string, number>();
            for (const item of checkoutItems) {
                if (!item.isRepairTicket) continue;
                const itemRepairTicketId = normalizeRepairTicketId(item.repairTicketId || item.productId);
                if (!itemRepairTicketId || !repairDocs.has(itemRepairTicketId)) {
                    throw new Error('Phieu sua chua trong gio hang khong hop le.');
                }
                const qty = readPositiveQuantity(item.quantity, `So luong phieu sua #${itemRepairTicketId.slice(-6)}`);
                const price = readNonNegativeAmount(item.price, `Tien phieu sua #${itemRepairTicketId.slice(-6)}`);
                repairPaymentRequestedTotals.set(itemRepairTicketId, (repairPaymentRequestedTotals.get(itemRepairTicketId) || 0) + price * qty);
            }
            for (const [id, requestedAmount] of repairPaymentRequestedTotals.entries()) {
                const repairDoc = repairDocs.get(id);
                if (!repairDoc) continue;
                const repairTicket = repairDoc.snap.data() as RepairTicket;
                if (repairTicket.payment?.status === 'paid') {
                    throw new Error(`Phieu sua chua #${id.slice(-6)} da thanh toan.`);
                }
                if (repairTicket.payment?.outstandingOrderId) {
                    throw new Error(`Phieu sua chua #${id.slice(-6)} da co hoa don ghi no. Vui long thu no tren hoa don da tao de tranh thu trung.`);
                }
                const expectedAmount = getRepairPaymentAmount(repairTicket, id);
                if (Math.abs(requestedAmount - expectedAmount) > 1) {
                    throw new Error(`So tien phieu sua chua #${id.slice(-6)} khong khop he thong.`);
                }
                repairPaymentTotals.set(id, expectedAmount);
            }

            const orderPaymentRequestedTotals = new Map<string, number>();
            for (const item of checkoutItems) {
                if (!item.isOrderPayment) continue;
                const itemOrderPaymentId = normalizeOrderPaymentId(item.orderPaymentId || item.productId);
                if (!itemOrderPaymentId || !orderPaymentDocs.has(itemOrderPaymentId)) continue;
                const qty = readPositiveQuantity(item.quantity, `So luong thu no #${itemOrderPaymentId.slice(-6)}`);
                const price = readNonNegativeAmount(item.price, `Tien thu no #${itemOrderPaymentId.slice(-6)}`);
                orderPaymentRequestedTotals.set(itemOrderPaymentId, (orderPaymentRequestedTotals.get(itemOrderPaymentId) || 0) + price * qty);
            }

            const collectedDebtAmount = isDebtCollectionOnly
                ? (submittedDepositAmount > 0 ? submittedDepositAmount : orderPaymentSubtotal)
                : Math.max(0, paymentReceived - currentOrderTotal);
            if (isDebtCollectionOnly && collectedDebtAmount <= 0) {
                throw new Error('Vui lòng nhập số tiền khách thanh toán.');
            }
            if (isDebtCollectionOnly && collectedDebtAmount - orderPaymentSubtotal > 1) {
                throw new Error(`Số tiền thu nợ vượt số còn lại ${orderPaymentSubtotal.toLocaleString('vi-VN')}đ.`);
            }

            const orderPaymentTotals = new Map<string, number>();
            const getRemainingOrderPayment = (data: FirebaseFirestore.DocumentData) => {
                const totalOrderAmount = Number(data.total_amount) || 0;
                return Math.max(0, totalOrderAmount - getPaidAmount(data));
            };
            const debtCandidateDocs: { ref: FirebaseFirestore.DocumentReference; snap: FirebaseFirestore.DocumentSnapshot }[] = [];
            if (use_surplus_to_pay_debt === true && resolvedCustomerId && paymentMethodCode !== 'DEBT') {
                const seenDebtCandidateIds = new Set<string>();
                const debtOrderByCustomerIdSnap = await tx.get(
                    db.collection('orders')
                        .where('customer_info.customerId', '==', resolvedCustomerId)
                        .limit(20)
                );
                for (const docSnap of debtOrderByCustomerIdSnap.docs) {
                    if (orderPaymentDocs.has(docSnap.id)) continue;
                    if (getRemainingOrderPayment(docSnap.data()) <= 0) continue;
                    seenDebtCandidateIds.add(docSnap.id);
                    debtCandidateDocs.push({ ref: docSnap.ref, snap: docSnap });
                }

                if (debtCandidateDocs.length === 0 && incomingContactInput.phone) {
                    const debtOrderByPhoneSnap = await tx.get(
                        db.collection('orders')
                            .where('customer_info.phone', '==', incomingContactInput.phone)
                            .limit(20)
                    );
                    for (const docSnap of debtOrderByPhoneSnap.docs) {
                        if (seenDebtCandidateIds.has(docSnap.id) || orderPaymentDocs.has(docSnap.id)) continue;
                        if (getRemainingOrderPayment(docSnap.data()) <= 0) continue;
                        seenDebtCandidateIds.add(docSnap.id);
                        debtCandidateDocs.push({ ref: docSnap.ref, snap: docSnap });
                    }
                }
            }
            let remainingDebtCollectionAmount = collectedDebtAmount;
            for (const [id, requestedAmount] of orderPaymentRequestedTotals.entries()) {
                const orderPaymentDoc = orderPaymentDocs.get(id);
                const remainingAmount = getRemainingOrderPayment(orderPaymentDoc?.snap.data() || {});
                const paymentAmount = Math.min(requestedAmount, remainingAmount, Math.max(0, remainingDebtCollectionAmount));
                if (paymentAmount > 0) {
                    orderPaymentTotals.set(id, paymentAmount);
                    remainingDebtCollectionAmount -= paymentAmount;
                }
            }

            if (use_surplus_to_pay_debt === true && remainingDebtCollectionAmount > 0) {
                for (const debtDoc of debtCandidateDocs) {
                    const remainingAmount = getRemainingOrderPayment(debtDoc.snap.data() || {});
                    const paymentAmount = Math.min(remainingAmount, remainingDebtCollectionAmount);
                    if (paymentAmount <= 0) continue;
                    orderPaymentDocs.set(debtDoc.snap.id, debtDoc);
                    orderPaymentTotals.set(debtDoc.snap.id, paymentAmount);
                    remainingDebtCollectionAmount -= paymentAmount;
                    if (remainingDebtCollectionAmount <= 0) break;
                }
            }

            if (isDebtCollectionOnly && orderPaymentTotals.size === 0) {
                throw new Error('Không còn khoản nợ hợp lệ để ghi nhận thanh toán.');
            }
            if (orderPaymentSubtotal > 0 && paymentMethodCode !== 'DEBT' && paymentReceived + 1 < currentOrderTotal) {
                throw new Error('Số tiền khách trả chưa đủ để vừa thanh toán đơn mới vừa thu nợ đã chọn.');
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
            const settledRepairRefs = new Map<string, { orderId: string; ref: FirebaseFirestore.DocumentReference }>();
            for (const [id, paymentAmount] of orderPaymentTotals.entries()) {
                const orderPaymentDoc = orderPaymentDocs.get(id);
                const orderData = orderPaymentDoc?.snap.data() || {};
                const totalOrderAmount = Number(orderData.total_amount) || 0;
                const paidAfter = Math.min(totalOrderAmount, getPaidAmount(orderData) + paymentAmount);
                if (paidAfter + 1 < totalOrderAmount) continue;

                for (const repairId of Array.isArray(orderData.repairTicketIds) ? orderData.repairTicketIds : []) {
                    const normalizedRepairId = readString(repairId);
                    if (!normalizedRepairId) continue;
                    settledRepairRefs.set(normalizedRepairId, {
                        orderId: id,
                        ref: db.collection('repairs').doc(normalizedRepairId),
                    });
                }
            }
            const settledRepairSnapshots = settledRepairRefs.size > 0
                ? await tx.getAll(...Array.from(settledRepairRefs.values()).map(entry => entry.ref))
                : [];
            const settledRepairDocs = new Map<string, { orderId: string; ticket: RepairTicket }>();
            settledRepairSnapshots.forEach((snapshot, index) => {
                if (!snapshot.exists) return;
                const entry = Array.from(settledRepairRefs.values())[index];
                settledRepairDocs.set(snapshot.id, { orderId: entry.orderId, ticket: snapshot.data() as RepairTicket });
            });
            const cashierShiftChannel = getCashierShiftChannel(receivedPaymentMethodCode);
            const cashierShiftCollectedAmount = cashierShiftChannel === 'none'
                ? 0
                : (paidNow + orderPaymentTotal);
            let cashierShiftRef: FirebaseFirestore.DocumentReference | null = null;
            let cashierShiftUsesTally = false;

            if (cashierShiftCollectedAmount > 0) {
                let activeShiftDoc = requestedCashierShiftSnap;
                const verifiedActiveShiftLockSnap = activeShiftLockSnap || await tx.get(activeShiftLockRef);
                const activeShiftId = typeof verifiedActiveShiftLockSnap.data()?.activeShiftId === 'string'
                    ? String(verifiedActiveShiftLockSnap.data()?.activeShiftId)
                    : '';
                if (activeShiftDoc && activeShiftId !== activeShiftDoc.id) {
                    throw new Error('Ca thu ngan tren may da khong con la ca dang mo. Vui long tai lai POS truoc khi thanh toan.');
                }
                if (!activeShiftDoc) {
                    // Tương thích client cũ trong thời gian rollout; bundle mới gửi cashierShiftId.
                    const activeShiftRef = activeShiftId ? db.collection('cashier_shifts').doc(activeShiftId) : null;
                    activeShiftDoc = activeShiftRef ? await tx.get(activeShiftRef) : null;
                }
                if (!activeShiftDoc) {
                    throw new Error('Vui lòng mở ca thu ngân trước khi thanh toán tiền mặt hoặc chuyển khoản tại POS.');
                }
                if (!activeShiftDoc.exists || activeShiftDoc.data()?.status !== 'open') {
                    throw new Error('Ca thu ngan dang mo khong hop le. Vui long chot/mo lai ca truoc khi thanh toan.');
                }
                cashierShiftRef = activeShiftDoc.ref;
                cashierShiftUsesTally = Number(activeShiftDoc.data()?.tallyVersion) >= 1;
            }
            const cashierShiftChanged = Boolean(cashierShiftRef && cashierShiftCollectedAmount > 0);
            markTransaction('readCashierShift');

            const repairCompletionTargets = new Map<string, { targetStatus: string; shouldCountCompletion: boolean }>();
            for (const [id, repairDoc] of repairDocs.entries()) {
                if (!repairPaymentTotals.has(id)) continue;
                const repairTicket = repairDoc.snap.data() as RepairTicket;
                if (!repairSettingsSnap?.exists) {
                    throw new Error('Không tìm thấy cấu hình workflow sửa chữa trong Firebase.');
                }
                const workflow = getWorkflowFromSettings((repairSettingsSnap.data() || {}) as RepairWorkflowSettings, repairTicket);
                const completionTarget = resolvePaymentCompletionTarget(workflow, repairTicket.status);
                repairCompletionTargets.set(id, completionTarget);
                if (!completionTarget.shouldCountCompletion) continue;

                for (const part of repairTicket.parts || []) {
                    if (!isSelectedRepairPart(part) || !part.productId) continue;
                    const quantity = Math.max(0, Math.floor(Number(part.quantity) || 0));
                    if (quantity <= 0) continue;
                    const reservedQuantity = Math.max(0, Math.min(quantity, Number(part.reservedQuantity) || quantity));
                    const existing = repairAggregatedForStock.get(part.productId) || {
                        quantity: 0,
                        reservedQuantity: 0,
                        productName: part.productName || part.productId,
                    };
                    repairAggregatedForStock.set(part.productId, {
                        quantity: existing.quantity + quantity,
                        reservedQuantity: existing.reservedQuantity + reservedQuantity,
                        productName: existing.productName || part.productName || part.productId,
                    });
                    addFifoDeduction(part.productId, quantity, part.lotCode);
                }
            }

            // ── Construct Order Object ──
            markTransaction('workflow');

            const repairProductRefs = Array.from(repairAggregatedForStock.keys())
                .filter(productId => !productDocs.has(productId))
                .map(productId => db.collection('products').doc(productId));
            if (repairProductRefs.length > 0) {
                const repairProductSnaps = await tx.getAll(...repairProductRefs);
                repairProductRefs.forEach((pRef, index) => {
                    const pSnap = repairProductSnaps[index];
                    if (!pSnap.exists) {
                        throw new Error(`Linh kiện sửa chữa (ID: ${pRef.id}) không tồn tại.`);
                    }
                    productDocs.set(pRef.id, { ref: pRef, data: (pSnap.data() || {}) as FirebaseFirestore.DocumentData });
                });
            }

            markTransaction('readRepairProducts');

            for (const [productId, repairQty] of repairAggregatedForStock.entries()) {
                const productDoc = productDocs.get(productId);
                if (!productDoc) continue;
                const currentStock = Number(productDoc.data.stock) || 0;
                const retailQty = preAggregatedForStock.get(productId) || 0;
                const totalDeduct = retailQty + repairQty.quantity;
                if (currentStock < totalDeduct) {
                    throw new Error(`Linh kiện "${repairQty.productName}" chỉ còn ${currentStock} tồn kho nhưng cần trừ ${totalDeduct}.`);
                }
            }

            fifoDeductors = Array.from(fifoMap.values()).map(x => ({
                productId: x.productId,
                quantityToDeduct: x.quantity,
                preferredLotCodes: Array.from(x.preferredLotCodes.entries()).map(([lotCode, quantity]) => ({ lotCode, quantity }))
            }));
            fifoLotReadDeductors = fifoDeductors.filter((deductor) => {
                if (productDocs.get(deductor.productId)?.data.inventoryTrackingMode !== 'legacy') return true;
                recordSkippedLegacyFifoProduct(deductor.productId);
                return false;
            });
            const stockProductIds = new Set([...preAggregatedForStock.keys(), ...repairAggregatedForStock.keys()]);
            const newDebt = !isDebtCollectionOnly ? Math.max(0, currentOrderTotal - paidNow) : 0;
            const retailItemsForPayment = normalizedItems.filter((item) => !item.isRepairTicket && !item.isOrderPayment);
            const retailSubtotalForPayment = retailItemsForPayment.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const retailDiscountForPayment = Math.min(serverDiscount, retailSubtotalForPayment);
            const retailTotalForPayment = Math.max(0, retailSubtotalForPayment - retailDiscountForPayment);
            const paidRetailNow = Math.min(paidNow, retailTotalForPayment);
            let remainingPaymentForRepairs = Math.max(0, paidNow - paidRetailNow);
            const repairPaidNowById = new Map<string, number>();
            for (const [id, repairPrice] of repairPaymentTotals.entries()) {
                const paidForRepair = Math.min(repairPrice, remainingPaymentForRepairs);
                repairPaidNowById.set(id, paidForRepair);
                remainingPaymentForRepairs -= paidForRepair;
            }
            const isDebt = paymentMethodCode === 'DEBT' || newDebt > 0;
            const existingCustomerContactMethods = getCustomerContactMethodsFromData(custSnap?.data());
            const hasIncomingDebtSafeContact = hasDebtSafeContact(incomingContactMethods);
            const hasExistingDebtSafeContact = hasDebtSafeContact(existingCustomerContactMethods);
            if (isDebt && (!resolvedCustomerId || (!hasIncomingDebtSafeContact && !hasExistingDebtSafeContact))) {
                throw new Error('Đơn hàng ghi nợ hoặc thanh toán thiếu bắt buộc phải có khách hàng và kênh liên hệ rõ như SĐT, Zalo, Facebook, email hoặc địa chỉ.');
            }

            const deltaDebt = isDebtCollectionOnly
                ? -orderPaymentTotal
                : (newDebt - orderPaymentTotal);
            let customerLedgerCount = 0;
            if (custRef) {
                if (!isDebtCollectionOnly) {
                    customerLedgerCount += 1; // purchase_order
                    if (paidNow > 0) customerLedgerCount += 1; // purchase_payment
                }
                if (orderPaymentTotal > 0) customerLedgerCount += 1; // thu nợ đơn cũ / cấn tiền dư
            }
            const inventoryLogCount = isPending
                ? 0
                : Array.from(stockProductIds).reduce((count, productId) => {
                    const retailQty = preAggregatedForStock.get(productId) || 0;
                    const repairQty = repairAggregatedForStock.get(productId)?.quantity || 0;
                    return count + (retailQty > 0 ? 1 : 0) + (repairQty > 0 ? 1 : 0);
                }, 0);
            const customerTransactionCount = resolvedCustomerId && orderPaymentTotal > 0 ? 1 : 0;
            const reservationStartedAt = Date.now();
            const reservedIdGroupsPromise = reserveSequentialDocumentIdGroups(tx, db, [
                { key: 'inventoryLogs', collectionName: 'inventory_logs', prefix: 'IL', count: inventoryLogCount },
                { key: 'customerLedger', collectionName: 'customer_ledger', prefix: 'CL', count: customerLedgerCount },
                { key: 'customerTransactions', collectionName: 'customer_transactions', prefix: 'CT', count: customerTransactionCount },
                { key: 'order', collectionName: 'orders', prefix: 'DH', count: isDebtCollectionOnly ? 0 : 1 },
            ]);
            markTransaction('prepareFifo');
            try {
                if (fifoLotReadDeductors.length > 0) {
                    const fifoReadMetrics = new Map<string, FifoReadMetric>();
                    fifoLogsDataMap = await fetchFifoLogsForDeduction(tx, db, fifoLotReadDeductors, {
                        onRead: (metric) => {
                            recordFifoRead(metric);
                            fifoReadMetrics.set(metric.productId, metric);
                        },
                    });
                    for (const deductor of fifoLotReadDeductors) {
                        const productData = productDocs.get(deductor.productId)?.data;
                        const metric = fifoReadMetrics.get(deductor.productId);
                        if (productData?.inventoryTrackingMode === undefined && metric) {
                            inventoryTrackingModeUpdates.set(deductor.productId, metric.lotCount > 0 ? 'fifo' : 'legacy');
                        }
                    }
                }
            } catch (error) {
                await reservedIdGroupsPromise.catch(() => undefined);
                throw error;
            }
            markTransaction('fifoRead');
            const reservedIdGroups = await reservedIdGroupsPromise;
            markTransaction('reserveIdsWait');
            recordTransactionDuration('reserveIdsTotal', Date.now() - reservationStartedAt);
            const inventoryLogAllocations = reservedIdGroups.get('inventoryLogs') || [];
            const customerLedgerAllocations = reservedIdGroups.get('customerLedger') || [];
            const customerTransactionAllocations = reservedIdGroups.get('customerTransactions') || [];
            let inventoryLogAllocationIndex = 0;
            let customerLedgerAllocationIndex = 0;

            const orderAllocation: ReservedSequentialDocumentId | null = reservedIdGroups.get('order')?.[0] || null;
            const orderRef = orderAllocation?.ref || null;
            const orderId = orderAllocation?.id || '';
            const debtPaymentReferenceId = updatedOrderIds.length === 1
                ? updatedOrderIds[0]
                : (idempotencyKey || orderId || `DEBT-${updatedOrderIds.map(id => id.slice(-6)).join('-')}`);
            const orderItems = normalizedItems.filter((item) => !item.isOrderPayment);

            const order: Record<string, unknown> = {
                customer_info: {
                    customerId: resolvedCustomerId || '',
                    name: incomingContactInput.name || 'Khách lẻ',
                    phone: normalizedPhoneResult?.local || incomingContactInput.phone || '',
                    primaryContactType: incomingPrimaryContact?.type || null,
                    primaryContactValue: incomingPrimaryContact?.value || '',
                    contactMethods: incomingContactMethods,
                    email: incomingContactInput.email || '',
                    address: incomingContactInput.address || '',
                    note: incomingContactInput.note || '',
                },
                items: orderItems,
                subtotal_amount: discountableSubtotal,
                discount_amount: serverDiscount,
                deposit_amount: paidNow,
                total_amount: currentOrderTotal,
                ...(appliedVoucherCode ? { voucherCode: appliedVoucherCode, discountSource: 'voucher' } : {}),
                status: 'Completed',
                source: 'pos',
                containsRepairPayment: repairPaymentTotals.size > 0,
                repairTicketIds: Array.from(repairPaymentTotals.keys()),
                containsOrderPayment: orderPaymentTotals.size > 0,
                orderPaymentIds: Array.from(orderPaymentTotals.keys()),
                is_vat_exported: false,
                payment_method: payment_method || 'CASH',
                ...(paymentMethodCode === 'DEBT' && paidNow > 0 ? { deposit_payment_method: receivedPaymentMethodCode } : {}),
                paymentStatus: newDebt > 0 ? 'debt' : 'paid',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                completedAt: FieldValue.serverTimestamp(),
                paymentHistory: paidNow > 0 ? [{
                    type: newDebt > 0 ? 'deposit' : 'full',
                    amount: Math.min(paidNow, currentOrderTotal),
                    method: receivedPaymentMethodCode,
                    timestamp: Date.now(),
                    note: newDebt > 0
                        ? `Thanh toán một phần POS (${paidNow.toLocaleString('vi-VN')}đ) — nợ lại ${newDebt.toLocaleString('vi-VN')}đ — ${payment_method}`
                        : `Thanh toán POS — ${payment_method}`
                }] : [],
                createdBy: caller.uid,
                createdByName
            };

            // ── Commission Server-Side Calculation ──
            const commissionableItems = orderItems;
            const commissionableTotal = currentOrderTotal;
            const activeCommissionRules = activeCommissionRulesPromise ? await activeCommissionRulesPromise : [];
            const commissionProductMap = Array.from(productDocs.entries()).reduce<Record<string, Product>>((map, [productId, productDoc]) => {
                map[productId] = productDoc.data as Product;
                return map;
            }, {});
            let commissionCost = 0;
            if (!isDebtCollectionOnly && !isPending && commissionableItems.length > 0 && commissionableTotal > 0) {
                const commissionResult = await calculateAndSaveCommissionsServer(tx, { uid: caller.uid, displayName: createdByName as string }, 'order', {
                    id: orderId,
                    ...order,
                    items: commissionableItems,
                    subtotal_amount: discountableSubtotal,
                    total_amount: commissionableTotal,
                } as unknown as Order, {
                    activeRules: activeCommissionRules,
                    productMap: commissionProductMap,
                    skipRevenueAggregate: true,
                });
                commissionCost += commissionResult.commissionCost;
            }
            if (!isPending && repairPaymentTotals.size > 0) {
                for (const [id, repairPrice] of repairPaymentTotals.entries()) {
                    const repairDoc = repairDocs.get(id);
                    const completionTarget = repairCompletionTargets.get(id);
                    if (!repairDoc || !completionTarget) continue;
                    const repairTicket = repairDoc.snap.data() as RepairTicket;
                    const commissionResult = await calculateAndSaveCommissionsServer(tx, { uid: caller.uid, displayName: createdByName as string }, 'repair', {
                        ...repairTicket,
                        id,
                        status: completionTarget.targetStatus,
                        payment: {
                            ...repairTicket.payment,
                            status: 'paid',
                            amount: repairPrice,
                        },
                    } as RepairTicket, {
                        activeRules: activeCommissionRules,
                        skipRevenueAggregate: true,
                    });
                    commissionCost += commissionResult.commissionCost;
                }
            }
            markTransaction('commission');

            // ==========================================
            // ── ALL WRITES START HERE ──
            // ==========================================

            const checkoutWarnings: string[] = [];
            if (repairPaymentTotals.size > 0 && newDebt > 0) {
                checkoutWarnings.push(`Phiếu sửa chữa đã được hoàn tất với thực thu ${paidNow.toLocaleString('vi-VN')}đ; còn ghi nợ ${newDebt.toLocaleString('vi-VN')}đ.`);
            }

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
            for (const productId of stockProductIds) {
                const pSnap = productDocs.get(productId)!;
                const d = pSnap.data;
                const currentStock = Number(d.stock) || 0;
                const currentHeld = Number(d.held) || 0;
                const retailQty = preAggregatedForStock.get(productId) || 0;
                const repairQty = repairAggregatedForStock.get(productId)?.quantity || 0;
                const repairReservedQty = repairAggregatedForStock.get(productId)?.reservedQuantity || 0;
                const totalQty = retailQty + repairQty;
                const inventoryTrackingMode = inventoryTrackingModeUpdates.get(productId);

                if (isPending) {
                    tx.update(pSnap.ref, {
                        held: currentHeld + retailQty,
                        ...(inventoryTrackingMode ? { inventoryTrackingMode } : {}),
                    });
                } else {
                    tx.update(pSnap.ref, {
                        stock: currentStock - totalQty,
                        held: Math.max(0, currentHeld - repairReservedQty),
                        ...(inventoryTrackingMode ? { inventoryTrackingMode } : {}),
                    });

                    if (retailQty > 0) {
                        tx.set(inventoryLogAllocations[inventoryLogAllocationIndex++].ref, {
                            productId,
                            productName: d.name,
                            quantity: -retailQty,
                            costPriceAtLog: Number(d.costPrice) || 0,
                            type: 'POS_SALE',
                            referenceType: 'order',
                            referenceId: orderId,
                            lotsDeducted: fifoResultsMap.get(productId) || [],
                            createdBy: caller.uid,
                            createdAt: FieldValue.serverTimestamp()
                        });
                    }
                    if (repairQty > 0) {
                        tx.set(inventoryLogAllocations[inventoryLogAllocationIndex++].ref, {
                            productId,
                            productName: repairAggregatedForStock.get(productId)?.productName || d.name,
                            quantity: -repairQty,
                            costPriceAtLog: Number(d.costPrice) || 0,
                            type: 'REPAIR_POS_HANDOVER',
                            referenceType: 'repair',
                            referenceId: orderId,
                            orderId,
                            lotsDeducted: fifoResultsMap.get(productId) || [],
                            createdBy: caller.uid,
                            createdAt: FieldValue.serverTimestamp()
                        });
                    }
                }
            }

            if (!isDebtCollectionOnly) {
                if (!orderRef || !orderAllocation) {
                    throw new Error('Không thể tạo mã đơn POS.');
                }
                orderAllocation.commitCounter();
                tx.set(orderRef, order);
            }
            const revenueDeltas: RevenueAggregateDelta[] = [];
            if (!isDebtCollectionOnly && !isPending) {
                const repairRevenue = Array.from(repairPaidNowById.values()).reduce((sum, amount) => sum + amount, 0);
                const repairDebt = Array.from(repairPaymentTotals.entries())
                    .reduce((sum, [id, amount]) => sum + Math.max(0, amount - (repairPaidNowById.get(id) || 0)), 0);

                if (retailItemsForPayment.length > 0) {
                    revenueDeltas.push(buildCompletedOrderRevenueDelta({
                            id: orderId,
                            ...order,
                            items: retailItemsForPayment,
                            subtotal_amount: retailSubtotalForPayment,
                            discount_amount: retailDiscountForPayment,
                            total_amount: retailTotalForPayment,
                            paymentStatus: paidRetailNow + 1 < retailTotalForPayment ? 'debt' : 'paid',
                            paymentHistory: paidRetailNow > 0 ? [{
                                type: paidRetailNow + 1 < retailTotalForPayment ? 'deposit' : 'full',
                                amount: paidRetailNow,
                                method: receivedPaymentMethodCode,
                                timestamp: Date.now(),
                                note: `Doanh thu POS retail thực thu - ${payment_method || 'CASH'}`
                            }] : [],
                        } as unknown as Order));
                }
                if (repairRevenue > 0 || repairDebt > 0) {
                    const repairCount = Array.from(repairCompletionTargets.values())
                        .filter(target => target.shouldCountCompletion)
                        .length;
                    revenueDeltas.push({ repairRevenue, debtRevenue: repairDebt, repairCount });
                }
            }
            if (!isPending && orderPaymentTotal > 0) {
                let debtCollectionPosRevenue = 0;
                let debtCollectionWebRevenue = 0;
                for (const [id, paymentAmount] of orderPaymentTotals.entries()) {
                    const source = String(orderPaymentDocs.get(id)?.snap.data()?.source || '');
                    if (source === 'pos') debtCollectionPosRevenue += paymentAmount;
                    else debtCollectionWebRevenue += paymentAmount;
                }
                revenueDeltas.push({
                    orderRevenue: orderPaymentTotal,
                    ...buildPaymentChannelRevenueDelta(orderPaymentTotal, receivedPaymentMethodCode),
                    posOrderRevenue: debtCollectionPosRevenue,
                    webOrderRevenue: debtCollectionWebRevenue,
                });
            }
            if (commissionCost > 0) {
                revenueDeltas.push({ commissionCost });
            }
            incrementRevenueAggregates(tx, db, mergeRevenueAggregateDeltas(...revenueDeltas));

            if (cashierShiftRef && cashierShiftCollectedAmount > 0) {
                if (cashierShiftUsesTally) {
                    queueCashierShiftTally(tx, db, {
                        shiftId: cashierShiftRef.id,
                        operationKey: readString(idempotencyKey) || orderId || debtPaymentReferenceId,
                        orderId: isDebtCollectionOnly ? debtPaymentReferenceId : orderId,
                        paymentMethod: receivedPaymentMethodCode,
                        cashAmount: cashierShiftChannel === 'cash' ? cashierShiftCollectedAmount : 0,
                        bankAmount: cashierShiftChannel === 'bank' ? cashierShiftCollectedAmount : 0,
                        actorId: caller.uid,
                    });
                } else {
                    tx.update(cashierShiftRef, {
                        ...(cashierShiftChannel === 'cash'
                            ? { cashSalesAmount: FieldValue.increment(cashierShiftCollectedAmount) }
                            : { bankSalesAmount: FieldValue.increment(cashierShiftCollectedAmount) }),
                        lastPaymentAmount: cashierShiftCollectedAmount,
                        lastPaymentMethod: receivedPaymentMethodCode,
                        lastOrderId: isDebtCollectionOnly ? debtPaymentReferenceId : orderId,
                        lastPaymentAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                }
            }

            // ── Increment Voucher Usage ──
            if (!isDebtCollectionOnly && appliedVoucherCode && voucherRef && !isPending) {
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
                    if (incomingContactMethods.length > 0) {
                        const contactMethods = mergeContactMethods(currentData.contactMethods, incomingContactMethods);
                        const primaryContact = getPrimaryContact(contactMethods) || incomingPrimaryContact;
                        updateData.phone = normalizedPhoneResult?.local || incomingContactInput.phone || currentData.phone || '';
                        updateData.primaryPhone = normalizedPhoneResult?.local || currentData.primaryPhone || '';
                        updateData.primaryContactType = primaryContact?.type || currentData.primaryContactType || null;
                        updateData.primaryContactValue = primaryContact?.value || currentData.primaryContactValue || '';
                        updateData.contactMethods = contactMethods;
                        updateData.searchKeywords = buildContactSearchKeywords(incomingContactInput, contactMethods);
                        if (incomingContactInput.email) updateData.email = incomingContactInput.email;
                        if (incomingContactInput.address) updateData.address = incomingContactInput.address;
                        if (incomingContactInput.note) updateData.note = incomingContactInput.note;
                    }

                    const customerSpendDelta = !isDebtCollectionOnly ? currentOrderTotal : 0;
                    if (customerSpendDelta > 0) {
                        updateData.totalSpent = FieldValue.increment(customerSpendDelta);
                        updateData.totalOrders = FieldValue.increment(1);
                    }
                    if (deltaDebt !== 0) {
                        updateData.totalDebt = FieldValue.increment(deltaDebt);
                    }

                    if (appliedPersonalVoucher && appliedVoucherCode) {
                        updateData['missions.bounty_redeemed'] = true;
                        updateData['missions.bountyVoucherCode'] = appliedVoucherCode;
                        updateData['missions.redeemedAt'] = FieldValue.serverTimestamp();
                        updateData['missions.redeemedOrderId'] = orderId;
                    }

                    tx.update(custRef, updateData);
                } else {
                    const customerSpendDelta = !isDebtCollectionOnly ? currentOrderTotal : 0;
                    const newCust: Record<string, unknown> = {
                        id: resolvedCustomerId,
                        code: resolvedCustomerId,
                        legacyPhoneId: normalizedPhoneResult?.local || '',
                        phone: normalizedPhoneResult?.local || incomingContactInput.phone || '',
                        primaryPhone: normalizedPhoneResult?.local || '',
                        name: incomingName || 'Khách lẻ',
                        type: 'retail',
                        primaryContactType: incomingPrimaryContact?.type || null,
                        primaryContactValue: incomingPrimaryContact?.value || '',
                        contactMethods: incomingContactMethods,
                        searchKeywords: buildContactSearchKeywords(incomingContactInput, incomingContactMethods),
                        email: incomingContactInput.email || '',
                        address: incomingContactInput.address || '',
                        note: incomingContactInput.note || '',
                        totalSpent: customerSpendDelta,
                        totalOrders: customerSpendDelta > 0 ? 1 : 0,
                        totalRepairs: 0,
                        totalAppointments: 0,
                        totalDebt: deltaDebt,
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                        lastVisit: FieldValue.serverTimestamp(),
                    };

                    tx.set(custRef, newCust);
                }

                if (!isDebtCollectionOnly) {
                    tx.set(customerLedgerAllocations[customerLedgerAllocationIndex++].ref, {
                        customerId: resolvedCustomerId,
                        type: 'purchase_order',
                        amount: currentOrderTotal,
                        referenceId: orderId,
                        date: FieldValue.serverTimestamp()
                    });
                    if (submittedDepositAmount > 0) {
                        tx.set(customerLedgerAllocations[customerLedgerAllocationIndex++].ref, {
                            customerId: resolvedCustomerId,
                            type: 'purchase_payment',
                            amount: paidNow,
                            referenceId: orderId,
                            date: FieldValue.serverTimestamp()
                        });
                    }
                }
                if (orderPaymentTotal > 0) {
                    tx.set(customerLedgerAllocations[customerLedgerAllocationIndex++].ref, {
                        customerId: resolvedCustomerId,
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
                    const repairPaidNow = repairPaidNowById.get(id) || 0;
                    const repairDebt = Math.max(0, repairPrice - repairPaidNow);
                    const isRepairFullyPaid = repairDebt <= 1;
                    tx.update(repairDoc.ref, {
                        'payment.status': isRepairFullyPaid ? 'paid' : 'pay_later',
                        status: completionTarget.targetStatus,
                        'payment.method': repairPaidNow > 0 ? receivedPaymentMethodCode : paymentMethodCode,
                        'payment.amount': repairPrice,
                        'payment.depositAmount': repairPaidNow,
                        ...(isRepairFullyPaid ? {
                            'payment.paidAt': FieldValue.serverTimestamp(),
                            'payment.outstandingOrderId': FieldValue.delete(),
                            'payment.outstandingAmount': 0,
                        } : {
                            'payment.outstandingOrderId': orderId,
                            'payment.outstandingAmount': repairDebt,
                        }),
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
                            note: isRepairFullyPaid
                                ? `Thanh toán POS #${orderId.slice(-6)}`
                                : `Hoàn tất sửa chữa, thực thu ${repairPaidNow.toLocaleString('vi-VN')}đ; ghi nợ ${repairDebt.toLocaleString('vi-VN')}đ qua POS #${orderId.slice(-6)}`
                        }),
                        ...(repairPaidNow > 0 ? { paymentHistory: FieldValue.arrayUnion({
                            type: 'full',
                            amount: repairPaidNow,
                            method: receivedPaymentMethodCode,
                            timestamp: Date.now(),
                            note: isRepairFullyPaid
                                ? `Thanh toán gộp hóa đơn POS #${orderId.slice(-6)}`
                                : `Thanh toán một phần POS #${orderId.slice(-6)}; còn nợ ${repairDebt.toLocaleString('vi-VN')}đ`
                        }) } : {})
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

                for (const [repairId, settlement] of settledRepairDocs.entries()) {
                    const outstandingOrderId = settlement.ticket.payment?.outstandingOrderId;
                    if (outstandingOrderId !== settlement.orderId) continue;

                    const repairAmount = getRepairPaymentAmount(settlement.ticket, repairId);
                    const paidBefore = getRepairPaidAmount(settlement.ticket);
                    const remainingRepairDebt = Math.max(0, repairAmount - paidBefore);
                    tx.update(db.collection('repairs').doc(repairId), {
                        'payment.status': 'paid',
                        'payment.depositAmount': repairAmount,
                        'payment.paidAt': FieldValue.serverTimestamp(),
                        'payment.outstandingOrderId': FieldValue.delete(),
                        'payment.outstandingAmount': 0,
                        updatedAt: FieldValue.serverTimestamp(),
                        ...(remainingRepairDebt > 0 ? {
                            paymentHistory: FieldValue.arrayUnion({
                                type: 'debt_payment',
                                amount: remainingRepairDebt,
                                method: payment_method || 'CASH',
                                timestamp: Date.now(),
                                referenceId: idempotencyKey || null,
                                note: `Thu nợ hóa đơn POS #${settlement.orderId.slice(-6)}`,
                            }),
                        } : {}),
                    });
                }

                let customerTransactionAllocationIndex = 0;
                if (resolvedCustomerId) {
                    if (orderPaymentTotal > 0) {
                        tx.set(customerTransactionAllocations[customerTransactionAllocationIndex++].ref, {
                            customerId: resolvedCustomerId,
                            customerName: incomingName || incomingContactInput.name || 'Khách lẻ',
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
            }

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: isDebtCollectionOnly ? 'pos_debt_collection' : 'pos_checkout',
                    referenceId: isDebtCollectionOnly ? debtPaymentReferenceId : orderId,
                    debtOnly: isDebtCollectionOnly,
                    cashierShiftChanged,
                    updatedOrderIds
                });
            }
            markTransaction('queueWrites');
            inventoryLogAllocations.at(-1)?.commitCounter();
            customerLedgerAllocations.at(-1)?.commitCounter();
            customerTransactionAllocations.at(-1)?.commitCounter();

            return {
                success: true,
                orderId: isDebtCollectionOnly ? debtPaymentReferenceId : orderId,
                updatedOrderIds,
                debtOnly: isDebtCollectionOnly,
                cashierShiftChanged,
                warnings: checkoutWarnings
            };
            } finally {
                finishTransactionAttempt();
            }
        });
        markTiming('transaction');
        debugTiming.transactionAttempts = transactionAttempts;
        debugTiming.transactionAttemptCount = transactionAttempts.length;
        debugTiming.transactionSteps = transactionAttempts.at(-1)?.steps || {};
        debugTiming.fifoReads = transactionAttempts.at(-1)?.fifoReads || [];
        debugTiming.fifoSkippedLegacyProductIds = transactionAttempts.at(-1)?.fifoSkippedLegacyProductIds || [];
        debugTiming.total = Date.now() - startedAt;
        if (Number(debugTiming.total) > 1500) {
            console.warn('POS checkout API timing', debugTiming);
            const fifoReads = transactionAttempts.at(-1)?.fifoReads || [];
            const fifoSkippedLegacyProductIds = transactionAttempts.at(-1)?.fifoSkippedLegacyProductIds || [];
            if (fifoReads.length > 0 || fifoSkippedLegacyProductIds.length > 0) {
                console.warn('POS checkout FIFO tracking', JSON.stringify({ fifoReads, fifoSkippedLegacyProductIds }));
            }
        }

        return context.json({ ...result, debugTiming });
    } catch (error: unknown) {
        debugTiming.transactionAttempts = transactionAttempts;
        debugTiming.transactionAttemptCount = transactionAttempts.length;
        debugTiming.transactionSteps = transactionAttempts.at(-1)?.steps || {};
        debugTiming.fifoReads = transactionAttempts.at(-1)?.fifoReads || [];
        debugTiming.fifoSkippedLegacyProductIds = transactionAttempts.at(-1)?.fifoSkippedLegacyProductIds || [];
        debugTiming.total = Date.now() - startedAt;
        console.error('POS checkout API timing before error:', debugTiming);
        throw error;
    }
});
