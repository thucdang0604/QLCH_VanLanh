import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { Order } from '@/lib/types';
import {
    getRevenueAggregateIds,
    normalizeRevenueAggregateDelta,
    type RevenueAggregateDelta,
} from '@/lib/revenueAggregate';

function safeNumber(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
}

function getPaymentChannel(value: unknown): 'cash' | 'bank' | 'other' | 'debt' {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'CASH' || raw === 'TIEN_MAT') return 'cash';
    if (raw === 'BANK' || raw === 'QR' || raw === 'CARD' || raw.includes('CHUYEN')) return 'bank';
    if (raw === 'DEBT') return 'debt';
    return 'other';
}

function buildIncrementPayload(delta: RevenueAggregateDelta, period: 'daily' | 'monthly', id: string, monthId: string) {
    const payload: Record<string, unknown> = {
        period,
        month: monthId,
        updatedAt: FieldValue.serverTimestamp(),
    };

    if (period === 'daily') {
        payload.date = id;
    }

    for (const [field, value] of Object.entries(delta)) {
        if (value !== 0) {
            payload[field] = FieldValue.increment(value);
        }
    }

    return payload;
}

export function incrementRevenueAggregates(
    tx: Transaction,
    db: Firestore,
    delta: RevenueAggregateDelta,
    occurredAt: Date = new Date(),
) {
    const normalized = normalizeRevenueAggregateDelta(delta);
    if (Object.keys(normalized).length === 0) return;

    const { dayId, monthId } = getRevenueAggregateIds(occurredAt);
    tx.set(
        db.collection('revenue_daily_aggregates').doc(dayId),
        buildIncrementPayload(normalized, 'daily', dayId, monthId),
        { merge: true },
    );
    tx.set(
        db.collection('revenue_monthly_aggregates').doc(monthId),
        buildIncrementPayload(normalized, 'monthly', monthId, monthId),
        { merge: true },
    );
}

export function buildCompletedOrderRevenueDelta(order: Order, multiplier = 1): RevenueAggregateDelta {
    const items = order.items || [];
    const hasOrderPaymentItems = items.some(item => {
        const line = item as typeof item & { isOrderPayment?: boolean; orderPaymentId?: string };
        return line.isOrderPayment === true || Boolean(line.orderPaymentId);
    });
    const itemTotal = items
        .filter(item => {
            const line = item as typeof item & { isOrderPayment?: boolean; orderPaymentId?: string };
            return line.isOrderPayment !== true && !line.orderPaymentId;
        })
        .reduce((sum, item) => sum + safeNumber(item.price) * safeNumber(item.quantity), 0);
    const orderTotal = hasOrderPaymentItems
        ? itemTotal
        : safeNumber(order.total_amount) || itemTotal || 0;
    const paidSoFar = Array.isArray(order.paymentHistory)
        ? order.paymentHistory.reduce((sum, payment) => {
            if (payment.type === 'debt_payment') return sum;
            return payment.type === 'refund' ? sum - safeNumber(payment.amount) : sum + safeNumber(payment.amount);
        }, 0)
        : 0;
    const isDebt = order.paymentStatus === 'debt' || order.payment_method === 'Debt';
    const hasPaymentHistory = Array.isArray(order.paymentHistory) && order.paymentHistory.length > 0;

    let orderRevenue = 0;
    let debtRevenue = 0;
    let cashRevenue = 0;
    let bankRevenue = 0;
    let otherRevenue = 0;

    if (hasPaymentHistory) {
        orderRevenue = paidSoFar;
        if (isDebt) {
            debtRevenue = Math.max(0, orderTotal - paidSoFar);
        }
        for (const payment of order.paymentHistory || []) {
            if (payment.type === 'refund' || payment.type === 'debt_payment') continue;
            const amount = Math.max(0, safeNumber(payment.amount));
            const channel = getPaymentChannel(payment.method || order.payment_method);
            if (channel === 'cash') cashRevenue += amount;
            else if (channel === 'bank') bankRevenue += amount;
            else if (channel !== 'debt') otherRevenue += amount;
        }
    } else if (isDebt) {
        debtRevenue = orderTotal;
    } else {
        orderRevenue = orderTotal;
        const channel = getPaymentChannel(order.payment_method);
        if (channel === 'cash') cashRevenue = orderTotal;
        else if (channel === 'bank') bankRevenue = orderTotal;
        else otherRevenue = orderTotal;
    }

    const isPos = order.source === 'pos';

    return {
        orderRevenue: orderRevenue * multiplier,
        cashRevenue: cashRevenue * multiplier,
        bankRevenue: bankRevenue * multiplier,
        otherRevenue: otherRevenue * multiplier,
        debtRevenue: debtRevenue * multiplier,
        webOrderCount: isPos ? 0 : multiplier,
        posOrderCount: isPos ? multiplier : 0,
        webOrderRevenue: isPos ? 0 : orderTotal * multiplier,
        posOrderRevenue: isPos ? orderTotal * multiplier : 0,
    };
}
