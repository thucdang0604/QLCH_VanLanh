import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { RepairTicket, PendingTechnicianTransfer } from '@/lib/types';
import { isRepairManager, isTechnicianUser } from '@/lib/repairAccess';

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');
        const body = await request.json();
        const { action, ticketId, ticketVersion, idempotencyKey } = body;

        if (!action || !ticketId) {
            return NextResponse.json({ error: 'Missing action or ticketId' }, { status: 400 });
        }

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists && opSnap.data()?.status === 'completed') {
                    const op = opSnap.data();
                    if (op?.type !== `transfer_${action}` || op?.referenceId !== ticketId || op?.actorId !== caller.uid) {
                        throw new Error('Mã chống gửi trùng đã được dùng cho thao tác khác.');
                    }
                    return { success: true, fromCache: true };
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

            let updateData: Record<string, unknown> = {};

            if (action === 'request') {
                const { toTechnicianId, reason, source } = body;
                if (!toTechnicianId) throw new Error('Thiếu KTV nhận');
                
                const currentTechnician = ticket.staff?.assignedTechnician;
                const currentTechnicianName = ticket.staff?.assignedTechnicianName || '';

                if (!currentTechnician) {
                    throw new Error('Phiếu chưa có KTV phụ trách để chuyển giao. Vui lòng gán KTV.');
                }
                if (currentTechnician === toTechnicianId) {
                    throw new Error('KTV nhận phải khác KTV hiện tại.');
                }
                if (caller.uid !== currentTechnician && !isRepairManager(caller)) {
                    throw new Error('Chỉ KTV đang phụ trách hoặc quản lý Sale được đề nghị chuyển KTV.');
                }
                if (typeof reason !== 'string' || !reason.trim()) {
                    throw new Error('Vui lòng nhập lý do chuyển KTV để lưu nhật ký kiểm soát.');
                }

                if (ticket.pendingTechnicianTransfer && ticket.pendingTechnicianTransfer.status === 'pending') {
                    throw new Error('Đang có một yêu cầu chuyển giao chờ xử lý.');
                }

                const targetSnap = await tx.get(db.collection('users').doc(toTechnicianId));
                const targetData = targetSnap.data() as Record<string, unknown> | undefined;
                if (!targetSnap.exists || !isTechnicianUser(targetData)) {
                    throw new Error('KTV nhận không tồn tại hoặc không có quyền kỹ thuật viên.');
                }
                const verifiedTechnicianName = typeof targetData?.displayName === 'string'
                    ? targetData.displayName
                    : 'Kỹ thuật viên';
                const safeSource = source === 'repairs' ? 'repairs' : 'technician';

                const transfer: PendingTechnicianTransfer = {
                    id: idempotencyKey || Date.now().toString(),
                    fromTechnicianId: currentTechnician,
                    fromTechnicianName: currentTechnicianName,
                    toTechnicianId,
                    toTechnicianName: verifiedTechnicianName,
                    requestedBy: caller.uid,
                    requestedByName: callerName,
                    requestedByRole: caller.role,
                    reason: reason.trim(),
                    source: safeSource,
                    status: 'pending',
                    requestedAt: new Date(),
                    ticketVersion: (ticket.version || 0) + 1
                };

                updateData = {
                    pendingTechnicianTransfer: transfer,
                    version: (ticket.version || 0) + 1,
                    updatedAt: FieldValue.serverTimestamp(),
                    statusTimeline: FieldValue.arrayUnion({
                        eventType: 'transfer_requested',
                        status: ticket.status,
                        actorId: caller.uid,
                        actorName: callerName,
                        actorRole: caller.role,
                        fromTechnicianId: currentTechnician,
                        toTechnicianId,
                        fromTechnicianName: currentTechnicianName,
                        toTechnicianName: verifiedTechnicianName,
                        reason: reason.trim(),
                        source: safeSource,
                        requestId: transfer.id,
                        timestamp: Date.now(),
                    })
                };
            } 
            else if (action === 'respond') {
                const { responseStatus } = body; 
                if (!ticket.pendingTechnicianTransfer || ticket.pendingTechnicianTransfer.status !== 'pending') {
                    throw new Error('Không có yêu cầu chuyển giao nào đang chờ xử lý.');
                }
                
                const transfer = ticket.pendingTechnicianTransfer;

                if (caller.uid !== transfer.toTechnicianId) {
                    throw new Error('Chỉ KTV được chỉ định mới có thể chấp nhận/từ chối yêu cầu.');
                }
                if (ticket.staff?.assignedTechnician !== transfer.fromTechnicianId) {
                    throw new Error('KTV phụ trách đã thay đổi. Yêu cầu chuyển giao này không còn hiệu lực.');
                }

                if (responseStatus === 'accepted') {
                    updateData = {
                        'pendingTechnicianTransfer.status': 'accepted',
                        'pendingTechnicianTransfer.respondedAt': FieldValue.serverTimestamp(),
                        'pendingTechnicianTransfer.respondedBy': caller.uid,
                        'staff.assignedTechnician': transfer.toTechnicianId,
                        'staff.assignedTechnicianName': transfer.toTechnicianName,
                        version: (ticket.version || 0) + 1,
                        updatedAt: FieldValue.serverTimestamp(),
                        statusTimeline: FieldValue.arrayUnion({
                            eventType: 'transfer_accepted',
                            status: ticket.status,
                            actorId: caller.uid,
                            actorName: callerName,
                            actorRole: caller.role,
                            fromTechnicianId: transfer.fromTechnicianId,
                            fromTechnicianName: transfer.fromTechnicianName,
                            toTechnicianId: transfer.toTechnicianId,
                            toTechnicianName: transfer.toTechnicianName,
                            reason: transfer.reason,
                            source: transfer.source,
                            requestId: transfer.id,
                            timestamp: Date.now(),
                        })
                    };
                } else if (responseStatus === 'rejected') {
                    updateData = {
                        'pendingTechnicianTransfer.status': 'rejected',
                        'pendingTechnicianTransfer.respondedAt': FieldValue.serverTimestamp(),
                        'pendingTechnicianTransfer.respondedBy': caller.uid,
                        version: (ticket.version || 0) + 1,
                        updatedAt: FieldValue.serverTimestamp(),
                        statusTimeline: FieldValue.arrayUnion({
                            eventType: 'transfer_rejected',
                            status: ticket.status,
                            actorId: caller.uid,
                            actorName: callerName,
                            actorRole: caller.role,
                            fromTechnicianId: transfer.fromTechnicianId,
                            fromTechnicianName: transfer.fromTechnicianName,
                            toTechnicianId: transfer.toTechnicianId,
                            toTechnicianName: transfer.toTechnicianName,
                            reason: transfer.reason,
                            source: transfer.source,
                            requestId: transfer.id,
                            timestamp: Date.now(),
                        })
                    };
                } else {
                    throw new Error('Trạng thái phản hồi không hợp lệ.');
                }
            }
            else if (action === 'cancel') {
                if (!ticket.pendingTechnicianTransfer || ticket.pendingTechnicianTransfer.status !== 'pending') {
                    throw new Error('Không có yêu cầu chuyển giao nào đang chờ xử lý.');
                }

                const transfer = ticket.pendingTechnicianTransfer;
                if (caller.uid !== transfer.requestedBy && !isRepairManager(caller)) {
                    throw new Error('Bạn không có quyền hủy yêu cầu này.');
                }

                updateData = {
                    'pendingTechnicianTransfer.status': 'cancelled',
                    'pendingTechnicianTransfer.respondedAt': FieldValue.serverTimestamp(),
                    'pendingTechnicianTransfer.respondedBy': caller.uid,
                    version: (ticket.version || 0) + 1,
                    updatedAt: FieldValue.serverTimestamp(),
                    statusTimeline: FieldValue.arrayUnion({
                        eventType: 'transfer_cancelled',
                        status: ticket.status,
                        actorId: caller.uid,
                        actorName: callerName,
                        actorRole: caller.role,
                        fromTechnicianId: transfer.fromTechnicianId,
                        fromTechnicianName: transfer.fromTechnicianName,
                        toTechnicianId: transfer.toTechnicianId,
                        toTechnicianName: transfer.toTechnicianName,
                        reason: transfer.reason,
                        source: transfer.source,
                        requestId: transfer.id,
                        timestamp: Date.now(),
                    })
                };
            }
            else {
                throw new Error('Action không hợp lệ.');
            }

            tx.update(ticketRef, updateData);

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: `transfer_${action}`,
                    referenceId: ticketId,
                    actorId: caller.uid,
                });
            }

            return { success: true };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Transfer technician API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
