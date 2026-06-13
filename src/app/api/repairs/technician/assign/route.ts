import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { FieldValue } from 'firebase-admin/firestore';
import type { RepairTicket } from '@/lib/types';
import { isRepairManager, isTechnicianUser } from '@/lib/repairAccess';

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');
        const body = await request.json();
        const { ticketId, technicianId, ticketVersion, idempotencyKey } = body;

        if (!ticketId || !technicianId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }
        if (!isRepairManager(caller)) {
            return NextResponse.json({ error: 'Chỉ quản lý Sale hoặc Admin được gán KTV lần đầu.' }, { status: 403 });
        }

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists && opSnap.data()?.status === 'completed') {
                    const op = opSnap.data();
                    if (op?.type !== 'assign_technician' || op?.referenceId !== ticketId || op?.actorId !== caller.uid) {
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
            const technicianSnap = await tx.get(db.collection('users').doc(technicianId));
            const technicianData = technicianSnap.data() as Record<string, unknown> | undefined;

            if (!technicianSnap.exists || !isTechnicianUser(technicianData)) {
                throw new Error('KTV được chọn không tồn tại hoặc không có quyền kỹ thuật viên.');
            }
            const technicianName = typeof technicianData?.displayName === 'string'
                ? technicianData.displayName
                : 'Kỹ thuật viên';
            const callerSnap = await tx.get(db.collection('users').doc(caller.uid));
            const callerData = callerSnap.data() as Record<string, unknown> | undefined;

            if (ticket.version !== undefined && ticket.version !== ticketVersion) {
                throw new Error('Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại trang.');
            }

            if (ticket.staff?.assignedTechnician) {
                throw new Error('Phiếu đã có KTV phụ trách. Vui lòng sử dụng tính năng Đề nghị chuyển KTV.');
            }

            const updateData: Record<string, unknown> = {
                'staff.assignedTechnician': technicianId,
                'staff.assignedTechnicianName': technicianName,
                version: (ticket.version || 0) + 1,
                updatedAt: FieldValue.serverTimestamp(),
                statusTimeline: FieldValue.arrayUnion({
                    eventType: 'technician_assigned',
                    status: ticket.status,
                    actorId: caller.uid,
                    actorName: typeof callerData?.displayName === 'string' ? callerData.displayName : 'Quản lý',
                    actorRole: caller.role,
                    toTechnicianId: technicianId,
                    toTechnicianName: technicianName,
                    source: 'repairs',
                    reason: 'Phân công KTV lần đầu',
                    requestId: idempotencyKey || null,
                    timestamp: Date.now(),
                }),
            };

            tx.update(ticketRef, updateData);

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'assign_technician',
                    referenceId: ticketId,
                    actorId: caller.uid,
                });
            }

            return { success: true };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Assign technician API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
