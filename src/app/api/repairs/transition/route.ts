import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import type { RepairTicket } from '@/lib/types';
import { loadRepairWorkflow, requireWorkflowNode, workflowNodeHasFeature } from '@/lib/repairWorkflowServer';
import { isChecklistComplete } from '@/lib/workflowFeatures';
import { REPAIR_PART_STATUS, REPAIR_STATUS, isPendingRepairPart, isSelectedRepairPart } from '@/lib/repairStatus';
import { isRepairManager } from '@/lib/repairAccess';
import { getMissingReservationQuantity, getRecordedReservationQuantity } from '@/lib/repairPartReservations';
import { isInventoryConsumedRepairPart, planRepairPartVerification, type RepairPartVerificationAction } from '@/lib/repairPartConsumption';
import { executeFifoDeductionsWrites, fetchFifoLogsForDeduction, type FifoDeductionResult, type FifoDeductor } from '@/lib/inventoryFifo';
import { reserveSequentialDocumentIds } from '@/lib/serverDocumentIds';

interface RepairTransitionRequest {
    ticketId?: string;
    targetStatus?: string;
    technicianNote?: string;
    ticketVersion?: number;
    idempotencyKey?: string;
    source?: 'repairs' | 'technician';
    partVerification?: Record<string, RepairPartVerificationAction>;
}

type RepairPartLine = NonNullable<RepairTicket['parts']>[number];

const CANCEL_TERMINAL_STATUSES = new Set([
    REPAIR_STATUS.REFUND,
    'cancelled',
    'canceled',
    'huy',
    'da_huy',
    'tu_choi',
    'bh_tu_choi',
    'bh_refund',
]);

function normalizeRepairNote(value: string) {
    return value
        .trim()
        .replace(/^\[\d{1,2}\/\d{1,2}\/\d{4}\]:\s*/, '')
        .replace(/\s+/g, ' ');
}

function hasExistingRepairNote(existingNotes: string | undefined, note: string) {
    const normalizedNote = normalizeRepairNote(note);
    if (!normalizedNote) return true;
    return (existingNotes || '')
        .split(/\r?\n/)
        .some(line => normalizeRepairNote(line) === normalizedNote);
}

function isCancelTerminalStatus(status: string) {
    return CANCEL_TERMINAL_STATUSES.has(status);
}

function getReservedReleaseQuantity(part: RepairPartLine) {
    if (isInventoryConsumedRepairPart(part)) return 0;
    const selectedQuantity = isSelectedRepairPart(part) ? Math.max(0, Math.floor(Number(part.quantity) || 0)) : 0;
    const reservedQuantity = Math.max(0, Math.floor(Number(part.reservedQuantity) || 0));
    if (reservedQuantity > 0) return reservedQuantity;
    return selectedQuantity;
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');

        const body = await request.json() as RepairTransitionRequest;
        const { ticketId, targetStatus, technicianNote, ticketVersion, idempotencyKey, source, partVerification } = body;
        const technicianNoteText = technicianNote?.trim() || '';

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
                        if (data.type !== 'repair_transition' || data.referenceId !== ticketId || data.actorId !== caller.uid) {
                            throw new Error('Mã chống gửi trùng đã được dùng cho thao tác khác.');
                        }
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
            const callerSnap = await tx.get(db.collection('users').doc(caller.uid));
            const callerData = callerSnap.data() as Record<string, unknown> | undefined;
            const callerName = typeof callerData?.displayName === 'string' ? callerData.displayName : caller.uid;

            if (ticket.version !== undefined && ticket.version !== ticketVersion) {
                throw new Error('Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại trang.');
            }

            if (ticket.status === targetStatus) {
                throw new Error('Không thể chuyển phiếu sang chính trạng thái hiện tại.');
            }

            const workflow = await loadRepairWorkflow(tx, db, ticket);
            const currentNode = requireWorkflowNode(workflow, ticket.status);
            const targetNode = requireWorkflowNode(workflow, targetStatus);
            const isCurrentTerminal = !!currentNode.isTerminal;
            const isTargetTerminal = !!targetNode.isTerminal;
            const isTargetCancelTerminal = isTargetTerminal && isCancelTerminalStatus(targetStatus);
            const shouldReserveSelectedParts = workflowNodeHasFeature(targetNode, 'reserveSelectedParts');
            const shouldConsumeSelectedParts = workflowNodeHasFeature(targetNode, 'consumeSelectedParts');
            const isAllowed = currentNode.allowedNext?.includes(targetStatus) ?? false;
            const requireChecklist = workflowNodeHasFeature(currentNode, 'requireChecklist');
            const requirePartsReady = workflowNodeHasFeature(currentNode, 'requirePartsReady');
            const entryNode = workflow[0];
            const leavingIntakeForWork = currentNode.id === entryNode?.id && !targetNode.isTerminal;
            const requireAssignedTechnician = leavingIntakeForWork
                || workflowNodeHasFeature(targetNode, 'requireAssignedTechnician')
                || workflowNodeHasFeature(currentNode, 'requireAssignedTechnician');
            const requireTechnicianNote = workflowNodeHasFeature(currentNode, 'requireTechnicianNote');

            if (isCurrentTerminal) {
                throw new Error(`Phiếu đã ở trạng thái kết thúc (${ticket.status}), không thể thay đổi.`);
            }

            if (isTargetTerminal && !isTargetCancelTerminal) {
                throw new Error(`Trạng thái ${targetStatus} là trạng thái kết thúc/bàn giao. Vui lòng dùng chức năng Bàn giao (handover).`);
            }

            if (!isAllowed) {
                throw new Error(`Không cho phép chuyển từ ${ticket.status} sang ${targetStatus} theo quy trình.`);
            }

            // Tech note gate based on CURRENT node feature
            if (requireTechnicianNote && !technicianNoteText && !ticket.issue?.notes?.trim()) {
                throw new Error('Vui lòng nhập ghi chú kỹ thuật (kết quả kiểm tra) trước khi chuyển trạng thái.');
            }

            // Checklist check
            if (requireChecklist) {
                const checklist = ticket.deviceInfo?.checklist as Record<string, unknown> | undefined;
                if (!isChecklistComplete(checklist)) {
                    throw new Error('Vui lòng hoàn thành tất cả các mục kiểm tra (Checklist) trước khi chuyển trạng thái.');
                }
            }

            // Parts ready check
            if (requirePartsReady) {
                const pendingParts = ticket.parts?.filter(isPendingRepairPart) || [];
                if (pendingParts.length > 0) {
                    throw new Error(`Có ${pendingParts.length} linh kiện chưa sẵn sàng. Không thể bắt đầu sửa chữa khi linh kiện còn đang yêu cầu hoặc đặt hàng.`);
                }
            }

            // Assigned technician and Manager Override check
            if (ticket.staff?.assignedTechnician) {
                const isAssignedKTV = caller.uid === ticket.staff.assignedTechnician;
                const isManager = isRepairManager(caller);

                if (!isAssignedKTV && !isManager) {
                    throw new Error('Chỉ KTV được phân công hoặc Quản lý mới có thể chuyển trạng thái phiếu này.');
                }
                if (!isAssignedKTV && isManager && !technicianNoteText) {
                    throw new Error('Quản lý ghi đè trạng thái (Manager Override) yêu cầu phải nhập lý do vào Ghi chú kỹ thuật.');
                }
            }

            if (requireAssignedTechnician && !ticket.staff?.assignedTechnician) {
                throw new Error('Trạng thái này yêu cầu phải phân công Kỹ thuật viên phụ trách. Vui lòng gán KTV trước khi chuyển trạng thái.');
            }

            const shouldReleaseHeldParts = isTargetCancelTerminal;
            const verificationPlan = shouldConsumeSelectedParts
                ? planRepairPartVerification(ticket.parts || [], partVerification)
                : { used: [], returned: [] };
            const releaseCandidates = shouldReleaseHeldParts
                ? (ticket.parts || []).map((part, index) => ({ part, index }))
                : verificationPlan.returned;
            const releaseParts = releaseCandidates
                .map((entry) => ({
                    ...entry,
                    releaseQuantity: getReservedReleaseQuantity(entry.part),
                }))
                .filter(entry => entry.part.productId && entry.releaseQuantity > 0);
            const consumedParts = verificationPlan.used;
            const reserveParts = shouldReserveSelectedParts
                ? (ticket.parts || [])
                    .map((part, index) => ({
                        part,
                        index,
                        reserveQuantity: getMissingReservationQuantity(part),
                    }))
                    .filter(entry => entry.part.productId && entry.reserveQuantity > 0)
                : [];
            const heldProductIds = new Set<string>();
            releaseParts.forEach(entry => {
                if (entry.part.productId) heldProductIds.add(entry.part.productId);
            });
            reserveParts.forEach(entry => {
                if (entry.part.productId) heldProductIds.add(entry.part.productId);
            });
            consumedParts.forEach(entry => {
                if (entry.part.productId) heldProductIds.add(entry.part.productId);
            });
            const heldProductDocs = new Map<string, { ref: DocumentReference; stock: number; held: number; costPrice: number }>();
            for (const productId of heldProductIds) {
                if (heldProductDocs.has(productId)) continue;
                const productRef = db.collection('products').doc(productId);
                const productSnap = await tx.get(productRef);
                if (!productSnap.exists) {
                    throw new Error(`Linh kiện ${productId} không còn tồn tại.`);
                }
                heldProductDocs.set(productId, {
                    ref: productRef,
                    stock: Math.max(0, Number(productSnap.data()?.stock) || 0),
                    held: Math.max(0, Number(productSnap.data()?.held) || 0),
                    costPrice: Math.max(0, Number(productSnap.data()?.costPrice) || 0),
                });
            }

            const consumptionByProduct = new Map<string, number>();
            const consumptionLotPreferences = new Map<string, Map<string, number>>();
            for (const entry of consumedParts) {
                const productId = entry.part.productId;
                if (!productId) continue;
                const quantity = Math.max(0, Math.floor(Number(entry.part.quantity) || 0));
                if (quantity === 0) continue;

                consumptionByProduct.set(productId, (consumptionByProduct.get(productId) || 0) + quantity);
                if (entry.part.lotCode) {
                    const productPreferences = consumptionLotPreferences.get(productId) || new Map<string, number>();
                    productPreferences.set(entry.part.lotCode, (productPreferences.get(entry.part.lotCode) || 0) + quantity);
                    consumptionLotPreferences.set(productId, productPreferences);
                }
            }
            const consumptionFifoDeductors: FifoDeductor[] = [...consumptionByProduct.entries()].map(([productId, quantityToDeduct]) => ({
                productId,
                quantityToDeduct,
                preferredLotCodes: [...(consumptionLotPreferences.get(productId) || new Map<string, number>()).entries()]
                    .map(([lotCode, quantity]) => ({ lotCode, quantity })),
            }));
            const consumptionFifoLogs = consumptionFifoDeductors.length > 0
                ? await fetchFifoLogsForDeduction(tx, db, consumptionFifoDeductors)
                : new Map<string, { ref: DocumentReference; data: Record<string, unknown> }[]>();
            const consumptionLogParts = consumedParts.filter((entry) => entry.part.productId && heldProductDocs.has(entry.part.productId));
            const consumptionLogAllocations = await reserveSequentialDocumentIds(tx, db, {
                collectionName: 'inventory_logs',
                prefix: 'IL',
                count: consumptionLogParts.length,
            });

            // Calculate duration
            let newDuration = ticket.durationInMinutes || 0;
            if (ticket.statusTimeline && ticket.statusTimeline.length > 0) {
                const lastEvent = [...ticket.statusTimeline].reverse().find(event => event.eventType === 'status_transition' || (!event.eventType && (event.timestamp || event.at)));
                // Chỉ cộng dồn thời gian nếu node hiện tại không phải là node cuối (isTerminal)
                const timelineTime = lastEvent?.timestamp ?? lastEvent?.at;
                if (timelineTime && ticket.status !== 'new' && !isCurrentTerminal) {
                    const ts = timelineTime as { toDate?: () => Date };
                    const lastDate = ts.toDate ? ts.toDate() : new Date(timelineTime as string | number | Date);
                    const now = new Date();
                    const diffMs = now.getTime() - lastDate.getTime();
                    if (!isNaN(diffMs) && diffMs > 0) {
                        newDuration += Math.round(diffMs / 60000);
                    }
                }
            }

            let isOverride = false;
            if (ticket.staff?.assignedTechnician && caller.uid !== ticket.staff.assignedTechnician) {
                isOverride = true;
            }

            const updateData: Record<string, unknown> = {
                status: targetStatus,
                statusTimeline: FieldValue.arrayUnion({
                    eventType: isOverride ? 'manager_override' : 'status_transition',
                    status: targetStatus,
                    timestamp: Date.now(),
                    by: caller.uid,
                    actorId: caller.uid,
                    actorName: callerName,
                    actorRole: caller.role,
                    fromStatus: ticket.status,
                    toStatus: targetStatus,
                    source: source === 'repairs' ? 'repairs' : 'technician',
                    reason: technicianNoteText || null,
                    requestId: idempotencyKey || null,
                    note: technicianNoteText || null,
                    isOverride
                }),
                durationInMinutes: newDuration,
                version: (ticket.version || 0) + 1,
                updatedAt: FieldValue.serverTimestamp()
            };

            // Lưu ghi chú
            if (technicianNoteText) {
                const currentIssue = ticket.issue || {};
                if (!hasExistingRepairNote(currentIssue.notes, technicianNoteText)) {
                    updateData.issue = {
                        ...currentIssue,
                        notes: currentIssue.notes
                            ? `${currentIssue.notes}\n[${new Date().toLocaleDateString('vi-VN')}]: ${technicianNoteText}`
                            : technicianNoteText
                    };
                }
            }

            if (releaseParts.length > 0 || reserveParts.length > 0 || consumedParts.length > 0) {
                const heldDeltas = new Map<string, number>();
                const updatedParts = [...(ticket.parts || [])];

                for (const entry of releaseParts) {
                    const productId = entry.part.productId;
                    if (!productId) continue;
                    heldDeltas.set(productId, (heldDeltas.get(productId) || 0) - entry.releaseQuantity);
                    updatedParts[entry.index] = {
                        ...updatedParts[entry.index],
                        reservedQuantity: 0,
                        ...(shouldConsumeSelectedParts ? { status: REPAIR_PART_STATUS.REJECTED } : {}),
                    };
                }

                for (const entry of consumedParts) {
                    const productId = entry.part.productId;
                    const quantity = Math.max(0, Math.floor(Number(entry.part.quantity) || 0));
                    if (productId && quantity > 0) {
                        heldDeltas.set(productId, (heldDeltas.get(productId) || 0) - quantity);
                    }
                    updatedParts[entry.index] = {
                        ...updatedParts[entry.index],
                        reservedQuantity: 0,
                        inventoryDeductedAt: new Date(),
                    };
                }

                for (const entry of reserveParts) {
                    const productId = entry.part.productId;
                    if (!productId) continue;
                    heldDeltas.set(productId, (heldDeltas.get(productId) || 0) + entry.reserveQuantity);
                    updatedParts[entry.index] = {
                        ...updatedParts[entry.index],
                        reservedQuantity: getRecordedReservationQuantity(entry.part) + entry.reserveQuantity,
                    };
                }

                for (const [productId, heldDelta] of heldDeltas.entries()) {
                    const productDoc = heldProductDocs.get(productId);
                    if (!productDoc) continue;
                    const nextHeld = productDoc.held + heldDelta;
                    const consumedQuantity = consumptionByProduct.get(productId) || 0;
                    const nextStock = productDoc.stock - consumedQuantity;
                    if (nextHeld < 0) {
                        throw new Error(`Lỗi giữ chỗ: held < 0 cho ${productId}`);
                    }
                    if (nextStock < 0) {
                        throw new Error(`Linh kiện ${productId} không đủ tồn kho để hoàn tất sửa chữa.`);
                    }
                    if (nextHeld > nextStock) {
                        throw new Error(`Linh kiện ${productId} không đủ tồn khả dụng để tạm giữ.`);
                    }
                    tx.update(productDoc.ref, {
                        held: nextHeld,
                        stock: nextStock,
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                }

                let consumptionFifoResults = new Map<string, FifoDeductionResult[]>();
                if (consumptionFifoDeductors.length > 0) {
                    consumptionFifoResults = executeFifoDeductionsWrites(tx, consumptionFifoDeductors, consumptionFifoLogs);
                }
                consumptionLogParts.forEach((entry, index) => {
                    const productId = entry.part.productId!;
                    const productDoc = heldProductDocs.get(productId);
                    const logAllocation = consumptionLogAllocations[index];
                    if (!productDoc || !logAllocation) return;
                    tx.set(logAllocation.ref, {
                        productId,
                        productName: entry.part.productName,
                        quantity: -Math.max(0, Math.floor(Number(entry.part.quantity) || 0)),
                        costPriceAtLog: productDoc.costPrice,
                        type: 'REPAIR_CONSUMPTION',
                        referenceId: ticketId,
                        referenceType: 'repair',
                        lotsDeducted: consumptionFifoResults.get(productId) || [],
                        createdBy: caller.uid,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                });

                updateData.parts = updatedParts;
                if (releaseParts.length > 0) {
                    updateData.partsReleasedAt = FieldValue.serverTimestamp();
                }
                if (reserveParts.length > 0 && !ticket.partsLockedAt) {
                    updateData.partsLockedAt = FieldValue.serverTimestamp();
                }
                if (consumedParts.length > 0) {
                    updateData.partsConsumedAt = FieldValue.serverTimestamp();
                }
            }

            tx.update(ticketRef, updateData);

            consumptionLogAllocations.at(-1)?.commitCounter();

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'repair_transition',
                    referenceId: ticketId,
                    actorId: caller.uid
                });
            }

            return { success: true };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Repair transition API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        const normalizedMessage = message.toLocaleLowerCase('vi-VN');
        return NextResponse.json(
            { error: message },
            { status: normalizedMessage.includes('không') || normalizedMessage.includes('vui lòng') ? 400 : 500 }
        );
    }
}
