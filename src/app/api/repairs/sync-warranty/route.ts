import { NextResponse, NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import type { RepairTicket } from '@/lib/types';
import { loadRepairWorkflow, requireWorkflowNode } from '@/lib/repairWorkflowServer';
import { stampRepairWarrantyOnParts } from '@/lib/repairWarrantyRules';

function getDateMillis(value: unknown): number {
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    return (value as { toMillis?: () => number } | undefined)?.toMillis?.()
        || (value as { toDate?: () => Date } | undefined)?.toDate?.()?.getTime()
        || Date.now();
}

export async function POST(request: NextRequest) {
    try {
        await requirePermission(request, 'manage_repairs');

        const body = await request.json();
        const { ticketId, ticketVersion } = body;

        if (!ticketId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            const ticketRef = db.collection('repairs').doc(ticketId);
            const ticketSnap = await tx.get(ticketRef);

            if (!ticketSnap.exists) {
                throw new Error('Phiếu sửa chữa không tồn tại.');
            }

            const ticket = { id: ticketSnap.id, ...ticketSnap.data() } as RepairTicket;

            if (ticket.version !== undefined && ticketVersion !== undefined && ticket.version !== ticketVersion) {
                throw new Error('Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại trang.');
            }

            const workflow = await loadRepairWorkflow(tx, db, ticket);
            const currentNode = requireWorkflowNode(workflow, ticket.status);
            if (!currentNode.isTerminal) {
                throw new Error('Chỉ đồng bộ bảo hành cho phiếu đã ở trạng thái kết thúc.');
            }

            const selectedProductIds = Array.from(new Set((ticket.parts || [])
                .map(part => part.productId)
                .filter((productId): productId is string => Boolean(productId))));

            const productDataById = new Map<string, Record<string, unknown> | null>();
            if (selectedProductIds.length > 0) {
                const productRefs = selectedProductIds.map(productId => db.collection('products').doc(productId));
                const productSnaps = await tx.getAll(...productRefs);
                for (const productSnap of productSnaps) {
                    productDataById.set(productSnap.id, productSnap.exists ? (productSnap.data() || {}) : null);
                }
            }

            const configSnap = await tx.get(db.collection('system_config').doc('repairs'));
            const warrantyRules = Array.isArray(configSnap.data()?.warrantyRules)
                ? configSnap.data()?.warrantyRules as Record<string, unknown>[]
                : [];

            const completedAtMs = getDateMillis(ticket.timing?.completedAt || ticket.updatedAt || ticket.createdAt);
            const stamped = stampRepairWarrantyOnParts(ticket.parts || [], productDataById, warrantyRules, completedAtMs);

            if (stamped.changed) {
                tx.update(ticketRef, {
                    parts: stamped.parts,
                    version: (ticket.version || 0) + 1,
                    warrantySyncedAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }

            return {
                success: true,
                changed: stamped.changed,
                stampedCount: stamped.stampedCount,
                ticket: {
                    ...ticket,
                    parts: stamped.parts,
                    version: stamped.changed ? (ticket.version || 0) + 1 : ticket.version,
                },
            };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Sync repair warranty API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: message.includes('không') || message.includes('Chỉ') ? 400 : 500 });
    }
}
