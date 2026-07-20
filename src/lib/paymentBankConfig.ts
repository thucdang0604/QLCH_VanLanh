export type PaymentBankAccount = {
    bankId: string;
    accountNo: string;
    accountName: string;
    isDefault: boolean;
};

export type PaymentBankConfig = {
    accounts: PaymentBankAccount[];
    bankId: string;
    accountNo: string;
    accountName: string;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function readAccount(value: unknown): PaymentBankAccount | null {
    if (!isRecord(value)) return null;

    const bankId = readText(value.bankId);
    const accountNo = readText(value.accountNo);
    if (!bankId || !accountNo) return null;

    return {
        bankId,
        accountNo,
        accountName: readText(value.accountName),
        isDefault: value.isDefault === true,
    };
}

/**
 * Returns only the bank information required to print a customer payment QR.
 * Admin phone numbers and TOTP configuration must remain in the settings API.
 */
export function buildPaymentBankConfig(value: unknown): PaymentBankConfig {
    const config = isRecord(value) ? value : {};
    const accounts = Array.isArray(config.accounts)
        ? config.accounts.map(readAccount).filter((account): account is PaymentBankAccount => account !== null)
        : [];

    return {
        accounts,
        bankId: readText(config.bankId),
        accountNo: readText(config.accountNo),
        accountName: readText(config.accountName),
    };
}
