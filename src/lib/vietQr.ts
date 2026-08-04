type VietQrPaymentInput = {
    bankId: string;
    accountNo: string;
    accountName?: string;
    amount: number;
    addInfo: string;
};

function normalizeVietQrPathPart(value: string) {
    return value.trim().replace(/[\s-]+/g, '').replace(/[^a-z0-9]/gi, '');
}

export function buildVietQrImageUrl(input: VietQrPaymentInput) {
    const bankId = normalizeVietQrPathPart(input.bankId).toUpperCase();
    const accountNo = normalizeVietQrPathPart(input.accountNo);
    if (!bankId || !accountNo) return '';

    const amount = Math.max(0, Math.round(Number(input.amount) || 0));
    const remoteUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(input.addInfo.trim())}&accountName=${encodeURIComponent(input.accountName?.trim() || '')}`;
    return `/api/proxy-image?url=${encodeURIComponent(remoteUrl)}`;
}
