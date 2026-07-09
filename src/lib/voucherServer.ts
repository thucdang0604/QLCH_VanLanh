import type { Firestore } from 'firebase-admin/firestore';

export function normalizeVoucherCode(value: unknown): string {
    return String(value || '').trim().toUpperCase();
}

export function voucherDocumentId(code: string): string {
    return `code_${code.replace(/[^A-Z0-9_-]/g, '_')}`;
}

export async function getUniqueActiveVoucherByCode(db: Firestore, rawCode: unknown) {
    const code = normalizeVoucherCode(rawCode);
    if (!code) return null;

    const snap = await db.collection('vouchers')
        .where('code', '==', code)
        .where('isActive', '==', true)
        .limit(2)
        .get();

    if (snap.empty) return null;
    if (snap.size > 1) {
        throw new Error(`Voucher code ${code} is duplicated. Disable duplicates before using this code.`);
    }

    return snap.docs[0];
}
