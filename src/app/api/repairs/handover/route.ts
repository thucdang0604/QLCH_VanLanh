import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { FieldValue } from 'firebase-admin/firestore';
import type { RepairTicket } from '@/lib/types';
import { calculateAndSaveCommissionsServer } from '@/lib/commissionCalcServer';
import { isWarrantyEligibleRepairPart } from '@/lib/repairStatus';
import { isInventoryConsumedRepairPart } from '@/lib/repairPartConsumption';
import { isBillableRepairPart } from '@/lib/repairPartBilling';
import { getConfiguredWorkflow, isHandoverTerminalAction } from '@/lib/repairWorkflowConfig';
import { fetchFifoLogsForDeduction, executeFifoDeductionsWrites, type FifoDeductionResult, type FifoDeductor } from '@/lib/inventoryFifo';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { stampRepairWarrantyOnParts } from '@/lib/repairWarrantyRules';
import { reserveSequentialDocumentIds } from '@/lib/serverDocumentIds';
import { getE2ERunMetadata } from '@/lib/e2eRunMetadata';
import { assertInboundArrivalConfirmedForTransition } from '@/lib/repairInboundIntake';
import { requiresRepairPaymentAtPos } from '@/lib/repairPaymentGate';
import { getRepairIssueLaborCost } from '@/lib/repairIssuePricing';

type HandoverRequestBody = {
    ticketId?: string;
    targetStatus?: string;
    ticketVersion?: number;
    laborCost?: number;
    additionalFees?: number;
    handoverNote?: string;
    paymentConfirmed?: boolean;
    idempotencyKey?: string;
    operationKey?: string;
};

function getTicketCustomerId(ticket: RepairTicket): string {
    return ticket.customer?.id || ticket.customer?.customerId || ticket.customer?.phone || '';
}

function resolveServiceWarrantyMonths(taxonomy: unknown, categoryPath: string[] | undefined) {
    if (!Array.isArray(categoryPath) || categoryPath.length === 0) return 3;

    let currentLevel = Array.isArray((taxonomy as { service?: unknown })?.service)
        ? (taxonomy as { service: unknown[] }).service
        : [];
    let months = 0;

    for (const pathId of categoryPath) {
        const node = currentLevel.find((item): item is { id?: string; warrantyMonths?: unknown; children?: unknown[] } =>
            typeof item === 'object' && item !== null && (item as { id?: unknown }).id === pathId
        );
        if (!node) break;
        const nodeMonths = Number(node.warrantyMonths) || 0;
        if (nodeMonths > 0) months = nodeMonths;
        currentLevel = Array.isArray(node.children) ? node.children : [];
    }

    return months > 0 ? months : 3;
}

export const POST = withApi({
    name: 'repairs/handover',
    onError: (error, context) => {
        const message = getApiErrorMessage(error);
        const legacyStatus = /kh(?:\\u00f4|\\u0103\\u00b4)ng|Vui l(?:\\u00f2|\\u0103\\u00b2)ng/.test(message) ? 400 : 500;
        return context.error(message, getApiErrorStatus(error, legacyStatus));
    },
}, async (request: NextRequest, context) => {
        const caller = await requirePermission(request, 'manage_repairs');
        const e2eMetadata = getE2ERunMetadata(request);

        const body = await context.readJson<HandoverRequestBody>(request);
        const { ticketId, targetStatus, ticketVersion, laborCost, additionalFees } = body;
        const idempotencyKey = body.idempotencyKey || body.operationKey;
        const normalizedHandoverNote = typeof body.handoverNote === 'string'
            ? body.handoverNote.trim().slice(0, 1000)
            : '';
        const paymentConfirmed = body.paymentConfirmed === true;

        if (!ticketId || !targetStatus) {
            return context.error('Missing parameters');
        }

        const db = getAdminDb();
        const requestedLaborCost = laborCost === undefined ? null : Number(laborCost) || 0;
        const requestedAdditionalFees = additionalFees === undefined ? null : Number(additionalFees) || 0;

        const result = await db.runTransaction(async (tx) => {
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed') {
                        if (
                            data.type !== 'repair_handover' ||
                            data.referenceId !== ticketId ||
                            data.targetStatus !== targetStatus ||
                            (data.laborCost ?? null) !== requestedLaborCost ||
                            (data.additionalFees ?? null) !== requestedAdditionalFees ||
                            (data.handoverNote !== undefined && data.handoverNote !== normalizedHandoverNote) ||
                            (data.paymentConfirmed !== undefined && Boolean(data.paymentConfirmed) !== paymentConfirmed)
                        ) {
                            throw new Error('Idempotency key da duoc dung cho thao tac khac.');
                        }
                        return { success: true, fromCache: true };
                    }
                }
            }

            const ticketRef = db.collection('repairs').doc(ticketId);
            const ticketSnap = await tx.get(ticketRef);

            if (!ticketSnap.exists) {
                throw new Error('Phiáº¿u sá»­a chá»¯a khĂ´ng tá»“n táº¡i.');
            }

            const ticket = ticketSnap.data() as RepairTicket;

            if (ticket.version !== undefined && ticket.version !== ticketVersion) {
                throw new Error('Dá»¯ liá»‡u Ä‘Ă£ bá»‹ thay Ä‘á»•i bá»Ÿi ngÆ°á»i khĂ¡c. Vui lĂ²ng táº£i láº¡i trang.');
            }

            if (ticket.status === targetStatus) return { success: true };

            // Terminal Guard & Warranty Rules Config
            let isCurrentTerminal = false;
            let isTargetTerminal = false;
            let targetRecordsCompletion = false;
            let targetAllowsTechnicianCommission = false;
            let targetAllowsSellerCommission = false;
            let targetIsAllowed = false;
            let warrantyRules: Record<string, unknown>[] = [];
            let serviceWarrantyMonths = 3;
            const configSnap = await tx.get(db.collection('system_config').doc('repairs'));
            if (!configSnap.exists) {
                throw new Error('Khong tim thay cau hinh workflow sua chua trong Firebase.');
            }
            const configData = configSnap.data();
            warrantyRules = configData?.warrantyRules || [];
            const workflow = getConfiguredWorkflow(configData ?? {}, ticket.ticketType);
            const currentNode = workflow.find(node => node.id === ticket.status);
            const targetNode = workflow.find(node => node.id === targetStatus);
            if (!currentNode || !targetNode) {
                throw new Error('Trang thai phieu khong ton tai trong workflow dang cau hinh.');
            }
            assertInboundArrivalConfirmedForTransition(ticket, currentNode);
            const targetTerminalAction = targetNode.terminalAction;
            isCurrentTerminal = currentNode.isTerminal === true;
            isTargetTerminal = targetNode.isTerminal === true;
            targetRecordsCompletion = targetNode.allowedFeatures?.includes('recordCompletion') === true;
            targetAllowsTechnicianCommission = targetNode.allowedFeatures?.includes('enableTechnicianCommission') === true;
            targetAllowsSellerCommission = targetNode.allowedFeatures?.includes('enableSellerCommission') === true;
            targetIsAllowed = currentNode.allowedNext?.includes(targetStatus) === true;
            const taxonomySnap = await tx.get(db.collection('system_config').doc('taxonomy_settings'));
            if (taxonomySnap.exists) {
                serviceWarrantyMonths = resolveServiceWarrantyMonths(taxonomySnap.data()?.taxonomy, ticket.categoryPath);
            }

            if (isCurrentTerminal) {
                throw new Error(`Phieu sua chua da o trang thai ket thuc (${ticket.status}), khong the ban giao lai.`);
            }

            if (!isTargetTerminal) {
                throw new Error(`Tráº¡ng thĂ¡i ${targetStatus} khĂ´ng pháº£i lĂ  tráº¡ng thĂ¡i BĂ n giao (Káº¿t thĂºc). Vui lĂ²ng dĂ¹ng chá»©c nÄƒng Chuyá»ƒn Tráº¡ng ThĂ¡i.`);
            }
            if (!isHandoverTerminalAction(targetTerminalAction)) {
                throw new Error('Trạng thái kết thúc này không yêu cầu bàn giao hoặc hoàn phí. Vui lòng dùng Chuyển trạng thái trực tiếp.');
            }
            if (!targetIsAllowed) {
                throw new Error(`Khong cho phep chuyen tu ${ticket.status} sang ${targetStatus} theo workflow.`);
            }
            if (requiresRepairPaymentAtPos(ticket, currentNode)) {
                throw new Error('Phiếu chưa thanh toán. Vui lòng thanh toán tại POS trước khi hoàn tất hoặc bàn giao máy.');
            }

            if (currentNode.allowedFeatures?.includes('requireReturnedPartsReceived')) {
                const pendingReturns = (ticket.parts || []).filter(part =>
                    Boolean(part.returnedToReceptionPendingAt) && !part.returnedToReceptionReceivedAt,
                );
                if (pendingReturns.length > 0) {
                    throw new Error(`Tiếp nhận chưa xác nhận đã nhận lại ${pendingReturns.length} linh kiện hoàn kho.`);
                }
            }

            // Check if any selected part missing priceConfirmedAt
            const selectedParts = (ticket.parts || []).filter(isBillableRepairPart);
            // Parts can be deducted when the repair is completed (before customer handover).
            // Keep them in selectedParts for pricing/warranty, but never deduct inventory twice.
            const partsToDeduct = selectedParts.filter((part) => !isInventoryConsumedRepairPart(part));
            const missingSnapshot = selectedParts.find(p => !p.priceConfirmedAt);
            if (missingSnapshot) {
                throw new Error(`Linh kiá»‡n "${missingSnapshot.productName}" chÆ°a cĂ³ snapshot giĂ¡. YĂªu cáº§u quáº£n trá»‹ viĂªn Ä‘á»‘i soĂ¡t trÆ°á»›c khi bĂ n giao.`);
            }

            // Recompute payment strictly
            const partsCost = selectedParts.reduce((sum, p) => sum + ((p.unitPriceAtUse || 0) * p.quantity), 0);
            const currentPayment = ticket.payment || {} as RepairTicket['payment'];
            const finalAdditionalFees = requestedAdditionalFees ?? (Number(currentPayment.additionalFees) || 0);
            const discountAmount = Number(currentPayment.discountAmount) || 0;
            const hasIssueLevelPricing = (ticket.issues || []).some(issue => issue.billingMode
                || selectedParts.some(part => part.issueId === issue.id));
            const calculatedLaborCost = getRepairIssueLaborCost(ticket.issues, selectedParts, Number(currentPayment.laborCost) || 0);
            const finalLaborCost = hasIssueLevelPricing
                ? calculatedLaborCost
                : laborCost !== undefined ? Number(laborCost) : (currentPayment.laborCost !== undefined ? currentPayment.laborCost : calculatedLaborCost);
            const amount = partsCost + finalLaborCost + finalAdditionalFees - discountAmount;

            const updateData: Record<string, unknown> = {
                status: targetStatus,
                statusTimeline: FieldValue.arrayUnion({
                    status: targetStatus,
                    at: new Date(),
                    by: caller.uid
                }),
                payment: {
                    ...currentPayment,
                    partsCost,
                    laborCost: finalLaborCost,
                    additionalFees: finalAdditionalFees,
                    amount
                },
                version: (ticket.version || 0) + 1,
                updatedAt: FieldValue.serverTimestamp()
            };

            const isWarranty = ticket.ticketType === 'warranty';
            const paymentConfirmationRequired = Number(ticket.payment?.depositAmount || 0) > 0;
            updateData.handoverRecord = {
                action: targetTerminalAction,
                ...(normalizedHandoverNote ? { note: normalizedHandoverNote } : {}),
                paymentConfirmationRequired,
                paymentConfirmed,
                confirmedBy: caller.uid,
                ...(caller.displayName || caller.name ? { confirmedByName: caller.displayName || caller.name } : {}),
                confirmedAt: FieldValue.serverTimestamp(),
            };

            let fifoResultsMap = new Map<string, FifoDeductionResult[]>();
            let fifoLogsDataMap: Awaited<ReturnType<typeof fetchFifoLogsForDeduction>> = new Map();
            let fifoDeductors: FifoDeductor[] = [];

            // --- READ PHASE ---
            let custRef: FirebaseFirestore.DocumentReference | null = null;
            const productDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }>();

            if (!isWarranty) {
                // Read customer
                const customerId = getTicketCustomerId(ticket);
                if (customerId) {
                    custRef = db.collection('customers').doc(customerId);
                }


                // Read products
                if (partsToDeduct.length > 0) {
                    const deductions: (FifoDeductor & { lotCode?: string })[] = [];
                    for (const p of partsToDeduct) {
                        if (p.productId && !productDocs.has(p.productId)) {
                            const pRef = db.collection('products').doc(p.productId);
                            const pSnap = await tx.get(pRef);
                            if (pSnap.exists) {
                                productDocs.set(p.productId, { ref: pRef, data: pSnap.data() || {} });
                            }
                        }
                        if (p.productId) {
                            deductions.push({ productId: p.productId, quantityToDeduct: p.quantity, lotCode: p.lotCode });
                        }
                    }

                    if (deductions.length > 0) {
                        const fifoMap = new Map<string, { productId: string; quantity: number; preferredLotCodes: Map<string, number> }>();
                        for (const curr of deductions) {
                            let fifoItem = fifoMap.get(curr.productId);
                            if (!fifoItem) {
                                fifoItem = { productId: curr.productId, quantity: 0, preferredLotCodes: new Map<string, number>() };
                                fifoMap.set(curr.productId, fifoItem);
                            }
                            fifoItem.quantity += curr.quantityToDeduct;
                            if (curr.lotCode) {
                                fifoItem.preferredLotCodes.set(curr.lotCode, (fifoItem.preferredLotCodes.get(curr.lotCode) || 0) + curr.quantityToDeduct);
                            }
                        }

                        const aggregated = Array.from(fifoMap.values()).map(x => ({
                            productId: x.productId,
                            quantityToDeduct: x.quantity,
                            preferredLotCodes: Array.from(x.preferredLotCodes.entries()).map(([lotCode, quantity]) => ({ lotCode, quantity }))
                        }));

                        fifoLogsDataMap = await fetchFifoLogsForDeduction(tx, db, aggregated);
                        fifoDeductors = aggregated;
                    }
                }
            }
            // --- END READ PHASE ---

            const partsToLog = !isWarranty
                ? partsToDeduct.filter(part => part.productId && productDocs.has(part.productId))
                : [];
            const inventoryLogAllocations = await reserveSequentialDocumentIds(tx, db, {
                collectionName: 'inventory_logs',
                prefix: 'IL',
                count: partsToLog.length,
            });
            const customerLedgerAllocations = await reserveSequentialDocumentIds(tx, db, {
                collectionName: 'customer_ledger',
                prefix: 'CL',
                count: !isWarranty && custRef ? 1 : 0,
            });
            let inventoryLogAllocationIndex = 0;

            const checkoutWarnings: string[] = [];

            if (!isWarranty) {
                // Execute FIFO Writes
                if (fifoDeductors.length > 0) {
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

                // Stamp Warranty
                // This timestamp is the immutable warranty start for a completed
                // repair. Use it for both expiry calculations and printed evidence.
                const warrantyStartedAt = Date.now();
                updateData.warrantyStartedAt = warrantyStartedAt;
                if (selectedParts.filter(p => isWarrantyEligibleRepairPart(p)).length === 0) {
                    const expireDate = new Date(warrantyStartedAt);
                    expireDate.setMonth(expireDate.getMonth() + serviceWarrantyMonths);
                    updateData.serviceWarrantyExpiresAt = expireDate.getTime();
                }

                if (ticket.parts && ticket.parts.length > 0) {
                    const productDataById = new Map<string, Record<string, unknown> | null>();
                    for (const [productId, productDoc] of productDocs.entries()) {
                        productDataById.set(productId, productDoc.data);
                    }
                    const stamped = stampRepairWarrantyOnParts(ticket.parts, productDataById, warrantyRules, warrantyStartedAt);
                    if (stamped.changed) {
                        updateData.parts = stamped.parts;
                        ticket.parts = stamped.parts;
                    }
                }

                // Stock Deduction
                if (partsToDeduct.length > 0) {
                    for (const p of partsToDeduct) {
                        if (!p.productId) continue;
                        const pData = productDocs.get(p.productId);
                        if (!pData) continue;

                        const currentStock = Number(pData.data.stock) || 0;
                        const currentHeld = Number(pData.data.held) || 0;

                        if (currentStock < p.quantity) {
                            throw new Error(`Sáº£n pháº©m ${p.productName} khĂ´ng Ä‘á»§ tá»“n kho (CĂ³: ${currentStock}, Cáº§n: ${p.quantity})`);
                        }
                        if (currentHeld < p.quantity) {
                            throw new Error(`Lá»—i giá»¯ chá»— cho ${p.productName} (Held: ${currentHeld}, Cáº§n: ${p.quantity})`);
                        }

                        tx.update(pData.ref, {
                            stock: currentStock - p.quantity,
                            held: currentHeld - p.quantity
                        });

                        // Cáº­p nháº­t memory cache
                        pData.data.stock = currentStock - p.quantity;
                        pData.data.held = currentHeld - p.quantity;

                        // Log
                        const logRef = inventoryLogAllocations[inventoryLogAllocationIndex++].ref;
                        tx.set(logRef, {
                            ...e2eMetadata,
                            productId: p.productId,
                            productName: p.productName,
                            quantity: -p.quantity, // deduction
                            costPriceAtLog: Number(pData.data.costPrice) || 0,
                            type: 'REPAIR_HANDOVER',
                            referenceId: ticketId,
                            referenceType: 'repair',
                            lotsDeducted: fifoResultsMap.get(p.productId) || [],
                            createdBy: caller.uid,
                            createdAt: FieldValue.serverTimestamp()
                        });
                    }
                }

                // Payment Status
                (updateData.payment as Record<string, unknown>).status = 'paid';
                (updateData.payment as Record<string, unknown>).paidAt = FieldValue.serverTimestamp();

                // Customer Aggregate (if valid customer)
                if (custRef) {
                    tx.set(custRef, {
                        code: getTicketCustomerId(ticket),
                        name: ticket.customer?.name || '',
                        phone: ticket.customer?.phone || '',
                        primaryPhone: ticket.customer?.phone || '',
                        primaryContactType: ticket.customer?.primaryContactType || ticket.customer?.contactType || null,
                        primaryContactValue: ticket.customer?.primaryContactValue || ticket.customer?.contactValue || ticket.customer?.phone || '',
                        contactMethods: ticket.customer?.contactMethods || [],
                        searchKeywords: ticket.customer?.searchKeywords || [],
                        totalSpent: FieldValue.increment(amount),
                        totalRepairs: FieldValue.increment(1),
                        updatedAt: FieldValue.serverTimestamp(),
                        lastVisit: FieldValue.serverTimestamp(),
                    }, { merge: true });
                    // Ledger
                    const ledgerRef = customerLedgerAllocations[0].ref;
                    tx.set(ledgerRef, {
                        ...e2eMetadata,
                        customerId: getTicketCustomerId(ticket),
                        customerPhone: ticket.customer?.phone || '',
                        customerName: ticket.customer?.name || '',
                        type: 'repair_payment',
                        amount: amount,
                        referenceId: ticketId,
                        date: FieldValue.serverTimestamp()
                    });
                }

                // Commission Server-Side Calculation
                const docDataForCommission = {
                    ...ticket,
                    status: targetStatus,
                    payment: updateData.payment
                } as RepairTicket;

                if (targetAllowsTechnicianCommission || targetAllowsSellerCommission) {
                    await calculateAndSaveCommissionsServer(tx, { uid: caller.uid, displayName: '' }, 'repair', docDataForCommission, {
                        repairRecipients: {
                            technician: targetAllowsTechnicianCommission,
                            seller: targetAllowsSellerCommission,
                        },
                    });
                }
                incrementRevenueAggregates(tx, db, {
                    repairRevenue: amount,
                    repairCount: targetRecordsCompletion ? 1 : 0,
                    totalGiftDiscount: targetRecordsCompletion ? Number(currentPayment.giftDiscount) || 0 : 0,
                });
            } else {
                // Warranty case: we may not charge anything, or just record handover
                // For simplicity, we just mark as handed over.
                incrementRevenueAggregates(tx, db, {
                    warrantyCount: targetRecordsCompletion ? 1 : 0,
                });
            }

            tx.update(ticketRef, updateData);

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    ...e2eMetadata,
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'repair_handover',
                    referenceId: ticketId,
                    targetStatus,
                    laborCost: requestedLaborCost,
                    additionalFees: requestedAdditionalFees,
                    handoverNote: normalizedHandoverNote,
                    paymentConfirmed,
                });
            }
            inventoryLogAllocations.at(-1)?.commitCounter();
            customerLedgerAllocations.at(-1)?.commitCounter();

            return { success: true, warnings: checkoutWarnings };
        });

        return context.json(result);
});
