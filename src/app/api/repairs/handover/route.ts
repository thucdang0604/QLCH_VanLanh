import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { RepairTicket } from '@/lib/types';
import { calculateAndSaveCommissionsServer } from '@/lib/commissionCalcServer';
import { REPAIR_STATUS, isSelectedRepairPart, isWarrantyEligibleRepairPart } from '@/lib/repairStatus';
import { getConfiguredWorkflow } from '@/lib/repairWorkflowConfig';
import { fetchFifoLogsForDeduction, executeFifoDeductionsWrites } from '@/lib/inventoryFifo';

const LEGACY_TERMINAL_STATUSES = [REPAIR_STATUS.DONE, REPAIR_STATUS.OUT, REPAIR_STATUS.REFUND, 'bh_hoan_tat', 'bh_tu_choi', 'bh_refund'];

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');

        const body = await request.json();
        const { ticketId, targetStatus, ticketVersion, idempotencyKey, laborCost } = body;

        if (!ticketId || !targetStatus) {
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
            let isTargetTerminal = false;
            let warrantyRules: Record<string, unknown>[] = [];
            const configSnap = await tx.get(db.collection('system_config').doc('repairs'));
            if (configSnap.exists) {
                const configData = configSnap.data();
                warrantyRules = configData?.warrantyRules || [];
                const workflow = getConfiguredWorkflow(configData ?? {}, ticket.ticketType);

                if (Array.isArray(workflow)) {
                    const targetNode = workflow.find((n: { id?: string; isTerminal?: boolean }) => n.id === targetStatus);
                    if (targetNode?.isTerminal) {
                        isTargetTerminal = true;
                    }
                }
            }

            if (!isTargetTerminal && LEGACY_TERMINAL_STATUSES.includes(targetStatus)) {
                isTargetTerminal = true;
            }

            if (!isTargetTerminal) {
                throw new Error(`Tráº¡ng thĂ¡i ${targetStatus} khĂ´ng pháº£i lĂ  tráº¡ng thĂ¡i BĂ n giao (Káº¿t thĂºc). Vui lĂ²ng dĂ¹ng chá»©c nÄƒng Chuyá»ƒn Tráº¡ng ThĂ¡i.`);
            }

            // Check if any selected part missing priceConfirmedAt
            const selectedParts = (ticket.parts || []).filter(isSelectedRepairPart);
            const missingSnapshot = selectedParts.find(p => !p.priceConfirmedAt);
            if (missingSnapshot) {
                throw new Error(`Linh kiá»‡n "${missingSnapshot.productName}" chÆ°a cĂ³ snapshot giĂ¡. YĂªu cáº§u quáº£n trá»‹ viĂªn Ä‘á»‘i soĂ¡t trÆ°á»›c khi bĂ n giao.`);
            }

            // Recompute payment strictly
            const partsCost = selectedParts.reduce((sum, p) => sum + ((p.unitPriceAtUse || 0) * p.quantity), 0);
            const currentPayment = ticket.payment || {} as RepairTicket['payment'];
            const additionalFees = Number(currentPayment.additionalFees) || 0;
            const discountAmount = Number(currentPayment.discountAmount) || 0;
            const calculatedLaborCost = (ticket.issues || []).reduce((sum, i) => sum + (Number(i.estimatedPrice) || 0), 0);
            const finalLaborCost = laborCost !== undefined ? Number(laborCost) : (currentPayment.laborCost !== undefined ? currentPayment.laborCost : calculatedLaborCost);
            const amount = partsCost + finalLaborCost + additionalFees - discountAmount;

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
                    amount
                },
                version: (ticket.version || 0) + 1,
                updatedAt: FieldValue.serverTimestamp()
            };

            const isWarranty = targetStatus.startsWith('bh_');

            let fifoResultsMap = new Map<string, any[]>();
            let fifoLogsDataMap = new Map<string, any[]>();
            let fifoDeductors: { productId: string, quantityToDeduct: number }[] = [];
            
            // --- READ PHASE ---
            let custSnap: FirebaseFirestore.DocumentSnapshot | null = null;
            let custRef: FirebaseFirestore.DocumentReference | null = null;
            const productDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }>();

            if (!isWarranty) {
                // Read customer
                if (ticket.customer?.phone) {
                    const phone = ticket.customer.phone;
                    custRef = db.collection('customers').doc(phone);
                    custSnap = await tx.get(custRef);
                }


                // Read products
                if (selectedParts.length > 0) {
                    const deductions = [];
                    for (const p of selectedParts) {
                        if (p.productId && !productDocs.has(p.productId)) {
                            const pRef = db.collection('products').doc(p.productId);
                            const pSnap = await tx.get(pRef);
                            if (pSnap.exists) {
                                productDocs.set(p.productId, { ref: pRef, data: pSnap.data() || {} });
                            }
                        }
                        if (p.productId) {
                            deductions.push({ productId: p.productId, quantityToDeduct: p.quantity });
                        }
                    }

                    if (deductions.length > 0) {
                        const aggregated = deductions.reduce((acc, curr) => {
                            const existing = acc.find(a => a.productId === curr.productId);
                            if (existing) {
                                existing.quantityToDeduct += curr.quantityToDeduct;
                            } else {
                                acc.push({ ...curr });
                            }
                            return acc;
                        }, [] as { productId: string, quantityToDeduct: number }[]);
                        
                        fifoLogsDataMap = await fetchFifoLogsForDeduction(tx, db, aggregated);
                        fifoDeductors = aggregated;
                    }
                }
            }
            // --- END READ PHASE ---

            if (!isWarranty) {
                // Execute FIFO Writes
                if (fifoDeductors.length > 0) {
                    fifoResultsMap = executeFifoDeductionsWrites(tx, fifoDeductors, fifoLogsDataMap);
                }

                // Stamp Warranty
                if (!ticket.parts || ticket.parts.filter(p => isWarrantyEligibleRepairPart(p)).length === 0) {
                    const expireDate = new Date();
                    expireDate.setMonth(expireDate.getMonth() + 3);
                    updateData.serviceWarrantyExpiresAt = expireDate.getTime();
                }

                if (ticket.parts && ticket.parts.length > 0) {
                    const ruleMap = new Map<string, number>();
                    for (const r of warrantyRules) {
                        if (typeof r.partType === 'string') {
                            ruleMap.set(r.partType, Number(r.warrantyMonths) || 0);
                        }
                    }

                    const nowMs = Date.now();
                    ticket.parts = ticket.parts.map(p => {
                        if (!isWarrantyEligibleRepairPart(p)) return p;
                        if (p.warrantyExpiresAt) return p;

                        const pData = p.productId ? productDocs.get(p.productId)?.data : null;
                        const rawPartType = String(p.partType || pData?.partType || '');
                        const partType = rawPartType.trim().toLowerCase();

                        let months = 0;
                        // Find exact match (case-insensitive)
                        for (const [key, val] of ruleMap.entries()) {
                            if (key.trim().toLowerCase() === partType) {
                                months = val;
                                break;
                            }
                        }
                        // Fallback to "KhĂ¡c"
                        if (months === 0 && partType !== '') {
                             for (const [key, val] of ruleMap.entries()) {
                                if (key.trim().toLowerCase() === 'khĂ¡c') {
                                    months = val;
                                    break;
                                }
                            }
                        }

                        console.warn(`[Handover] Part: ${p.productName} | RawType: "${rawPartType}" | Mapped Months: ${months}`);

                        if (months <= 0) return { ...p, warrantyMonths: 0 };

                        const expiresAt = new Date(nowMs);
                        expiresAt.setMonth(expiresAt.getMonth() + months);

                        return {
                            ...p,
                            warrantyMonths: months,
                            warrantyExpiresAt: expiresAt.getTime(),
                            partType: rawPartType
                        };
                    });

                    updateData.parts = ticket.parts;
                }

                // Stock Deduction
                if (selectedParts.length > 0) {
                    for (const p of selectedParts) {
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
                        const logRef = db.collection('inventory_logs').doc();
                        tx.set(logRef, {
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
                if (custRef && custSnap) {
                    if (custSnap.exists) {
                        tx.update(custRef, {
                            totalSpent: FieldValue.increment(amount),
                            totalRepairs: FieldValue.increment(1),
                            updatedAt: FieldValue.serverTimestamp()
                        });
                    }
                    // Ledger
                    const ledgerRef = db.collection('customer_ledger').doc();
                    tx.set(ledgerRef, {
                        customerId: ticket.customer?.phone,
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

                await calculateAndSaveCommissionsServer(tx, { uid: caller.uid, displayName: '' }, 'repair', docDataForCommission);
            } else {
                // Warranty case: we may not charge anything, or just record handover
                // For simplicity, we just mark as handed over.
            }

            tx.update(ticketRef, updateData);

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'repair_handover',
                    referenceId: ticketId
                });
            }

            return { success: true };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Handover API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json(
            { error: message },
            { status: message.includes('khĂ´ng') || message.includes('Vui lĂ²ng') ? 400 : 500 }
        );
    }
}
