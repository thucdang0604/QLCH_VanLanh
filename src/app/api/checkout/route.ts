import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { isRateLimited } from '@/lib/rateLimit';
import { PRODUCT_STATUS, isProductArchived } from '@/lib/productLifecycle';

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 phút

export async function POST(request: NextRequest) {
    try {
        // ── 1. Rate Limiting ──
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || request.headers.get('x-real-ip')
            || 'unknown';

        if (await isRateLimited(ip, 'checkout', RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
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

        // ── 4. Server-Side Data Fetching & Transaction ──
        const db = getAdminDb();
        let orderRefId = '';
        
        await db.runTransaction(async (transaction) => {
            const normalizedItems = [];
            let subtotal_amount = 0;

            // Pre-aggregate: gom theo productId để chống overdraft khi trùng SP
            const preAggregated = new Map<string, number>();
            for (const item of items) {
                const pid = String(item.id || '');
                const qty = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));
                preAggregated.set(pid, (preAggregated.get(pid) || 0) + qty);
            }

            // READ 1: Đọc tất cả dữ liệu sản phẩm
            const productDocs = new Map<string, FirebaseFirestore.DocumentSnapshot>();
            for (const productId of preAggregated.keys()) {
                const productRef = db.collection('products').doc(productId);
                const productSnap = await transaction.get(productRef);
                if (!productSnap.exists) {
                    throw new Error(`Sản phẩm (ID: ${productId}) không tồn tại hoặc đã bị xóa.`);
                }
                productDocs.set(productId, productSnap);
            }

            // READ 2: Đọc thông tin khách hàng (nếu có SĐT)
            const normalizedPhone = phone.trim().replace(/[^0-9]/g, '');
            let customerSnap: FirebaseFirestore.DocumentSnapshot | null = null;
            let customerRef: FirebaseFirestore.DocumentReference | null = null;
            if (normalizedPhone.length >= 9) {
                customerRef = db.collection('customers').doc(normalizedPhone);
                customerSnap = await transaction.get(customerRef);
            }

            // READ 3: Đọc taxonomy để lấy cấu hình bảo hành mặc định
            const taxonomySnap = await transaction.get(db.collection('system_config').doc('taxonomy_settings'));
            const retailTrees = taxonomySnap.data()?.taxonomy?.retail || [];

            function resolveWarranty(productData: { warrantyType?: string; warrantyMonths?: string | number; category?: string; [key: string]: unknown }): { warrantyType: string, warrantyMonths: number } | null {
                // Ưu tiên override từ sản phẩm
                if (productData.warrantyType && productData.warrantyType !== 'none') {
                    return { warrantyType: productData.warrantyType, warrantyMonths: Number(productData.warrantyMonths) || 0 };
                }
                if (productData.warrantyType === 'none') return null;

                // Fallback xuống danh mục
                const categoryPath = productData.category || '';
                if (!categoryPath) return null;

                const segments = categoryPath.split('/');
                let currentNodes = retailTrees;
                let lastFoundWarranty: { warrantyType: string, warrantyMonths: number } | null = null;

                for (let i = 0; i < segments.length; i++) {
                    const partialId = segments.slice(0, i + 1).join('/');
                    const node = currentNodes.find((n: { id?: string; slug?: string; warrantyType?: string; warrantyMonths?: string | number; children?: Record<string, unknown>[] }) => n.id === partialId || n.slug === segments[i]);
                    if (!node) break;

                    if (node.warrantyType && node.warrantyType !== 'none') {
                        lastFoundWarranty = { warrantyType: node.warrantyType, warrantyMonths: Number(node.warrantyMonths) || 0 };
                    } else if (node.warrantyType === 'none') {
                        lastFoundWarranty = null;
                    }

                    if (!node.children || node.children.length === 0) break;
                    currentNodes = node.children;
                }
                return lastFoundWarranty;
            }

            // Validate aggregated totals against available stock
            for (const [productId, totalQty] of preAggregated.entries()) {
                const productSnap = productDocs.get(productId)!;
                const d = productSnap.data()!;
                if (isProductArchived({ status: String(d.status || '') as 'active' | 'hidden' | 'inactive' }) || d.status !== PRODUCT_STATUS.ACTIVE || d.isProposed === true) {
                    throw new Error(`Sản phẩm "${d.name || productId}" hiện không còn được bán.`);
                }
                const available = (typeof d.stock === 'number' ? d.stock : 0) - (typeof d.held === 'number' ? d.held : 0);
                if (available < totalQty) {
                    throw new Error(`Sản phẩm "${d.name}" chỉ còn ${available} khả dụng nhưng đơn yêu cầu ${totalQty}.`);
                }
            }

            // Đọc tất cả dữ liệu sản phẩm trong transaction (đã cached từ trên)
            for (const item of items) {
                const cartItemId = String(item.id || '');
                const productId = cartItemId;
                const quantity = Math.max(1, Math.min(99, Math.floor(Number(item.quantity) || 1)));

                const productSnap = productDocs.get(productId)!;
                const productData = productSnap.data()!;

                const originalPrice = productData.price_original || productData.price || 0;
                const promoPrice = productData.price_promo || 0;
                const finalPrice = promoPrice > 0 ? promoPrice : originalPrice;

                const warrantyInfo = resolveWarranty(productData);

                normalizedItems.push({
                    id: cartItemId,
                    productId,
                    productName: productData.name || item.name,
                    price: finalPrice,
                    quantity,
                    image: productData.images?.[0] || productData.imageUrl || productData.image || item.image || '',
                    color: item.color || null,
                    storage: item.storage || null,
                    warrantyType: warrantyInfo?.warrantyType || 'none',
                    warrantyMonths: warrantyInfo?.warrantyMonths || 0,
                    imeis: [], // To be filled by Admin later
                });

                subtotal_amount += finalPrice * quantity;
            }

            if (subtotal_amount <= 0) {
                throw new Error('Tổng tiền đơn hàng không hợp lệ.');
            }

            // ==========================================
            // TỪ ĐÂY TRỞ XUỐNG CHỈ CÓ WRITE (NO MORE READS)
            // ==========================================

            // Tạo reference mới cho order
            const orderRef = db.collection('orders').doc();
            orderRefId = orderRef.id;

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
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            };

            // Ghi order
            transaction.set(orderRef, order);

            // Gom nhóm theo productId để chống payload manipulation
            const groupedItems = new Map<string, { name: string; totalQty: number }>();
            for (const item of normalizedItems) {
                const existing = groupedItems.get(item.productId);
                if (existing) {
                    existing.totalQty += item.quantity;
                } else {
                    groupedItems.set(item.productId, { name: item.productName, totalQty: item.quantity });
                }
            }

            // Cập nhật tồn kho (Stock & Held) + Audit Trail
            for (const [productId, group] of groupedItems.entries()) {
                const productRef = db.collection('products').doc(productId);
                const currentData = productDocs.get(productId)!;
                const d = currentData.data()!;
                const currentHeld = d.held || 0;
                
                transaction.update(productRef, {
                    held: currentHeld + group.totalQty
                });
            }

            // Đồng bộ Customer CRM
            if (customerRef && customerSnap) {
                if (!customerSnap.exists) {
                    // Mới tạo → Không cộng aggregate vì Pending
                    transaction.set(customerRef, {
                        phone: normalizedPhone,
                        name: name.trim() || 'Khách lẻ',
                        address: '',
                        totalSpent: 0,
                        totalOrders: 0,
                        totalRepairs: 0,
                        totalAppointments: 0,
                        lastVisit: FieldValue.serverTimestamp(),
                        createdAt: FieldValue.serverTimestamp(),
                        updatedAt: FieldValue.serverTimestamp(),
                        tags: [],
                    });
                } else {
                    const currentData = customerSnap.data()!;
                    const updateData: Record<string, unknown> = {
                        updatedAt: FieldValue.serverTimestamp(),
                        lastVisit: FieldValue.serverTimestamp(),
                    };
                    
                    if (name.trim() !== '' && name.trim() !== 'Khách lẻ' && name.trim() !== currentData.name) {
                        updateData.name = name.trim();
                    }
                    
                    transaction.update(customerRef, updateData);
                }
            }
        });

        return NextResponse.json({
            success: true,
            orderId: orderRefId,
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
