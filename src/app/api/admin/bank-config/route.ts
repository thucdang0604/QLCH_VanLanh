import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
    try {
        await requirePermission(request, 'manage_settings');
        const db = getAdminDb();
        const snap = await db.collection('settings').doc('bank_config').get();
        
        if (!snap.exists) {
            return NextResponse.json({ success: true, config: null });
        }
        
        const data = snap.data();
        return NextResponse.json({ 
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
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Không thể tải cấu hình ngân hàng.';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
