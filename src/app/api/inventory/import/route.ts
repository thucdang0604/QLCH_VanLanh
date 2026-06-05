import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { ImportReceipt, ImportReceiptItem, RepairTicket } from '@/lib/types';
import { buildProductCodeFromId, getProductCodeKind, normalizeProductCode } from '@/lib/productCodes';

type RepairLine = NonNullable<RepairTicket['parts']>[number];
type ReceiptItem = ImportReceiptItem & {
    ticketId?: string;
    partLineId?: string;
    status?: 'requested' | 'approved' | 'ordered' | 'in_stock' | 'unavailable' | 'selected';
    supplier?: string;
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

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Internal server error';
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
                throw new Error('Phiáº¿u nháº­p khĂ´ng tá»“n táº¡i.');
            }

            const receipt = receiptSnap.data() as ReceiptData;

            if (receipt.version !== undefined && receipt.version !== receiptVersion) {
                throw new Error('Dá»¯ liá»‡u phiáº¿u nháº­p Ä‘Ă£ bá»‹ thay Ä‘á»•i (Version mismatch). Vui lĂ²ng táº£i láº¡i trang.');
            }

            if (receipt.status === 'completed') {
                throw new Error('Phiáº¿u nháº­p Ä‘Ă£ hoĂ n táº¥t, khĂ´ng thá»ƒ thay Ä‘á»•i.');
            }

            const updateRepairLine = async (ticketId: string, partLineId: string, updateFn: (line: RepairLine) => void) => {
                const ticketRef = db.collection('repairs').doc(ticketId);
                const ticketSnap = await tx.get(ticketRef);
                if (!ticketSnap.exists) return;
                
                const ticketData = ticketSnap.data() as RepairData;
                if (!ticketData.parts) return;
                
                const lineIndex = ticketData.parts.findIndex((p) => p.partLineId === partLineId);
                if (lineIndex !== -1) {
                    updateFn(ticketData.parts[lineIndex]);
                    
                    const updateData: RepairUpdateData = {
                        parts: ticketData.parts,
                        version: (ticketData.version || 0) + 1,
                        updatedAt: FieldValue.serverTimestamp()
                    };
                    
                    // If we need to recompute payment (used in complete_import)
                    if (ticketData.parts[lineIndex].status === 'selected') {
                        const selectedParts = ticketData.parts.filter((p) => p.status === 'selected');
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
                    
                    tx.update(ticketRef, updateData);
                }
            };

            if (action === 'order_receipt') {
                if (receipt.status !== 'draft') {
                    throw new Error('Chá»‰ cĂ³ thá»ƒ Ä‘áº·t hĂ ng tá»« phiáº¿u nhĂ¡p.');
                }
                
                if (!receipt.supplierId) {
                    throw new Error('Vui lĂ²ng chá»n nhĂ  cung cáº¥p trÆ°á»›c khi Ä‘áº·t hĂ ng.');
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
                    for (const item of receipt.items) {
                        if (item.ticketId && item.partLineId) {
                            await updateRepairLine(item.ticketId, item.partLineId, (line) => {
                                if (line.status === 'requested' || line.status === 'approved') {
                                    line.status = 'ordered';
                                }
                            });
                        }
                    }
                }
            } else if (action === 'mark_availability') {
                const { partLineId, availability } = body;
                if (!partLineId || !['in_stock', 'unavailable'].includes(availability)) {
                    throw new Error('Tham sá»‘ mark_availability khĂ´ng há»£p lá»‡.');
                }
                
                let foundItem = false;
                const newItems = (receipt.items || []).map((item) => {
                    if (item.partLineId === partLineId) {
                        foundItem = true;
                        return { ...item, status: availability };
                    }
                    return item;
                });
                
                if (!foundItem) throw new Error('KhĂ´ng tĂ¬m tháº¥y linh kiá»‡n trong phiáº¿u nháº­p.');
                
                tx.update(receiptRef, {
                    items: newItems,
                    version: (receipt.version || 0) + 1,
                    updatedAt: FieldValue.serverTimestamp()
                });
                
                // Update linked repair part
                const targetItem = receipt.items?.find((i) => i.partLineId === partLineId);
                if (targetItem?.ticketId) {
                    await updateRepairLine(targetItem.ticketId, partLineId, (line) => {
                        if (line.status === 'ordered' || line.status === 'requested') {
                            line.status = availability;
                        }
                    });
                }
            } else if (action === 'complete_import') {
                const { paymentMethod, newParts = {} } = body;
                
                if (receipt.status !== 'ordered') {
                    throw new Error('Chá»‰ cĂ³ thá»ƒ hoĂ n táº¥t phiáº¿u nháº­p á»Ÿ tráº¡ng thĂ¡i Ä‘Ă£ Ä‘áº·t hĂ ng.');
                }
                
                if (!receipt.supplierId) throw new Error('Thiáº¿u nhĂ  cung cáº¥p.');
                
                // Calculate actual imported items
                const importedItems = (receipt.items || []).filter((i) => i.status !== 'unavailable');
                if (importedItems.length === 0) {
                    throw new Error('KhĂ´ng cĂ³ linh kiá»‡n nĂ o Ä‘á»ƒ nháº­p kho (táº¥t cáº£ Ä‘á»u khĂ´ng kháº£ dá»¥ng).');
                }
                
                const totalAmount = importedItems.reduce((sum, i) => sum + ((i.importPrice || 0) * i.quantity), 0);
                
                tx.update(receiptRef, {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    completedBy: caller.uid,
                    totalAmount,
                    paymentMethod: paymentMethod || 'cash',
                    version: (receipt.version || 0) + 1,
                    updatedAt: FieldValue.serverTimestamp()
                });
                
                // Update Products & Held & Cost Price
                for (const item of importedItems) {
                    if (!item.productId) continue;
                    
                    const pRef = db.collection('products').doc(item.productId);
                    const pSnap = await tx.get(pRef);
                    
                    if (pSnap.exists) {
                        const pData = pSnap.data() as ProductData;
                        const currentStock = Number(pData.stock) || 0;
                        const newStock = currentStock + item.quantity;
                        
                        // Weighted average cost price
                        const currentTotalValue = currentStock * (Number(pData.costPrice) || 0);
                        const importTotalValue = item.quantity * (Number(item.importPrice) || 0);
                        const newCostPrice = Math.round((currentTotalValue + importTotalValue) / newStock) || 0;
                        
                        let additionalHeld = 0;
                        if (item.ticketId && item.partLineId) {
                            // Part is mapped to a repair ticket, it becomes 'selected' and thus held
                            additionalHeld = item.quantity;
                        }
                        
                        const updateData: ProductUpdateData = {
                            stock: newStock,
                            costPrice: newCostPrice,
                            held: FieldValue.increment(additionalHeld),
                            updatedAt: FieldValue.serverTimestamp()
                        };
                        const productCode = normalizeProductCode(pData.sku || pData.barcode || pData.productCode)
                            || buildProductCodeFromId(item.productId, getProductCodeKind(pData));
                        updateData.sku = productCode;
                        updateData.barcode = productCode;
                        updateData.productCode = productCode;
                        updateData.qrCodes = [productCode];

                        if (newParts && newParts[item.productId]) {
                            const info = newParts[item.productId];
                            updateData.name = item.productName;
                            updateData.price_original = item.importPrice;
                            updateData.price_promo = Number(info.price_promo) || 0;
                            updateData.quality = item.quality || 'Zin';
                            updateData.supplier = item.supplier || info.supplier || '';
                            updateData.status = 'active';
                            updateData.isProposed = false;
                            
                            if (receipt.receiptType === 'retail') {
                                updateData.category = 'product';
                                updateData.categoryIds = info.categoryIds || ['san-pham'];
                            } else {
                                updateData.category = 'component';
                                updateData.categoryIds = ['component'];
                                updateData.partType = info.partType || pData.partType || '';
                                updateData.description = info.model || pData.description || '';
                            }
                        }

                        tx.update(pRef, updateData);
                        
                        // Write Inventory Log
                        const logRef = db.collection('inventory_logs').doc();
                        tx.set(logRef, {
                            productId: item.productId,
                            productName: item.productName || pData.name,
                            quantity: item.quantity,
                            costPriceAtLog: newCostPrice,
                            type: 'IMPORT',
                            referenceId: receiptId,
                            referenceType: 'import_receipt',
                            createdBy: caller.uid,
                            createdAt: FieldValue.serverTimestamp()
                        });
                        
                        // Update Repair Line to 'selected', snapshot prices
                        if (item.ticketId && item.partLineId) {
                            await updateRepairLine(item.ticketId, item.partLineId, (line) => {
                                if (line.status === 'in_stock' || line.status === 'ordered' || line.status === 'requested') {
                                    line.status = 'selected';
                                    line.unitPriceAtUse = Number(pData.price) || 0; // Snapshot catalog price
                                    line.unitCostAtUse = newCostPrice; // Snapshot new cost
                                    line.priceConfirmedAt = new Date() as unknown as RepairLine['priceConfirmedAt'];
                                }
                            });
                        }
                    }
                }
                
                // Add Supplier Transaction if debt
                if (paymentMethod === 'debt') {
                    const suppTxRef = db.collection('supplier_transactions').doc();
                    tx.set(suppTxRef, {
                        supplierId: receipt.supplierId,
                        type: 'import_debt',
                        amount: totalAmount,
                        importReceiptId: receiptId,
                        date: FieldValue.serverTimestamp(),
                        createdBy: caller.uid
                    });
                    
                    // Update supplier debt aggregate
                    const suppRef = db.collection('suppliers').doc(receipt.supplierId);
                    tx.update(suppRef, {
                        totalDebt: FieldValue.increment(totalAmount),
                        updatedAt: FieldValue.serverTimestamp()
                    });
                } else {
                    // Pay immediately
                    const expenseRef = db.collection('expenses').doc();
                    tx.set(expenseRef, {
                        type: 'inventory',
                        amount: totalAmount,
                        date: FieldValue.serverTimestamp(),
                        paymentMethod: paymentMethod,
                        description: `Thanh toĂ¡n phiáº¿u nháº­p kho ${receiptId}`,
                        referenceId: receiptId,
                        referenceType: 'import_receipt',
                        createdBy: caller.uid
                    });
                }
            } else {
                throw new Error('Action khĂ´ng há»£p lá»‡.');
            }

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: `inventory_import_${action}`,
                    referenceId: receiptId
                });
            }

            return { success: true };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Inventory import API error:', error);
        const message = errorMessage(error);
        return NextResponse.json(
            { error: message },
            { status: message.includes('khĂ´ng') || message.includes('Version') ? 400 : 500 }
        );
    }
}
