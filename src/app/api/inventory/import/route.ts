import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { ImportReceipt, ImportReceiptItem, RepairTicket } from '@/lib/types';
import { buildProductCodeFromId, getProductCodeKind, normalizeProductCode } from '@/lib/productCodes';
import { PART_CATEGORY_LABEL } from '@/lib/constants';
import { REPAIR_PART_STATUS, isRepairPartStatus, isSelectedRepairPart } from '@/lib/repairStatus';
import { buildReactivateOnImportUpdate } from '@/lib/productLifecycle';
import { applyProductImport, assertStockCoversHeld, planRepairImportAllocation } from '@/lib/inventoryImportAllocation';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentIdGroups } from '@/lib/serverDocumentIds';
import { getApiErrorStatus, withApi } from '@/lib/api/handler';

type RepairLine = NonNullable<RepairTicket['parts']>[number];
type ReceiptItem = ImportReceiptItem & {
    ticketId?: string;
    partLineId?: string;
    status?: 'requested' | 'approved' | 'ordered' | 'in_stock' | 'unavailable' | 'selected';
    supplier?: string;
};
type ValidatedReceiptItem = ReceiptItem & {
    importPrice: number;
    quantity: number;
};
type ReceiptData = Omit<Partial<ImportReceipt>, 'items'> & {
    items?: ReceiptItem[];
    version?: number;
    status?: 'draft' | 'ordered' | 'completed';
};
type RepairData = Partial<RepairTicket> & {
    parts?: RepairLine[];
    version?: number;
};
type RepairUpdateData = {
    parts: RepairLine[];
    version: number;
    updatedAt: FieldValue;
    payment?: Partial<RepairTicket['payment']>;
    partsLockedAt?: FieldValue;
};
type ProductData = Record<string, unknown>;
type ProductUpdateData = Record<string, unknown>;
type WorkingProduct = {
    ref: FirebaseFirestore.DocumentReference;
    isNew: boolean;
    data: ProductData;
    stock: number;
    held: number;
    costPrice: number;
    updateData: ProductUpdateData;
};
type ImportPaymentMethod = 'cash' | 'bank' | 'debt';

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Internal server error';
}

function readNonNegativeImportPrice(value: unknown, itemName: string): number {
    const price = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Gia nhap cua "${itemName}" khong hop le.`);
    }
    return price;
}

function readPositiveImportQuantity(value: unknown, itemName: string): number {
    const quantity = typeof value === 'number' ? value : Number(value);
    const normalizedQuantity = Math.floor(quantity);
    if (!Number.isFinite(quantity) || normalizedQuantity <= 0) {
        throw new Error(`So luong nhap cua "${itemName}" khong hop le.`);
    }
    return normalizedQuantity;
}

function validateImportItemValues(item: ReceiptItem): ValidatedReceiptItem {
    const itemName = item.productName || item.productId || item.partLineId || 'mat hang';
    return {
        ...item,
        importPrice: readNonNegativeImportPrice(item.importPrice, String(itemName)),
        quantity: readPositiveImportQuantity(item.quantity, String(itemName)),
    };
}

function calculateImportTotal(items: ValidatedReceiptItem[]): number {
    return items.reduce((sum, item) => sum + item.importPrice * item.quantity, 0);
}

function normalizeImportPaymentMethod(value: unknown): ImportPaymentMethod {
    const method = String(value || 'cash').trim().toLowerCase();
    if (method === 'cash' || method === 'bank' || method === 'debt') {
        return method;
    }
    throw new Error('Phuong thuc thanh toan phieu nhap khong hop le.');
}

export const POST = withApi({
    name: 'inventory/import',
    onError: (error, context) => {
        const message = errorMessage(error);
        const fallbackStatus = message.includes('không') || message.includes('Version') ? 400 : 500;
        return context.error(message, getApiErrorStatus(error, fallbackStatus));
    },
}, async (request: NextRequest, context) => {
    const startedAt = Date.now();
    const debugTiming: Record<string, unknown> = {};
    let lastRequestMark = startedAt;
    let actionForTiming = '';
    let receiptIdForTiming = '';
    const markRequest = (key: string) => {
        const now = Date.now();
        debugTiming[key] = now - lastRequestMark;
        lastRequestMark = now;
    };
    const transactionAttempts: Array<{ attempt: number; steps: Record<string, number>; callbackMs: number }> = [];
    let activeTransactionAttempt: { attempt: number; startedAt: number; lastMark: number; steps: Record<string, number> } | null = null;
    const beginTransactionAttempt = () => {
        const now = Date.now();
        activeTransactionAttempt = {
            attempt: transactionAttempts.length + 1,
            startedAt: now,
            lastMark: now,
            steps: {},
        };
    };
    const markTransaction = (key: string) => {
        if (!activeTransactionAttempt) return;
        const now = Date.now();
        activeTransactionAttempt.steps[key] = now - activeTransactionAttempt.lastMark;
        activeTransactionAttempt.lastMark = now;
    };
    const recordTransactionDuration = (key: string, duration: number) => {
        if (!activeTransactionAttempt) return;
        activeTransactionAttempt.steps[key] = duration;
    };
    const finishTransactionAttempt = () => {
        if (!activeTransactionAttempt) return;
        transactionAttempts.push({
            attempt: activeTransactionAttempt.attempt,
            steps: activeTransactionAttempt.steps,
            callbackMs: Date.now() - activeTransactionAttempt.startedAt,
        });
        activeTransactionAttempt = null;
    };
    const logTiming = (outcome: 'success' | 'error') => {
        debugTiming.action = actionForTiming || 'unknown';
        debugTiming.receiptId = receiptIdForTiming || 'unknown';
        debugTiming.transactionAttempts = transactionAttempts;
        debugTiming.transactionAttemptCount = transactionAttempts.length;
        debugTiming.transactionSteps = transactionAttempts.at(-1)?.steps || {};
        debugTiming.total = Date.now() - startedAt;
        console.warn(`Inventory import API timing (${outcome})`, debugTiming);
    };
    try {
        const caller = await requirePermission(request, 'manage_inventory', (authSteps) => {
            debugTiming.authSteps = authSteps;
        });
        markRequest('auth');

        const body = await context.readJson(request);
        const { action, receiptId, receiptVersion, idempotencyKey } = body;
        actionForTiming = typeof action === 'string' ? action : '';
        receiptIdForTiming = typeof receiptId === 'string' ? receiptId : '';
        markRequest('parseBody');

        if (!action || !receiptId) {
            logTiming('success');
            return context.error('Missing parameters');
        }
        const operationType = `inventory_import_${action}`;
        const requestedPaymentMethod = action === 'complete_import'
            ? normalizeImportPaymentMethod(body.paymentMethod)
            : null;

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            beginTransactionAttempt();
            try {
            const receiptRef = db.collection('import_receipts').doc(receiptId);
            const operationRef = idempotencyKey ? db.collection('operation_requests').doc(idempotencyKey) : null;
            let receiptSnap: FirebaseFirestore.DocumentSnapshot;

            if (operationRef) {
                const [opSnap, loadedReceiptSnap] = await tx.getAll(operationRef, receiptRef);
                receiptSnap = loadedReceiptSnap;
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed') {
                        if (
                            data.type !== operationType ||
                            data.referenceId !== receiptId ||
                            (data.paymentMethod ?? null) !== requestedPaymentMethod
                        ) {
                            throw new Error('Idempotency key da duoc dung cho thao tac khac.');
                        }
                        markTransaction('readCoreDocuments');
                        return { success: true, fromCache: true };
                    }
                }
            } else {
                receiptSnap = await tx.get(receiptRef);
            }
            markTransaction('readCoreDocuments');

            if (!receiptSnap.exists) {
                throw new Error('Phiếu nhập không tồn tại.');
            }

            const receipt = receiptSnap.data() as ReceiptData;

            if (receipt.version !== undefined && receipt.version !== receiptVersion) {
                throw new Error('Dữ liệu phiếu nhập đã bị thay đổi (Version mismatch). Vui lòng tải lại trang.');
            }

            if (receipt.status === 'completed') {
                throw new Error('Phiếu nhập đã hoàn tất, không thể thay đổi.');
            }


            if (action === 'patch_item') {
                const itemIndex = Number(body.itemIndex);
                if (!Number.isInteger(itemIndex) || itemIndex < 0) {
                    throw new Error('Dong phieu nhap khong hop le.');
                }
                const items = [...(receipt.items || [])];
                const currentItem = items[itemIndex];
                if (!currentItem) {
                    throw new Error('Khong tim thay dong phieu nhap.');
                }

                const patch = body.patch || {};
                const nextItem: ReceiptItem = { ...currentItem };
                if (Object.prototype.hasOwnProperty.call(patch, 'importPrice')) {
                    nextItem.importPrice = readNonNegativeImportPrice(patch.importPrice, String(currentItem.productName || currentItem.productId || itemIndex));
                }
                if (Object.prototype.hasOwnProperty.call(patch, 'quantity')) {
                    nextItem.quantity = readPositiveImportQuantity(patch.quantity, String(currentItem.productName || currentItem.productId || itemIndex));
                }
                if (Object.prototype.hasOwnProperty.call(patch, 'supplier')) {
                    nextItem.supplier = typeof patch.supplier === 'string' ? patch.supplier.trim() : '';
                }
                if (Object.prototype.hasOwnProperty.call(patch, 'supplierId')) {
                    nextItem.supplierId = typeof patch.supplierId === 'string' ? patch.supplierId.trim() : '';
                }

                items[itemIndex] = nextItem;
                const totalAmount = calculateImportTotal(
                    items
                        .filter((item) => item.status !== 'unavailable')
                        .map(validateImportItemValues),
                );

                tx.update(receiptRef, {
                    items,
                    totalAmount,
                    version: (receipt.version || 0) + 1,
                    updatedAt: FieldValue.serverTimestamp(),
                });

                markTransaction('patchItem');
                return { success: true, items, totalAmount, version: (receipt.version || 0) + 1 };
            }

            // PRE-FETCH ALL RELATED DOCUMENTS TO AVOID READ-AFTER-WRITE IN FIRESTORE
            const relatedProductIds = new Set<string>();
            const relatedTicketIds = new Set<string>();

            if (receipt.items) {
                for (const item of receipt.items) {
                    if (item.productId) relatedProductIds.add(item.productId);
                    if (item.ticketId) relatedTicketIds.add(item.ticketId);
                }
            }

            const relatedProductRefs = Array.from(relatedProductIds, (productId) => ({
                id: productId,
                ref: db.collection('products').doc(productId),
            }));
            const relatedTicketRefs = Array.from(relatedTicketIds, (ticketId) => ({
                id: ticketId,
                ref: db.collection('repairs').doc(ticketId),
            }));
            const relatedDocumentRefs = [...relatedProductRefs, ...relatedTicketRefs];
            const relatedDocumentSnapshotsPromise = relatedDocumentRefs.length > 0
                ? tx.getAll(...relatedDocumentRefs.map((entry) => entry.ref))
                : Promise.resolve([]);
            const pSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
            const tSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
            let relatedDocumentsLoaded = false;
            const loadRelatedDocuments = async () => {
                if (relatedDocumentsLoaded) return;
                const snapshots = await relatedDocumentSnapshotsPromise;
                snapshots.forEach((snapshot, index) => {
                    const relatedRef = relatedDocumentRefs[index];
                    if (index < relatedProductRefs.length) {
                        pSnaps.set(relatedRef.id, snapshot);
                    } else {
                        tSnaps.set(relatedRef.id, snapshot);
                    }
                });
                relatedDocumentsLoaded = true;
                markTransaction('readRelatedDocuments');
            };

            const prepareCompletionReservation = () => {
                    const newParts = body.newParts || {};
                    const paymentMethod = requestedPaymentMethod;
                    if (!paymentMethod) {
                        throw new Error('Phương thức thanh toán phiếu nhập không hợp lệ.');
                    }
                    if (receipt.status !== 'ordered') {
                        throw new Error('Chỉ có thể hoàn tất phiếu nhập ở trạng thái đã đặt hàng.');
                    }

                    const missingSupplier = (receipt.items || []).filter((item) => item.status !== 'unavailable' && !item.supplier && !item.supplierId && !receipt.supplierId);
                    if (missingSupplier.length > 0) {
                        throw new Error('Thiếu nhà cung cấp. Vui lòng gán nhà cung cấp cho tất cả linh kiện cần nhập.');
                    }

                    const completedReceiptItems = (receipt.items || []).map((item) =>
                        item.status === 'unavailable' ? item : validateImportItemValues(item),
                    );
                    const importedItems = completedReceiptItems.filter((item): item is ValidatedReceiptItem => item.status !== 'unavailable');
                    if (importedItems.length === 0) {
                        throw new Error('Không có linh kiện nào để nhập kho (tất cả đều không khả dụng).');
                    }

                    const totalAmount = calculateImportTotal(importedItems);
                    const newProductPartKeys = importedItems
                        .map((item) => item.productId ? '' : (item.productId || item.partLineId || ''))
                        .filter((partKey) => partKey && newParts?.[partKey]);
                    const uniqueNewProductPartKeys = [...new Set(newProductPartKeys)];
                    const debtBySupplier = new Map<string, number>();
                    if (paymentMethod === 'debt') {
                        for (const item of importedItems) {
                            const supplierId = item.supplierId || receipt.supplierId;
                            if (!supplierId) {
                                throw new Error(`Không thể ghi công nợ: Sản phẩm "${item.productName}" chưa được gán Nhà cung cấp hợp lệ từ hệ thống.`);
                            }
                            const itemTotal = (item.importPrice || 0) * item.quantity;
                            debtBySupplier.set(supplierId, (debtBySupplier.get(supplierId) || 0) + itemTotal);
                        }
                    }

                    const reserveIdsStartedAt = Date.now();
                    const reservedIdGroupsPromise = reserveSequentialDocumentIdGroups(tx, db, [
                        {
                            key: 'newProducts',
                            collectionName: 'products',
                            prefix: receipt.receiptType === 'retail' ? 'SP' : 'LK',
                            count: uniqueNewProductPartKeys.length,
                        },
                        { key: 'lots', collectionName: 'inventory_lots', prefix: 'LOT', count: importedItems.length },
                        { key: 'inventoryLogs', collectionName: 'inventory_logs', prefix: 'IL', count: importedItems.length },
                        { key: 'supplierTransactions', collectionName: 'supplier_transactions', prefix: 'ST', count: debtBySupplier.size },
                        { key: 'expense', collectionName: 'expenses', prefix: 'CP', count: paymentMethod === 'debt' ? 0 : 1 },
                    ]);

                return {
                    newParts,
                    paymentMethod,
                    completedReceiptItems,
                    importedItems,
                    totalAmount,
                    uniqueNewProductPartKeys,
                    debtBySupplier,
                    reserveIdsStartedAt,
                    reservedIdGroupsPromise,
                };
            };
            let completionReservation: ReturnType<typeof prepareCompletionReservation> | null = null;
            try {
                if (action === 'complete_import') {
                    completionReservation = prepareCompletionReservation();
                }
            } catch (error) {
                await relatedDocumentSnapshotsPromise.catch(() => undefined);
                throw error;
            }

            try {
                await loadRelatedDocuments();
            } catch (error) {
                await completionReservation?.reservedIdGroupsPromise.catch(() => undefined);
                throw error;
            }

            const pendingTicketUpdates = new Map<string, RepairUpdateData>();

            const updateRepairLine = (ticketId: string, partLineId: string, updateFn: (line: RepairLine) => void) => {
                const ticketSnap = tSnaps.get(ticketId);
                if (!ticketSnap || !ticketSnap.exists) return;

                const ticketData = (pendingTicketUpdates.get(ticketId) as unknown as RepairData) || (ticketSnap.data() as RepairData);
                if (!ticketData.parts) return;

                const lineIndex = ticketData.parts.findIndex((p) => p.partLineId === partLineId);
                if (lineIndex !== -1) {
                    updateFn(ticketData.parts[lineIndex]);

                    const updateData: RepairUpdateData = {
                        parts: ticketData.parts,
                        version: (ticketData.version || 0) + 1,
                        updatedAt: FieldValue.serverTimestamp()
                    };

                    if (isSelectedRepairPart(ticketData.parts[lineIndex])) {
                        const selectedParts = ticketData.parts.filter(isSelectedRepairPart);
                        const partsCost = selectedParts.reduce((sum, p) => sum + ((p.unitPriceAtUse || 0) * p.quantity), 0);

                        const currentPayment = (ticketData.payment || {}) as Partial<RepairTicket['payment']>;
                        const laborCost = currentPayment.laborCost || 0;
                        const additionalFees = currentPayment.additionalFees || 0;
                        const discountAmount = currentPayment.discountAmount || 0;

                        updateData.payment = {
                            ...currentPayment,
                            partsCost,
                            amount: laborCost + partsCost + additionalFees - discountAmount
                        };

                        if (!ticketData.partsLockedAt) {
                            updateData.partsLockedAt = FieldValue.serverTimestamp();
                        }
                    }

                    pendingTicketUpdates.set(ticketId, updateData);
                }
            };
            
            let generatedLotsToReturn: { product: { id: string } & Record<string, unknown>, lotCode: string, copies: number }[] | null = null;

            if (action === 'order_receipt') {
                if (receipt.status !== 'draft') {
                    throw new Error('Chỉ có thể đặt hàng từ phiếu nhập.');
                }

                const importableItems = (receipt.items || []).filter((item) => item.status !== 'unavailable');
                if (importableItems.length === 0) {
                    throw new Error('Phiếu không còn linh kiện có thể đặt hàng.');
                }
                const missingSupplier = importableItems.filter(
                    (item) => !item.supplierId && !item.supplier && !receipt.supplierId,
                );
                if (missingSupplier.length > 0) {
                    throw new Error(`Còn ${missingSupplier.length} linh kiện chưa được gán nhà cung cấp.`);
                }

                tx.update(receiptRef, {
                    status: 'ordered',
                    orderedAt: FieldValue.serverTimestamp(),
                    orderedBy: caller.uid,
                    version: (receipt.version || 0) + 1,
                    updatedAt: FieldValue.serverTimestamp()
                });

                // Update linked repair parts to 'ordered'
                if (receipt.items && receipt.items.length > 0) {
                    for (const item of importableItems) {
                        if (item.ticketId && item.partLineId) {
                            updateRepairLine(item.ticketId, item.partLineId, (line) => {
                                if (isRepairPartStatus(line.status, REPAIR_PART_STATUS.REQUESTED) || isRepairPartStatus(line.status, REPAIR_PART_STATUS.APPROVED)) {
                                    line.status = REPAIR_PART_STATUS.ORDERED;
                                }
                            });
                        }
                    }
                }
            } else if (action === 'mark_availability') {
                const { partLineId, itemIndex, availability } = body;
                const parsedItemIndex = Number(itemIndex);
                const hasItemIndex = Number.isInteger(parsedItemIndex) && parsedItemIndex >= 0;
                if ((!partLineId && !hasItemIndex) || !['in_stock', 'unavailable', 'approved'].includes(availability)) {
                    throw new Error('Tham số mark_availability không hợp lệ.');
                }

                let foundItem = false;
                let targetItem: ReceiptItem | undefined;
                const newItems = (receipt.items || []).map((item, index) => {
                    const isTarget = partLineId ? item.partLineId === partLineId : index === parsedItemIndex;
                    if (isTarget) {
                        foundItem = true;
                        targetItem = item;
                        return { ...item, status: availability };
                    }
                    return item;
                });

                if (!foundItem) throw new Error('Không tìm thấy linh kiện trong phiếu nhập.');

                const totalAmount = calculateImportTotal(
                    newItems
                        .filter((item) => item.status !== 'unavailable')
                        .map(validateImportItemValues),
                );
                tx.update(receiptRef, {
                    items: newItems,
                    totalAmount,
                    version: (receipt.version || 0) + 1,
                    updatedAt: FieldValue.serverTimestamp()
                });

                // Update linked repair part
                if (targetItem?.ticketId && targetItem.partLineId) {
                    updateRepairLine(targetItem.ticketId, targetItem.partLineId, (line) => {
                        if (
                            isRepairPartStatus(line.status, REPAIR_PART_STATUS.ORDERED) ||
                            isRepairPartStatus(line.status, REPAIR_PART_STATUS.REQUESTED) ||
                            isRepairPartStatus(line.status, REPAIR_PART_STATUS.APPROVED) ||
                            isRepairPartStatus(line.status, REPAIR_PART_STATUS.IN_STOCK) ||
                            isRepairPartStatus(line.status, REPAIR_PART_STATUS.UNAVAILABLE)
                        ) {
                            line.status = availability;
                        }
                    });
                }
            } else if (action === 'complete_import') {
                const completion = completionReservation;
                if (!completion) {
                    throw new Error('Không thể khởi tạo dữ liệu nhập kho.');
                }
                const {
                    newParts,
                    paymentMethod,
                    completedReceiptItems,
                    importedItems,
                    totalAmount,
                    uniqueNewProductPartKeys,
                    debtBySupplier,
                    reserveIdsStartedAt,
                    reservedIdGroupsPromise,
                } = completion;
                const reservedIdGroups = await reservedIdGroupsPromise;
                markTransaction('reserveIdsWait');
                recordTransactionDuration('reserveIdsTotal', Date.now() - reserveIdsStartedAt);

                const newProductAllocations = reservedIdGroups.get('newProducts') || [];
                const lotAllocations = reservedIdGroups.get('lots') || [];
                const inventoryLogAllocations = reservedIdGroups.get('inventoryLogs') || [];
                const supplierTransactionAllocations = reservedIdGroups.get('supplierTransactions') || [];
                const expenseAllocations = reservedIdGroups.get('expense') || [];
                const newProductIdsByPartKey = new Map<string, string>();
                uniqueNewProductPartKeys.forEach((partKey, index) => {
                    newProductIdsByPartKey.set(partKey, newProductAllocations[index].id);
                });

                const lotCode = 'PN-' + new Date().toISOString().slice(2, 7).replace('-', '') + '-' + Math.floor(1000 + Math.random() * 9000);

                const workingProducts = new Map<string, WorkingProduct>();
                const generatedLots = [];
                let lotAllocationIndex = 0;
                let inventoryLogAllocationIndex = 0;

                // Calculate all product mutations first. Each product is written once after aggregation.
                for (const item of importedItems) {
                    const importedQuantity = Number(item.quantity);
                    const originalTicketId = item.ticketId;
                    const originalPartLineId = item.partLineId;
                    const partKey = item.productId || item.partLineId || '';

                    let targetProductId = item.productId;
                    let isNewProduct = false;

                    if (!targetProductId && newParts && newParts[partKey]) {
                        const allocatedProductId = newProductIdsByPartKey.get(partKey);
                        if (!allocatedProductId) {
                            throw new Error(`Khong the tao ma san pham moi cho "${item.productName}".`);
                        }
                        targetProductId = allocatedProductId;
                        item.productId = targetProductId; // modify in-memory reference
                        isNewProduct = true;
                    }

                    if (!targetProductId) {
                        throw new Error(`Mặt hàng "${item.productName}" chưa có sản phẩm đích.`);
                    }

                    let workingProduct = workingProducts.get(targetProductId);
                    if (!workingProduct) {
                        const pRef = db.collection('products').doc(targetProductId);
                        const pSnap = isNewProduct ? undefined : pSnaps.get(targetProductId);
                        if (!isNewProduct && (!pSnap || !pSnap.exists)) {
                            throw new Error(`Sản phẩm "${item.productName}" không còn tồn tại.`);
                        }
                        const pData = (pSnap?.data() || {}) as ProductData;
                        workingProduct = {
                            ref: pRef,
                            isNew: isNewProduct,
                            data: pData,
                            stock: Number(pData.stock) || 0,
                            held: Number(pData.held) || 0,
                            costPrice: Number(pData.costPrice) || 0,
                            updateData: {},
                        };
                        assertStockCoversHeld({
                            stock: workingProduct.stock,
                            held: workingProduct.held,
                            label: String(pData.name || item.productName || targetProductId),
                        });
                        workingProducts.set(targetProductId, workingProduct);
                    }

                    const pData = workingProduct.data;
                    const currentStock = workingProduct.stock;

                    let linkedLine: RepairLine | undefined;
                    let allocation = planRepairImportAllocation(importedQuantity);
                    if (item.ticketId && item.partLineId) {
                        const tSnap = tSnaps.get(item.ticketId);
                        if (tSnap && tSnap.exists) {
                            const ticketData = (pendingTicketUpdates.get(item.ticketId) as unknown as RepairData) || (tSnap.data() as RepairData);
                            linkedLine = ticketData.parts?.find(part => part.partLineId === item.partLineId);
                        }
                        allocation = planRepairImportAllocation(importedQuantity, linkedLine);
                    }

                    item.allocatedHeldQuantity = allocation.heldQuantity;
                    item.surplusQuantity = allocation.surplusQuantity;
                    if (allocation.shouldUnlink && item.ticketId && item.partLineId) {
                        item.unlinkedReason = allocation.unlinkReason;
                        delete item.ticketId;
                        delete item.partLineId;
                    }

                    const nextProductState = applyProductImport(
                        workingProduct,
                        importedQuantity,
                        item.importPrice,
                        allocation.heldQuantity,
                    );
                    workingProduct.stock = nextProductState.stock;
                    workingProduct.held = nextProductState.held;
                    workingProduct.costPrice = nextProductState.costPrice;
                    assertStockCoversHeld({
                        stock: workingProduct.stock,
                        held: workingProduct.held,
                        label: String(pData.name || item.productName || targetProductId),
                    });
                    const newStock = nextProductState.stock;
                    const newCostPrice = nextProductState.costPrice;

                    const updateData: ProductUpdateData = {
                        stock: newStock,
                        costPrice: newCostPrice,
                        held: workingProduct.held,
                        inventoryTrackingMode: 'fifo',
                        updatedAt: FieldValue.serverTimestamp(),
                        ...buildReactivateOnImportUpdate({
                            status: String(pData.status || 'active') as 'active' | 'hidden' | 'inactive',
                            stock: currentStock,
                            held: workingProduct.held - allocation.heldQuantity,
                            isProposed: pData.isProposed === true,
                        }, newStock),
                    };
                    const productCode = normalizeProductCode(pData.sku || pData.barcode || pData.productCode)
                        || buildProductCodeFromId(targetProductId, getProductCodeKind(pData as ProductData));
                    updateData.sku = productCode;
                    updateData.barcode = productCode;
                    updateData.productCode = productCode;
                    updateData.qrCodes = [productCode];

                    // Only a brand-new product or an explicit proposed catalog record
                    // may receive catalog details from the "new item" form. A stale
                    // client preview must never overwrite a confirmed product.
                    if ((workingProduct.isNew || pData.isProposed === true) && newParts && newParts[partKey]) {
                        const info = newParts[partKey];
                        const categoryIds = Array.isArray(info.categoryIds)
                            ? info.categoryIds.filter((value: unknown) => typeof value === 'string' && value.trim())
                            : [];
                        if (categoryIds.length === 0) {
                            throw new Error(`Mặt hàng "${item.productName}" chưa được gán taxonomy.`);
                        }
                        updateData.name = item.productName;
                        updateData.price_original = item.importPrice;
                        updateData.price_promo = Number(info.price_promo) || 0;
                        updateData.quality = item.quality || 'Zin';
                        updateData.supplier = item.supplier || info.supplier || '';
                        updateData.status = 'active';
                        updateData.isProposed = false;

                        if (receipt.receiptType === 'retail') {
                            updateData.category = typeof info.category === 'string' && info.category.trim()
                                ? info.category.trim()
                                : pData.category || '';
                            updateData.categoryIds = categoryIds;
                        } else {
                            updateData.category = PART_CATEGORY_LABEL;
                            updateData.categoryIds = categoryIds;
                            updateData.partType = info.partType || pData.partType || '';
                            updateData.description = info.model || pData.description || '';
                        }
                    }

                    workingProduct.updateData = { ...workingProduct.updateData, ...updateData };
                    if (workingProduct.isNew) {
                        workingProduct.updateData.createdAt = FieldValue.serverTimestamp();
                    }

                    // Create Inventory Lot
                    const lotAllocation = lotAllocations[lotAllocationIndex++];
                    const lotRef = lotAllocation.ref;
                    tx.set(lotRef, {
                        lotCode: lotCode,
                        productId: targetProductId,
                        supplierId: item.supplierId || receipt.supplierId || null,
                        importPrice: item.importPrice,
                        initialQuantity: importedQuantity,
                        remainingQuantity: importedQuantity,
                        status: 'active',
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp()
                    });
                    
                    generatedLots.push({
                        product: {
                            ...pData,
                            ...workingProduct.updateData,
                            id: targetProductId
                        },
                        lotCode: lotCode,
                        copies: importedQuantity
                    });

                    // Write Inventory Log (Audit Trail)
                    const inventoryLogAllocation = inventoryLogAllocations[inventoryLogAllocationIndex++];
                    const logRef = inventoryLogAllocation.ref;
                    tx.set(logRef, {
                        productId: targetProductId,
                        productName: item.productName || pData.name || 'Sản phẩm mới',
                        quantity: importedQuantity,
                        supplierId: item.supplierId || receipt.supplierId || item.supplier || null,
                        lotCode: lotCode,
                        heldQuantity: allocation.heldQuantity,
                        surplusQuantity: allocation.surplusQuantity,
                        repairTicketId: originalTicketId || null,
                        partLineId: originalPartLineId || null,
                        unlinkReason: item.unlinkedReason || null,
                        costPriceAtLog: newCostPrice,
                        type: 'IMPORT',
                        referenceId: receiptId,
                        referenceType: 'import_receipt',
                        createdBy: caller.uid,
                        createdAt: FieldValue.serverTimestamp()
                    });

                    // Accumulate reservations and expose the line only after it is fully reserved.
                    if (item.ticketId && item.partLineId && linkedLine) {
                        updateRepairLine(item.ticketId, item.partLineId, (line) => {
                            if (
                                isRepairPartStatus(line.status, REPAIR_PART_STATUS.IN_STOCK) ||
                                isRepairPartStatus(line.status, REPAIR_PART_STATUS.ORDERED) ||
                                isRepairPartStatus(line.status, REPAIR_PART_STATUS.REQUESTED) ||
                                isRepairPartStatus(line.status, REPAIR_PART_STATUS.APPROVED)
                            ) {
                                const reservedQuantity = Math.min(
                                    line.quantity,
                                    (Number(line.reservedQuantity) || 0) + allocation.heldQuantity,
                                );
                                line.reservedQuantity = reservedQuantity;
                                if (reservedQuantity >= line.quantity) {
                                    line.status = REPAIR_PART_STATUS.SELECTED;
                                }
                                line.unitPriceAtUse = Number(updateData.price_promo || pData.price_promo) || 0;
                                line.unitCostAtUse = newCostPrice;
                                line.priceConfirmedAt = new Date();
                                line.productId = targetProductId; // Update the line with the new product ID
                            }
                        });
                    }
                }

                for (const workingProduct of workingProducts.values()) {
                    if (workingProduct.isNew) {
                        tx.set(workingProduct.ref, workingProduct.updateData);
                    } else {
                        tx.update(workingProduct.ref, workingProduct.updateData);
                    }
                }

                // Finalize receipt
                tx.update(receiptRef, {
                    status: 'completed',
                    lotCode: lotCode,
                    items: completedReceiptItems,
                    completedAt: FieldValue.serverTimestamp(),
                    completedBy: caller.uid,
                    totalAmount,
                    paymentMethod,
                    version: (receipt.version || 0) + 1,
                    updatedAt: FieldValue.serverTimestamp()
                });
                if (paymentMethod === 'debt') {
                    incrementRevenueAggregates(tx, db, { importDebt: totalAmount, debtExpenses: totalAmount });
                } else {
                    const paidImportDelta = paymentMethod === 'bank'
                        ? { importCost: totalAmount, bankExpenses: totalAmount }
                        : { importCost: totalAmount, cashExpenses: totalAmount };
                    incrementRevenueAggregates(tx, db, paidImportDelta);
                }

                // Add Supplier Transaction if debt
                if (paymentMethod === 'debt') {
                    let supplierTransactionAllocationIndex = 0;
                    for (const [sId, amount] of debtBySupplier.entries()) {
                        const suppTxRef = supplierTransactionAllocations[supplierTransactionAllocationIndex++].ref;
                        tx.set(suppTxRef, {
                            supplierId: sId,
                            type: 'import_debt',
                            amount: amount,
                            importReceiptId: receiptId,
                            date: FieldValue.serverTimestamp(),
                            createdBy: caller.uid
                        });

                        const suppRef = db.collection('suppliers').doc(sId);
                        tx.update(suppRef, {
                            totalDebt: FieldValue.increment(amount),
                            updatedAt: FieldValue.serverTimestamp()
                        });
                    }
                } else {
                    // Pay immediately
                    const expenseRef = expenseAllocations[0].ref;
                    tx.set(expenseRef, {
                        type: 'inventory',
                        amount: totalAmount,
                        date: FieldValue.serverTimestamp(),
                        paymentMethod: paymentMethod,
                        description: `Thanh toán phiếu nhập kho ${receiptId}`,
                        referenceId: receiptId,
                        referenceType: 'import_receipt',
                        createdBy: caller.uid
                    });
                }

                newProductAllocations.at(-1)?.commitCounter();
                lotAllocations.at(-1)?.commitCounter();
                inventoryLogAllocations.at(-1)?.commitCounter();
                supplierTransactionAllocations.at(-1)?.commitCounter();
                expenseAllocations.at(-1)?.commitCounter();

                generatedLotsToReturn = generatedLots;
            } else {
                throw new Error('Action không hợp lệ.');
            }

            markTransaction('actionAndWrites');
            // Apply all pending ticket updates
            for (const [tid, updateData] of pendingTicketUpdates.entries()) {
                tx.update(db.collection('repairs').doc(tid), updateData);
            }

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: operationType,
                    referenceId: receiptId,
                    paymentMethod: requestedPaymentMethod
                });
            }

            markTransaction('queueFinalWrites');
            return generatedLotsToReturn ? { success: true, generatedLots: generatedLotsToReturn } : { success: true };
            } finally {
                finishTransactionAttempt();
            }
        });

        markRequest('transaction');
        logTiming('success');
        return context.json(result);
    } catch (error: unknown) {
        finishTransactionAttempt();
        logTiming('error');
        throw error;
    }
});
