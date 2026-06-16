import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebaseAdmin';
import { normalizeVietnamPhone } from '@/lib/phone';
import { requirePermission } from '@/lib/apiAuth';

type BankAccountInput = {
    id?: string;
    bankId?: string;
    accountNo?: string;
    accountName?: string;
    isDefault?: boolean;
};

type BankConfigInput = {
    accounts?: BankAccountInput[];
    bankId?: string;
    accountNo?: string;
    accountName?: string;
};

export async function POST(request: NextRequest) {
    try {
        await requirePermission(request, 'manage_settings');
        const body = await request.json() as { phone?: string; config?: BankConfigInput; otpToken?: string };
        const { phone, config, otpToken } = body;

        if (!phone || !config) {
            return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc.' }, { status: 400 });
        }

        const db = getAdminDb();
        
        const normalizedInputPhone = normalizeVietnamPhone(phone)?.e164;
        if (!normalizedInputPhone) {
            return NextResponse.json({ success: false, error: 'Số điện thoại không hợp lệ.' }, { status: 400 });
        }

        // 2. Kiểm tra TOTP nếu hệ thống đã bật
        const configDoc = await db.collection('settings').doc('bank_config').get();
        const configData = configDoc.data();
        if (configData?.totpEnabled && configData?.totpSecret) {
            if (!otpToken) {
                return NextResponse.json({ success: false, error: 'Yêu cầu mã xác thực TOTP.' }, { status: 400 });
            }
            
            // Require otplib at runtime to avoid top-level import issues if not installed yet
            const { authenticator } = await import('otplib');
            const isValid = authenticator.verify({ token: otpToken, secret: configData.totpSecret });
            if (!isValid) {
                return NextResponse.json({ success: false, error: 'Mã xác thực không hợp lệ.' }, { status: 400 });
            }
        }

        // 3. Cập nhật cấu hình
        const updateData: Record<string, unknown> = {
            adminPhone: phone,
        };

        if (config.accounts && Array.isArray(config.accounts) && config.accounts.length > 0) {
            updateData.accounts = config.accounts;
            const defaultAcc = config.accounts.find(account => account.isDefault) || config.accounts[0];
            updateData.bankId = defaultAcc.bankId || '';
            updateData.accountNo = defaultAcc.accountNo || '';
            updateData.accountName = defaultAcc.accountName || '';
        } else {
            updateData.bankId = config.bankId || '';
            updateData.accountNo = config.accountNo || '';
            updateData.accountName = config.accountName || '';
            updateData.accounts = [{
                id: 'default_1',
                bankId: updateData.bankId,
                accountNo: updateData.accountNo,
                accountName: updateData.accountName,
                isDefault: true
            }];
        }

        await db.collection('settings').doc('bank_config').set(updateData, { merge: true });

        // 4. Xóa OTP (Không cần vì dùng Firebase Auth)

        return NextResponse.json({ success: true, message: 'Cấu hình ngân hàng đã được cập nhật thành công.' });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Không thể cập nhật cấu hình ngân hàng.';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
