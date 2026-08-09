import { NextRequest } from 'next/server';
import { requireAdminOrStaff } from '@/lib/apiAuth';
import { withApi } from '@/lib/api/handler';

export const POST = withApi({
    name: 'orders/imei',
    onError: (_error, context) => context.error('Không thể thay đổi IMEI/Serial của đơn đã chốt.', 403),
}, async (
    request: NextRequest,
    apiContext,
    routeContext: { params: Promise<{ id: string }> },
) => {
        let authResult;
        try {
            authResult = await requireAdminOrStaff(request);
        } catch {
            return apiContext.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // A serial is part of the issued warranty evidence. POS captures it before
        // checkout; the order detail page is intentionally read-only afterwards.
        void authResult;
        void routeContext;
        return apiContext.json({ error: 'IMEI/Serial là dữ liệu chứng từ và không thể sửa sau khi đơn đã chốt.' }, { status: 403 });

});
