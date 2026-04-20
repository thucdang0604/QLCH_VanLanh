import { NextRequest, NextResponse } from 'next/server';
import { addDoc, collection, serverTimestamp, doc, getDoc, writeBatch, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Rate Limiting (in-memory, per IP, 3 req/min) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 phút

function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (entry.count >= RATE_LIMIT_MAX) {
        return false; // Bị chặn
    }

    entry.count++;
    return true;
}

// Dọn dẹp bộ nhớ mỗi 5 phút
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
        if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
}, 5 * 60_000);

export async function POST(request: NextRequest) {
    try {
        // ── 1. Rate Limiting ──
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (!checkRateLimit(ip)) {
            return NextResponse.json(
                { error: 'Bạn đang gửi quá nhiều yêu cầu. Vui lòng thử lại sau.' },
                { status: 429 }
            );
        }

        const body = await request.json();

        // ── 2. Honeypot Check ──
        // Field "website" ẩn trong form, bot tự fill → reject
        if (body.website) {
            return NextResponse.json(
                { error: 'Invalid request' },
                { status: 400 }
            );
        }

        const { name, phone, note, items } = body;

        // ── 3. Validate required fields ──
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            return NextResponse.json(
                { error: 'Vui lòng nhập họ tên (ít nhất 2 ký tự).' },
                { status: 400 }
            );
        }

        if (!phone || typeof phone !== 'string') {
            return NextResponse.json(
                { error: 'Vui lòng nhập số điện thoại.' },
                { status: 400 }
            );
        }

        // Validate phone format (Vietnamese: 0xxxxxxxxx, 10-11 digits)
        if (!/^0\d{9,10}$/.test(phone.trim())) {
            return NextResponse.json(
                { error: 'Số điện thoại không hợp lệ (VD: 0901234567).' },
                { status: 400 }
            );
        }

        // Validate items
        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: 'Giỏ hàng trống.' },
                { status: 400 }
            );
        }

        if (items.length > 50) {
            return NextResponse.json(
                { error: 'Đơn hàng không được vượt quá 50 sản phẩm.' },
                { status: 400 }
            );
        }

        // ── 4. Server-Side Data Fetching, Pricing & Validation ──
        const productPromises = items.map(async (item: any) => {
            const cartItemId = String(item.id || '');
            const productId = cartItemId; // Do NOT split by hyphen since slugs contain hyphens
            const quantity = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));

            const productRef = doc(db, 'products', productId);
            const productSnap = await getDoc(productRef);

            if (!productSnap.exists()) {
                throw new Error(`Sản phẩm "${item.name}" không tồn tại hoặc đã bị xóa.`);
            }

            const productData = productSnap.data();
            const stock = typeof productData.stock === 'number' ? productData.stock : 0;

            if (stock < quantity) {
                throw new Error(`Sản phẩm "${productData.name}" chỉ còn ${stock} sản phẩm trong kho.`);
            }

            const originalPrice = productData.price_original || productData.price || 0;
            const promoPrice = productData.price_promo || 0;
            const finalPrice = promoPrice > 0 ? promoPrice : originalPrice;

            return {
                id: cartItemId, // Preserve variant signature
                productId,
                productName: productData.name || item.name,
                price: finalPrice, // True server price
                quantity,
                image: productData.images?.[0] || productData.imageUrl || productData.image || item.image || '',
                color: item.color || null,
                storage: item.storage || null,
            };
        });

        let normalizedItems;
        try {
            normalizedItems = await Promise.all(productPromises);
        } catch (e: any) {
            return NextResponse.json(
                { error: e.message || 'Lỗi khi kiểm tra giỏ hàng.' },
                { status: 400 }
            );
        }

        // ── 5. Tính lại tổng tiền phía server ──
        const subtotal_amount = normalizedItems.reduce(
            (sum: number, item) => sum + item.price * item.quantity, 0
        );

        if (subtotal_amount <= 0) {
            return NextResponse.json(
                { error: 'Tổng tiền đơn hàng không hợp lệ.' },
                { status: 400 }
            );
        }

        // ── 6. Tạo đơn hàng trong Firestore ──
        const order = {
            customer_info: {
                name: name.trim(),
                phone: phone.trim(),
                email: '',
                address: '',
                note: (note || '').trim(),
            },
            items: normalizedItems,
            subtotal_amount,
            discount_amount: 0,
            total_amount: subtotal_amount,
            status: 'Pending',
            source: 'web',
            is_vat_exported: false,
            payment_method: 'COD',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        // Use batch to create order and update stock
        const batch = writeBatch(db);
        const orderRef = doc(collection(db, 'orders'));
        
        batch.set(orderRef, order);

        // Update double-entry inventory (Stock to Held)
        for (const item of normalizedItems) {
            const productRef = doc(db, 'products', item.productId);
            batch.update(productRef, {
                stock: increment(-item.quantity),
                held: increment(item.quantity)
            });
        }

        await batch.commit();

        return NextResponse.json({
            success: true,
            orderId: orderRef.id,
            message: 'Đặt hàng thành công!',
        });
    } catch (error) {
        console.error('Checkout error:', error);
        return NextResponse.json(
            { error: 'Lỗi hệ thống. Vui lòng thử lại sau.' },
            { status: 500 }
        );
    }
}
