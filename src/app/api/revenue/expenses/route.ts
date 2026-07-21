import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin } from '@/lib/apiAuth';
import { getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';

const EXPENSE_CATEGORIES = new Set(['rent', 'utilities', 'supplies', 'salary', 'other']);
type ExpenseRequestBody = { category?: string; description?: string; amount?: unknown };

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Internal server error';
}

export const POST = withApi({
    name: 'revenue/expenses',
    onError: (error, context) => context.error(getErrorMessage(error), getApiErrorStatus(error)),
}, async (request: NextRequest, context) => {
        const caller = await requireAdmin(request);
        const body = await context.readJson<ExpenseRequestBody>(request);

        const amount = Number(body.amount);
        const category = EXPENSE_CATEGORIES.has(String(body.category)) ? String(body.category) : 'other';
        const description = String(body.description || '').trim();

        if (!Number.isFinite(amount) || amount <= 0) {
            return context.error('Invalid expense amount');
        }

        const db = getAdminDb();
        const createdAt = new Date();

        const result = await db.runTransaction(async (tx) => {
            const userSnap = await tx.get(db.collection('users').doc(caller.uid));
            const userData = userSnap.data();
            const createdByName = typeof userData?.displayName === 'string'
                ? userData.displayName
                : typeof userData?.name === 'string'
                    ? userData.name
                    : 'Admin';

            const expenseAllocation = await reserveSequentialDocumentId(tx, db, {
                collectionName: 'expenses',
                prefix: 'CP',
            });
            const expenseRef = expenseAllocation.ref;
            const expense = {
                category,
                description,
                amount,
                date: FieldValue.serverTimestamp(),
                createdBy: caller.uid,
                createdByName,
                createdAt: FieldValue.serverTimestamp(),
            };

            expenseAllocation.commitCounter();
            tx.set(expenseRef, expense);
            incrementRevenueAggregates(tx, db, { manualExpenses: amount }, createdAt);

            return {
                id: expenseAllocation.id,
                category,
                description,
                amount,
                createdBy: caller.uid,
                createdByName,
                createdAt: createdAt.toISOString(),
                date: createdAt.toISOString(),
            };
        });

        return context.json({ success: true, expense: result });
});
