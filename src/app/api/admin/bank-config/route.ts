import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

export const GET = withApi({
    name: 'admin/bank-config',
    onError: (error, context) => context.json(
        { success: false, error: getApiErrorMessage(error, 'Không thể tải cấu hình ngân hàng.') },
        { status: getApiErrorStatus(error) },
    ),
}, async (request: NextRequest, context) => {
        await requirePermission(request, 'manage_settings');
        const db = getAdminDb();
        const snap = await db.collection('settings').doc('bank_config').get();
        
        if (!snap.exists) {
            return context.json({ success: true, config: null });
        }
        
        const data = snap.data();
        return context.json({
            success: true, 
            config: {
                adminPhone: data?.adminPhone || '',
                bankId: data?.bankId || '',
                accountNo: data?.accountNo || '',
                accountName: data?.accountName || '',
                accounts: Array.isArray(data?.accounts) ? data.accounts : [],
                totpEnabled: data?.totpEnabled === true,
            }
        });
});
