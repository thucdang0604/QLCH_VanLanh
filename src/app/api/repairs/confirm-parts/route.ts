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
type RequestedReceiptItem = {
    partLineId: string;
    productId: string;
    productName: string;
    quantity: number;
    quality: string;
    importPrice: number;
    ticketId: string;
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

function getProductPartType(product: ProductData): string {
    return String(product.partType || '').trim();
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');

        const body = await request.json();
        // command có thể là 1 object hoặc mảng các object (batch processing)
        const { ticketId, ticketVersion, operationKey, command, commands } = body;

        const cmdList = commands || (command ? (Array.isArray(command) ? command : [command]) : []);

        if (!ticketId || !operationKey || cmdList.length === 0) {
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
            const dirtyProductIds = new Set<string>();

            const updateProductHeld = (productId: string, delta: number) => {
                const p = updatedProductRefs.get(productId);
                if (!p) throw new Error('Product not fetched');
                const newHeld = (Number(p.data.held) || 0) + delta;
                if (newHeld < 0) throw new Error(`Lỗi giữ chỗ: held < 0 cho ${productId}`);
                p.data.held = newHeld;
                dirtyProductIds.add(productId);
            };

            const getReservedQuantity = (line: RepairLine) => {
                const fallback = isSelectedRepairPart(line) ? line.quantity : 0;
                return Math.max(0, Math.min(line.quantity, Number(line.reservedQuantity) || fallback));
            };

            const partLineIdsToUnlink = new Set<string>(
                cmdList
                    .filter((cmd: { type?: string }) => cmd.type === 'remove_line' || cmd.type === 'reject_request')
                    .map((cmd: { partLineId?: string }) => cmd.partLineId)
                    .filter((partLineId: unknown): partLineId is string => typeof partLineId === 'string' && partLineId.length > 0),
            );
            const receiptsRef = db.collection('import_receipts');
            const needsDraftReceipt = partLineIdsToUnlink.size > 0
                || cmdList.some((cmd: { type?: string }) => cmd.type === 'request_part');
            const draftSnap = needsDraftReceipt
                ? await tx.get(
                    receiptsRef.where('status', '==', 'draft')
                        .where('source', '==', 'repair_request')
                        .limit(1),
                )
                : null;

            const productIdsToLoad = new Set<string>();
            for (const cmd of cmdList as Array<{ productId?: string; partLineId?: string }>) {
                if (cmd.productId) productIdsToLoad.add(cmd.productId);
                if (cmd.partLineId) {
                    const line = parts.find((part) => part.partLineId === cmd.partLineId);
                    if (line?.productId) productIdsToLoad.add(line.productId);
                }
            }
            if (productIdsToLoad.size > 0) {
                const productRefs = [...productIdsToLoad].map((productId) => db.collection('products').doc(productId));
                const productSnaps = await tx.getAll(...productRefs);
                for (const productSnap of productSnaps) {
                    if (!productSnap.exists) {
                        throw new Error(`Sản phẩm ${productSnap.id} không tồn tại.`);
                    }
                    updatedProductRefs.set(productSnap.id, {
                        ref: productSnap.ref,
                        data: (productSnap.data() || {}) as ProductData,
                    });
                }
            }

            const getProduct = async (productId: string) => {
                const product = updatedProductRefs.get(productId);
                if (!product) throw new Error(`Sản phẩm ${productId} chưa được tải trong transaction.`);
                return product.data;
            };
            const newRequestedItems: RequestedReceiptItem[] = [];

            // Process all commands
            for (const cmd of cmdList) {
                if (cmd.type === 'add_selected') {
                    const { productId, quantity } = cmd;
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
                        reservedQuantity: quantity,
                        status: REPAIR_PART_STATUS.SELECTED,
                        quality: String(pData.quality || ''),
                        partType: getProductPartType(pData),
                        unitPriceAtUse: Number(pData.price_promo) || Number(pData.price_original) || 0,
                        unitCostAtUse: Number(pData.costPrice) || 0,
                        priceConfirmedAt: arrayTimestampValue()
                    });

                    if (!partsLockedAt) {
                        partsLockedAt = documentTimestampValue();
                    }

                } else if (cmd.type === 'request_part') {
                    const { productId, customName, quantity, quality: cmdQuality } = cmd;
                    if (quantity <= 0) throw new Error('Invalid quantity');

                    let pName = customName;
                    let quality = cmdQuality || '';
                    if (productId) {
                        const pData: Record<string, unknown> = await getProduct(productId);
                        pName = String(pData.name || 'Unknown');
                        if (!quality) quality = String(pData.quality || '');
                    }

                    const partLineId = randomUUID();
                    parts.push({
                        partLineId,
                        productId: productId || '',
                        productName: pName || 'Linh kiện yêu cầu',
                        quantity,
                        quality,
                        status: REPAIR_PART_STATUS.REQUESTED
                    });

                    newRequestedItems.push({
                        partLineId,
                        productId: productId || '',
                        productName: pName || 'Unknown',
                        quantity,
                        quality,
                        importPrice: 0,
                        ticketId: ticketId
                    });
                    // Note: We don't hold stock for requested parts

                } else if (cmd.type === 'remove_line') {
                    const { partLineId } = cmd;
                    const lineIndex = parts.findIndex(p => p.partLineId === partLineId);
                    if (lineIndex === -1) throw new Error('Part line not found');

                    const line = parts[lineIndex];
                    const reservedQuantity = getReservedQuantity(line);
                    if (line.productId && reservedQuantity > 0) {
                        await getProduct(line.productId); // fetch to update held
                        updateProductHeld(line.productId, -reservedQuantity);
                    }

                    parts.splice(lineIndex, 1);

                } else if (cmd.type === 'change_quantity') {
                    const { partLineId, quantity } = cmd;
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
                                reservedQuantity: delta,
                                status: REPAIR_PART_STATUS.SELECTED,
                                quality: String(pData.quality || ''),
                                partType: line.partType || getProductPartType(pData),
                                unitPriceAtUse: Number(pData.price_promo) || Number(pData.price_original) || 0,
                                unitCostAtUse: Number(pData.costPrice) || 0,
                                priceConfirmedAt: arrayTimestampValue()
                            });
                            // Do not modify old line quantity to keep old price for old quantity
                        } else if (delta < 0) {
                            // Giảm quantity: reduce held, reduce quantity on current line
                            updateProductHeld(line.productId, delta); // delta is negative
                            parts[lineIndex].quantity = quantity;
                            parts[lineIndex].reservedQuantity = quantity;
                        }
                    } else {
                        const reservedQuantity = getReservedQuantity(line);
                        if (line.productId && reservedQuantity > quantity) {
                            await getProduct(line.productId);
                            updateProductHeld(line.productId, quantity - reservedQuantity);
                            parts[lineIndex].reservedQuantity = quantity;
                        }
                        parts[lineIndex].quantity = quantity;
                        if ((Number(parts[lineIndex].reservedQuantity) || 0) >= quantity) {
                            parts[lineIndex].status = REPAIR_PART_STATUS.SELECTED;
                        }
                    }

                } else if (cmd.type === 'reject_request') {
                    const { partLineId } = cmd;
                    const lineIndex = parts.findIndex(p => p.partLineId === partLineId);
                    if (lineIndex === -1) throw new Error('Part line not found');

                    const line = parts[lineIndex];
                    const reservedQuantity = getReservedQuantity(line);
                    if (line.productId && reservedQuantity > 0) {
                        await getProduct(line.productId);
                        updateProductHeld(line.productId, -reservedQuantity);
                    }

                    parts[lineIndex].status = REPAIR_PART_STATUS.REJECTED;
                    parts[lineIndex].reservedQuantity = 0;
                } else {
                    throw new Error(`Unknown command type: ${cmd.type}`);
                }
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

            // ===== START WRITES =====
            for (const productId of dirtyProductIds) {
                const product = updatedProductRefs.get(productId);
                if (!product) throw new Error(`Sản phẩm ${productId} không tồn tại trong cache.`);
                tx.update(product.ref, { held: Number(product.data.held) || 0 });
            }
            tx.update(ticketRef, updateData);

            // Ghi log operation
            tx.set(opRef, {
                status: 'completed',
                type: 'confirm_parts',
                ticketId,
                commandType: cmdList.length === 1 ? cmdList[0].type : 'batch',
                completedAt: FieldValue.serverTimestamp()
            });

            // Handle Draft Receipt for requested parts (Consolidated Receipt trigger)
            if (draftSnap && (newRequestedItems.length > 0 || partLineIdsToUnlink.size > 0)) {
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
                } else if (newRequestedItems.length > 0) {
                    draftRef = receiptsRef.doc();
                } else {
                    return { success: true, parts, payment: paymentUpdate, partsLockedAt };
                }

                draftData.items = [
                    ...(draftData.items || []).filter((item) => {
                        const partLineId = typeof item.partLineId === 'string' ? item.partLineId : '';
                        return !partLineIdsToUnlink.has(partLineId);
                    }),
                    ...newRequestedItems,
                ];
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
