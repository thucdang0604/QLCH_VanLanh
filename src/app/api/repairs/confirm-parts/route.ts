import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import type { FirestoreDateValue, RepairTicket } from '@/lib/types';
import { loadRepairWorkflow, requireWorkflowNode } from '@/lib/repairWorkflowServer';
import { REPAIR_PART_STATUS, isSelectedRepairPart } from '@/lib/repairStatus';
import { randomUUID } from 'crypto';

type RepairLine = NonNullable<RepairTicket['parts']>[number];
type ProductData = Record<string, unknown>;
type ProductCacheEntry = { ref: DocumentReference; data: ProductData };
type RepairUpdateData = {
    parts: RepairLine[];
    payment: Partial<RepairTicket['payment']>;
    version: number;
    updatedAt: FieldValue;
    partsLockedAt?: FirestoreDateValue;
};
type DraftReceiptData = {
    status: string;
    source: string;
    supplierId: string;
    totalAmount: number;
    items: Array<Record<string, unknown>>;
    createdAt?: FieldValue;
    createdBy?: string;
    note?: string;
};

function documentTimestampValue(): FirestoreDateValue {
    return FieldValue.serverTimestamp() as unknown as FirestoreDateValue;
}

function arrayTimestampValue(): FirestoreDateValue {
    return new Date() as unknown as FirestoreDateValue;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Internal server error';
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');
        
        const body = await request.json();
        const { ticketId, ticketVersion, operationKey, command } = body;

        if (!ticketId || !operationKey || !command || !command.type) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            // Idempotency check
            const opRef = db.collection('operation_requests').doc(operationKey);
            const opSnap = await tx.get(opRef);
            if (opSnap.exists) {
                const opData = opSnap.data();
                if (opData?.status === 'completed') {
                    // Trả về kết quả cũ nếu cùng command (lược giản bằng cách lấy từ db)
                    const ticketSnap = await tx.get(db.collection('repairs').doc(ticketId));
                    return { success: true, fromCache: true, parts: ticketSnap.data()?.parts, payment: ticketSnap.data()?.payment };
                }
            }

            const ticketRef = db.collection('repairs').doc(ticketId);
            const ticketSnap = await tx.get(ticketRef);
            if (!ticketSnap.exists) {
                throw new Error('Phiếu không tồn tại.');
            }

            const ticket = ticketSnap.data() as RepairTicket;
            
            if (ticket.version !== undefined && ticket.version !== ticketVersion) {
                throw new Error('Dữ liệu đã bị thay đổi bởi người khác (Version mismatch). Vui lòng tải lại trang.');
            }

            // Migration Guard
            if (ticket.parts?.some(p => !p.partLineId)) {
                throw new Error('Phiếu chưa được migrate partLineId. Vui lòng liên hệ Admin.');
            }

            const workflow = await loadRepairWorkflow(tx, db, ticket);
            const currentNode = requireWorkflowNode(workflow, ticket.status);
            const isTerminal = !!currentNode.isTerminal;

            if (isTerminal) {
                throw new Error(`Không thể thay đổi linh kiện khi phiếu đã ở trạng thái kết thúc (${ticket.status})`);
            }

            const parts = [...(ticket.parts || [])];
            let partsLockedAt = ticket.partsLockedAt;
            const updatedProductRefs = new Map<string, ProductCacheEntry>();

            const getProduct = async (productId: string) => {
                if (updatedProductRefs.has(productId)) return updatedProductRefs.get(productId)!.data;
                const pRef = db.collection('products').doc(productId);
                const pSnap = await tx.get(pRef);
                if (!pSnap.exists) throw new Error(`Sản phẩm ${productId} không tồn tại.`);
                const pData = (pSnap.data() || {}) as Record<string, unknown>;
                updatedProductRefs.set(productId, { ref: pRef, data: pData });
                return pData;
            };

            const updateProductHeld = (productId: string, delta: number) => {
                const p = updatedProductRefs.get(productId);
                if (!p) throw new Error('Product not fetched');
                const newHeld = (Number(p.data.held) || 0) + delta;
                if (newHeld < 0) throw new Error(`Lỗi giữ chỗ: held < 0 cho ${productId}`);
                p.data.held = newHeld;
                tx.update(p.ref, { held: newHeld });
            };

            // Process commands
            if (command.type === 'add_selected') {
                const { productId, quantity } = command;
                if (!productId || quantity <= 0) throw new Error('Invalid add_selected command');
                
                const pData: Record<string, unknown> = await getProduct(productId);
                const stock = Number(pData.stock) || 0;
                const held = Number(pData.held) || 0;
                
                if (stock - held < quantity) {
                    throw new Error(`Sản phẩm ${pData.name} không đủ tồn kho khả dụng (Có: ${stock - held}, Cần: ${quantity})`);
                }

                updateProductHeld(productId, quantity);

                parts.push({
                    partLineId: randomUUID(),
                    productId,
                    productName: String(pData.name || 'Unknown'),
                    quantity,
                    status: REPAIR_PART_STATUS.SELECTED,
                            quality: String(pData.quality || ''),
                    unitPriceAtUse: Number(pData.price_promo) || Number(pData.price_original) || 0,
                    unitCostAtUse: Number(pData.costPrice) || 0,
                    priceConfirmedAt: arrayTimestampValue()
                });

                if (!partsLockedAt) {
                    partsLockedAt = documentTimestampValue();
                }

            } else if (command.type === 'request_part') {
                const { productId, customName, quantity } = command;
                if (quantity <= 0) throw new Error('Invalid quantity');
                
                let pName = customName;
                let quality = '';
                if (productId) {
                    const pData: Record<string, unknown> = await getProduct(productId);
                    pName = String(pData.name || 'Unknown');
                    quality = String(pData.quality || '');
                }

                parts.push({
                    partLineId: randomUUID(),
                    productId: productId || '',
                    productName: pName || 'Linh kiện yêu cầu',
                    quantity,
                    quality,
                    status: REPAIR_PART_STATUS.REQUESTED
                });
                // Note: We don't hold stock for requested parts

            } else if (command.type === 'remove_line') {
                const { partLineId } = command;
                const lineIndex = parts.findIndex(p => p.partLineId === partLineId);
                if (lineIndex === -1) throw new Error('Part line not found');
                
                const line = parts[lineIndex];
                if (isSelectedRepairPart(line) && line.productId) {
                    await getProduct(line.productId); // fetch to update held
                    updateProductHeld(line.productId, -line.quantity);
                }
                
                parts.splice(lineIndex, 1);

            } else if (command.type === 'change_quantity') {
                const { partLineId, quantity } = command;
                if (quantity <= 0) throw new Error('Invalid quantity');
                
                const lineIndex = parts.findIndex(p => p.partLineId === partLineId);
                if (lineIndex === -1) throw new Error('Part line not found');
                
                const line = parts[lineIndex];
                
                if (isSelectedRepairPart(line) && line.productId) {
                    const pData: Record<string, unknown> = await getProduct(line.productId);
                    const stock = Number(pData.stock) || 0;
                    const held = Number(pData.held) || 0;
                    
                    const delta = quantity - line.quantity;
                    
                    if (delta > 0) {
                        // Tăng quantity: check stock, split line
                        if (stock - held < delta) {
                            throw new Error(`Sản phẩm ${pData.name} không đủ tồn kho khả dụng cho phần tăng thêm.`);
                        }
                        updateProductHeld(line.productId, delta);
                        
                        // Split line for the delta to capture new price
                        parts.push({
                            partLineId: randomUUID(),
                            productId: line.productId,
                            productName: line.productName,
                            quantity: delta,
                            status: REPAIR_PART_STATUS.SELECTED,
                            quality: String(pData.quality || ''),
                            unitPriceAtUse: Number(pData.price_promo) || Number(pData.price_original) || 0,
                            unitCostAtUse: Number(pData.costPrice) || 0,
                            priceConfirmedAt: arrayTimestampValue()
                        });
                        // Do not modify old line quantity to keep old price for old quantity
                    } else if (delta < 0) {
                        // Giảm quantity: reduce held, reduce quantity on current line
                        updateProductHeld(line.productId, delta); // delta is negative
                        parts[lineIndex].quantity = quantity;
                    }
                } else {
                    // For requested/rejected/etc, just change the quantity
                    parts[lineIndex].quantity = quantity;
                }

            } else if (command.type === 'reject_request') {
                const { partLineId } = command;
                const lineIndex = parts.findIndex(p => p.partLineId === partLineId);
                if (lineIndex === -1) throw new Error('Part line not found');
                
                const line = parts[lineIndex];
                if (isSelectedRepairPart(line) && line.productId) {
                    await getProduct(line.productId);
                    updateProductHeld(line.productId, -line.quantity);
                }
                
                parts[lineIndex].status = REPAIR_PART_STATUS.REJECTED;
            } else {
                throw new Error('Unknown command type');
            }

            // Server-compute payment
            const selectedParts = parts.filter(isSelectedRepairPart);
            const partsCost = selectedParts.reduce((sum, p) => sum + ((p.unitPriceAtUse || 0) * p.quantity), 0);
            
            const currentPayment = ticket.payment || {};
            const laborCost = currentPayment.laborCost || 0;
            const additionalFees = currentPayment.additionalFees || 0;
            const discountAmount = currentPayment.discountAmount || 0;
            
            const amount = laborCost + partsCost + additionalFees - discountAmount;

            const paymentUpdate = {
                ...currentPayment,
                partsCost,
                amount
            };

            const updateData: RepairUpdateData = {
                parts,
                payment: paymentUpdate,
                version: (ticket.version || 0) + 1,
                updatedAt: FieldValue.serverTimestamp()
            };

            if (partsLockedAt) {
                updateData.partsLockedAt = partsLockedAt;
            }

            tx.update(ticketRef, updateData);

            // Ghi log operation
            tx.set(opRef, {
                status: 'completed',
                type: 'confirm_parts',
                ticketId,
                commandType: command.type,
                completedAt: FieldValue.serverTimestamp()
            });

            // Handle Draft Receipt for requested parts (Consolidated Receipt trigger)
            if (command.type === 'request_part') {
                // Find or create a draft receipt
                const receiptsRef = db.collection('import_receipts');
                const draftSnap = await tx.get(
                    receiptsRef.where('status', '==', 'draft')
                               .where('source', '==', 'repair_request')
                               .limit(1)
                );
                
                let draftRef;
                let draftData: DraftReceiptData = {
                    status: 'draft',
                    source: 'repair_request',
                    supplierId: '',
                    totalAmount: 0,
                    items: [],
                    createdAt: FieldValue.serverTimestamp(),
                    createdBy: caller.uid,
                    note: 'Phiếu nhập tự động từ yêu cầu linh kiện KTV'
                };

                if (!draftSnap.empty) {
                    draftRef = draftSnap.docs[0].ref;
                    draftData = draftSnap.docs[0].data() as unknown as DraftReceiptData;
                } else {
                    draftRef = receiptsRef.doc();
                }

                // Push new requested part into the draft receipt
                const newItem = {
                    partLineId: parts[parts.length - 1].partLineId,
                    productId: command.productId || '',
                    productName: command.customName || command.productId || 'Unknown',
                    quantity: command.quantity,
                    importPrice: 0,
                    ticketId: ticketId
                };

                draftData.items = [...(draftData.items || []), newItem];
                tx.set(draftRef, draftData, { merge: true });
            }

            return { success: true, parts, payment: paymentUpdate, partsLockedAt };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Confirm parts API error:', error);
        const message = errorMessage(error);
        return NextResponse.json(
            { error: message },
            { status: message.includes('không') || message.includes('mismatch') ? 400 : 500 }
        );
    }
}
