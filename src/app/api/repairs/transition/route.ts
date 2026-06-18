import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { RepairTicket } from '@/lib/types';
import { loadRepairWorkflow, requireWorkflowNode, workflowNodeHasFeature } from '@/lib/repairWorkflowServer';
import { isChecklistComplete } from '@/lib/workflowFeatures';
import { isPendingRepairPart } from '@/lib/repairStatus';
import { isRepairManager } from '@/lib/repairAccess';

interface RepairTransitionRequest {
    ticketId?: string;
    targetStatus?: string;
    technicianNote?: string;
    ticketVersion?: number;
    idempotencyKey?: string;
    source?: 'repairs' | 'technician';
}

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

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');

        const body = await request.json() as RepairTransitionRequest;
        const { ticketId, targetStatus, technicianNote, ticketVersion, idempotencyKey, source } = body;
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

            if (ticket.status === targetStatus) return { success: true };

            const workflow = await loadRepairWorkflow(tx, db, ticket);
            const currentNode = requireWorkflowNode(workflow, ticket.status);
            const targetNode = requireWorkflowNode(workflow, targetStatus);
            const isCurrentTerminal = !!currentNode.isTerminal;
            const isTargetTerminal = !!targetNode.isTerminal;
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

            if (isTargetTerminal) {
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

            tx.update(ticketRef, updateData);

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
        return NextResponse.json(
            { error: message },
            { status: message.includes('không') || message.includes('Vui lòng') ? 400 : 500 }
        );
    }
}
