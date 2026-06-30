import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { getAdminDb } from '@/lib/firebaseAdmin';

type CashierShiftData = FirebaseFirestore.DocumentData & {
    status?: string;
    openingCashAmount?: number;
    openingBankAmount?: number;
    cashSalesAmount?: number;
    bankSalesAmount?: number;
    otherSalesAmount?: number;
    openedByName?: string;
};

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

function serializeShift(id: string, data: CashierShiftData) {
    const openingCashAmount = asAmount(data.openingCashAmount);
    const openingBankAmount = asAmount(data.openingBankAmount);
    const cashSalesAmount = asAmount(data.cashSalesAmount);
    const bankSalesAmount = asAmount(data.bankSalesAmount);
    const otherSalesAmount = asAmount(data.otherSalesAmount);

    return {
        id,
        status: String(data.status || 'open'),
        openingCashAmount,
        openingBankAmount,
        cashSalesAmount,
        bankSalesAmount,
        otherSalesAmount,
        expectedCashAmount: openingCashAmount + cashSalesAmount,
        expectedBankAmount: openingBankAmount + bankSalesAmount,
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
        const activeShift = await getActiveShiftSnap(db);
        return NextResponse.json({
            success: true,
            shift: activeShift ? serializeShift(activeShift.id, activeShift.data()) : null,
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
            const activeQuery = db.collection('cashier_shifts')
                .where('status', '==', 'open')
                .limit(1);
            const [activeSnap, userSnap] = await Promise.all([
                tx.get(activeQuery),
                tx.get(db.collection('users').doc(caller.uid)),
            ]);
            if (!activeSnap.empty) {
                throw new Error('Đang có ca thu ngân mở. Vui lòng chốt ca hiện tại trước khi mở ca mới.');
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
                openedBy: caller.uid,
                openedByName,
                openedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });

            return {
                id: shiftRef.id,
                status: 'open',
                openingCashAmount,
                openingBankAmount,
                cashSalesAmount: 0,
                bankSalesAmount: 0,
                otherSalesAmount: 0,
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
        const status = message.includes('Forbidden') ? 403 : message.includes('Đang có ca') ? 409 : 500;
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
            const activeQuery = db.collection('cashier_shifts')
                .where('status', '==', 'open')
                .limit(1);
            const [activeSnap, userSnap] = await Promise.all([
                tx.get(activeQuery),
                tx.get(db.collection('users').doc(caller.uid)),
            ]);
            const activeDoc = activeSnap.docs[0];
            if (!activeDoc) {
                throw new Error('Không có ca thu ngân đang mở.');
            }

            const shiftData = activeDoc.data() as CashierShiftData;
            const userData = userSnap.data();
            const closedByName = typeof userData?.displayName === 'string'
                ? userData.displayName
                : typeof userData?.name === 'string'
                    ? userData.name
                    : caller.uid;
            const expectedCashAmount = asAmount(shiftData.openingCashAmount) + asAmount(shiftData.cashSalesAmount);
            const expectedBankAmount = asAmount(shiftData.openingBankAmount) + asAmount(shiftData.bankSalesAmount);

            tx.update(activeDoc.ref, {
                status: 'closed',
                expectedCashAmount,
                expectedBankAmount,
                closingCashAmount: expectedCashAmount,
                closingBankAmount: expectedBankAmount,
                closedBy: caller.uid,
                closedByName,
                closedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });

            return {
                ...serializeShift(activeDoc.id, {
                    ...shiftData,
                    status: 'closed',
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
