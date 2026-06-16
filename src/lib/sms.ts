export async function sendSms(phone: string, content: string): Promise<{ success: boolean; error?: string }> {
    const apiKey = process.env.SPEEDSMS_API_KEY;
    
    if (!apiKey) {
        console.warn('⚠️ SPEEDSMS_API_KEY chưa được cấu hình. Chỉ in log:');
        console.warn(`[SMS preview to ${phone}]: ${content}`);
        return { success: false, error: 'Chưa cấu hình API Key SMS' };
    }

    try {
        const authHeader = 'Basic ' + Buffer.from(apiKey + ':x').toString('base64');
        const res = await fetch('https://api.speedsms.vn/index.php/sms/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify({
                to: [phone],
                content: content,
                sms_type: 2, // 2 = OTP, 4 = CSKH, 3 = Brandname
                brandname: process.env.SPEEDSMS_BRANDNAME || 'SpeedSMS'
            })
        });

        const data = await res.json() as { status?: string; message?: string };
        
        if (data.status === 'success') {
            return { success: true };
        } else {
            console.error('SpeedSMS Error:', data);
            return { success: false, error: data.message || 'Lỗi từ nhà cung cấp SMS' };
        }
    } catch (error: unknown) {
        console.error('Send SMS Error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Không thể gửi SMS' };
    }
}
