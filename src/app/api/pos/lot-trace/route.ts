import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/apiAuth';
import { ApiError, getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { parseInventoryLotTraceCode } from '@/lib/inventoryLotTraceCode';

function stringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
}

/**
 * Resolves a VL1 QR label for the POS without exposing supplier or cost data.
 * The final stock deduction is still revalidated by the checkout transaction.
 */
export const GET = withApi({
    name: 'pos/lot-trace',
    onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error, 500)),
}, async (request: NextRequest, context) => {
    await requirePermission(request, 'manage_orders');

    const inventoryLotId = parseInventoryLotTraceCode(request.nextUrl.searchParams.get('code'));
    if (!inventoryLotId) {
        throw new ApiError('Mã QR lô không hợp lệ.', 400, 'invalid_lot_trace');
    }

    const db = getAdminDb();
    const lotSnap = await db.collection('inventory_lots').doc(inventoryLotId).get();
    if (!lotSnap.exists) {
        throw new ApiError('Không tìm thấy lô hàng từ mã QR.', 404, 'inventory_lot_not_found');
    }

    const lot = lotSnap.data() || {};
    const productId = typeof lot.productId === 'string' ? lot.productId.trim() : '';
    if (!productId) {
        throw new ApiError('Dòng lô này không có sản phẩm hợp lệ.', 409, 'inventory_lot_product_missing');
    }

    const productSnap = await db.collection('products').doc(productId).get();
    if (!productSnap.exists) {
        throw new ApiError('Sản phẩm của lô không còn tồn tại.', 409, 'inventory_lot_product_not_found');
    }

    const product = productSnap.data() || {};
    const lotRemainingQuantity = Math.max(0, Math.floor(Number(lot.remainingQuantity) || 0));
    const productAvailableQuantity = Math.max(0, Math.floor((Number(product.stock) || 0) - (Number(product.held) || 0)));

    return context.json({
        success: true,
        trace: {
            inventoryLotId,
            lotCode: typeof lot.lotCode === 'string' ? lot.lotCode : '',
            availableQuantity: Math.min(lotRemainingQuantity, productAvailableQuantity),
        },
        product: {
            id: productSnap.id,
            sku: typeof product.sku === 'string' ? product.sku : undefined,
            barcode: typeof product.barcode === 'string' ? product.barcode : undefined,
            productCode: typeof product.productCode === 'string' ? product.productCode : undefined,
            qrCodes: stringArray(product.qrCodes),
            name: typeof product.name === 'string' ? product.name : productId,
            brand: typeof product.brand === 'string' ? product.brand : '',
            category: typeof product.category === 'string' ? product.category : '',
            categoryIds: stringArray(product.categoryIds),
            price_original: Number(product.price_original) || 0,
            price_promo: Number(product.price_promo) || 0,
            images: stringArray(product.images),
            imageUrl: typeof product.imageUrl === 'string' ? product.imageUrl : undefined,
            status: typeof product.status === 'string' ? product.status : 'inactive',
            isProposed: product.isProposed === true,
            stock: Number(product.stock) || 0,
            held: Number(product.held) || 0,
            warrantyType: typeof product.warrantyType === 'string' ? product.warrantyType : undefined,
            warrantyMonths: Number.isFinite(Number(product.warrantyMonths)) ? Number(product.warrantyMonths) : undefined,
            condition: typeof product.condition === 'string' ? product.condition : undefined,
            partType: typeof product.partType === 'string' ? product.partType : undefined,
        },
    });
});
