import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export async function GET(request: NextRequest) {
    try {
        await requirePermission(request, 'manage_settings');
        
        // Sinh secret mới
        const secret = authenticator.generateSecret();
        
        // Tạo chuỗi URI cho app Authenticator
        const service = 'QLCH_VanLanh';
        const user = 'admin'; // Hoặc lấy email của admin hiện tại nếu có
        const otpauth = authenticator.keyuri(user, service, secret);
        
        // Tạo ảnh QR Code dạng Data URL (base64)
        const qrCodeUrl = await QRCode.toDataURL(otpauth);

        return NextResponse.json({ 
            success: true, 
            secret, 
            qrCodeUrl 
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Không thể khởi tạo TOTP.';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
