export const REVENUE_AGGREGATE_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const REVENUE_AGGREGATE_ROLLOUT_DATE = '2026-06-17';

export const REVENUE_AGGREGATE_NUMERIC_FIELDS = [
    'orderRevenue',
    'repairRevenue',
    'cashRevenue',
    'bankRevenue',
    'otherRevenue',
    'debtRevenue',
    'totalRevenue',
    'totalGiftDiscount',
    'importCost',
    'importDebt',
    'commissionCost',
    'manualExpenses',
    'cashExpenses',
    'bankExpenses',
    'debtExpenses',
    'totalExpenses',
    'netProfit',
    'webOrderCount',
    'posOrderCount',
    'repairCount',
    'warrantyCount',
    'webOrderRevenue',
    'posOrderRevenue',
] as const;

export type RevenueAggregateField = typeof REVENUE_AGGREGATE_NUMERIC_FIELDS[number];
export type RevenueAggregateDelta = Partial<Record<RevenueAggregateField, number>>;
export type RevenueAggregateValues = Record<RevenueAggregateField, number>;

export interface RevenueAggregateDoc extends Partial<RevenueAggregateValues> {
    id?: string;
    date?: string;
    month?: string;
    period?: 'daily' | 'monthly';
}

function toFiniteNumber(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
}

export function toRevenueDateId(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: REVENUE_AGGREGATE_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

export function toRevenueMonthId(date: Date): string {
    return toRevenueDateId(date).slice(0, 7);
}

export function getRevenueAggregateIds(date: Date = new Date()) {
    const dayId = toRevenueDateId(date);
    return {
        dayId,
        monthId: dayId.slice(0, 7),
    };
}

export function createEmptyRevenueAggregate(): RevenueAggregateValues {
    return REVENUE_AGGREGATE_NUMERIC_FIELDS.reduce((acc, field) => {
        acc[field] = 0;
        return acc;
    }, {} as RevenueAggregateValues);
}

export function normalizeRevenueAggregateDelta(delta: RevenueAggregateDelta): RevenueAggregateDelta {
    const normalized: RevenueAggregateDelta = {};

    for (const field of REVENUE_AGGREGATE_NUMERIC_FIELDS) {
        const value = toFiniteNumber(delta[field]);
        if (value !== 0) {
            normalized[field] = value;
        }
    }

    const revenueDelta = toFiniteNumber(normalized.orderRevenue) + toFiniteNumber(normalized.repairRevenue);
    const expenseDelta = toFiniteNumber(normalized.importCost) + toFiniteNumber(normalized.commissionCost) + toFiniteNumber(normalized.manualExpenses);
    const giftDelta = toFiniteNumber(normalized.totalGiftDiscount);

    if (revenueDelta !== 0) {
        normalized.totalRevenue = toFiniteNumber(normalized.totalRevenue) + revenueDelta;
    }
    if (expenseDelta !== 0) {
        normalized.totalExpenses = toFiniteNumber(normalized.totalExpenses) + expenseDelta;
    }

    const netProfitDelta = revenueDelta - expenseDelta - giftDelta;
    if (netProfitDelta !== 0) {
        normalized.netProfit = toFiniteNumber(normalized.netProfit) + netProfitDelta;
    }

    return normalized;
}

export function mergeRevenueAggregateDocs(docs: RevenueAggregateDoc[]): RevenueAggregateValues {
    const totals = createEmptyRevenueAggregate();

    for (const doc of docs) {
        for (const field of REVENUE_AGGREGATE_NUMERIC_FIELDS) {
            totals[field] += toFiniteNumber(doc[field]);
        }
    }

    return totals;
}

export function applyRevenueAggregateDelta(
    docs: RevenueAggregateDoc[],
    date: Date,
    delta: RevenueAggregateDelta,
): RevenueAggregateDoc[] {
    const normalized = normalizeRevenueAggregateDelta(delta);
    const { dayId, monthId } = getRevenueAggregateIds(date);
    let found = false;

    const next = docs.map((doc) => {
        if (doc.date !== dayId) return doc;
        found = true;
        const updated: RevenueAggregateDoc = { ...doc };
        for (const field of REVENUE_AGGREGATE_NUMERIC_FIELDS) {
            updated[field] = toFiniteNumber(updated[field]) + toFiniteNumber(normalized[field]);
        }
        return updated;
    });

    if (!found) {
        next.push({
            id: dayId,
            date: dayId,
            month: monthId,
            period: 'daily',
            ...createEmptyRevenueAggregate(),
            ...normalized,
        });
    }

    return next.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

export function isAggregateRangeAvailable(from: Date): boolean {
    return toRevenueDateId(from) >= REVENUE_AGGREGATE_ROLLOUT_DATE;
}
