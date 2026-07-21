import { NextRequest } from 'next/server';
import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore';
import { requireAdmin } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getWorkflowFromSettings } from '@/lib/repairWorkflowServer';
import { getExpectedReservationQuantity } from '@/lib/repairPartReservations';
import type { RepairTicket } from '@/lib/types';
import type { RepairWorkflowSettings } from '@/lib/repairWorkflowConfig';

const WRITE_BATCH_SIZE = 400;

export const POST = withApi({
    name: 'inventory/reconcile-held',
    onError: (error, context) => {
        const message = getApiErrorMessage(error);
        const fallbackStatus = message.startsWith('Forbidden') ? 403 : 400;
        return context.error(message, getApiErrorStatus(error, fallbackStatus));
    },
}, async (request: NextRequest, context) => {
        const caller = await requireAdmin(request);
        const db = getAdminDb();

        const [settingsSnap, repairSnaps, heldProductsSnap] = await Promise.all([
            db.collection('system_config').doc('repairs').get(),
            db.collection('repairs').get(),
            db.collection('products').where('held', '>', 0).get(),
        ]);
        if (!settingsSnap.exists) {
            throw new Error('Không tìm thấy cấu hình workflow sửa chữa trong Firebase.');
        }

        const settings = settingsSnap.data() as RepairWorkflowSettings;
        const repairWorkflow = getWorkflowFromSettings(settings, { ticketType: 'repair' });
        const warrantyWorkflow = getWorkflowFromSettings(settings, { ticketType: 'warranty' });
        const expectedHeld = new Map<string, number>();
        let activeTickets = 0;

        repairSnaps.forEach((snap) => {
            const ticket = snap.data() as RepairTicket;
            const workflow = ticket.ticketType === 'warranty' ? warrantyWorkflow : repairWorkflow;
            const currentNode = workflow.find((node) => node.id === ticket.status);

            // Unknown statuses are kept active for safety; their holds must not be released accidentally.
            if (currentNode?.isTerminal) return;
            activeTickets += 1;

            (ticket.parts || []).forEach((part) => {
                if (!part.productId) return;
                const quantity = getExpectedReservationQuantity(part);
                if (quantity <= 0) return;
                expectedHeld.set(part.productId, (expectedHeld.get(part.productId) || 0) + quantity);
            });
        });

        const productSnapshots = new Map<string, DocumentSnapshot>(
            heldProductsSnap.docs.map((snap) => [snap.id, snap]),
        );
        const missingProductIds = [...expectedHeld.keys()].filter((productId) => !productSnapshots.has(productId));
        for (let index = 0; index < missingProductIds.length; index += WRITE_BATCH_SIZE) {
            const refs = missingProductIds
                .slice(index, index + WRITE_BATCH_SIZE)
                .map((productId) => db.collection('products').doc(productId));
            const snapshots = await db.getAll(...refs);
            snapshots.forEach((snap) => productSnapshots.set(snap.id, snap));
        }

        const updates = [...productSnapshots.values()]
            .filter((snap) => snap.exists)
            .map((snap) => {
                const currentHeld = Math.max(0, Number(snap.data()?.held) || 0);
                const nextHeld = expectedHeld.get(snap.id) || 0;
                return { ref: snap.ref, currentHeld, nextHeld };
            })
            .filter((item) => item.currentHeld !== item.nextHeld);

        for (let index = 0; index < updates.length; index += WRITE_BATCH_SIZE) {
            const batch = db.batch();
            updates.slice(index, index + WRITE_BATCH_SIZE).forEach((item) => {
                batch.update(item.ref, {
                    held: item.nextHeld,
                    heldReconciledAt: FieldValue.serverTimestamp(),
                    heldReconciledBy: caller.uid,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            });
            await batch.commit();
        }

        const totalHeld = [...expectedHeld.values()].reduce((total, quantity) => total + quantity, 0);
        return context.json({
            success: true,
            activeTickets,
            productsUpdated: updates.length,
            totalHeld,
        });
    });
