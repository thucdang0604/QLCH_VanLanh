import { withApi } from '@/lib/api/handler';

const BANK_DIRECTORY_TIMEOUT_MS = 8_000;

export const GET = withApi({
    name: 'admin/bank-config/banks',
    onError: (_error, context) => context.json({
        code: '99',
        desc: 'Lỗi máy chủ',
        error: 'Không thể tải danh sách ngân hàng. Vui lòng thử lại sau.',
    }, { status: 502 }),
}, async (_request, context) => {
        const response = await fetch('https://api.vietqr.io/v2/banks', {
            signal: AbortSignal.timeout(BANK_DIRECTORY_TIMEOUT_MS),
            next: { revalidate: 86_400 },
        });
        if (!response.ok) {
            throw new Error(`VietQR bank directory returned ${response.status}`);
        }
        const data = await response.json();
        return context.json(data);
});
