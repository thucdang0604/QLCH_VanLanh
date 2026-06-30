import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { isRateLimited } from '@/lib/rateLimit';
import { PRODUCT_STATUS, isProductArchived } from '@/lib/productLifecycle';
import { calculateCustomerTier, getTierDiscountPercent } from '@/lib/customerTiers';
import { normalizeVietnamPhone } from '@/lib/phone';
import { reserveSequentialDocumentId } from '@/lib/serverDocumentIds';

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 phút

async function verifyVoucherProofPhone(token: unknown, expectedPhone: string) {
    if (!token || typeof token !== 'string') {
        throw new Error('Personal voucher requires OTP phone verification before checkout.');
    }

    let decodedToken;
    try {
        decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (error) {
        console.error('Checkout voucher proof token error:', error);
        throw new Error('Personal voucher verification expired. Please verify the phone number again.');
    }

    const tokenPhone = typeof decodedToken.phone_number === 'string'
        ? normalizeVietnamPhone(decodedToken.phone_number)
        : null;
    if (!tokenPhone || tokenPhone.local !== expectedPhone) {
        throw new Error('Personal voucher verification does not match the checkout phone number.');
    }

    return tokenPhone.local;
}

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

        const { idempotencyKey, name, phone, note, items, voucherCode, voucherProofToken } = body;

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

        const normalizedPhoneResult = normalizeVietnamPhone(phone);
        if (!normalizedPhoneResult) {
            return NextResponse.json(
                { error: 'Số điện thoại không hợp lệ (VD: 0901234567).' },
                { status: 400 }
            );
        }
        const normalizedPhone = normalizedPhoneResult.local;

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
        let verifiedVoucherProofPhone: string | null = null;

        if (voucherCode && typeof voucherCode === 'string') {
            const voucherPreviewQuery = await db.collection('vouchers')
                .where('code', '==', voucherCode.trim().toUpperCase())
                .where('isActive', '==', true)
                .limit(1)
                .get();
            const voucherOwnerId = voucherPreviewQuery.docs[0]?.data()?.ownerId;
            if (voucherOwnerId) {
                const voucherOwnerPhone = normalizeVietnamPhone(String(voucherOwnerId));
                if (!voucherOwnerPhone || voucherOwnerPhone.local !== normalizedPhone) {
                    throw new Error('Personal voucher can only be used by the verified owner phone number.');
                }
                verifiedVoucherProofPhone = await verifyVoucherProofPhone(voucherProofToken, normalizedPhone);
                if (verifiedVoucherProofPhone !== voucherOwnerPhone.local) {
                    throw new Error('Personal voucher verification does not match the voucher owner.');
                }
            }
        }
        
        const result = await db.runTransaction(async (transaction) => {
            if (idempotencyKey) {
                const opRef = db.collection('operation_requests').doc(String(idempotencyKey));
                const opSnap = await transaction.get(opRef);
                if (opSnap.exists) {
                    const data = opSnap.data();
                    if (data?.status === 'completed' && data.referenceId) {
                        return { orderId: String(data.referenceId), fromCache: true };
                    }
                    if (data?.type && data.type !== 'web_checkout') {
                        throw new Error('Ma chong gui trung da duoc dung cho thao tac khac.');
                    }
                }
            }

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

            // READ 4: Voucher (nếu có voucherCode)
            let voucherSnap: FirebaseFirestore.DocumentSnapshot | null = null;
            let voucherRef: FirebaseFirestore.DocumentReference | null = null;
            if (voucherCode && typeof voucherCode === 'string') {
                const voucherQuery = await db.collection('vouchers')
                    .where('code', '==', voucherCode.trim().toUpperCase())
                    .where('isActive', '==', true)
                    .limit(1)
                    .get();
                if (!voucherQuery.empty) {
                    voucherRef = voucherQuery.docs[0].ref;
                    voucherSnap = await transaction.get(voucherRef);
                }
            }

            // READ 5: Tier settings (để tính tier discount)
            const tierSettingsSnap = await transaction.get(db.collection('system_config').doc('tier_settings'));

            // ── Tính Voucher Discount ──
            let voucherDiscountAmount = 0;
            let appliedVoucherCode: string | undefined;
            let appliedPersonalVoucher = false;
            const voucherData = voucherSnap?.data();
            if (voucherData && voucherSnap?.exists) {
                // Validate expiry
                if (voucherData.expiryDate) {
                    const exp = voucherData.expiryDate.toDate ? voucherData.expiryDate.toDate() : new Date(voucherData.expiryDate);
                    if (exp.getTime() < Date.now()) {
                        throw new Error('Mã Voucher đã hết hạn.');
                    }
                }
                // Validate usage limit
                if (voucherData.usageLimit > 0 && voucherData.usedCount >= voucherData.usageLimit) {
                    throw new Error('Mã Voucher đã hết lượt sử dụng.');
                }
                // Validate min order value
                if (voucherData.minOrderValue && subtotal_amount < voucherData.minOrderValue) {
                    throw new Error(`Đơn hàng tối thiểu ${voucherData.minOrderValue.toLocaleString('vi-VN')}đ để sử dụng mã này.`);
                }
                // Validate personal bounty voucher owner on the server, not only in preview API.
                if (voucherData.ownerId) {
                    const voucherOwnerPhone = normalizeVietnamPhone(String(voucherData.ownerId));
                    if (!voucherOwnerPhone
                        || voucherOwnerPhone.local !== normalizedPhone
                        || verifiedVoucherProofPhone !== normalizedPhone
                        || verifiedVoucherProofPhone !== voucherOwnerPhone.local) {
                        throw new Error('Personal voucher requires verified phone ownership at checkout.');
                    }
                    appliedPersonalVoucher = true;
                }

                // Tính discount
                if (voucherData.type === 'fixed') {
                    voucherDiscountAmount = Math.min(voucherData.value, subtotal_amount);
                } else {
                    voucherDiscountAmount = Math.round(subtotal_amount * voucherData.value / 100);
                    if (voucherData.maxDiscount && voucherDiscountAmount > voucherData.maxDiscount) {
                        voucherDiscountAmount = voucherData.maxDiscount;
                    }
                }
                appliedVoucherCode = voucherData.code;
            }

            // ── Tính Tier Discount ──
            let tierDiscountAmount = 0;
            const customerTotalSpent = customerSnap?.exists ? (customerSnap.data()?.totalSpent || 0) : 0;
            const customerTier = calculateCustomerTier(customerTotalSpent);
            // Đọc tier settings từ Firestore (ưu tiên) hoặc fallback code
            let tierPercent = getTierDiscountPercent(customerTier);
            if (tierSettingsSnap.exists && tierSettingsSnap.data()?.tiers) {
                const tierConfig = tierSettingsSnap.data()!.tiers.find(
                    (t: { name: string; discountPercent: number }) => t.name === customerTier
                );
                if (tierConfig) tierPercent = tierConfig.discountPercent;
            }
            if (tierPercent > 0) {
                tierDiscountAmount = Math.round(subtotal_amount * tierPercent / 100);
            }

            // ── Stacking Engine ──
            let discount_amount = 0;
            let discountSource: 'voucher' | 'tier' | undefined;
            const stackingRules = voucherData?.stackingRules || { isExclusive: false, stackWithPromo: true, stackWithTier: false };

            if (appliedVoucherCode && stackingRules.isExclusive) {
                // Exclusive voucher — chỉ dùng voucher, bỏ tier
                discount_amount = voucherDiscountAmount;
                discountSource = 'voucher';
            } else if (appliedVoucherCode && tierDiscountAmount > 0) {
                if (stackingRules.stackWithTier) {
                    // Cộng dồn cả hai
                    discount_amount = voucherDiscountAmount + tierDiscountAmount;
                    discountSource = 'voucher'; // ghi nhận voucher là nguồn chính
                } else {
                    // Chọn cái lớn hơn
                    if (voucherDiscountAmount >= tierDiscountAmount) {
                        discount_amount = voucherDiscountAmount;
                        discountSource = 'voucher';
                    } else {
                        discount_amount = tierDiscountAmount;
                        discountSource = 'tier';
                        appliedVoucherCode = undefined; // Không dùng voucher
                    }
                }
            } else if (appliedVoucherCode) {
                discount_amount = voucherDiscountAmount;
                discountSource = 'voucher';
            } else if (tierDiscountAmount > 0) {
                discount_amount = tierDiscountAmount;
                discountSource = 'tier';
            }

            // Đảm bảo discount không vượt quá subtotal
            discount_amount = Math.min(discount_amount, subtotal_amount);
            const total_amount = subtotal_amount - discount_amount;

            // ==========================================
            // TỪ ĐÂY TRỞ XUỐNG CHỈ CÓ WRITE (NO MORE READS)
            // ==========================================

            const orderAllocation = await reserveSequentialDocumentId(transaction, db, {
                collectionName: 'orders',
                prefix: 'DH',
            });
            const orderRef = orderAllocation.ref;
            orderRefId = orderAllocation.id;

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
                discount_amount,
                total_amount,
                ...(appliedVoucherCode ? { voucherCode: appliedVoucherCode, voucherDiscount: voucherDiscountAmount } : {}),
                ...(discountSource ? { discountSource } : {}),
                status: 'Pending',
                source: 'web',
                is_vat_exported: false,
                payment_method: 'COD',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            };

            // Ghi order
            orderAllocation.commitCounter();
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

            // Tăng usedCount cho Voucher (nếu đã áp dụng)
            if (appliedVoucherCode && voucherRef) {
                transaction.update(voucherRef, {
                    usedCount: FieldValue.increment(1),
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
                        ...(appliedPersonalVoucher && appliedVoucherCode ? {
                            missions: {
                                bounty_redeemed: true,
                                bountyVoucherCode: appliedVoucherCode,
                                redeemedAt: FieldValue.serverTimestamp(),
                                redeemedOrderId: orderRefId,
                            },
                        } : {}),
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

                    if (appliedPersonalVoucher && appliedVoucherCode) {
                        updateData['missions.bounty_redeemed'] = true;
                        updateData['missions.bountyVoucherCode'] = appliedVoucherCode;
                        updateData['missions.redeemedAt'] = FieldValue.serverTimestamp();
                        updateData['missions.redeemedOrderId'] = orderRefId;
                    }
                    
                    transaction.update(customerRef, updateData);
                }
            }

            if (idempotencyKey) {
                transaction.set(db.collection('operation_requests').doc(String(idempotencyKey)), {
                    status: 'completed',
                    completedAt: FieldValue.serverTimestamp(),
                    type: 'web_checkout',
                    referenceId: orderRefId,
                });
            }

            return { orderId: orderRefId, fromCache: false };
        });

        return NextResponse.json({
            success: true,
            orderId: result.orderId,
            fromCache: result.fromCache,
            message: 'Đặt hàng thành công!',
        });
    } catch (error) {
        console.error('Checkout error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Lỗi hệ thống. Vui lòng thử lại sau.' },
            { status: 400 }
        );
    }
}
