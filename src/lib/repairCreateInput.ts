import { Timestamp } from 'firebase-admin/firestore';
import type { PaymentHistoryEntry } from '@/lib/types';

const SERVER_MANAGED_REPAIR_FIELDS = [
    'createdAt',
    'updatedAt',
    'status',
    'statusTimeline',
    'version',
    'pendingTechnicianTransfer',
    'paymentHistory',
] as const;

export function parseRepairClientTimestamp(value: unknown): Timestamp | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as { seconds?: unknown; nanoseconds?: unknown };
    if (typeof raw.seconds !== 'number') return null;
    return new Timestamp(raw.seconds, typeof raw.nanoseconds === 'number' ? raw.nanoseconds : 0);
}

export function normalizeRepairPaymentHistory(value: unknown): PaymentHistoryEntry[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
        throw new Error('Lich su thanh toan khong hop le.');
    }

    return value.map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error(`Dong thanh toan #${index + 1} khong hop le.`);
        }
        const data = entry as Record<string, unknown>;
        const amount = typeof data.amount === 'number' ? data.amount : Number(data.amount);
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`So tien thanh toan #${index + 1} khong hop le.`);
        }
        const type = typeof data.type === 'string' && data.type.trim()
            ? data.type
            : 'payment';
        if (!['deposit', 'payment', 'full', 'additional', 'refund', 'debt_payment'].includes(type)) {
            throw new Error(`Loai thanh toan #${index + 1} khong hop le.`);
        }
        return { ...data, type, amount } as PaymentHistoryEntry;
    });
}

export function buildSafeRepairCreateBody(body: Record<string, unknown>, paymentHistory: PaymentHistoryEntry[] | undefined) {
    const safeBody = { ...body };
    for (const field of SERVER_MANAGED_REPAIR_FIELDS) {
        delete safeBody[field];
    }
    if (paymentHistory) {
        safeBody.paymentHistory = paymentHistory;
    }
    return safeBody;
}
