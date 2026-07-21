import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import type { RepairTicket } from '@/lib/types';
import { getConfiguredWorkflow, type RepairWorkflowSettings } from '@/lib/repairWorkflowConfig';

const LEGACY_TERMINAL_REPAIR_STATUSES = new Set(['done', 'out', 'refund', 'da_giao_khach', 'huy_phieu', 'bh_hoan_tat', 'bh_tu_choi', 'bh_refund']);

type RepairPartData = {
    productId?: string;
    quantity?: number;
    reservedQuantity?: number;
    status?: string;
};

type RepairHeldData = Pick<RepairTicket, 'ticketType'> & {
    status?: string;
    parts?: RepairPartData[];
};

type FixHeldPayload = {
    apply?: boolean;
    confirm?: string;
};

function reservedQuantity(part: RepairPartData): number {
    const quantity = Math.max(0, Number(part.quantity) || 0);
    const explicitReserved = Number(part.reservedQuantity);
    if (Number.isFinite(explicitReserved)) {
        return Math.max(0, Math.min(quantity, explicitReserved));
    }
    return part.status === 'selected' ? quantity : 0;
}

function isTerminalRepair(repair: RepairHeldData, settings: RepairWorkflowSettings): boolean {
    if (LEGACY_TERMINAL_REPAIR_STATUSES.has(repair.status || '')) return true;
    const workflow = getConfiguredWorkflow(settings, repair.ticketType);
    return workflow.some(node => node.id === repair.status && node.isTerminal === true);
}

export const POST = withApi({
    name: 'admin/fix-held',
    onError: (error, context) => context.json({ success: false, error: getApiErrorMessage(error) }, { status: getApiErrorStatus(error) }),
}, async (request: NextRequest, context) => {
        const caller = await requirePermission(request, 'manage_inventory');
        const payload = await context.readJson<FixHeldPayload>(request);
        const shouldApply = payload.apply === true && payload.confirm === 'FIX_HELD_APPLY';
        const db = getAdminDb();
        const [productsSnap, repairsSnap, configSnap] = await Promise.all([
            db.collection('products').get(),
            db.collection('repairs').get(),
            db.collection('system_config').doc('repairs').get(),
        ]);
        const workflowSettings = (configSnap.data() || {}) as RepairWorkflowSettings;

        const heldMap = new Map<string, number>();
        for (const repairDoc of repairsSnap.docs) {
            const repair = repairDoc.data() as RepairHeldData;
            if (isTerminalRepair(repair, workflowSettings)) continue;

            for (const part of repair.parts || []) {
                if (!part.productId) continue;
                const reserved = reservedQuantity(part);
                if (reserved <= 0) continue;
                heldMap.set(part.productId, (heldMap.get(part.productId) || 0) + reserved);
            }
        }

        const changes: Array<{
            productId: string;
            currentHeld: number;
            nextHeld: number;
        }> = [];

        for (const productDoc of productsSnap.docs) {
            const currentHeld = Math.max(0, Number(productDoc.data().held) || 0);
            const nextHeld = heldMap.get(productDoc.id) || 0;
            if (currentHeld !== nextHeld) {
                changes.push({
                    productId: productDoc.id,
                    currentHeld,
                    nextHeld,
                });
            }
        }

        if (shouldApply && changes.length > 0) {
            const writer = db.bulkWriter();
            for (const change of changes) {
                writer.update(db.collection('products').doc(change.productId), { held: change.nextHeld });
            }
            await writer.close();

            await db.collection('maintenance_audit_logs').add({
                action: 'fix-held',
                executedBy: caller.uid,
                executedAt: new Date(),
                changedProducts: changes.length,
                scannedProducts: productsSnap.size,
                scannedRepairs: repairsSnap.size,
            });
        }

        return context.json({
            success: true,
            dryRun: !shouldApply,
            scannedProducts: productsSnap.size,
            scannedRepairs: repairsSnap.size,
            changedProducts: changes.length,
            updatedProducts: shouldApply ? changes.length : 0,
            changes,
            heldByProduct: Object.fromEntries(heldMap),
            executedBy: caller.uid,
        });
});
