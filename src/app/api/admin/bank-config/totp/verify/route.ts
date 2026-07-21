import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { authenticator } from 'otplib';

type TotpVerifyRequestBody = { token?: string; secret?: string };

export const POST = withApi({
    name: 'admin/bank-config/totp/verify',
    onError: (error, context) => context.json({ success: false, error: getApiErrorMessage(error) }, { status: getApiErrorStatus(error) }),
}, async (request: NextRequest, context) => {
        await requirePermission(request, 'manage_settings');
        const body = await context.readJson<TotpVerifyRequestBody>(request);
        const { token, secret } = body;

        if (!token) {
            return context.json({ success: false, error: 'Thiếu mã token.' }, { status: 400 });
        }

        const db = getAdminDb();
        const existingConfigDoc = await db.collection('settings').doc('bank_config').get();
        const existingConfig = existingConfigDoc.data();
        if (secret && existingConfig?.totpEnabled && existingConfig?.totpSecret) {
            return context.json({ success: false, error: 'Authenticator da duoc thiet lap.' }, { status: 409 });
        }
        
        let secretToUse = secret;

        // Nếu không truyền secret (lúc Edit config), lấy từ DB
        if (!secretToUse) {
            const configData = existingConfig;
            
            if (!configData?.totpEnabled || !configData?.totpSecret) {
                return context.json({ success: false, error: 'Hệ thống chưa cấu hình TOTP.' }, { status: 400 });
            }
            secretToUse = configData.totpSecret as string;
        }

        // Xác thực token
        const isValid = authenticator.verify({ token, secret: secretToUse });

        if (!isValid) {
            return context.json({ success: false, error: 'Mã xác thực không hợp lệ hoặc đã hết hạn.' }, { status: 400 });
        }

        // Nếu có secret (lúc Setup), lưu vào DB
        if (secret) {
            await db.collection('settings').doc('bank_config').set({
                totpEnabled: true,
                totpSecret: secret
            }, { merge: true });
        }

        return context.json({ success: true, message: 'Xác thực thành công.' });
});
