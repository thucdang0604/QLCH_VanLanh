import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { readCashierShiftTallyTotals, type CashierShiftTallyTotals } from '@/lib/cashierShiftTallyServer';

type CashierShiftData = FirebaseFirestore.DocumentData & {
    status?: string;
    openingCashAmount?: number;
    openingBankAmount?: number;
    cashSalesAmount?: number;
    bankSalesAmount?: number;
    otherSalesAmount?: number;
    openedByName?: string;
    closingCashAmount?: number;
    closingBankAmount?: number;
    tallyVersion?: number;
};

const ACTIVE_SHIFT_LOCK_COLLECTION = 'system_counters';
const ACTIVE_SHIFT_LOCK_ID = 'active_cashier_shift';
const CASHIER_SHIFT_ALREADY_OPEN_MESSAGE = 'Dang co ca thu ngan mo. Vui long chot ca hien tai truoc khi mo ca moi.';

function asAmount(value: unknown) {
    const amount = Math.round(Number(value) || 0);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function timestampToIso(value: unknown) {
    if (!value) return null;
    const timestamp = value as { toDate?: () => Date };
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function usesShardedTally(data: CashierShiftData) {
    return Number(data.tallyVersion) >= 1;
}

function serializeShift(id: string, data: CashierShiftData, liveTotals?: CashierShiftTallyTotals) {
    const openingCashAmount = asAmount(data.openingCashAmount);
    const openingBankAmount = asAmount(data.openingBankAmount);
    const cashSalesAmount = liveTotals ? asAmount(liveTotals.cashSalesAmount) : asAmount(data.cashSalesAmount);
    const bankSalesAmount = liveTotals ? asAmount(liveTotals.bankSalesAmount) : asAmount(data.bankSalesAmount);
    const otherSalesAmount = liveTotals ? asAmount(liveTotals.otherSalesAmount) : asAmount(data.otherSalesAmount);
    const expectedCashAmount = openingCashAmount + cashSalesAmount;
    const expectedBankAmount = openingBankAmount + bankSalesAmount;

    return {
        id,
        status: String(data.status || 'open'),
        openingCashAmount,
        openingBankAmount,
        cashSalesAmount,
        bankSalesAmount,
        otherSalesAmount,
        expectedCashAmount,
        expectedBankAmount,
        closingCashAmount: asAmount(data.closingCashAmount ?? expectedCashAmount),
        closingBankAmount: asAmount(data.closingBankAmount ?? expectedBankAmount),
        openedBy: String(data.openedBy || ''),
        openedByName: String(data.openedByName || ''),
        openedAt: timestampToIso(data.openedAt),
        closedBy: String(data.closedBy || ''),
        closedByName: String(data.closedByName || ''),
        closedAt: timestampToIso(data.closedAt),
        updatedAt: timestampToIso(data.updatedAt),
    };
}

async function getActiveShiftSnap(db: FirebaseFirestore.Firestore) {
    const snap = await db.collection('cashier_shifts')
        .where('status', '==', 'open')
        .limit(1)
        .get();
    return snap.docs[0] || null;
}

export async function GET(request: NextRequest) {
    try {
        await requirePermission(request, 'manage_orders');
        const db = getAdminDb();
        const includeHistory = request.nextUrl.searchParams.get('includeHistory') === 'true';
        const historyPromise = includeHistory
            ? db.collection('cashier_shifts')
                .orderBy('closedAt', 'desc')
                .limit(10)
                .get()
            : null;
        const [activeShift, historySnap] = await Promise.all([
            getActiveShiftSnap(db),
            historyPromise,
        ]);
        const activeShiftData = activeShift?.data() as CashierShiftData | undefined;
        const liveTotals = activeShift && activeShiftData && usesShardedTally(activeShiftData)
            ? await readCashierShiftTallyTotals(db, db, activeShift.id)
            : undefined;
        return NextResponse.json({
            success: true,
            shift: activeShift ? serializeShift(activeShift.id, activeShift.data(), liveTotals) : null,
            history: historySnap?.docs.map(doc => serializeShift(doc.id, doc.data())) || [],
        });
    } catch (error: unknown) {
        console.error('Get cashier shift API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: message.includes('Forbidden') ? 403 : 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_orders');
        const body = await request.json() as {
            openingCashAmount?: unknown;
            openingBankAmount?: unknown;
        };
        const openingCashAmount = asAmount(body.openingCashAmount);
        const openingBankAmount = asAmount(body.openingBankAmount);
        const db = getAdminDb();

        const result = await db.runTransaction(async (tx) => {
            const lockRef = db.collection(ACTIVE_SHIFT_LOCK_COLLECTION).doc(ACTIVE_SHIFT_LOCK_ID);
            const [activeSnap, userSnap] = await Promise.all([
                tx.get(lockRef),
                tx.get(db.collection('users').doc(caller.uid)),
            ]);
            const activeShiftId = typeof activeSnap.data()?.activeShiftId === 'string'
                ? String(activeSnap.data()?.activeShiftId)
                : '';
            if (activeShiftId) {
                const activeShiftSnap = await tx.get(db.collection('cashier_shifts').doc(activeShiftId));
                if (activeShiftSnap.exists && activeShiftSnap.data()?.status === 'open') {
                    throw new Error(CASHIER_SHIFT_ALREADY_OPEN_MESSAGE);
                }
            }

            const userData = userSnap.data();
            const openedByName = typeof userData?.displayName === 'string'
                ? userData.displayName
                : typeof userData?.name === 'string'
                    ? userData.name
                    : caller.uid;

            const shiftRef = db.collection('cashier_shifts').doc();
            tx.set(shiftRef, {
                status: 'open',
                openingCashAmount,
                openingBankAmount,
                cashSalesAmount: 0,
                bankSalesAmount: 0,
                otherSalesAmount: 0,
                tallyVersion: 1,
                openedBy: caller.uid,
                openedByName,
                openedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            tx.set(lockRef, {
                activeShiftId: shiftRef.id,
                openedBy: caller.uid,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            return {
                id: shiftRef.id,
                status: 'open',
                openingCashAmount,
                openingBankAmount,
                cashSalesAmount: 0,
                bankSalesAmount: 0,
                otherSalesAmount: 0,
                tallyVersion: 1,
                expectedCashAmount: openingCashAmount,
                expectedBankAmount: openingBankAmount,
                openedBy: caller.uid,
                openedByName,
                openedAt: new Date().toISOString(),
            };
        });

        return NextResponse.json({ success: true, shift: result });
    } catch (error: unknown) {
        console.error('Open cashier shift API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        const status = message.includes('Forbidden') ? 403 : message === CASHIER_SHIFT_ALREADY_OPEN_MESSAGE ? 409 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const caller = await requirePermission(request, 'manage_orders');
        const body = await request.json() as { action?: string };
        if (body.action !== 'close') {
            return NextResponse.json({ error: 'Invalid cashier shift action' }, { status: 400 });
        }

        const db = getAdminDb();
        const result = await db.runTransaction(async (tx) => {
            const lockRef = db.collection(ACTIVE_SHIFT_LOCK_COLLECTION).doc(ACTIVE_SHIFT_LOCK_ID);
            const [lockSnap, userSnap] = await Promise.all([
                tx.get(lockRef),
                tx.get(db.collection('users').doc(caller.uid)),
            ]);
            const activeShiftId = typeof lockSnap.data()?.activeShiftId === 'string'
                ? String(lockSnap.data()?.activeShiftId)
                : '';
            let activeDoc: FirebaseFirestore.DocumentSnapshot | null = null;
            if (activeShiftId) {
                const lockedShiftSnap = await tx.get(db.collection('cashier_shifts').doc(activeShiftId));
                if (lockedShiftSnap.exists && lockedShiftSnap.data()?.status === 'open') {
                    activeDoc = lockedShiftSnap;
                }
            }
            if (!activeDoc) {
                const activeQuery = db.collection('cashier_shifts')
                    .where('status', '==', 'open')
                    .limit(1);
                const activeSnap = await tx.get(activeQuery);
                activeDoc = activeSnap.docs[0] || null;
            }
            if (!activeDoc) {
                throw new Error('Khong co ca thu ngan dang mo.');
            }

            const shiftData = activeDoc.data() as CashierShiftData;
            const liveTotals = usesShardedTally(shiftData)
                ? await readCashierShiftTallyTotals(tx, db, activeDoc.id)
                : undefined;
            const userData = userSnap.data();
            const closedByName = typeof userData?.displayName === 'string'
                ? userData.displayName
                : typeof userData?.name === 'string'
                    ? userData.name
                    : caller.uid;
            const cashSalesAmount = liveTotals ? liveTotals.cashSalesAmount : asAmount(shiftData.cashSalesAmount);
            const bankSalesAmount = liveTotals ? liveTotals.bankSalesAmount : asAmount(shiftData.bankSalesAmount);
            const otherSalesAmount = liveTotals ? liveTotals.otherSalesAmount : asAmount(shiftData.otherSalesAmount);
            const expectedCashAmount = asAmount(shiftData.openingCashAmount) + cashSalesAmount;
            const expectedBankAmount = asAmount(shiftData.openingBankAmount) + bankSalesAmount;

            tx.update(activeDoc.ref, {
                status: 'closed',
                cashSalesAmount,
                bankSalesAmount,
                otherSalesAmount,
                expectedCashAmount,
                expectedBankAmount,
                closingCashAmount: expectedCashAmount,
                closingBankAmount: expectedBankAmount,
                closedBy: caller.uid,
                closedByName,
                closedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            tx.set(lockRef, {
                activeShiftId: null,
                closedShiftId: activeDoc.id,
                closedBy: caller.uid,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            return {
                ...serializeShift(activeDoc.id, {
                    ...shiftData,
                    status: 'closed',
                    cashSalesAmount,
                    bankSalesAmount,
                    otherSalesAmount,
                    closedBy: caller.uid,
                    closedByName,
                }),
                expectedCashAmount,
                expectedBankAmount,
                closingCashAmount: expectedCashAmount,
                closingBankAmount: expectedBankAmount,
                closedAt: new Date().toISOString(),
            };
        });

        return NextResponse.json({ success: true, shift: result });
    } catch (error: unknown) {
        console.error('Close cashier shift API error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({ error: message }, { status: message.includes('Forbidden') ? 403 : 500 });
    }
}
