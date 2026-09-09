import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { isRepairManager } from '@/lib/repairAccess';
import { loadRepairWorkflow, requireWorkflowNode, workflowNodeHasFeature } from '@/lib/repairWorkflowServer';
import type { RepairTicket } from '@/lib/types';
import { getRepairIssueLaborCost } from '@/lib/repairIssuePricing';
import { normalizeDiagnosisIssue, type DiagnosisIssueInput } from '@/lib/repairDiagnosisInput';

type DiagnosisUpdateRequest = {
    ticketId?: string;
    ticketVersion?: number;
    issues?: DiagnosisIssueInput[];
    technicianNote?: string;
};

export const POST = withApi({
    name: 'repairs/diagnosis',
    onError: (error, context) => context.error(
        getApiErrorMessage(error, 'Khong the cap nhat chan doan ky thuat.'),
        getApiErrorStatus(error, 400),
    ),
}, async (request: NextRequest, context) => {
    const caller = await requirePermission(request, 'manage_repairs');
    const body = await context.readJson<DiagnosisUpdateRequest>(request);
    const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : '';
    const technicianNote = typeof body.technicianNote === 'string' ? body.technicianNote.trim() : '';

    if (!ticketId || !Array.isArray(body.issues)) return context.error('Missing ticketId or issues.', 400);
    if (body.issues.length === 0 || body.issues.length > 20) return context.error('Cần có từ 1 đến 20 lỗi trong chẩn đoán.', 400);
    if (technicianNote.length > 4_000) return context.error('Ghi chú kỹ thuật không được vượt quá 4.000 ký tự.', 400);

    const issues = body.issues.map(normalizeDiagnosisIssue);
    const representativeIssue = issues.find(issue => issue.categoryPath && issue.categoryPath.length > 0) || issues[0];
    const db = getAdminDb();

    const result = await db.runTransaction(async (tx) => {
        const ticketRef = db.collection('repairs').doc(ticketId);
        const ticketSnap = await tx.get(ticketRef);
        if (!ticketSnap.exists) throw new Error('Phiếu sửa chữa không tồn tại.');

        const ticket = ticketSnap.data() as RepairTicket;
        if (ticket.version !== undefined && ticket.version !== body.ticketVersion) throw new Error('Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại phiếu.');
        if (!isRepairManager(caller) && ticket.staff?.assignedTechnician !== caller.uid) throw new Error('Bạn không được phân công xử lý phiếu này.');
        if (ticket.payment?.status === 'paid' || ticket.payment?.status === 'refunded') throw new Error('Phiếu đã thanh toán hoặc hoàn tiền, không thể đổi chẩn đoán và giá.');

        const workflow = await loadRepairWorkflow(tx, db, ticket);
        const currentNode = requireWorkflowNode(workflow, ticket.status);
        if (currentNode.isTerminal) throw new Error('Phiếu đang ở trạng thái kết thúc, không thể cập nhật chẩn đoán.');
        if (!workflowNodeHasFeature(currentNode, 'allowTechnicianDiagnosis')) throw new Error('Workflow hiện tại chưa cho phép KTV cập nhật chẩn đoán ở bước này.');

        const payment = ticket.payment || {} as RepairTicket['payment'];
        const laborCost = getRepairIssueLaborCost(issues, ticket.parts || [], Number(payment.laborCost) || 0);
        const partsCost = Number(payment.partsCost) || 0;
        const additionalFees = Number(payment.additionalFees) || 0;
        const discountAmount = Number(payment.discountAmount) || 0;
        const updatedPayment = { ...payment, laborCost, amount: Math.max(0, partsCost + laborCost + additionalFees - discountAmount) };
        const nextVersion = (ticket.version || 0) + 1;

        tx.update(ticketRef, {
            issues,
            issue: { description: issues.map(issue => issue.label).join(', '), notes: technicianNote },
            categoryPath: representativeIssue.categoryPath || [],
            serviceName: representativeIssue.serviceName || '',
            payment: updatedPayment,
            updatedAt: FieldValue.serverTimestamp(),
            version: nextVersion,
            statusTimeline: FieldValue.arrayUnion({
                status: ticket.status,
                eventType: 'diagnosis_updated',
                timestamp: Date.now(),
                actorId: caller.uid,
                actorRole: isRepairManager(caller) ? 'manager' : 'technician',
                note: technicianNote || null,
            }),
        });

        return {
            issues,
            issue: { description: issues.map(issue => issue.label).join(', '), notes: technicianNote },
            categoryPath: representativeIssue.categoryPath || [],
            serviceName: representativeIssue.serviceName || '',
            payment: updatedPayment,
            version: nextVersion,
        };
    });

    return context.json({ success: true, ...result });
});
