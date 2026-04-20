import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';

export async function GET(req: Request) {
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Endpoint chặn chạy trên Production để bảo vệ dữ liệu.' }, { status: 403 });
    }

    try {
        const db = getAdminDb();
        const batch = db.batch();
        
        let count = 0;
        const now = new Date();

        // 1. Generate 50 Smartphones
        const phoneBrands = ['Apple', 'Samsung', 'Xiaomi', 'Oppo'];
        for (let i = 1; i <= 50; i++) {
            const brand = phoneBrands[i % phoneBrands.length];
            const originalPrice = 10000000 + Math.floor(Math.random() * 20000000);
            const ref = db.collection('products').doc(`seed-phone-${i}`);
            batch.set(ref, {
                name: `Điện thoại ${brand} Mẫu ${i} (Seed Demo)`,
                brand: brand,
                category: 'Phone',
                price_original: originalPrice,
                price_promo: originalPrice - 1000000,
                costPrice: originalPrice - 3000000,
                specs: { screen: '6.7 inch OLED', ram: '8GB', storage: '256GB' },
                images: [],
                status: 'active',
                condition: 'new',
                stock: 10 + Math.floor(Math.random() * 50),
                held: 0,
                sold: Math.floor(Math.random() * 10),
                isFlashSale: i % 10 === 0,
                createdAt: now,
                updatedAt: now,
            });
            count++;
        }

        // 2. Generate 30 Laptops
        const laptopBrands = ['Dell', 'Asus', 'HP', 'MacBook'];
        for (let i = 1; i <= 30; i++) {
            const brand = laptopBrands[i % laptopBrands.length];
            const originalPrice = 15000000 + Math.floor(Math.random() * 25000000);
            const ref = db.collection('products').doc(`seed-laptop-${i}`);
            batch.set(ref, {
                name: `Laptop ${brand} Pro ${i} (Seed Demo)`,
                brand: brand,
                category: 'Laptop',
                price_original: originalPrice,
                price_promo: originalPrice - 2000000,
                costPrice: originalPrice - 4000000,
                specs: { screen: '15.6 inch 4K', ram: '16GB', storage: '512GB SSD', cpu: 'Intel Core i7' },
                images: [],
                status: 'active',
                condition: 'like-new',
                stock: 5 + Math.floor(Math.random() * 20),
                held: 0,
                sold: Math.floor(Math.random() * 5),
                isFlashSale: i % 10 === 0,
                createdAt: now,
                updatedAt: now,
            });
            count++;
        }

        // 3. Generate 50 Parts / Linh kiện
        const partTypes = ['Màn hình', 'Pin', 'Camera', 'Cáp sạc', 'Mainboard'];
        for (let i = 1; i <= 50; i++) {
            const pType = partTypes[i % partTypes.length];
            const originalPrice = 500000 + Math.floor(Math.random() * 2000000);
            const ref = db.collection('products').doc(`seed-part-${i}`);
            batch.set(ref, {
                name: `Linh kiện ${pType} Zin bóc máy ${i} (Seed Demo)`,
                brand: 'OEM',
                category: 'Linh kiện',
                partType: pType,
                price_original: originalPrice,
                price_promo: originalPrice,
                costPrice: originalPrice - 200000,
                specs: {},
                images: [],
                status: 'active',
                condition: 'new',
                quality: 'Zin bóc máy',
                stock: 20 + Math.floor(Math.random() * 100),
                held: 0,
                sold: 0,
                isFlashSale: false,
                createdAt: now,
                updatedAt: now,
            });
            count++;
        }

        await batch.commit();

        return NextResponse.json({ 
            success: true, 
            message: `Thành công! Đã thêm ${count} sản phẩm/linh kiện nháp.`, 
            instruction: 'Kho hàng đã đầy đủ stock, bạn có thể bắt đầu Test ngay bây giờ.'
        }, { status: 200, headers: { 'Cache-Control': 'no-store' }});

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
