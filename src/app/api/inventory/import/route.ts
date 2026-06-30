import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { ImportReceipt, ImportReceiptItem, RepairTicket } from '@/lib/types';
import { buildProductCodeFromId, getProductCodeKind, normalizeProductCode } from '@/lib/productCodes';
import { PART_CATEGORY_LABEL } from '@/lib/constants';
import { REPAIR_PART_STATUS, isRepairPartStatus, isSelectedRepairPart } from '@/lib/repairStatus';
import { buildReactivateOnImportUpdate } from '@/lib/productLifecycle';
import { applyProductImport, planRepairImportAllocation } from '@/lib/inventoryImportAllocation';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentIds } from '@/lib/serverDocumentIds';

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

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_inventory');

        const body = await request.json();
        const { action, receiptId, receiptVersion, idempotencyKey } = body;

        if (!action || !receiptId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed') {
                        return { success: true, fromCache: true };
                    }
                }
            }

            const receiptRef = db.collection('import_receipts').doc(receiptId);
            const receiptSnap = await tx.get(receiptRef);

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

            // PRE-FETCH ALL RELATED DOCUMENTS TO AVOID READ-AFTER-WRITE IN FIRESTORE
            const relatedProductIds = new Set<string>();
            const relatedTicketIds = new Set<string>();

            if (receipt.items) {
                for (const item of receipt.items) {
                    if (item.productId) relatedProductIds.add(item.productId);
                    if (item.ticketId) relatedTicketIds.add(item.ticketId);
                }
            }

            const pSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
            for (const pid of relatedProductIds) {
                pSnaps.set(pid, await tx.get(db.collection('products').doc(pid)));
            }

            const tSnaps = new Map<string, FirebaseFirestore.DocumentSnapshot>();
            for (const tid of relatedTicketIds) {
                tSnaps.set(tid, await tx.get(db.collection('repairs').doc(tid)));
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
                const { paymentMethod, newParts = {} } = body;

                if (receipt.status !== 'ordered') {
                    throw new Error('Chỉ có thể hoàn tất phiếu nhập ở trạng thái đã đặt hàng.');
                }

                const missingSupplier = (receipt.items || []).filter((item) => item.status !== 'unavailable' && !item.supplier && !item.supplierId);
                if (missingSupplier.length > 0) {
                    throw new Error('Thiếu nhà cung cấp. Vui lòng gán nhà cung cấp cho tất cả linh kiện cần nhập.');
                }

                // Calculate actual imported items
                const completedReceiptItems = (receipt.items || []).map((item) =>
                    item.status === 'unavailable' ? item : validateImportItemValues(item),
                );
                const importedItems = completedReceiptItems.filter((i): i is ValidatedReceiptItem => i.status !== 'unavailable');
                if (importedItems.length === 0) {
                    throw new Error('Không có linh kiện nào để nhập kho (tất cả đều không khả dụng).');
                }

                const totalAmount = calculateImportTotal(importedItems);
                const newProductPartKeys = importedItems
                    .map((item) => item.productId ? '' : (item.productId || item.partLineId || ''))
                    .filter((partKey) => partKey && newParts?.[partKey]);
                const uniqueNewProductPartKeys = [...new Set(newProductPartKeys)];
                const newProductAllocations = await reserveSequentialDocumentIds(tx, db, {
                    collectionName: 'products',
                    prefix: receipt.receiptType === 'retail' ? 'SP' : 'LK',
                    count: uniqueNewProductPartKeys.length,
                });
                const newProductIdsByPartKey = new Map<string, string>();
                uniqueNewProductPartKeys.forEach((partKey, index) => {
                    newProductIdsByPartKey.set(partKey, newProductAllocations[index].id);
                });
                const lotAllocations = await reserveSequentialDocumentIds(tx, db, {
                    collectionName: 'inventory_lots',
                    prefix: 'LOT',
                    count: importedItems.length,
                });
                const inventoryLogAllocations = await reserveSequentialDocumentIds(tx, db, {
                    collectionName: 'inventory_logs',
                    prefix: 'IL',
                    count: importedItems.length,
                });
                const debtBySupplier = new Map<string, number>();
                if (paymentMethod === 'debt') {
                    for (const item of importedItems) {
                        const sId = item.supplierId || receipt.supplierId;
                        if (!sId) {
                            throw new Error(`KhĂ´ng thá»ƒ ghi cĂ´ng ná»£: Sáº£n pháº©m "${item.productName}" chÆ°a Ä‘Æ°á»£c gĂ¡n NhĂ  cung cáº¥p há»£p lá»‡ tá»« há»‡ thá»‘ng.`);
                        }
                        const itemTotal = (item.importPrice || 0) * item.quantity;
                        debtBySupplier.set(sId, (debtBySupplier.get(sId) || 0) + itemTotal);
                    }
                }
                const supplierTransactionAllocations = await reserveSequentialDocumentIds(tx, db, {
                    collectionName: 'supplier_transactions',
                    prefix: 'ST',
                    count: debtBySupplier.size,
                });
                const expenseAllocations = await reserveSequentialDocumentIds(tx, db, {
                    collectionName: 'expenses',
                    prefix: 'CP',
                    count: paymentMethod === 'debt' ? 0 : 1,
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
                    const newStock = nextProductState.stock;
                    const newCostPrice = nextProductState.costPrice;

                    const updateData: ProductUpdateData = {
                        stock: newStock,
                        costPrice: newCostPrice,
                        held: workingProduct.held,
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

                    if (newParts && newParts[partKey]) {
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
                    paymentMethod: paymentMethod || 'cash',
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

            // Apply all pending ticket updates
            for (const [tid, updateData] of pendingTicketUpdates.entries()) {
                tx.update(db.collection('repairs').doc(tid), updateData);
            }

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: `inventory_import_${action}`,
                    referenceId: receiptId
                });
            }

            return generatedLotsToReturn ? { success: true, generatedLots: generatedLotsToReturn } : { success: true };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Inventory import API error:', error);
        const message = errorMessage(error);
        return NextResponse.json(
            { error: message },
            { status: message.includes('không') || message.includes('Version') ? 400 : 500 }
        );
    }
}
