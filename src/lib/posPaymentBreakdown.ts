export const POS_IMMEDIATE_PAYMENT_METHODS = ['CASH', 'BANK', 'MOMO', 'QR', 'CARD', 'INSTALLMENT'] as const;

export type PosImmediatePaymentMethod = typeof POS_IMMEDIATE_PAYMENT_METHODS[number];

export type PosPaymentBreakdownEntry = {
    method: PosImmediatePaymentMethod;
    amount: number;
    reference?: string;
};

export type PosPaymentBreakdownResult = {
    entries: PosPaymentBreakdownEntry[];
    cashApplied: number;
    bankApplied: number;
    paidAmount: number;
    remainingAmount: number;
    changeDue: number;
};

function toNonNegativeAmount(value: unknown, label: string) {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${label} không hợp lệ.`);
    }
    return Math.round(amount);
}

export function isPosImmediatePaymentMethod(value: unknown): value is PosImmediatePaymentMethod {
    return typeof value === 'string'
        && (POS_IMMEDIATE_PAYMENT_METHODS as readonly string[]).includes(value.trim().toUpperCase());
}

export function normalizePosPaymentReference(value: unknown) {
    const reference = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return /^POS-[A-Z0-9]{6,32}$/.test(reference) ? reference : '';
}

export function createPosPaymentReference(seed: string) {
    const token = seed.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(-12);
    return `POS-${token || 'PENDING'}`;
}

export function sumPosPaymentBreakdown(entries: readonly PosPaymentBreakdownEntry[]) {
    return entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0);
}

/**
 * Đọc payload thanh toán mới. `null` nghĩa là client cũ chưa gửi breakdown,
 * để checkout tiếp tục dùng contract deposit/payment_method trước đó.
 */
export function readPosPaymentBreakdown(value: unknown): PosPaymentBreakdownEntry[] | null {
    if (value === undefined || value === null) return null;
    if (!Array.isArray(value) || value.length > 4) {
        throw new Error('Danh sách khoản thanh toán không hợp lệ.');
    }

    return value.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Khoản thanh toán #${index + 1} không hợp lệ.`);
        }

        const record = entry as Record<string, unknown>;
        const method = typeof record.method === 'string' ? record.method.trim().toUpperCase() : '';
        if (!isPosImmediatePaymentMethod(method)) {
            throw new Error(`Kênh thanh toán #${index + 1} không hợp lệ.`);
        }

        const amount = toNonNegativeAmount(record.amount, `Số tiền khoản thanh toán #${index + 1}`);
        if (amount <= 0) {
            throw new Error(`Số tiền khoản thanh toán #${index + 1} phải lớn hơn 0.`);
        }

        const reference = normalizePosPaymentReference(record.reference);
        if (record.reference !== undefined && !reference) {
            throw new Error(`Mã tham chiếu khoản thanh toán #${index + 1} không hợp lệ.`);
        }
        if (reference && method !== 'BANK') {
            throw new Error(`Mã tham chiếu chỉ dùng cho khoản chuyển khoản #${index + 1}.`);
        }

        return { method, amount, ...(reference ? { reference } : {}) };
    });
}

/** Chia tuần tự các khoản thu cho một phần giá trị của hóa đơn. */
export function takePosPaymentBreakdown(entries: readonly PosPaymentBreakdownEntry[], amount: number) {
    let remaining = Math.max(0, Math.round(amount));
    const allocated: PosPaymentBreakdownEntry[] = [];

    for (const entry of entries) {
        if (remaining <= 0) break;
        const taken = Math.min(remaining, Math.max(0, Math.round(entry.amount)));
        if (taken > 0) {
            allocated.push({ ...entry, amount: taken });
            remaining -= taken;
        }
    }

    return allocated;
}

/**
 * Tiền mặt được áp dụng trước để có thể trả lại tiền thừa; chuyển khoản chỉ
 * áp dụng cho số còn lại. extraCashAllocation dùng khi khách chủ động cấn
 * tiền mặt dư vào công nợ cũ.
 */
export function buildPosPaymentBreakdown(input: {
    total: number;
    cashTendered: number;
    bankTransferAmount: number;
    bankReference: string;
    extraCashAllocation?: number;
}): PosPaymentBreakdownResult {
    const total = Math.max(0, Math.round(input.total));
    const cashTendered = Math.max(0, Math.round(input.cashTendered));
    const bankTransferAmount = Math.max(0, Math.round(input.bankTransferAmount));
    const extraCashAllocation = Math.max(0, Math.round(input.extraCashAllocation || 0));
    const cashApplied = Math.min(cashTendered, total + extraCashAllocation);
    const bankApplied = Math.min(bankTransferAmount, Math.max(0, total - cashApplied));
    const reference = normalizePosPaymentReference(input.bankReference);
    const entries: PosPaymentBreakdownEntry[] = [
        ...(cashApplied > 0 ? [{ method: 'CASH' as const, amount: cashApplied }] : []),
        ...(bankApplied > 0 ? [{ method: 'BANK' as const, amount: bankApplied, ...(reference ? { reference } : {}) }] : []),
    ];
    const paidAmount = sumPosPaymentBreakdown(entries);

    return {
        entries,
        cashApplied,
        bankApplied,
        paidAmount,
        remainingAmount: Math.max(0, total - Math.min(total, paidAmount)),
        changeDue: Math.max(0, cashTendered - cashApplied),
    };
}
