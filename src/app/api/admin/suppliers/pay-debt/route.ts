import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { incrementRevenueAggregates } from '@/lib/revenueAggregateServer';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';

function normalizePaymentMethod(value: unknown): 'cash' | 'bank' | 'other' {
    const raw = String(value || '')
        .trim()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toUpperCase();
    if (raw === 'CASH' || raw === 'TIEN_MAT' || raw.includes('TIEN')) return 'cash';
    if (raw === 'BANK' || raw === 'QR' || raw === 'CARD' || raw.includes('CHUYEN')) return 'bank';
    return 'other';
}

function expenseChannelDelta(amount: number, method: 'cash' | 'bank' | 'other') {
    if (method === 'cash') return { cashExpenses: amount };
    if (method === 'bank') return { bankExpenses: amount };
    return {};
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_inventory');
        const body = await request.json().catch(() => ({}));
        const supplierId = typeof body.supplierId === 'string' ? body.supplierId.trim() : '';
        const amount = Number(body.amount);
        const paymentMethod = normalizePaymentMethod(body.paymentMethod);
        const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
        const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';

        if (!supplierId || !Number.isFinite(amount) || amount <= 0) {
            return NextResponse.json({ error: 'Invalid supplier payment payload' }, { status: 400 });
        }
        if (!idempotencyKey) {
            return NextResponse.json({ error: 'Missing idempotencyKey' }, { status: 400 });
        }

        const db = getAdminDb();
        const supplierRef = db.collection('suppliers').doc(supplierId);
        const opRef = db.collection('operation_requests').doc(idempotencyKey);

        const result = await db.runTransaction(async (tx) => {
            const opSnap = await tx.get(opRef);
            if (opSnap.exists) {
                const opData = opSnap.data() || {};
                if (
                    opData.status === 'completed'
                    && opData.type === 'supplier_pay_debt'
                    && opData.supplierId === supplierId
                    && Number(opData.amount) === amount
                    && opData.paymentMethod === paymentMethod
                    && opData.actorId === caller.uid
                ) {
                    return {
                        success: true,
                        supplierTransactionId: String(opData.referenceId || ''),
                        expenseId: String(opData.expenseId || ''),
                        remainingDebt: Number(opData.remainingDebt) || 0,
                        fromCache: true,
                    };
                }
                throw new Error('Idempotency key was already used for a different supplier payment.');
            }

            const [supplierSnap, staffSnap] = await Promise.all([
                tx.get(supplierRef),
                tx.get(db.collection('users').doc(caller.uid)),
            ]);
            if (!supplierSnap.exists) {
                throw new Error('Supplier not found');
            }

            const supplier = supplierSnap.data() || {};
            const currentDebt = Number(supplier.totalDebt) || 0;
            if (currentDebt <= 0) {
                throw new Error('Supplier has no debt');
            }
            if (amount > currentDebt) {
                throw new Error('Supplier payment amount exceeds current debt');
            }

            const supplierTxAllocation = await reserveSequentialDocumentId(tx, db, {
                collectionName: 'supplier_transactions',
                prefix: 'ST',
            });
            const expenseAllocation = await reserveSequentialDocumentId(tx, db, {
                collectionName: 'expenses',
                prefix: 'EXP',
            });

            const staff = staffSnap.data() || {};
            const createdByName = staff.displayName || staff.name || caller.uid;
            const supplierName = String(supplier.name || supplierId);
            const remainingDebt = currentDebt - amount;

            supplierTxAllocation.commitCounter();
            expenseAllocation.commitCounter();

            tx.set(supplierTxAllocation.ref, {
                supplierId,
                supplierName,
                type: 'PAYMENT',
                amount,
                paymentMethod,
                note,
                createdBy: caller.uid,
                createdByName,
                createdAt: FieldValue.serverTimestamp(),
            });
            tx.set(expenseAllocation.ref, {
                category: 'supplier_payment',
                description: `Tra no NCC: ${supplierName}${note ? ` - ${note}` : ''}`,
                amount,
                paymentMethod,
                supplierId,
                supplierTransactionId: supplierTxAllocation.id,
                date: FieldValue.serverTimestamp(),
                createdBy: caller.uid,
                createdByName,
                createdAt: FieldValue.serverTimestamp(),
            });
            tx.update(supplierRef, {
                totalDebt: FieldValue.increment(-amount),
                updatedAt: FieldValue.serverTimestamp(),
            });
            incrementRevenueAggregates(tx, db, {
                supplierPaymentCost: amount,
                ...expenseChannelDelta(amount, paymentMethod),
            });
            tx.set(opRef, {
                status: 'completed',
                type: 'supplier_pay_debt',
                actorId: caller.uid,
                supplierId,
                amount,
                paymentMethod,
                referenceId: supplierTxAllocation.id,
                expenseId: expenseAllocation.id,
                remainingDebt,
                completedAt: FieldValue.serverTimestamp(),
            });

            return {
                success: true,
                supplierTransactionId: supplierTxAllocation.id,
                expenseId: expenseAllocation.id,
                remainingDebt,
                fromCache: false,
            };
        });

        return NextResponse.json(result);
    } catch (error: unknown) {
        console.error('Supplier pay debt API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        const lower = message.toLowerCase();
        const status = lower.includes('missing authorization')
            ? 401
            : lower.includes('forbidden')
                ? 403
                : lower.includes('invalid') || lower.includes('not found') || lower.includes('debt') || lower.includes('exceeds')
                    ? 400
                    : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
