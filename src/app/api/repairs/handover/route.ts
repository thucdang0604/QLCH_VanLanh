import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { RepairTicket, RepairWorkflowConfig } from '@/lib/types';
import { calculateAndSaveCommissionsServer } from '@/lib/commissionCalcServer';

const LEGACY_TERMINAL_STATUSES = ['done', 'out', 'refund', 'bh_hoan_tat', 'bh_tu_choi', 'bh_refund'];

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');
        
        const body = await request.json();
        const { ticketId, targetStatus, ticketVersion, idempotencyKey } = body;

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
                throw new Error('Phiếu sửa chữa không tồn tại.');
            }

            const ticket = ticketSnap.data() as RepairTicket;

            if (ticket.version !== undefined && ticket.version !== ticketVersion) {
                throw new Error('Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại trang.');
            }

            if (ticket.status === targetStatus) return { success: true };

            // Terminal Guard
            let isTargetTerminal = false;
            if (ticket.workflowConfigId) {
                const wfRef = db.collection('system_config').doc('repair_workflows');
                const wfSnap = await tx.get(wfRef);
                if (wfSnap.exists) {
                    const configs = wfSnap.data()?.configs as RepairWorkflowConfig[];
                    const cfg = configs?.find(c => c.id === ticket.workflowConfigId);
                    if (cfg) {
                        const targetNode = cfg.nodes.find(n => n.id === targetStatus);
                        if (targetNode?.isTerminal) {
                            isTargetTerminal = true;
                        }
                    }
                }
            }
            if (!isTargetTerminal && LEGACY_TERMINAL_STATUSES.includes(targetStatus)) {
                isTargetTerminal = true;
            }

            if (!isTargetTerminal) {
                throw new Error(`Trạng thái ${targetStatus} không phải là trạng thái Bàn giao (Kết thúc). Vui lòng dùng chức năng Chuyển Trạng Thái.`);
            }

            // Check if any selected part missing priceConfirmedAt
            const selectedParts = (ticket.parts || []).filter(p => p.status === 'selected');
            const missingSnapshot = selectedParts.find(p => !p.priceConfirmedAt);
            if (missingSnapshot) {
                throw new Error(`Linh kiện "${missingSnapshot.productName}" chưa có snapshot giá. Yêu cầu quản trị viên đối soát trước khi bàn giao.`);
            }

            // Recompute payment strictly
            const partsCost = selectedParts.reduce((sum, p) => sum + ((p.unitPriceAtUse || 0) * p.quantity), 0);
            const currentPayment = ticket.payment || {} as RepairTicket['payment'];
            const additionalFees = Number(currentPayment.additionalFees) || 0;
            const discountAmount = Number(currentPayment.discountAmount) || 0;
            const amount = partsCost + additionalFees - discountAmount;

            const updateData: Record<string, unknown> = {
                status: targetStatus,
                statusTimeline: FieldValue.arrayUnion({
                    status: targetStatus,
                    at: FieldValue.serverTimestamp(),
                    by: caller.uid
                }),
                payment: {
                    ...currentPayment,
                    partsCost,
                    amount
                },
                version: (ticket.version || 0) + 1,
                updatedAt: FieldValue.serverTimestamp()
            };

            const isWarranty = targetStatus.startsWith('bh_');

            if (!isWarranty) {
                // Stock Deduction
                if (selectedParts.length > 0) {
                    const productDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }>();
                    for (const p of selectedParts) {
                        if (p.productId && !productDocs.has(p.productId)) {
                            const pRef = db.collection('products').doc(p.productId);
                            const pSnap = await tx.get(pRef);
                            if (pSnap.exists) {
                                productDocs.set(p.productId, { ref: pRef, data: pSnap.data() || {} });
                            }
                        }
                    }

                    for (const p of selectedParts) {
                        if (!p.productId) continue;
                        const pData = productDocs.get(p.productId);
                        if (!pData) continue;
                        
                        const currentStock = Number(pData.data.stock) || 0;
                        const currentHeld = Number(pData.data.held) || 0;
                        
                        if (currentStock < p.quantity) {
                            throw new Error(`Sản phẩm ${p.productName} không đủ tồn kho (Có: ${currentStock}, Cần: ${p.quantity})`);
                        }
                        if (currentHeld < p.quantity) {
                            throw new Error(`Lỗi giữ chỗ cho ${p.productName} (Held: ${currentHeld}, Cần: ${p.quantity})`);
                        }

                        tx.update(pData.ref, {
                            stock: currentStock - p.quantity,
                            held: currentHeld - p.quantity
                        });
                        
                        // Cập nhật memory cache
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
                            createdBy: caller.uid,
                            createdAt: FieldValue.serverTimestamp()
                        });
                    }
                }

                // Payment Status
                (updateData.payment as Record<string, unknown>).status = 'paid';
                (updateData.payment as Record<string, unknown>).paidAt = FieldValue.serverTimestamp();

                // Customer Aggregate (if valid customer)
                if (ticket.customer?.phone) {
                    const phone = ticket.customer.phone;
                    const custRef = db.collection('customers').doc(phone);
                    const custSnap = await tx.get(custRef);
                    
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
                        customerId: phone,
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
            { status: message.includes('không') || message.includes('Vui lòng') ? 400 : 500 }
        );
    }
}
