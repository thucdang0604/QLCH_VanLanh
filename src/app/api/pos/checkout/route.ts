
import { NextRequest } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import { calculateAndSaveCommissionsServer, getActiveRulesServer } from '@/lib/commissionCalcServer';
import type { Order, Product, RepairTicket, WorkflowNode } from '@/lib/types';
import { PRODUCT_STATUS, isProductArchived } from '@/lib/productLifecycle';
import { normalizeVietnamPhone } from '@/lib/phone';
import { buildContactMethods, buildContactSearchKeywords, getPrimaryContact, hasDebtSafeContact, mergeContactMethods } from '@/lib/contactIdentity';
import type { ContactMethod, ContactMethodType } from '@/lib/types/contact';
import { fetchFifoLogsForDeduction, executeFifoDeductionsWrites, type FifoDeductionResult, type FifoDeductor, type FifoReadMetric } from '@/lib/inventoryFifo';
import { buildCompletedOrderRevenueDelta, buildPaymentChannelRevenueDelta, incrementRevenueAggregates, mergeRevenueAggregateDeltas } from '@/lib/revenueAggregateServer';
import { getWorkflowFromSettings, requireWorkflowNode, workflowNodeHasFeature } from '@/lib/repairWorkflowServer';
import { isSelectedRepairPart } from '@/lib/repairStatus';
import { reserveSequentialDocumentIdGroups, type ReservedSequentialDocumentId } from '@/lib/serverDocumentIds';
import { queueCashierShiftTally } from '@/lib/cashierShiftTallyServer';
import type { RepairWorkflowSettings } from '@/lib/repairWorkflowConfig';
import type { RevenueAggregateDelta } from '@/lib/revenueAggregate';
import { ApiError, getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { canCreatePosDebt, readPosCustomerIdentityMode, resolvePosZaloContactIdentity, type PosZaloContactIdentity } from '@/lib/posCustomerIdentity';
import { getE2ERunMetadata } from '@/lib/e2eRunMetadata';
import { readRepairShippingInput } from '@/lib/repairShipping';
import { createPosPaymentReference, readPosPaymentBreakdown, sumPosPaymentBreakdown, type PosPaymentBreakdownEntry } from '@/lib/posPaymentBreakdown';
import {
    getCashierShiftChannel,
    getFixedPosRetailPrice,
    getRepairPaidAmount,
    getRepairPaymentAmount,
    normalizeOrderPaymentId,
    normalizeRepairTicketId,
    readNonNegativeCheckoutAmount as readNonNegativeAmount,
    readOptionalNonNegativeCheckoutAmount as readOptionalNonNegativeAmount,
    readPositiveCheckoutQuantity as readPositiveQuantity,
    requiresImeiForPosRetailProduct,
    resolveProductWarranty,
    type CheckoutItemInput,
} from '@/lib/posCheckoutRules';

type CheckoutPaymentLine = PosPaymentBreakdownEntry & {
    paymentIndex: number;
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

function buildIncomingCustomerContact(
    customerInfo: Record<string, unknown>,
    zaloIdentity: PosZaloContactIdentity | null = null,
) {
    return {
        name: readString(customerInfo.name),
        phone: readString(customerInfo.phone),
        zalo: zaloIdentity?.profileUrl || readString(customerInfo.zalo),
        facebook: readString(customerInfo.facebook),
        email: readString(customerInfo.email),
        address: readString(customerInfo.address),
        note: readString(customerInfo.note),
        other: readString(customerInfo.otherContact || customerInfo.other),
        primaryType: zaloIdentity ? 'zalo' : normalizeIncomingContactType(customerInfo.primaryContactType),
        source: zaloIdentity ? 'zalo_contact_card' as const : 'pos' as const,
        ...(zaloIdentity ? {
            methodMeta: {
                zalo: {
                    confidence: 'high' as const,
                    externalId: zaloIdentity.externalId,
                    profileUrl: zaloIdentity.profileUrl,
                },
            },
        } : {}),
    };
}

function getCustomerContactMethodsFromData(data: FirebaseFirestore.DocumentData | undefined): ContactMethod[] {
    return Array.isArray(data?.contactMethods) ? data.contactMethods as ContactMethod[] : [];
}

function customerHasZaloContactCardIdentity(
    data: FirebaseFirestore.DocumentData | undefined,
    expectedExternalId: string,
): boolean {
    if (!data) return false;
    const expected = expectedExternalId.toLowerCase();
    const contactMethods = getCustomerContactMethodsFromData(data);
    const matchesZaloValue = (value: unknown) => resolvePosZaloContactIdentity(readString(value))?.externalId === expected;

    return contactMethods.some(method => method.type === 'zalo' && (
        readString(method.externalId).toLowerCase() === expected || matchesZaloValue(method.profileUrl) || matchesZaloValue(method.value)
    ))
        || matchesZaloValue(data.zalo)
        || (data.primaryContactType === 'zalo' && matchesZaloValue(data.primaryContactValue));
}

async function verifyPosPhoneOwnership(token: unknown, expectedPhone: string): Promise<string> {
    if (typeof token !== 'string' || !token.trim()) {
        throw new ApiError('Khách mới ghi nợ cần xác minh SĐT bằng mã OTP.', 400, 'phone_verification_required');
    }

    try {
        const decoded = await getAdminAuth().verifyIdToken(token);
        const verifiedPhone = typeof decoded.phone_number === 'string'
            ? normalizeVietnamPhone(decoded.phone_number)?.local
            : null;
        if (!verifiedPhone || verifiedPhone !== expectedPhone) {
            throw new ApiError('Mã OTP không khớp với SĐT khách hàng.', 400, 'phone_verification_mismatch');
        }
        return verifiedPhone;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('Xác minh SĐT đã hết hạn hoặc không hợp lệ. Vui lòng xác minh lại.', 400, 'phone_verification_invalid');
    }
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
        const e2eMetadata = getE2ERunMetadata(request);
        markTiming('auth');

        const body = await context.readJson(request);
        const { idempotencyKey, repairTicketId, repairTicketIds, customer_info, phone_verification_token, items, discount_amount, total_amount, deposit_amount, deposit_payment_method, payment_breakdown, payment_method, voucherCode, use_surplus_to_pay_debt, cashierShiftId, repair_shipping } = body;
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
        const submittedPaymentBreakdown = readPosPaymentBreakdown(payment_breakdown);
        const submittedTotalAmount = total_amount === undefined || total_amount === null || total_amount === ''
            ? null
            : readNonNegativeAmount(total_amount, 'Tong tien');

        const db = getAdminDb();
        const getPaidAmount = (data: FirebaseFirestore.DocumentData) => {
            const history = Array.isArray(data.paymentHistory) ? data.paymentHistory : [];
            const paidFromHistory = history.reduce((sum, entry) => sum + (Number(entry?.amount) || 0), 0);
            return Math.max(Number(data.deposit_amount) || 0, paidFromHistory);
        };

        const customerInfoRecord = (customer_info && typeof customer_info === 'object' ? customer_info : {}) as Record<string, unknown>;
        const customerIdentityMode = readPosCustomerIdentityMode(customerInfoRecord.identityMode);
        const zaloIdentity = customerIdentityMode === 'zalo_contact'
            ? resolvePosZaloContactIdentity(readString(customerInfoRecord.zalo))
            : null;
        if (customerIdentityMode === 'zalo_contact' && !zaloIdentity) {
            throw new ApiError('Khách mới qua Zalo cần liên kết danh thiếp Zalo hợp lệ (zaloapp.com/qr/p/...).', 400, 'zalo_contact_card_required');
        }
        const incomingContactInput = buildIncomingCustomerContact(customerInfoRecord, zaloIdentity);
        if ((customerIdentityMode === 'verified_phone' || customerIdentityMode === 'zalo_contact') && !incomingContactInput.name) {
            throw new ApiError('Khách hàng mới cần nhập tên trước khi tạo hồ sơ và ghi nợ.', 400, 'customer_name_required');
        }
        const incomingContactMethods = buildContactMethods(incomingContactInput);
        const incomingPrimaryContact = getPrimaryContact(incomingContactMethods);
        const requestedCustomerId = readString(customerInfoRecord.customerId || customerInfoRecord.id);
        const rawPhone = incomingContactInput.phone;
        const normalizedPhoneResult = rawPhone ? normalizeVietnamPhone(rawPhone) : null;
        const verifiedPhone = customerIdentityMode === 'verified_phone'
            ? await verifyPosPhoneOwnership(phone_verification_token, normalizedPhoneResult?.local || '')
            : '';
        const resolvedCustomerId = customerIdentityMode === 'existing'
            ? requestedCustomerId
            : customerIdentityMode === 'verified_phone'
                ? verifiedPhone
                : zaloIdentity?.customerId || '';
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
        const repairShipping = readRepairShippingInput(repair_shipping, repairIdSet);
        if (repairShipping && repairShipping.mode !== 'customer_paid_now') {
            await requirePermission(request, 'manage_cashier_expenses');
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
            const shippingPayerRef = repairShipping?.mode === 'shop_advance_on_credit' && repairShipping.billingCustomerId
                ? db.collection('customers').doc(repairShipping.billingCustomerId)
                : null;
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
                ...(shippingPayerRef ? [shippingPayerRef] : []),
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
            const shippingPayerSnap = shippingPayerRef ? getCoreSnapshot(shippingPayerRef) || null : null;
            if (customerIdentityMode === 'existing' && !custSnap?.exists) {
                throw new ApiError('Hồ sơ khách hàng đã chọn không còn tồn tại. Vui lòng tra cứu và chọn lại.', 400, 'customer_not_found');
            }
            if (customerIdentityMode === 'zalo_contact' && custSnap?.exists && !customerHasZaloContactCardIdentity(custSnap.data(), zaloIdentity!.externalId)) {
                throw new ApiError('Liên kết Zalo này trùng mã hồ sơ nhưng không khớp dữ liệu hiện có. Vui lòng chọn hồ sơ khách cũ hoặc liên hệ quản trị.', 409, 'zalo_customer_id_collision');
            }
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
                const submittedPrice = readNonNegativeAmount(item.price, `Gia dong hang ${pid || 'khong ro'}`);

                if (item.isRepairTicket) {
                    const itemRepairTicketId = normalizeRepairTicketId(item.repairTicketId || item.productId);
                    normalizedItems.push({
                        id: pid,
                        productId: pid,
                        repairTicketId: itemRepairTicketId || undefined,
                        productName: item.productName || '[Phiếu sửa chữa]',
                        price: submittedPrice,
                        quantity: qty,
                        image: '',
                        isRepairTicket: true
                    });
                    serverSubtotal += submittedPrice * qty;
                    continue;
                }
                if (item.isOrderPayment) {
                    const itemOrderPaymentId = normalizeOrderPaymentId(item.orderPaymentId || item.productId);
                    normalizedItems.push({
                        id: pid,
                        productId: pid,
                        orderPaymentId: itemOrderPaymentId || undefined,
                        productName: item.productName || '[Thanh toán đơn hàng]',
                        price: submittedPrice,
                        quantity: qty,
                        image: '',
                        isOrderPayment: true
                    });
                    const lineTotal = submittedPrice * qty;
                    serverSubtotal += lineTotal;
                    orderPaymentSubtotal += lineTotal;
                    continue;
                }

                const pSnap = productDocs.get(pid)!;
                const d = pSnap.data;
                const price = getFixedPosRetailPrice(d, `Gia san pham ${pid || 'khong ro'}`);

                const warrantyInfo = resolveProductWarranty(d, retailTrees);
                const warrantyType = warrantyInfo?.warrantyType || 'none';
                const warrantyMonths = warrantyInfo?.warrantyMonths || 0;

                let imeis: string[] = [];
                if (requiresImeiForPosRetailProduct(d)) {
                    if (Array.isArray(item.imeis)) {
                        imeis = item.imeis.map((x: unknown) => String(x).trim()).filter(Boolean);
                    }
                    if (imeis.length !== qty) {
                        throw new Error(`Sản phẩm "${d.name}" cần đủ ${qty} IMEI/Serial.`);
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
            const customerShippingCharge = repairShipping?.mode === 'customer_paid_now' ? repairShipping.fee : 0;
            const currentOrderTotal = Math.max(0, discountableSubtotal - serverDiscount) + customerShippingCharge;
            const serverTotal = currentOrderTotal + orderPaymentSubtotal;
            const isDebtCollectionOnly = orderPaymentSubtotal > 0 && discountableSubtotal === 0;
            const paymentMethodCode = String(payment_method || 'CASH').toUpperCase();
            const submittedBreakdownTotal = submittedPaymentBreakdown ? sumPosPaymentBreakdown(submittedPaymentBreakdown) : 0;
            // If payment method is not DEBT, and deposit is not provided/0, treat as fully paid for the whole POS receipt.
            const paymentReceived = submittedPaymentBreakdown
                ? submittedBreakdownTotal
                : (paymentMethodCode !== 'DEBT' && submittedDepositAmount === 0)
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
            if (repairShipping && !repairPaymentTotals.has(repairShipping.repairTicketId)) {
                throw new Error('Phí ship chỉ được tạo cùng phiếu sửa chữa chưa thanh toán trong giỏ POS.');
            }
            if (repairShipping?.mode === 'shop_advance_on_credit') {
                if (!shippingPayerRef || !shippingPayerSnap?.exists || shippingPayerSnap.data()?.isActive === false) {
                    throw new Error('Không tìm thấy khách/đối tác đang hoạt động để ghi nợ phí ship shop ứng hộ.');
                }
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
            const totalCollectedAmount = paidNow + orderPaymentTotal;
            if (submittedPaymentBreakdown && Math.abs(submittedBreakdownTotal - totalCollectedAmount) > 1) {
                throw new Error('Các khoản thanh toán không khớp với số tiền cần thu. Vui lòng kiểm tra lại.');
            }

            const legacyReceivedPaymentMethod = paymentMethodCode === 'DEBT' && paidNow > 0
                ? receivedPaymentMethodCode
                : paymentMethodCode;
            const legacyPaymentLines: PosPaymentBreakdownEntry[] = totalCollectedAmount > 0
                && ['CASH', 'BANK', 'MOMO', 'QR', 'CARD', 'INSTALLMENT'].includes(legacyReceivedPaymentMethod)
                ? [{ method: legacyReceivedPaymentMethod as PosPaymentBreakdownEntry['method'], amount: totalCollectedAmount }]
                : [];
            const checkoutPaymentLines: CheckoutPaymentLine[] = (submittedPaymentBreakdown || legacyPaymentLines)
                .map((entry, index) => ({
                    ...entry,
                    paymentIndex: index + 1,
                }));
            const remainingPaymentLines = checkoutPaymentLines.map(entry => ({ ...entry }));
            const takePaymentLines = (amount: number): CheckoutPaymentLine[] => {
                let remainingAmount = Math.max(0, amount);
                const allocated: CheckoutPaymentLine[] = [];
                while (remainingAmount > 0 && remainingPaymentLines.length > 0) {
                    const line = remainingPaymentLines[0];
                    const allocatedAmount = Math.min(remainingAmount, line.amount);
                    allocated.push({ ...line, amount: allocatedAmount });
                    remainingAmount -= allocatedAmount;
                    line.amount -= allocatedAmount;
                    if (line.amount <= 0) remainingPaymentLines.shift();
                }
                if (remainingAmount > 0) {
                    throw new Error('Không thể phân bổ đủ các khoản thanh toán.');
                }
                return allocated;
            };
            const currentSalePaymentLines = takePaymentLines(paidNow);
            const orderPaymentLinesById = new Map<string, CheckoutPaymentLine[]>();
            for (const [id, amount] of orderPaymentTotals.entries()) {
                orderPaymentLinesById.set(id, takePaymentLines(amount));
            }
            const resolvePaymentMethodFromLines = (lines: readonly CheckoutPaymentLine[], fallback: string) => {
                const methods = Array.from(new Set(lines.map(line => line.method)));
                return methods.length > 1 ? 'MIXED' : methods[0] || fallback;
            };
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
            const cashierShiftPaymentLines = checkoutPaymentLines.filter(line => getCashierShiftChannel(line.method) !== 'none');
            const cashierShiftCollectedAmount = cashierShiftPaymentLines.reduce((sum, line) => sum + line.amount, 0);
            const cashierShiftShippingExpenseAmount = repairShipping?.mode === 'customer_paid_now'
                ? 0
                : (repairShipping?.fee || 0);
            const cashierShiftShippingExpenseChannel = repairShipping?.shopPaymentMethod
                ? getCashierShiftChannel(repairShipping.shopPaymentMethod)
                : 'none';
            let cashierShiftRef: FirebaseFirestore.DocumentReference | null = null;
            let cashierShiftUsesTally = false;

            if (cashierShiftCollectedAmount > 0 || cashierShiftShippingExpenseAmount > 0) {
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
            const cashierShiftChanged = Boolean(cashierShiftRef && (cashierShiftCollectedAmount > 0 || cashierShiftShippingExpenseAmount > 0));
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
            const shippingPaidNow = Math.min(customerShippingCharge, remainingPaymentForRepairs);
            const shippingDebt = Math.max(0, customerShippingCharge - shippingPaidNow);
            const remainingCurrentSalePaymentLines = currentSalePaymentLines.map(line => ({ ...line }));
            const takeCurrentSalePaymentLines = (amount: number): CheckoutPaymentLine[] => {
                let remainingAmount = Math.max(0, amount);
                const allocated: CheckoutPaymentLine[] = [];
                while (remainingAmount > 0 && remainingCurrentSalePaymentLines.length > 0) {
                    const line = remainingCurrentSalePaymentLines[0];
                    const allocatedAmount = Math.min(remainingAmount, line.amount);
                    allocated.push({ ...line, amount: allocatedAmount });
                    remainingAmount -= allocatedAmount;
                    line.amount -= allocatedAmount;
                    if (line.amount <= 0) remainingCurrentSalePaymentLines.shift();
                }
                if (remainingAmount > 0) throw new Error('Không thể phân bổ khoản thu cho hóa đơn.');
                return allocated;
            };
            const retailPaymentLines = takeCurrentSalePaymentLines(paidRetailNow);
            const repairPaymentLinesById = new Map<string, CheckoutPaymentLine[]>();
            for (const [id] of repairPaymentTotals.entries()) {
                repairPaymentLinesById.set(id, takeCurrentSalePaymentLines(repairPaidNowById.get(id) || 0));
            }
            const shippingPaymentLines = takeCurrentSalePaymentLines(shippingPaidNow);
            const isDebt = paymentMethodCode === 'DEBT' || newDebt > 0;
            const existingCustomerContactMethods = getCustomerContactMethodsFromData(custSnap?.data());
            const hasIncomingDebtSafeContact = hasDebtSafeContact(incomingContactMethods);
            const hasExistingDebtSafeContact = hasDebtSafeContact(existingCustomerContactMethods);
            if (isDebt && !canCreatePosDebt(customerIdentityMode)) {
                throw new ApiError('Khách lẻ không thể ghi nợ. Hãy chọn hồ sơ khách cũ hoặc xác minh SĐT khách mới bằng OTP.', 400, 'debt_customer_identity_required');
            }
            if (isDebt && (!resolvedCustomerId || (!hasIncomingDebtSafeContact && !hasExistingDebtSafeContact))) {
                throw new ApiError('Đơn hàng ghi nợ hoặc thanh toán thiếu bắt buộc phải có khách hàng và kênh liên hệ rõ như SĐT, Zalo, Facebook, email hoặc địa chỉ.', 400, 'debt_contact_required');
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
            if (repairShipping?.mode === 'shop_advance_on_credit') {
                customerLedgerCount += 1;
            }
            const inventoryLogCount = isPending
                ? 0
                : Array.from(stockProductIds).reduce((count, productId) => {
                    const retailQty = preAggregatedForStock.get(productId) || 0;
                    const repairQty = repairAggregatedForStock.get(productId)?.quantity || 0;
                    return count + (retailQty > 0 ? 1 : 0) + (repairQty > 0 ? 1 : 0);
                }, 0);
            const customerTransactionCount = resolvedCustomerId && orderPaymentTotal > 0 ? 1 : 0;
            const shippingExpenseCount = repairShipping?.mode === 'shop_absorbs' ? 1 : 0;
            const reservationStartedAt = Date.now();
            const reservedIdGroupsPromise = reserveSequentialDocumentIdGroups(tx, db, [
                { key: 'inventoryLogs', collectionName: 'inventory_logs', prefix: 'IL', count: inventoryLogCount },
                { key: 'customerLedger', collectionName: 'customer_ledger', prefix: 'CL', count: customerLedgerCount },
                { key: 'customerTransactions', collectionName: 'customer_transactions', prefix: 'CT', count: customerTransactionCount },
                {
                    key: 'orders',
                    collectionName: 'orders',
                    prefix: 'DH',
                    count: (isDebtCollectionOnly ? 0 : 1) + (repairShipping?.mode === 'shop_advance_on_credit' ? 1 : 0),
                },
                { key: 'shippingExpenses', collectionName: 'expenses', prefix: 'CP', count: shippingExpenseCount },
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
            const shippingExpenseAllocations = reservedIdGroups.get('shippingExpenses') || [];
            let inventoryLogAllocationIndex = 0;
            let customerLedgerAllocationIndex = 0;

            const orderAllocations = reservedIdGroups.get('orders') || [];
            const orderAllocation: ReservedSequentialDocumentId | null = isDebtCollectionOnly ? null : orderAllocations[0] || null;
            const orderRef = orderAllocation?.ref || null;
            const orderId = orderAllocation?.id || '';
            const shippingAdvanceOrderAllocation: ReservedSequentialDocumentId | null = repairShipping?.mode === 'shop_advance_on_credit'
                ? orderAllocations[isDebtCollectionOnly ? 0 : 1] || null
                : null;
            const shippingAdvanceOrderId = shippingAdvanceOrderAllocation?.id || '';
            const debtPaymentReferenceId = updatedOrderIds.length === 1
                ? updatedOrderIds[0]
                : (idempotencyKey || orderId || `DEBT-${updatedOrderIds.map(id => id.slice(-6)).join('-')}`);
            const orderItems = normalizedItems.filter((item) => !item.isOrderPayment);
            const repairShippingRecord = repairShipping ? {
                repairTicketId: repairShipping.repairTicketId,
                mode: repairShipping.mode,
                fee: repairShipping.fee,
                customerCharge: customerShippingCharge,
                recipientName: repairShipping.recipientName,
                recipientPhone: repairShipping.recipientPhone,
                recipientAddress: repairShipping.recipientAddress,
                ...(repairShipping.billingCustomerId ? { billingCustomerId: repairShipping.billingCustomerId } : {}),
                ...(repairShipping.shopPaymentMethod ? { shopPaymentMethod: repairShipping.shopPaymentMethod } : {}),
                ...(shippingAdvanceOrderId ? { shippingAdvanceOrderId } : {}),
                ...(repairShipping.note ? { note: repairShipping.note } : {}),
            } : null;
            const paymentRecordReference = orderId || debtPaymentReferenceId || readString(idempotencyKey);
            const getBankTransferReference = (line: CheckoutPaymentLine) => line.reference
                || (line.method === 'BANK' ? createPosPaymentReference(`${paymentRecordReference}${line.paymentIndex}`) : '');
            const getPaymentRecordId = (line: CheckoutPaymentLine) => `${paymentRecordReference}:payment:${line.paymentIndex}`;
            const currentOrderPaymentMethod = newDebt > 0
                ? 'DEBT'
                : resolvePaymentMethodFromLines(currentSalePaymentLines, paymentMethodCode);

            const order: Record<string, unknown> = {
                ...e2eMetadata,
                customer_info: {
                    customerId: resolvedCustomerId || '',
                    name: incomingContactInput.name || 'Khách lẻ',
                    phone: normalizedPhoneResult?.local || incomingContactInput.phone || '',
                    identityMode: customerIdentityMode,
                    ...(verifiedPhone ? { phoneVerifiedAt: FieldValue.serverTimestamp() } : {}),
                    ...(zaloIdentity ? { zaloExternalId: zaloIdentity.externalId } : {}),
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
                ...(customerShippingCharge > 0 ? { shipping_fee: customerShippingCharge } : {}),
                ...(repairShippingRecord ? { repairShipping: repairShippingRecord } : {}),
                ...(appliedVoucherCode ? { voucherCode: appliedVoucherCode, discountSource: 'voucher' } : {}),
                status: 'Completed',
                source: 'pos',
                containsRepairPayment: repairPaymentTotals.size > 0,
                repairTicketIds: Array.from(repairPaymentTotals.keys()),
                containsOrderPayment: orderPaymentTotals.size > 0,
                orderPaymentIds: Array.from(orderPaymentTotals.keys()),
                is_vat_exported: false,
                payment_method: currentOrderPaymentMethod,
                ...(currentSalePaymentLines.length > 0 ? {
                    paymentBreakdown: currentSalePaymentLines.map(line => ({
                        method: line.method,
                        amount: line.amount,
                        ...(getBankTransferReference(line) ? { reference: getBankTransferReference(line) } : {}),
                    })),
                } : {}),
                ...(newDebt > 0 && currentSalePaymentLines.length === 1 ? { deposit_payment_method: currentSalePaymentLines[0].method } : {}),
                paymentStatus: newDebt > 0 ? 'debt' : 'paid',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                completedAt: FieldValue.serverTimestamp(),
                paymentHistory: currentSalePaymentLines.map(line => ({
                    type: newDebt > 0 ? 'deposit' : 'full',
                    amount: line.amount,
                    method: line.method,
                    paymentRecordId: getPaymentRecordId(line),
                    ...(getBankTransferReference(line) ? { bankTransferReference: getBankTransferReference(line) } : {}),
                    timestamp: Date.now(),
                    note: newDebt > 0
                        ? `Thanh toán một phần POS (${line.amount.toLocaleString('vi-VN')}đ) — nợ lại ${newDebt.toLocaleString('vi-VN')}đ`
                        : `Thanh toán POS — ${line.method}`,
                })),
                createdBy: caller.uid,
                createdByName
            };

            // ── Commission Server-Side Calculation ──
            const commissionableItems = orderItems;
            const commissionableTotal = Math.max(0, currentOrderTotal - customerShippingCharge);
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
                            ...e2eMetadata,
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
                            ...e2eMetadata,
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
            for (const line of checkoutPaymentLines.filter(entry => entry.method === 'BANK')) {
                const linkedOrderIds = new Set<string>();
                if (orderId && currentSalePaymentLines.some(entry => entry.paymentIndex === line.paymentIndex)) {
                    linkedOrderIds.add(orderId);
                }
                for (const [linkedOrderId, lines] of orderPaymentLinesById.entries()) {
                    if (lines.some(entry => entry.paymentIndex === line.paymentIndex)) linkedOrderIds.add(linkedOrderId);
                }
                const reference = getBankTransferReference(line);
                tx.set(db.collection('bank_payment_reconciliations').doc(`BPR-${getPaymentRecordId(line)}`), {
                    ...e2eMetadata,
                    paymentRecordId: getPaymentRecordId(line),
                    reference,
                    expectedAmount: line.amount,
                    paymentMethod: 'BANK',
                    provider: 'vietqr',
                    paymentStatus: 'confirmed',
                    reconciliationStatus: 'pending',
                    orderIds: Array.from(linkedOrderIds),
                    ...(readString(idempotencyKey) ? { idempotencyKey: readString(idempotencyKey) } : {}),
                    confirmedBy: caller.uid,
                    confirmedByName: createdByName,
                    confirmedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            if (repairShipping?.mode === 'shop_advance_on_credit') {
                if (!shippingAdvanceOrderAllocation || !shippingPayerRef || !shippingPayerSnap?.exists) {
                    throw new Error('Không thể tạo chứng từ công nợ phí ship.');
                }
                const payer = shippingPayerSnap.data() || {};
                shippingAdvanceOrderAllocation.commitCounter();
                tx.set(shippingAdvanceOrderAllocation.ref, {
                    ...e2eMetadata,
                    customer_info: {
                        customerId: shippingPayerRef.id,
                        name: String(payer.name || 'Khách/đối tác'),
                        phone: String(payer.phone || ''),
                        primaryContactType: payer.primaryContactType || null,
                        primaryContactValue: payer.primaryContactValue || '',
                    },
                    items: [],
                    subtotal_amount: repairShipping.fee,
                    discount_amount: 0,
                    total_amount: repairShipping.fee,
                    deposit_amount: 0,
                    status: 'Completed',
                    source: 'pos',
                    isShippingAdvance: true,
                    shippingAdvanceRepairTicketId: repairShipping.repairTicketId,
                    parentOrderId: orderId,
                    payment_method: 'DEBT',
                    paymentStatus: 'debt',
                    is_vat_exported: false,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                    completedAt: FieldValue.serverTimestamp(),
                    paymentHistory: [],
                    createdBy: caller.uid,
                    createdByName,
                });
            }
            if (repairShipping?.mode === 'shop_absorbs') {
                const expenseAllocation = shippingExpenseAllocations[0];
                if (!expenseAllocation) {
                    throw new Error('Không thể tạo chứng từ chi phí ship.');
                }
                expenseAllocation.commitCounter();
                tx.set(expenseAllocation.ref, {
                    ...e2eMetadata,
                    category: 'shipping',
                    description: `Phí ship phiếu sửa #${repairShipping.repairTicketId.slice(-6)} (shop chịu)`,
                    amount: repairShipping.fee,
                    paymentMethod: repairShipping.shopPaymentMethod,
                    repairTicketId: repairShipping.repairTicketId,
                    orderId,
                    createdBy: caller.uid,
                    createdByName,
                    date: FieldValue.serverTimestamp(),
                    createdAt: FieldValue.serverTimestamp(),
                });
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
                            paymentHistory: retailPaymentLines.map(line => ({
                                type: paidRetailNow + 1 < retailTotalForPayment ? 'deposit' : 'full',
                                amount: line.amount,
                                method: line.method,
                                timestamp: Date.now(),
                                note: `Doanh thu POS retail thực thu - ${line.method}`,
                            })),
                        } as unknown as Order));
                }
                if (repairRevenue > 0 || repairDebt > 0) {
                    const repairCount = Array.from(repairCompletionTargets.values())
                        .filter(target => target.shouldCountCompletion)
                        .length;
                    revenueDeltas.push({
                        repairRevenue,
                        debtRevenue: repairDebt,
                        repairCount,
                        ...mergeRevenueAggregateDeltas(...Array.from(repairPaymentLinesById.values()).flat().map(line => buildPaymentChannelRevenueDelta(line.amount, line.method))),
                    });
                }
                if (customerShippingCharge > 0) {
                    revenueDeltas.push({
                        shippingRevenue: shippingPaidNow,
                        debtRevenue: shippingDebt,
                        ...mergeRevenueAggregateDeltas(...shippingPaymentLines.map(line => buildPaymentChannelRevenueDelta(line.amount, line.method))),
                    });
                }
                if (repairShipping?.mode === 'shop_absorbs') {
                    revenueDeltas.push({
                        shippingExpense: repairShipping.fee,
                        ...(repairShipping.shopPaymentMethod === 'CASH'
                            ? { cashExpenses: repairShipping.fee }
                            : { bankExpenses: repairShipping.fee }),
                    });
                }
            }
            if (!isPending && orderPaymentTotal > 0) {
                let debtCollectionPosRevenue = 0;
                let debtCollectionWebRevenue = 0;
                let debtCollectionRevenue = 0;
                for (const [id, paymentAmount] of orderPaymentTotals.entries()) {
                    const orderData = orderPaymentDocs.get(id)?.snap.data() || {};
                    if (orderData.isShippingAdvance === true) continue;
                    debtCollectionRevenue += paymentAmount;
                    const source = String(orderData.source || '');
                    if (source === 'pos') debtCollectionPosRevenue += paymentAmount;
                    else debtCollectionWebRevenue += paymentAmount;
                }
                if (debtCollectionRevenue > 0) {
                    revenueDeltas.push({
                        orderRevenue: debtCollectionRevenue,
                        ...mergeRevenueAggregateDeltas(...Array.from(orderPaymentTotals.keys()).flatMap(id => (
                            orderPaymentDocs.get(id)?.snap.data()?.isShippingAdvance === true
                                ? []
                                : (orderPaymentLinesById.get(id) || []).map(line => buildPaymentChannelRevenueDelta(line.amount, line.method))
                        ))),
                        posOrderRevenue: debtCollectionPosRevenue,
                        webOrderRevenue: debtCollectionWebRevenue,
                    });
                }
            }
            if (commissionCost > 0) {
                revenueDeltas.push({ commissionCost });
            }
            incrementRevenueAggregates(tx, db, mergeRevenueAggregateDeltas(...revenueDeltas));

            if (cashierShiftRef && cashierShiftCollectedAmount > 0) {
                if (cashierShiftUsesTally) {
                    for (const line of cashierShiftPaymentLines) {
                        const channel = getCashierShiftChannel(line.method);
                        queueCashierShiftTally(tx, db, {
                            shiftId: cashierShiftRef.id,
                            operationKey: `${readString(idempotencyKey) || orderId || debtPaymentReferenceId}:payment:${line.paymentIndex}`,
                            orderId: isDebtCollectionOnly ? debtPaymentReferenceId : orderId,
                            paymentMethod: line.method,
                            cashAmount: channel === 'cash' ? line.amount : 0,
                            bankAmount: channel === 'bank' ? line.amount : 0,
                            actorId: caller.uid,
                        });
                    }
                } else {
                    const cashierCashAmount = cashierShiftPaymentLines
                        .filter(line => getCashierShiftChannel(line.method) === 'cash')
                        .reduce((sum, line) => sum + line.amount, 0);
                    const cashierBankAmount = cashierShiftPaymentLines
                        .filter(line => getCashierShiftChannel(line.method) === 'bank')
                        .reduce((sum, line) => sum + line.amount, 0);
                    tx.update(cashierShiftRef, {
                        ...(cashierCashAmount > 0 ? { cashSalesAmount: FieldValue.increment(cashierCashAmount) } : {}),
                        ...(cashierBankAmount > 0 ? { bankSalesAmount: FieldValue.increment(cashierBankAmount) } : {}),
                        lastPaymentAmount: cashierShiftCollectedAmount,
                        lastPaymentMethod: resolvePaymentMethodFromLines(cashierShiftPaymentLines, receivedPaymentMethodCode),
                        lastOrderId: isDebtCollectionOnly ? debtPaymentReferenceId : orderId,
                        lastPaymentAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                }
            }
            if (cashierShiftRef && cashierShiftShippingExpenseAmount > 0) {
                if (cashierShiftUsesTally) {
                    queueCashierShiftTally(tx, db, {
                        shiftId: cashierShiftRef.id,
                        operationKey: `${readString(idempotencyKey) || orderId}:repair-shipping`,
                        orderId,
                        paymentMethod: repairShipping?.shopPaymentMethod || 'CASH',
                        cashAmount: cashierShiftShippingExpenseChannel === 'cash' ? cashierShiftShippingExpenseAmount : 0,
                        bankAmount: cashierShiftShippingExpenseChannel === 'bank' ? cashierShiftShippingExpenseAmount : 0,
                        direction: 'expense',
                        movementType: 'repair_shipping',
                        actorId: caller.uid,
                    });
                } else {
                    tx.update(cashierShiftRef, {
                        ...(cashierShiftShippingExpenseChannel === 'cash'
                            ? { cashExpenseAmount: FieldValue.increment(cashierShiftShippingExpenseAmount) }
                            : { bankExpenseAmount: FieldValue.increment(cashierShiftShippingExpenseAmount) }),
                        lastExpenseAmount: cashierShiftShippingExpenseAmount,
                        lastExpenseMethod: repairShipping?.shopPaymentMethod || 'CASH',
                        lastExpenseOrderId: orderId,
                        lastExpenseAt: FieldValue.serverTimestamp(),
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
            const shippingAdvanceDebt = repairShipping?.mode === 'shop_advance_on_credit' ? repairShipping.fee : 0;
            const shippingAdvanceUsesPrimaryCustomer = Boolean(
                shippingAdvanceDebt > 0 && custRef && shippingPayerRef && custRef.id === shippingPayerRef.id,
            );
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
                    const primaryCustomerDebtDelta = deltaDebt + (shippingAdvanceUsesPrimaryCustomer ? shippingAdvanceDebt : 0);
                    if (primaryCustomerDebtDelta !== 0) {
                        updateData.totalDebt = FieldValue.increment(primaryCustomerDebtDelta);
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
                        ...e2eMetadata,
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
                        ...(verifiedPhone ? {
                            contactVerification: {
                                method: 'phone_otp',
                                phone: verifiedPhone,
                                verifiedAt: FieldValue.serverTimestamp(),
                                verifiedBy: caller.uid,
                            },
                        } : {}),
                        ...(zaloIdentity ? {
                            contactProof: {
                                method: 'zalo_contact_card',
                                externalId: zaloIdentity.externalId,
                                profileUrl: zaloIdentity.profileUrl,
                                recordedAt: FieldValue.serverTimestamp(),
                                recordedBy: caller.uid,
                            },
                        } : {}),
                        searchKeywords: buildContactSearchKeywords(incomingContactInput, incomingContactMethods),
                        email: incomingContactInput.email || '',
                        address: incomingContactInput.address || '',
                        note: incomingContactInput.note || '',
                        totalSpent: customerSpendDelta,
                        totalOrders: customerSpendDelta > 0 ? 1 : 0,
                        totalRepairs: 0,
                        totalAppointments: 0,
                        totalDebt: deltaDebt + (shippingAdvanceUsesPrimaryCustomer ? shippingAdvanceDebt : 0),
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                        lastVisit: FieldValue.serverTimestamp(),
                    };

                    tx.set(custRef, newCust);
                }

                if (!isDebtCollectionOnly) {
                    tx.set(customerLedgerAllocations[customerLedgerAllocationIndex++].ref, {
                        ...e2eMetadata,
                        customerId: resolvedCustomerId,
                        type: 'purchase_order',
                        amount: currentOrderTotal,
                        referenceId: orderId,
                        date: FieldValue.serverTimestamp()
                    });
                    if (submittedDepositAmount > 0) {
                        tx.set(customerLedgerAllocations[customerLedgerAllocationIndex++].ref, {
                            ...e2eMetadata,
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
                        ...e2eMetadata,
                        customerId: resolvedCustomerId,
                        type: 'debt_payment',
                        amount: orderPaymentTotal,
                        referenceId: debtPaymentReferenceId,
                        date: FieldValue.serverTimestamp()
                    });
                }
            }
            if (shippingAdvanceDebt > 0 && shippingPayerRef && !shippingAdvanceUsesPrimaryCustomer) {
                tx.update(shippingPayerRef, {
                    totalDebt: FieldValue.increment(shippingAdvanceDebt),
                    updatedAt: FieldValue.serverTimestamp(),
                    lastVisit: FieldValue.serverTimestamp(),
                });
            }
            if (shippingAdvanceDebt > 0 && shippingPayerRef) {
                tx.set(customerLedgerAllocations[customerLedgerAllocationIndex++].ref, {
                    ...e2eMetadata,
                    customerId: shippingPayerRef.id,
                    type: 'shipping_advance',
                    amount: shippingAdvanceDebt,
                    referenceId: shippingAdvanceOrderId,
                    parentOrderId: orderId,
                    repairTicketId: repairShipping?.repairTicketId || '',
                    date: FieldValue.serverTimestamp(),
                });
            }

            // Repair Ticket Link
            if (!isPending) {
                for (const [id, repairPrice] of repairPaymentTotals.entries()) {
                    const repairDoc = repairDocs.get(id);
                    const completionTarget = repairCompletionTargets.get(id);
                    if (!repairDoc) continue;
                    if (!completionTarget) continue;
                    const repairPaidNow = repairPaidNowById.get(id) || 0;
                    const repairPaymentLines = repairPaymentLinesById.get(id) || [];
                    const repairDebt = Math.max(0, repairPrice - repairPaidNow);
                    const isRepairFullyPaid = repairDebt <= 1;
                    tx.update(repairDoc.ref, {
                        'payment.status': isRepairFullyPaid ? 'paid' : 'pay_later',
                        status: completionTarget.targetStatus,
                        'payment.method': repairPaidNow > 0 ? resolvePaymentMethodFromLines(repairPaymentLines, receivedPaymentMethodCode) : paymentMethodCode,
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
                        ...(repairShipping?.repairTicketId === id ? {
                            delivery: {
                                status: 'pending_dispatch',
                                mode: repairShipping.mode,
                                fee: repairShipping.fee,
                                recipientName: repairShipping.recipientName,
                                recipientPhone: repairShipping.recipientPhone,
                                recipientAddress: repairShipping.recipientAddress,
                                ...(repairShipping.billingCustomerId ? { billingCustomerId: repairShipping.billingCustomerId } : {}),
                                ...(repairShipping.shopPaymentMethod ? { shopPaymentMethod: repairShipping.shopPaymentMethod } : {}),
                                checkoutOrderId: orderId,
                                ...(shippingAdvanceOrderId ? { shippingAdvanceOrderId } : {}),
                                ...(repairShipping.note ? { note: repairShipping.note } : {}),
                                createdAt: FieldValue.serverTimestamp(),
                                updatedAt: FieldValue.serverTimestamp(),
                            },
                        } : {}),
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
                        ...(repairPaymentLines.length > 0 ? {
                            paymentHistory: FieldValue.arrayUnion(...repairPaymentLines.map(line => ({
                                type: 'full',
                                amount: line.amount,
                                method: line.method,
                                paymentRecordId: getPaymentRecordId(line),
                                ...(getBankTransferReference(line) ? { bankTransferReference: getBankTransferReference(line) } : {}),
                                timestamp: Date.now(),
                                note: isRepairFullyPaid
                                    ? `Thanh toán gộp hóa đơn POS #${orderId.slice(-6)}`
                                    : `Thanh toán một phần POS #${orderId.slice(-6)}; còn nợ ${repairDebt.toLocaleString('vi-VN')}đ`,
                            }))),
                        } : {})
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
                    const paymentLines = orderPaymentLinesById.get(id) || [];
                    const isFullyPaid = Math.abs(totalOrderAmount - newPaidSoFar) <= 1;

                    tx.update(orderPaymentDoc.ref, {
                        deposit_amount: newPaidSoFar,
                        paymentStatus: isFullyPaid ? 'paid' : 'debt',
                        ...(isFullyPaid ? {
                            status: 'Completed',
                            completedAt: orderData.completedAt || FieldValue.serverTimestamp(),
                        } : {}),
                        updatedAt: FieldValue.serverTimestamp(),
                        paymentHistory: FieldValue.arrayUnion(...paymentLines.map((line, lineIndex) => ({
                            type: 'debt_payment',
                            amount: line.amount,
                            method: line.method,
                            paymentRecordId: getPaymentRecordId(line),
                            ...(getBankTransferReference(line) ? { bankTransferReference: getBankTransferReference(line) } : {}),
                            timestamp: Date.now(),
                            referenceId: idempotencyKey || null,
                            paymentIndex: paymentIndex + lineIndex,
                            ...(lineIndex === paymentLines.length - 1 ? {
                                paidAfter: newPaidSoFar,
                                remainingAfter: remainingAfterPayment,
                            } : {}),
                            note: `Thu nợ tại POS lần ${paymentIndex + lineIndex}: ${line.amount.toLocaleString('vi-VN')}đ`,
                        })))
                    });
                }

                const remainingSettledRepairPaymentLines = new Map<string, CheckoutPaymentLine[]>();
                const takeSettledRepairPaymentLines = (settledOrderId: string, amount: number) => {
                    const remainingLines = remainingSettledRepairPaymentLines.get(settledOrderId)
                        || (orderPaymentLinesById.get(settledOrderId) || []).map(line => ({ ...line }));
                    remainingSettledRepairPaymentLines.set(settledOrderId, remainingLines);
                    let remainingAmount = Math.max(0, amount);
                    const allocated: CheckoutPaymentLine[] = [];
                    while (remainingAmount > 0 && remainingLines.length > 0) {
                        const line = remainingLines[0];
                        const allocatedAmount = Math.min(remainingAmount, line.amount);
                        allocated.push({ ...line, amount: allocatedAmount });
                        remainingAmount -= allocatedAmount;
                        line.amount -= allocatedAmount;
                        if (line.amount <= 0) remainingLines.shift();
                    }
                    return allocated;
                };
                for (const [repairId, settlement] of settledRepairDocs.entries()) {
                    const outstandingOrderId = settlement.ticket.payment?.outstandingOrderId;
                    if (outstandingOrderId !== settlement.orderId) continue;

                    const repairAmount = getRepairPaymentAmount(settlement.ticket, repairId);
                    const paidBefore = getRepairPaidAmount(settlement.ticket);
                    const remainingRepairDebt = Math.max(0, repairAmount - paidBefore);
                    const repairDebtPaymentLines = takeSettledRepairPaymentLines(settlement.orderId, remainingRepairDebt);
                    tx.update(db.collection('repairs').doc(repairId), {
                        'payment.status': 'paid',
                        'payment.depositAmount': repairAmount,
                        'payment.paidAt': FieldValue.serverTimestamp(),
                        'payment.outstandingOrderId': FieldValue.delete(),
                        'payment.outstandingAmount': 0,
                        updatedAt: FieldValue.serverTimestamp(),
                        ...(repairDebtPaymentLines.length > 0 ? {
                            paymentHistory: FieldValue.arrayUnion(...repairDebtPaymentLines.map(line => ({
                                type: 'debt_payment',
                                amount: line.amount,
                                method: line.method,
                                paymentRecordId: getPaymentRecordId(line),
                                ...(getBankTransferReference(line) ? { bankTransferReference: getBankTransferReference(line) } : {}),
                                timestamp: Date.now(),
                                referenceId: idempotencyKey || null,
                                note: `Thu nợ hóa đơn POS #${settlement.orderId.slice(-6)}`,
                            }))),
                        } : {}),
                    });
                }

                let customerTransactionAllocationIndex = 0;
                if (resolvedCustomerId) {
                    if (orderPaymentTotal > 0) {
                        tx.set(customerTransactionAllocations[customerTransactionAllocationIndex++].ref, {
                            ...e2eMetadata,
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
                    ...e2eMetadata,
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
                paymentBreakdown: isDebtCollectionOnly ? [] : currentSalePaymentLines.map(line => ({
                    method: line.method,
                    amount: line.amount,
                    ...(getBankTransferReference(line) ? { reference: getBankTransferReference(line) } : {}),
                })),
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
