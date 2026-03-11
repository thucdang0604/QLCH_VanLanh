/**
 * Script to seed an admin account
 * 
 * CÁCH SỬ DỤNG:
 * 
 * 1. Đăng ký tài khoản trên website (ví dụ: admin@vanlanh.com)
 * 2. Mở Firebase Console > Authentication > Users
 * 3. Copy UID của tài khoản vừa tạo
 * 4. Chạy lệnh sau trong terminal:
 * 
 * curl -X POST http://localhost:3000/api/seed-admin \
 *   -H "Content-Type: application/json" \
 *   -d '{"uid":"YOUR_UID_HERE","email":"admin@vanlanh.com","secretKey":"vanlanh-admin-secret-2024"}'
 * 
 * Hoặc chạy script này bằng Node.js:
 * node scripts/seed-admin.js
 */

const seedAdmin = async () => { 
    // THAY ĐỔI CÁC GIÁ TRỊ NÀY
    const uid = 'YOUR_FIREBASE_UID'; // Copy từ Firebase Console
    const email = 'admin@vanlanh.com';
    const secretKey = 'vanlanh-admin-secret-2024';
    const apiUrl = 'http://localhost:3000/api/seed-admin';

    try {
        console.log('🚀 Đang tạo admin account...');

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ uid, email, secretKey }),
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Thành công!', data.message);
        } else {
            console.error('❌ Lỗi:', data.error);
        }
    } catch (error) {
        console.error('❌ Fetch error:', error.message);
    }
};

// Uncomment dòng dưới để chạy script
// seedAdmin();

module.exports = { seedAdmin };
