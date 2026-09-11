export interface ReceiptPaymentSource {
    total_amount?: unknown;
    deposit_amount?: unknown;
    status?: unknown;
    paymentHistory?: unknown;
    paymentBreakdown?: unknown;
}

function sumPaymentEntries(value: unknown): number {
    if (!Array.isArray(value)) return 0;
    return value.reduce((sum, entry) => {
        const amount = entry && typeof entry === 'object'
            ? Number((entry as { amount?: unknown }).amount)
            : 0;
        return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
    }, 0);
}

export function getReceiptPaymentSummary(order: ReceiptPaymentSource) {
    const totalAmount = Number(order.total_amount) || 0;
    const paymentHistory = Array.isArray(order.paymentHistory) ? order.paymentHistory : [];
    const paidFromHistory = sumPaymentEntries(paymentHistory);
    const paidFromBreakdown = paymentHistory.length > 0 ? 0 : sumPaymentEntries(order.paymentBreakdown);
    const paidAmount = Math.max(Number(order.deposit_amount) || 0, paidFromHistory, paidFromBreakdown);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    return {
        totalAmount,
        paidAmount,
        remainingAmount,
        isDebt: order.status !== 'Cancelled' && remainingAmount > 0,
    };
}
