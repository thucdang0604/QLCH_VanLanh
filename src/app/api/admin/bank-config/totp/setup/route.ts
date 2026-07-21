import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export const GET = withApi({
    name: 'admin/bank-config/totp/setup',
    onError: (error, context) => context.json({ success: false, error: getApiErrorMessage(error) }, { status: getApiErrorStatus(error) }),
}, async (request: NextRequest, context) => {
        await requirePermission(request, 'manage_settings');
        const db = getAdminDb();
        const configDoc = await db.collection('settings').doc('bank_config').get();
        const configData = configDoc.data();
        if (configData?.totpEnabled && configData?.totpSecret) {
            return context.json({ success: false, error: 'Authenticator da duoc thiet lap.' }, { status: 409 });
        }
        
        // Sinh secret mới
        const secret = authenticator.generateSecret();
        
        // Tạo chuỗi URI cho app Authenticator
        const service = 'QLCH_VanLanh';
        const user = 'admin'; // Hoặc lấy email của admin hiện tại nếu có
        const otpauth = authenticator.keyuri(user, service, secret);
        
        // Tạo ảnh QR Code dạng Data URL (base64)
        const qrCodeUrl = await QRCode.toDataURL(otpauth);

        return context.json({
            success: true, 
            secret, 
            qrCodeUrl 
        });
});
