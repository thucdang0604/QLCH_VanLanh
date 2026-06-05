import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { RepairTicket } from '@/lib/types';
import { loadRepairWorkflow, requireWorkflowNode, workflowNodeHasFeature } from '@/lib/repairWorkflowServer';
import { isChecklistComplete } from '@/lib/workflowFeatures';

interface RepairTransitionRequest {
    ticketId?: string;
    targetStatus?: string;
    technicianNote?: string;
    ticketVersion?: number;
    idempotencyKey?: string;
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');
        
        const body = await request.json() as RepairTransitionRequest;
        const { ticketId, targetStatus, technicianNote, ticketVersion, idempotencyKey } = body;

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

            const workflow = await loadRepairWorkflow(tx, db, ticket);
            const currentNode = requireWorkflowNode(workflow, ticket.status);
            const targetNode = requireWorkflowNode(workflow, targetStatus);
            const isCurrentTerminal = !!currentNode.isTerminal;
            const isTargetTerminal = !!targetNode.isTerminal;
            const isAllowed = currentNode.allowedNext?.includes(targetStatus) ?? false;
            const requireChecklist = workflowNodeHasFeature(targetNode, 'requireChecklist');
            const requirePartsReady = workflowNodeHasFeature(targetNode, 'requirePartsReady');

            if (isCurrentTerminal) {
                throw new Error(`Phiếu đã ở trạng thái kết thúc (${ticket.status}), không thể thay đổi.`);
            }

            if (isTargetTerminal) {
                throw new Error(`Trạng thái ${targetStatus} là trạng thái kết thúc/bàn giao. Vui lòng dùng chức năng Bàn giao (handover).`);
            }

            if (!isAllowed) {
                throw new Error(`Không cho phép chuyển từ ${ticket.status} sang ${targetStatus} theo quy trình.`);
            }

            // Tech note gate
            if (ticket.status === 'dang_kiem_tra' && !technicianNote?.trim() && !ticket.issue?.notes?.trim()) {
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
                const requestedParts = ticket.parts?.filter(p => p.status === 'requested') || [];
                if (requestedParts.length > 0) {
                    throw new Error(`Có ${requestedParts.length} linh kiện đang yêu cầu nhập kho. Không thể bắt đầu sửa chữa khi chưa có linh kiện.`);
                }
            }

            // Calculate duration
            let newDuration = ticket.durationInMinutes || 0;
            if (ticket.statusTimeline && ticket.statusTimeline.length > 0) {
                const lastEvent = ticket.statusTimeline[ticket.statusTimeline.length - 1];
                if (lastEvent && lastEvent.timestamp && ticket.status !== 'new' && ticket.status !== 'cho_ban_giao_khach') {
                    const ts = lastEvent.timestamp as { toDate?: () => Date };
                    const lastDate = ts.toDate ? ts.toDate() : new Date(lastEvent.timestamp as string | number | Date);
                    const now = new Date();
                    const diffMs = now.getTime() - lastDate.getTime();
                    if (diffMs > 0) {
                        newDuration += Math.round(diffMs / 60000);
                    }
                }
            }

            const updateData: Record<string, unknown> = {
                status: targetStatus,
                statusTimeline: FieldValue.arrayUnion({
                    status: targetStatus,
                    at: new Date(),
                    by: caller.uid,
                    note: technicianNote || null
                }),
                durationInMinutes: newDuration,
                version: (ticket.version || 0) + 1,
                updatedAt: FieldValue.serverTimestamp()
            };

            // Lưu ghi chú
            if (technicianNote?.trim()) {
                const currentIssue = ticket.issue || {};
                updateData.issue = {
                    ...currentIssue,
                    notes: currentIssue.notes 
                        ? `${currentIssue.notes}\n[${new Date().toLocaleDateString('vi-VN')}]: ${technicianNote}` 
                        : technicianNote
                };
            }

            tx.update(ticketRef, updateData);

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'repair_transition',
                    referenceId: ticketId
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
