import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import type { RepairTicket } from '@/lib/types';
import { loadRepairWorkflow, requireWorkflowNode } from '@/lib/repairWorkflowServer';

const PAYMENT_SIGNATURE_FIELDS = ['deposit', 'quote', 'giftDiscount', 'additionalFees', 'laborCost', 'paymentMethod'] as const;

function stableSignature(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value || {})).digest('hex');
}

function paymentPayloadSignature(paymentData: Record<string, unknown>, profileData: Record<string, unknown>) {
    const normalizedPayment = PAYMENT_SIGNATURE_FIELDS.reduce((acc, field) => {
        if (field in paymentData) acc[field] = paymentData[field];
        return acc;
    }, {} as Record<string, unknown>);
    return stableSignature({ payment: normalizedPayment, profile: profileData });
}

function parseDate(value: unknown) {
    if (!value) return null;
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return Timestamp.fromDate(date);
    }
    return null;
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_repairs');
        const body = await request.json();
        const { ticketId, ticketVersion, idempotencyKey } = body;
        const paymentData = (body.paymentData || {}) as Record<string, unknown>;
        const profileData = (body.profileData || {}) as Record<string, unknown>;

        if (!ticketId || !profileData || !paymentData) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const payloadSignature = paymentPayloadSignature(paymentData, profileData);
        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(idempotencyKey);
                const opSnap = await tx.get(opRef);
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed') {
                        if (
                            data.type !== 'repair_edit' ||
                            data.referenceId !== ticketId ||
                            data.actorId !== caller.uid ||
                            data.payloadSignature !== payloadSignature
                        ) {
                            throw new Error('Idempotency key da duoc dung cho thao tac khac.');
                        }
                        return { success: true, fromCache: true };
                    }
                }
            }

            const ticketRef = db.collection('repairs').doc(String(ticketId));
            const ticketSnap = await tx.get(ticketRef);
            if (!ticketSnap.exists) {
                throw new Error('Phieu sua chua khong ton tai.');
            }

            const ticket = ticketSnap.data() as RepairTicket;
            if (ticket.version !== undefined && ticket.version !== ticketVersion) {
                throw new Error('Du lieu da thay doi. Vui long tai lai phieu truoc khi luu.');
            }
            if (ticket.payment?.status === 'paid' || ticket.payment?.status === 'refunded') {
                throw new Error('Khong the sua chi phi khi phieu da thanh toan hoac hoan tien.');
            }

            const workflow = await loadRepairWorkflow(tx, db, ticket);
            const currentNode = requireWorkflowNode(workflow, ticket.status);
            if (currentNode.isTerminal) {
                throw new Error(`Khong the sua phieu o trang thai ket thuc (${ticket.status}).`);
            }

            const currentPayment = ticket.payment || {} as RepairTicket['payment'];
            const updatedPayment = { ...currentPayment };
            if ('deposit' in paymentData) (updatedPayment as Record<string, unknown>).deposit = Number(paymentData.deposit) || 0;
            if ('quote' in paymentData) (updatedPayment as Record<string, unknown>).quote = Number(paymentData.quote) || 0;
            if ('giftDiscount' in paymentData) updatedPayment.giftDiscount = Number(paymentData.giftDiscount) || 0;
            if ('additionalFees' in paymentData) updatedPayment.additionalFees = Number(paymentData.additionalFees) || 0;
            if ('laborCost' in paymentData) updatedPayment.laborCost = Number(paymentData.laborCost) || 0;
            if ('paymentMethod' in paymentData) (updatedPayment as Record<string, unknown>).paymentMethod = paymentData.paymentMethod;

            const partsCost = updatedPayment.partsCost || 0;
            const laborCost = updatedPayment.laborCost || 0;
            const additionalFees = updatedPayment.additionalFees || 0;
            const discountAmount = updatedPayment.discountAmount || 0;
            updatedPayment.amount = partsCost + laborCost + additionalFees - discountAmount;

            const nextVersion = (ticket.version || 0) + 1;
            tx.update(ticketRef, {
                appointmentId: profileData.appointmentId || null,
                appointmentIntakeMethod: profileData.appointmentIntakeMethod || null,
                categoryPath: Array.isArray(profileData.categoryPath) ? profileData.categoryPath : [],
                serviceName: profileData.serviceName || '',
                customer: profileData.customer || ticket.customer,
                deviceInfo: profileData.deviceInfo || ticket.deviceInfo,
                preRepairMedia: Array.isArray(profileData.preRepairMedia) ? profileData.preRepairMedia : [],
                postRepairMedia: Array.isArray(profileData.postRepairMedia) ? profileData.postRepairMedia : [],
                issue: profileData.issue || ticket.issue || {},
                issues: Array.isArray(profileData.issues) ? profileData.issues : null,
                timing: {
                    receivedAt: ticket.timing?.receivedAt || FieldValue.serverTimestamp(),
                    estimatedReturnAt: parseDate(profileData.estimatedReturnAt),
                },
                staff: {
                    createdBy: ticket.staff?.createdBy || caller.uid,
                    createdByName: ticket.staff?.createdByName || 'Admin',
                    assignedTechnician: profileData.assignedTechnician || '',
                    assignedTechnicianName: profileData.assignedTechnicianName || '',
                },
                payment: updatedPayment,
                updatedAt: FieldValue.serverTimestamp(),
                version: nextVersion,
            });

            if (idempotencyKey) {
                tx.set(db.collection('operation_requests').doc(idempotencyKey), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'repair_edit',
                    referenceId: ticketId,
                    actorId: caller.uid,
                    payloadSignature,
                });
            }

            return { success: true, version: nextVersion, payment: updatedPayment };
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Repair edit API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
