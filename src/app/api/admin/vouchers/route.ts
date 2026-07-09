import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { normalizeVoucherCode, voucherDocumentId } from '@/lib/voucherServer';

function jsonError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('Forbidden') ? 403 : message.includes('Missing Authorization') ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
}

function parseDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'string') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'object' && value !== null && 'seconds' in value) {
        const seconds = Number((value as { seconds?: unknown }).seconds) || 0;
        const date = new Date(seconds * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
}

function normalizeVoucherPayload(input: Record<string, unknown>) {
    const code = normalizeVoucherCode(input.code);
    if (!code) throw new Error('Voucher code is required.');
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) {
        throw new Error('Voucher code must contain only A-Z, 0-9, underscore, or dash.');
    }

    const type = input.type === 'percentage' ? 'percentage' : 'fixed';
    const value = Number(input.value) || 0;
    if (value <= 0) throw new Error('Voucher value must be greater than 0.');
    if (type === 'percentage' && value > 100) throw new Error('Percentage voucher cannot exceed 100%.');

    const stackingRules = input.stackingRules && typeof input.stackingRules === 'object'
        ? input.stackingRules as Record<string, unknown>
        : {};

    return {
        code,
        type,
        value,
        maxDiscount: input.maxDiscount === undefined ? null : Number(input.maxDiscount) || null,
        minOrderValue: input.minOrderValue === undefined ? null : Number(input.minOrderValue) || null,
        expiryDate: parseDate(input.expiryDate),
        usageLimit: Math.max(0, Number(input.usageLimit) || 0),
        usedCount: Math.max(0, Number(input.usedCount) || 0),
        isActive: input.isActive !== false,
        ownerId: typeof input.ownerId === 'string' && input.ownerId.trim() ? input.ownerId.trim() : null,
        stackingRules: {
            isExclusive: stackingRules.isExclusive === true,
            stackWithPromo: stackingRules.isExclusive === true ? false : stackingRules.stackWithPromo !== false,
            stackWithTier: stackingRules.isExclusive === true ? false : stackingRules.stackWithTier === true,
        },
    };
}

export async function POST(request: NextRequest) {
    try {
        await requirePermission(request, 'manage_discounts');
        const body = await request.json() as Record<string, unknown>;
        const payload = normalizeVoucherPayload(body);
        const db = getAdminDb();
        const docId = voucherDocumentId(payload.code);

        await db.runTransaction(async (tx) => {
            const voucherRef = db.collection('vouchers').doc(docId);
            const voucherSnap = await tx.get(voucherRef);
            if (voucherSnap.exists) {
                throw new Error(`Voucher code ${payload.code} already exists.`);
            }

            const duplicateSnap = await tx.get(
                db.collection('vouchers')
                    .where('code', '==', payload.code)
                    .limit(1)
            );
            if (!duplicateSnap.empty) {
                throw new Error(`Voucher code ${payload.code} already exists in legacy data.`);
            }

            tx.set(voucherRef, {
                ...payload,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
        });

        return NextResponse.json({ success: true, id: docId, code: payload.code });
    } catch (error) {
        return jsonError(error);
    }
}

export async function PATCH(request: NextRequest) {
    try {
        await requirePermission(request, 'manage_discounts');
        const body = await request.json() as Record<string, unknown>;
        const id = typeof body.id === 'string' ? body.id : '';
        if (!id) throw new Error('Voucher id is required.');

        const payload = normalizeVoucherPayload(body);
        const db = getAdminDb();
        const targetId = voucherDocumentId(payload.code);

        await db.runTransaction(async (tx) => {
            const currentRef = db.collection('vouchers').doc(id);
            const currentSnap = await tx.get(currentRef);
            if (!currentSnap.exists) throw new Error('Voucher not found.');

            const duplicateSnap = await tx.get(
                db.collection('vouchers')
                    .where('code', '==', payload.code)
                    .limit(2)
            );
            const duplicate = duplicateSnap.docs.find(doc => doc.id !== id);
            if (duplicate) {
                throw new Error(`Voucher code ${payload.code} already exists.`);
            }

            const targetRef = db.collection('vouchers').doc(targetId);
            if (targetId !== id) {
                const targetSnap = await tx.get(targetRef);
                if (targetSnap.exists) throw new Error(`Voucher code ${payload.code} already exists.`);
                tx.delete(currentRef);
                tx.set(targetRef, {
                    ...currentSnap.data(),
                    ...payload,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            } else {
                tx.update(currentRef, {
                    ...payload,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }
        });

        return NextResponse.json({ success: true, id: targetId, code: payload.code });
    } catch (error) {
        return jsonError(error);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        await requirePermission(request, 'manage_discounts');
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) throw new Error('Voucher id is required.');
        await getAdminDb().collection('vouchers').doc(id).delete();
        return NextResponse.json({ success: true });
    } catch (error) {
        return jsonError(error);
    }
}
