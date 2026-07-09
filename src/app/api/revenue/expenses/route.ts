import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdmin } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';

const EXPENSE_CATEGORIES = new Set(['rent', 'utilities', 'supplies', 'salary', 'other']);

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Internal server error';
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requireAdmin(request);
        const body = await request.json() as {
            category?: string;
            description?: string;
            amount?: unknown;
        };

        const amount = Number(body.amount);
        const category = EXPENSE_CATEGORIES.has(String(body.category)) ? String(body.category) : 'other';
        const description = String(body.description || '').trim();

        if (!Number.isFinite(amount) || amount <= 0) {
            return NextResponse.json({ error: 'Invalid expense amount' }, { status: 400 });
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

        return NextResponse.json({ success: true, expense: result });
    } catch (error: unknown) {
        console.error('Create expense API error:', error);
        const message = getErrorMessage(error);
        const lower = message.toLowerCase();
        const status = lower.includes('missing authorization')
            ? 401
            : lower.includes('forbidden')
                ? 403
                : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
