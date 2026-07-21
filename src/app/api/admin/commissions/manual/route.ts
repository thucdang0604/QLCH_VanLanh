import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';

type ManualCommissionRequestBody = {
    staffId?: string;
    sourceType?: string;
    sourceId?: string;
    amount?: number;
    baseAmount?: number;
    idempotencyKey?: string;
};

function normalizeSourceType(value: unknown): 'repair' | 'order' {
    return value === 'order' ? 'order' : 'repair';
}

export const POST = withApi({
    name: 'admin/commissions/manual',
    onError: (error, context) => {
        const message = getApiErrorMessage(error);
        const lower = message.toLowerCase();
        const legacyStatus = lower.includes('invalid') || lower.includes('not found') || lower.includes('recipient') || lower.includes('idempotency')
            ? 400
            : 500;
        return context.error(message, getApiErrorStatus(error, legacyStatus));
    },
}, async (request: NextRequest, context) => {
        const caller = await requireAdmin(request);
        const body = await context.readJson<ManualCommissionRequestBody>(request);
        const staffId = typeof body.staffId === 'string' ? body.staffId.trim() : '';
        const sourceType = normalizeSourceType(body.sourceType);
        const sourceId = typeof body.sourceId === 'string' && body.sourceId.trim()
            ? body.sourceId.trim().slice(0, 120)
            : 'manual-entry';
        const amount = Number(body.amount);
        const baseAmount = Math.max(0, Number(body.baseAmount) || 0);
        const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';

        if (!staffId || !Number.isFinite(amount) || amount <= 0) {
            return context.error('Invalid manual commission payload');
        }
        if (!idempotencyKey) {
            return context.error('Missing idempotencyKey');
        }

        const db = getAdminDb();
        const opRef = db.collection('operation_requests').doc(idempotencyKey);

        const result = await db.runTransaction(async (tx) => {
            const opSnap = await tx.get(opRef);
            if (opSnap.exists) {
                const opData = opSnap.data() || {};
                if (
                    opData.status === 'completed'
                    && opData.type === 'manual_commission'
                    && opData.staffId === staffId
                    && Number(opData.amount) === amount
                    && Number(opData.baseAmount) === baseAmount
                    && opData.sourceType === sourceType
                    && opData.sourceId === sourceId
                    && opData.actorId === caller.uid
                ) {
                    return {
                        success: true,
                        commission: opData.commission,
                        fromCache: true,
                    };
                }
                throw new Error('Idempotency key was already used for a different manual commission.');
            }

            const staffSnap = await tx.get(db.collection('users').doc(staffId));
            if (!staffSnap.exists) {
                throw new Error('Staff not found');
            }
            const staff = staffSnap.data() || {};
            const staffRole = String(staff.role || '');
            if (staffRole !== 'staff' && staffRole !== 'admin') {
                throw new Error('Commission recipient must be staff or admin');
            }

            const commissionAllocation = await reserveSequentialDocumentId(tx, db, {
                collectionName: 'commissions',
                prefix: 'COM',
            });
            const now = new Date();
            const staffName = String(staff.displayName || staff.name || staff.email || staffId);
            const commission = {
                id: commissionAllocation.id,
                staffId,
                staffName,
                ruleId: 'manual',
                sourceType,
                sourceId,
                amount,
                baseAmount,
                createdBy: caller.uid,
                createdAt: now.toISOString(),
            };

            commissionAllocation.commitCounter();
            tx.set(commissionAllocation.ref, {
                staffId,
                staffName,
                ruleId: 'manual',
                sourceType,
                sourceId,
                amount,
                baseAmount,
                createdBy: caller.uid,
                createdAt: FieldValue.serverTimestamp(),
            });
            incrementRevenueAggregates(tx, db, { commissionCost: amount }, now);
            tx.set(opRef, {
                status: 'completed',
                type: 'manual_commission',
                actorId: caller.uid,
                staffId,
                sourceType,
                sourceId,
                amount,
                baseAmount,
                commissionId: commissionAllocation.id,
                commission,
                completedAt: FieldValue.serverTimestamp(),
            });

            return {
                success: true,
                commission,
                fromCache: false,
            };
        });

        return context.json(result);
});
