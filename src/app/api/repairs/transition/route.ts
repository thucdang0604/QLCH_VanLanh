import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import type { RepairTicket, RepairWorkflowActor } from '@/lib/types';
import { loadRepairWorkflow, requireWorkflowNode, workflowNodeHasFeature } from '@/lib/repairWorkflowServer';
import { canTransitionDirectlyToTerminal, getFirstNonTerminalWorkflowTransition } from '@/lib/repairWorkflowConfig';
import { isChecklistComplete } from '@/lib/workflowFeatures';
import { REPAIR_PART_STATUS, isPendingRepairPart, isSelectedRepairPart } from '@/lib/repairStatus';
import { isRepairManager } from '@/lib/repairAccess';
import { getMissingReservationQuantity, getRecordedReservationQuantity } from '@/lib/repairPartReservations';
import { isInventoryConsumedRepairPart, planRepairPartVerification, type RepairPartVerificationAction } from '@/lib/repairPartConsumption';
import { getActualUsedRepairPartsCost } from '@/lib/repairPartBilling';
import { getRepairIssueLaborCost } from '@/lib/repairIssuePricing';
import { executeFifoDeductionsWrites, fetchFifoLogsForDeduction, type FifoDeductionResult, type FifoDeductor } from '@/lib/inventoryFifo';
import { reserveSequentialDocumentIds } from '@/lib/serverDocumentIds';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getE2ERunMetadata } from '@/lib/e2eRunMetadata';
import { assertInboundArrivalConfirmedForTransition } from '@/lib/repairInboundIntake';

interface RepairTransitionRequest {
    ticketId?: string;
    targetStatus?: string;
    technicianNote?: string;
    /** Note recorded by reception after speaking with the customer. */
    customerNote?: string;
    /** Explicit customer decision recorded while the ticket remains at the confirmation node. */
    customerDecision?: 'approved' | 'declined';
    ticketVersion?: number;
    idempotencyKey?: string;
    source?: 'repairs' | 'technician';
    partVerification?: Record<string, RepairPartVerificationAction>;
}

type RepairPartLine = NonNullable<RepairTicket['parts']>[number];

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

function getReservedReleaseQuantity(part: RepairPartLine) {
    if (isInventoryConsumedRepairPart(part)) return 0;
    const selectedQuantity = isSelectedRepairPart(part) ? Math.max(0, Math.floor(Number(part.quantity) || 0)) : 0;
    const reservedQuantity = Math.max(0, Math.floor(Number(part.reservedQuantity) || 0));
    if (reservedQuantity > 0) return reservedQuantity;
    return selectedQuantity;
}

function getWorkflowActor(ticket: RepairTicket, caller: { uid: string; role?: string; permissions?: string[] }): RepairWorkflowActor | null {
    // A staff account can have elevated permissions while still being the KTV
    // assigned to this ticket. Assignment is therefore the most specific role.
    if (ticket.staff?.assignedTechnician === caller.uid) return 'technician';
    // Reception is the staff member who opened the ticket. This prevents an
    // unrelated technician with generic repair permission from impersonating
    // reception on a configured two-person workflow.
    if (ticket.staff?.createdBy === caller.uid) return 'reception';
    if (isRepairManager(caller)) return 'manager';
    return null;
}

export const POST = withApi({
    name: 'repairs/transition',
    onError: (error, context) => {
        const message = getApiErrorMessage(error);
        const normalizedMessage = message.toLocaleLowerCase('vi-VN');
        const fallbackStatus = normalizedMessage.includes('không') || normalizedMessage.includes('vui lòng') ? 400 : 500;
        const status = getApiErrorStatus(error, fallbackStatus);

        // Keep the request id next to the original exception. The shared API
        // handler deliberately redacts 5xx responses, which is correct in
        // production but made this repair workflow impossible to diagnose.
        console.error('[repairs/transition] failed', {
            requestId: context.requestId,
            status,
            message,
            error,
        });

        // Never expose implementation errors in production. Locally, return
        // the real error so the operator can fix malformed Firestore data
        // instead of seeing only the generic 5xx message.
        if (process.env.NODE_ENV !== 'production') {
            return context.json({ error: message, requestId: context.requestId }, { status });
        }

        return context.error(message, status);
    },
}, async (request: NextRequest, context) => {
        const caller = await requirePermission(request, 'manage_repairs');
        const e2eMetadata = getE2ERunMetadata(request);

        const body = await context.readJson<RepairTransitionRequest>(request);
        const { ticketId, targetStatus, technicianNote, customerNote, customerDecision, ticketVersion, idempotencyKey, source, partVerification } = body;
        const technicianNoteText = technicianNote?.trim() || '';
        const customerNoteText = customerNote?.trim() || '';
        const isCustomerDecisionRequest = customerDecision === 'approved' || customerDecision === 'declined';

        if (!ticketId || !targetStatus) {
            return context.error('Missing parameters');
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

            if (ticket.status === targetStatus && !isCustomerDecisionRequest) {
                throw new Error('Không thể chuyển phiếu sang chính trạng thái hiện tại.');
            }

            const workflow = await loadRepairWorkflow(tx, db, ticket);
            const currentNode = requireWorkflowNode(workflow, ticket.status);
            const targetNode = requireWorkflowNode(workflow, targetStatus);
            if (ticket.status !== targetStatus) {
                assertInboundArrivalConfirmedForTransition(ticket, currentNode);
            }
            const isCurrentTerminal = !!currentNode.isTerminal;
            const isTargetTerminal = !!targetNode.isTerminal;
            const isTargetDirectTerminal = canTransitionDirectlyToTerminal(targetNode);
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
            const requirePartsReceivedByTechnician = workflowNodeHasFeature(currentNode, 'requirePartsReceivedByTechnician');
            const workflowActor = getWorkflowActor(ticket, caller);
            const configuredActors = currentNode.transitionActors?.[targetStatus];
            const isCustomerDeclinedReturn = ticket.customerApproval?.decision === 'declined'
                && targetNode.terminalAction === 'handover';
            const isTechnicianStartingInspection = workflowActor === 'technician' && currentNode.id === entryNode?.id;
            const technicianStartNode = isTechnicianStartingInspection
                ? getFirstNonTerminalWorkflowTransition(workflow, currentNode.id)
                : undefined;

            if (isCurrentTerminal) {
                throw new Error(`Phiếu đã ở trạng thái kết thúc (${ticket.status}), không thể thay đổi.`);
            }

            if (!isCustomerDecisionRequest && isTargetTerminal && !isTargetDirectTerminal && !isCustomerDeclinedReturn) {
                throw new Error(`Trạng thái ${targetStatus} là trạng thái kết thúc/bàn giao. Vui lòng dùng chức năng Bàn giao (handover).`);
            }

            if (!isCustomerDecisionRequest && !isAllowed) {
                throw new Error(`Không cho phép chuyển từ ${ticket.status} sang ${targetStatus} theo quy trình.`);
            }

            // At the workflow entry, KTV may only start the first technical
            // step. Reception/manager retain their configured intake actions.
            if (!isCustomerDecisionRequest && isTechnicianStartingInspection && technicianStartNode?.id !== targetStatus) {
                throw new Error('KTV chỉ có thể bắt đầu kiểm tra ở bước Chờ Tiếp nhận.');
            }

            if (!isCustomerDecisionRequest && configuredActors && (!workflowActor || !configuredActors.includes(workflowActor))) {
                const actorLabel = workflowActor === 'reception' ? 'Tiếp nhận' : workflowActor === 'technician' ? 'KTV' : workflowActor === 'manager' ? 'Quản lý' : 'Tài khoản này';
                throw new Error(`${actorLabel} không được phép chuyển bước này.`);
            }

            // Tech note gate based on CURRENT node feature
            if (!isCustomerDecisionRequest && !isTechnicianStartingInspection && requireTechnicianNote && !technicianNoteText && !ticket.issue?.notes?.trim()) {
                throw new Error('Vui lòng nhập ghi chú kỹ thuật (kết quả kiểm tra) trước khi chuyển trạng thái.');
            }

            // Checklist check
            if (!isCustomerDecisionRequest && !isTechnicianStartingInspection && requireChecklist) {
                const checklist = ticket.deviceInfo?.checklist as Record<string, unknown> | undefined;
                if (!isChecklistComplete(checklist)) {
                    throw new Error('Vui lòng hoàn thành tất cả các mục kiểm tra (Checklist) trước khi chuyển trạng thái.');
                }
            }

            // Parts ready check
            if (!isCustomerDecisionRequest && !isTechnicianStartingInspection && requirePartsReady) {
                const pendingParts = ticket.parts?.filter(isPendingRepairPart) || [];
                if (pendingParts.length > 0) {
                    throw new Error(`Có ${pendingParts.length} linh kiện chưa sẵn sàng. Không thể bắt đầu sửa chữa khi linh kiện còn đang yêu cầu hoặc đặt hàng.`);
                }
            }

            if (!isCustomerDecisionRequest && !isTechnicianStartingInspection && requirePartsReceivedByTechnician) {
                const unreceivedParts = (ticket.parts || []).filter(part =>
                    isSelectedRepairPart(part)
                    && !isInventoryConsumedRepairPart(part)
                    && !part.technicianReceivedAt,
                );
                if (unreceivedParts.length > 0) {
                    throw new Error(`KTV chưa xác nhận đã nhận ${unreceivedParts.length} linh kiện từ Tiếp nhận. Vui lòng xác nhận từng linh kiện trước khi bắt đầu sửa.`);
                }
            }

            // Assigned technician and Manager Override check
            if (!isCustomerDecisionRequest && !configuredActors && ticket.staff?.assignedTechnician) {
                const isAssignedKTV = caller.uid === ticket.staff.assignedTechnician;
                const isManager = isRepairManager(caller);

                if (!isAssignedKTV && !isManager) {
                    throw new Error('Chỉ KTV được phân công hoặc Quản lý mới có thể chuyển trạng thái phiếu này.');
                }
                if (!isAssignedKTV && isManager && !technicianNoteText) {
                    throw new Error('Quản lý ghi đè trạng thái (Manager Override) yêu cầu phải nhập lý do vào Ghi chú kỹ thuật.');
                }
            }

            if (!isCustomerDecisionRequest && requireAssignedTechnician && !ticket.staff?.assignedTechnician) {
                throw new Error('Trạng thái này yêu cầu phải phân công Kỹ thuật viên phụ trách. Vui lòng gán KTV trước khi chuyển trạng thái.');
            }

            const shouldReleaseHeldParts = workflowNodeHasFeature(targetNode, 'releaseHeldParts');
            const verificationPlan = shouldConsumeSelectedParts
                ? planRepairPartVerification(ticket.parts || [], partVerification)
                : { used: [], returned: [] };
            const returnedParts = shouldConsumeSelectedParts ? verificationPlan.returned : [];
            const releaseCandidates = shouldReleaseHeldParts
                ? (ticket.parts || []).map((part, index) => ({ part, index }))
                : [];
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

            const isOverride = workflowActor === 'manager'
                && !!ticket.staff?.assignedTechnician
                && caller.uid !== ticket.staff.assignedTechnician;
            const requiresCustomerConfirmation = workflowNodeHasFeature(currentNode, 'confirmCustomerResponse');
            const currentRecordsCustomerApproval = workflowNodeHasFeature(currentNode, 'recordCustomerApproval');
            const currentRecordsCustomerDecline = workflowNodeHasFeature(currentNode, 'recordCustomerDecline');
            // Support the older model where an explicit decision was represented
            // by a separate target node, but never infer a decision merely from
            // moving KTV into the confirmation node.
            const targetRecordsCustomerApproval = requiresCustomerConfirmation && workflowNodeHasFeature(targetNode, 'recordCustomerApproval');
            const targetRecordsCustomerDecline = requiresCustomerConfirmation && workflowNodeHasFeature(targetNode, 'recordCustomerDecline');
            const recordsCustomerApproval = isCustomerDecisionRequest
                ? customerDecision === 'approved'
                : targetRecordsCustomerApproval;
            const recordsCustomerDecline = isCustomerDecisionRequest
                ? customerDecision === 'declined'
                : targetRecordsCustomerDecline;
            const recordsCustomerDecision = recordsCustomerApproval || recordsCustomerDecline;
            if (recordsCustomerDecision && !requiresCustomerConfirmation) {
                throw new Error('Phản hồi khách hàng chỉ được ghi nhận tại bước Báo tình trạng và giá sau kiểm tra.');
            }
            if (isCustomerDecisionRequest && (
                recordsCustomerApproval && !currentRecordsCustomerApproval && !targetRecordsCustomerApproval
                || recordsCustomerDecline && !currentRecordsCustomerDecline && !targetRecordsCustomerDecline
            )) {
                throw new Error('Lựa chọn phản hồi khách hàng không được cấu hình cho bước hiện tại.');
            }
            if (recordsCustomerDecision && workflowActor !== 'reception' && workflowActor !== 'manager') {
                throw new Error('Chỉ Tiếp nhận hoặc Quản lý có thể ghi nhận phản hồi của khách hàng.');
            }
            if (!isCustomerDecisionRequest && requiresCustomerConfirmation && !ticket.customerApproval?.decision) {
                throw new Error('Tiếp nhận cần ghi nhận khách đồng ý hoặc không đồng ý sửa trước khi chuyển bước tiếp theo.');
            }
            if (!isCustomerDecisionRequest && ticket.customerApproval?.decision === 'declined' && targetNode.terminalAction !== 'handover') {
                throw new Error('Khách không đồng ý sửa. Chỉ được phép chuyển phiếu sang Trả máy (OUT).');
            }

            // Firestore does not accept undefined fields inside arrayUnion.
            // Staff tokens may legitimately omit role, so only persist it when
            // the claim is available rather than failing the whole transition.
            const timelineEntry = {
                eventType: recordsCustomerApproval ? 'customer_approved' : recordsCustomerDecline ? 'customer_declined' : isOverride ? 'manager_override' : 'status_transition',
                status: targetStatus,
                timestamp: Date.now(),
                by: caller.uid,
                actorId: caller.uid,
                actorName: callerName,
                ...(caller.role ? { actorRole: caller.role } : {}),
                fromStatus: ticket.status,
                toStatus: targetStatus,
                source: source === 'repairs' ? 'repairs' : 'technician',
                reason: recordsCustomerDecision ? customerNoteText || null : technicianNoteText || null,
                requestId: idempotencyKey || null,
                note: recordsCustomerDecision ? customerNoteText || null : technicianNoteText || null,
                isOverride,
            };

            const updateData: Record<string, unknown> = {
                status: targetStatus,
                statusTimeline: FieldValue.arrayUnion(timelineEntry),
                durationInMinutes: newDuration,
                version: (ticket.version || 0) + 1,
                updatedAt: FieldValue.serverTimestamp()
            };

            if (recordsCustomerDecision) {
                updateData.customerApproval = {
                    decision: recordsCustomerApproval ? 'approved' : 'declined',
                    respondedAt: new Date(),
                    respondedBy: caller.uid,
                    respondedByName: callerName,
                    ...(recordsCustomerApproval ? {
                        approvedAt: new Date(),
                        approvedBy: caller.uid,
                        approvedByName: callerName,
                    } : {}),
                    ...(customerNoteText ? { note: customerNoteText } : {}),
                };
            }

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

            if (releaseParts.length > 0 || reserveParts.length > 0 || consumedParts.length > 0 || returnedParts.length > 0) {
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

                for (const entry of returnedParts) {
                    updatedParts[entry.index] = {
                        ...updatedParts[entry.index],
                        returnedToReceptionPendingAt: new Date(),
                        returnedToReceptionBy: caller.uid,
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
                        ...e2eMetadata,
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
                if (shouldConsumeSelectedParts) {
                    const partsCost = getActualUsedRepairPartsCost(updatedParts);
                    const payment = ticket.payment || {};
                    const laborCost = getRepairIssueLaborCost(ticket.issues, updatedParts, Number(payment.laborCost) || 0);
                    const additionalFees = Number(payment.additionalFees) || 0;
                    const discountAmount = Number(payment.discountAmount) || 0;
                    updateData.payment = {
                        ...payment,
                        partsCost,
                        laborCost,
                        amount: Math.max(0, laborCost + partsCost + additionalFees - discountAmount),
                    };
                }
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
                    ...e2eMetadata,
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'repair_transition',
                    referenceId: ticketId,
                    actorId: caller.uid
                });
            }

            return { success: true };
        });

        return context.json(result);
});
