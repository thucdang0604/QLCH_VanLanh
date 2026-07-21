import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { normalizeVietnamPhone } from '@/lib/phone';
import { requirePermission } from '@/lib/apiAuth';
import { getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';

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

type BankConfigUpdateRequestBody = { phone?: string; config?: BankConfigInput; otpToken?: string };

export const POST = withApi({
    name: 'admin/bank-config/update',
    onError: (error, context) => context.json({ success: false, error: getApiErrorMessage(error) }, { status: getApiErrorStatus(error) }),
}, async (request: NextRequest, context) => {
        await requirePermission(request, 'manage_settings');
        const body = await context.readJson<BankConfigUpdateRequestBody>(request);
        const { phone, config, otpToken } = body;

        if (!phone || !config) {
            return context.json({ success: false, error: 'Thiếu thông tin bắt buộc.' }, { status: 400 });
        }

        const db = getAdminDb();
        
        const normalizedInputPhone = normalizeVietnamPhone(phone)?.e164;
        if (!normalizedInputPhone) {
            return context.json({ success: false, error: 'Số điện thoại không hợp lệ.' }, { status: 400 });
        }

        // 2. Kiểm tra TOTP nếu hệ thống đã bật
        const configDoc = await db.collection('settings').doc('bank_config').get();
        const configData = configDoc.data();
        if (!configData?.totpEnabled || !configData?.totpSecret) {
            return context.json({ success: false, error: 'Vui lòng thiết lập Authenticator trước khi cập nhật cấu hình ngân hàng.' }, { status: 403 });
        }
        if (configData?.totpEnabled && configData?.totpSecret) {
            if (!otpToken) {
                return context.json({ success: false, error: 'Yêu cầu mã xác thực TOTP.' }, { status: 400 });
            }
            
            // Require otplib at runtime to avoid top-level import issues if not installed yet
            const { authenticator } = await import('otplib');
            const isValid = authenticator.verify({ token: otpToken, secret: configData.totpSecret });
            if (!isValid) {
                return context.json({ success: false, error: 'Mã xác thực không hợp lệ.' }, { status: 400 });
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

        return context.json({ success: true, message: 'Cấu hình ngân hàng đã được cập nhật thành công.' });
});
