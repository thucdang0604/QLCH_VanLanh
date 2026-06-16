import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { authenticator } from 'otplib';

export async function POST(request: NextRequest) {
    try {
        await requirePermission(request, 'manage_settings');
        const body = await request.json() as { token: string; secret?: string };
        const { token, secret } = body;

        if (!token) {
            return NextResponse.json({ success: false, error: 'Thiếu mã token.' }, { status: 400 });
        }

        const db = getAdminDb();
        
        let secretToUse = secret;

        // Nếu không truyền secret (lúc Edit config), lấy từ DB
        if (!secretToUse) {
            const configDoc = await db.collection('settings').doc('bank_config').get();
            const configData = configDoc.data();
            
            if (!configData?.totpEnabled || !configData?.totpSecret) {
                return NextResponse.json({ success: false, error: 'Hệ thống chưa cấu hình TOTP.' }, { status: 400 });
            }
            secretToUse = configData.totpSecret as string;
        }

        // Xác thực token
        const isValid = authenticator.verify({ token, secret: secretToUse });

        if (!isValid) {
            return NextResponse.json({ success: false, error: 'Mã xác thực không hợp lệ hoặc đã hết hạn.' }, { status: 400 });
        }

        // Nếu có secret (lúc Setup), lưu vào DB
        if (secret) {
            await db.collection('settings').doc('bank_config').set({
                totpEnabled: true,
                totpSecret: secret
            }, { merge: true });
        }

        return NextResponse.json({ success: true, message: 'Xác thực thành công.' });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Không thể xác thực mã TOTP.';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
