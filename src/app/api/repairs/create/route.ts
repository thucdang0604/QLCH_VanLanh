import { NextResponse, NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { loadRepairWorkflow } from '@/lib/repairWorkflowServer';
import { FieldValue } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { isTechnicianUser } from '@/lib/repairAccess';

type CreateRepairBody = Record<string, unknown> & {
    ticketType?: 'repair' | 'warranty';
    timing?: Record<string, unknown>;
    staff?: Record<string, unknown>;
};

function parseClientTimestamp(value: unknown): Timestamp | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as { seconds?: unknown; nanoseconds?: unknown };
    if (typeof raw.seconds !== 'number') return null;
    return new Timestamp(raw.seconds, typeof raw.nanoseconds === 'number' ? raw.nanoseconds : 0);
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');
        const body = await request.json() as CreateRepairBody;

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            const workflow = await loadRepairWorkflow(tx, db, { ticketType: body.ticketType });
            const entryNode = workflow[0];

            if (!entryNode) {
                throw new Error('Không tìm thấy entry node trong workflow');
            }

            const callerRef = db.collection('users').doc(caller.uid);
            const callerSnap = await tx.get(callerRef);
            const callerData = callerSnap.data() as Record<string, unknown> | undefined;
            const requestedTechnicianId = typeof body.staff?.assignedTechnician === 'string'
                ? body.staff.assignedTechnician.trim()
                : '';
            let assignedTechnicianName = '';

            if (requestedTechnicianId) {
                const technicianSnap = await tx.get(db.collection('users').doc(requestedTechnicianId));
                const technicianData = technicianSnap.data() as Record<string, unknown> | undefined;
                if (!technicianSnap.exists || !isTechnicianUser(technicianData)) {
                    throw new Error('KTV được chọn không tồn tại hoặc không có quyền kỹ thuật viên.');
                }
                assignedTechnicianName = typeof technicianData?.displayName === 'string'
                    ? technicianData.displayName
                    : 'Kỹ thuật viên';
            }

            const estimatedReturnAt = parseClientTimestamp(body.timing?.estimatedReturnAt);
            const safeBody = { ...body };
            delete safeBody.createdAt;
            delete safeBody.updatedAt;
            delete safeBody.status;
            delete safeBody.statusTimeline;
            delete safeBody.version;
            delete safeBody.pendingTechnicianTransfer;

            // Ép trạng thái về entry node
            const finalData = {
                ...safeBody,
                staff: {
                    createdBy: caller.uid,
                    createdByName: typeof callerData?.displayName === 'string' ? callerData.displayName : 'Nhân viên',
                    ...(requestedTechnicianId ? {
                        assignedTechnician: requestedTechnicianId,
                        assignedTechnicianName,
                    } : {}),
                },
                status: entryNode.id,
                statusTimeline: [{
                    eventType: 'status_transition',
                    status: entryNode.id,
                    toStatus: entryNode.id,
                    actorId: caller.uid,
                    actorName: typeof callerData?.displayName === 'string' ? callerData.displayName : 'Nhân viên',
                    actorRole: caller.role,
                    source: 'repairs',
                    timestamp: Date.now(),
                }],
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                timing: {
                    ...(estimatedReturnAt ? { estimatedReturnAt } : {}),
                    receivedAt: FieldValue.serverTimestamp(),
                },
                version: 1,
            };

            const newTicketRef = db.collection('repairs').doc();
            tx.set(newTicketRef, finalData);

            return { id: newTicketRef.id, status: entryNode.id };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Create ticket API error:', error);
        const message = error instanceof Error ? error.message : 'Không thể tạo phiếu sửa chữa.';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
