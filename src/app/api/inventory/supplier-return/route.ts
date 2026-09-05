import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePermission } from '@/lib/apiAuth';
import { ApiError, getApiErrorMessage, getApiErrorStatus, withApi } from '@/lib/api/handler';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { reserveSequentialDocumentIdGroups } from '@/lib/serverDocumentIds';
import { planSupplierLotReturn } from '@/lib/supplierLotReturn';

type SupplierLotReturnRequestBody = {
    lotId?: unknown;
    quantity?: unknown;
    reason?: unknown;
    idempotencyKey?: unknown;
};

function requiredId(value: unknown, label: string): string {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id || id.length > 180) {
        throw new ApiError(`${label} không hợp lệ.`, 400);
    }
    return id;
}

function requiredReason(value: unknown): string {
    const reason = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    if (reason.length < 3 || reason.length > 300) {
        throw new ApiError('Lý do trả NCC phải có từ 3 đến 300 ký tự.', 400);
    }
    return reason;
}

function numeric(value: unknown, fallback = 0): number {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
}

export const POST = withApi({
    name: 'inventory/supplier-return',
    onError: (error, context) => context.error(getApiErrorMessage(error), getApiErrorStatus(error, 500)),
}, async (request: NextRequest, context) => {
    const caller = await requirePermission(request, 'manage_inventory');
    const body = await context.readJson<SupplierLotReturnRequestBody>(request);
    const lotId = requiredId(body.lotId, 'Lô hàng');
    const idempotencyKey = requiredId(body.idempotencyKey, 'Mã chống trùng thao tác');
    const reason = requiredReason(body.reason);

    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new ApiError('Số lượng trả phải là số nguyên lớn hơn 0.', 400);
    }

    const db = getAdminDb();
    const lotRef = db.collection('inventory_lots').doc(lotId);
    const operationRef = db.collection('operation_requests').doc(idempotencyKey);

    const result = await db.runTransaction(async (tx) => {
        const [operationSnap, lotSnap] = await tx.getAll(operationRef, lotRef);
        if (operationSnap.exists) {
            const operation = operationSnap.data() || {};
            if (
                operation.status === 'completed'
                && operation.type === 'supplier_lot_return'
                && operation.actorId === caller.uid
                && operation.lotId === lotId
                && Number(operation.quantity) === quantity
                && operation.reason === reason
            ) {
                return {
                    success: true,
                    supplierReturnId: String(operation.referenceId || ''),
                    supplierCreditAmount: numeric(operation.supplierCreditAmount),
                    fromCache: true,
                };
            }
            throw new ApiError('Mã chống trùng đã được dùng cho thao tác khác.', 409);
        }
        if (!lotSnap.exists) {
            throw new ApiError('Không tìm thấy lô hàng cần trả.', 404);
        }

        const lot = lotSnap.data() || {};
        const productId = requiredId(lot.productId, 'Sản phẩm của lô');
        const supplierId = requiredId(lot.supplierId, 'Nhà cung cấp của lô');
        const productRef = db.collection('products').doc(productId);
        const supplierRef = db.collection('suppliers').doc(supplierId);
        const [productSnap, supplierSnap] = await tx.getAll(productRef, supplierRef);

        if (!productSnap.exists) {
            throw new ApiError('Sản phẩm của lô không còn tồn tại.', 409);
        }
        if (!supplierSnap.exists) {
            throw new ApiError('Nhà cung cấp gốc của lô không còn tồn tại.', 409);
        }

        const product = productSnap.data() || {};
        const supplier = supplierSnap.data() || {};
        const landedUnitCost = numeric(lot.landedUnitCost, numeric(lot.importPrice));
        const hasRecordedPurchaseCost = lot.purchaseUnitCost !== null
            && lot.purchaseUnitCost !== undefined
            && Number.isFinite(Number(lot.purchaseUnitCost))
            && Number(lot.purchaseUnitCost) >= 0;
        const supplierCreditUnitCost = hasRecordedPurchaseCost
            ? numeric(lot.purchaseUnitCost)
            : landedUnitCost;

        let plan;
        try {
            plan = planSupplierLotReturn({
                quantity,
                lotRemainingQuantity: lot.remainingQuantity,
                productStock: product.stock,
                productHeld: product.held,
                productCostPrice: product.costPrice,
                landedUnitCost,
                supplierCreditUnitCost,
            });
        } catch (error) {
            throw new ApiError(getApiErrorMessage(error), 409);
        }

        // All state reads are complete before readable-ID allocation and writes.
        const reservations = await reserveSequentialDocumentIdGroups(tx, db, [
            { key: 'supplierReturn', collectionName: 'supplier_returns', prefix: 'SR', count: 1 },
            { key: 'inventoryLog', collectionName: 'inventory_logs', prefix: 'IL', count: 1 },
            { key: 'supplierTransaction', collectionName: 'supplier_transactions', prefix: 'ST', count: 1 },
        ]);
        const supplierReturnAllocation = reservations.get('supplierReturn')?.[0];
        const inventoryLogAllocation = reservations.get('inventoryLog')?.[0];
        const supplierTransactionAllocation = reservations.get('supplierTransaction')?.[0];
        if (!supplierReturnAllocation || !inventoryLogAllocation || !supplierTransactionAllocation) {
            throw new Error('Không thể cấp mã chứng từ trả NCC.');
        }

        const supplierReturnId = supplierReturnAllocation.id;
        const lotCode = typeof lot.lotCode === 'string' ? lot.lotCode : '';
        const importReceiptId = typeof lot.importReceiptId === 'string' ? lot.importReceiptId : null;
        const productName = String(product.name || lot.productName || productId);
        const supplierName = String(supplier.name || supplierId);
        const createdByName = String(caller.displayName || caller.name || caller.uid);
        const creditBasis = hasRecordedPurchaseCost ? 'purchase_unit_cost' : 'legacy_landed_cost';

        tx.update(lotRef, {
            remainingQuantity: plan.nextLotRemainingQuantity,
            status: plan.nextLotStatus,
            updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(productRef, {
            stock: plan.nextProductStock,
            costPrice: plan.nextProductCostPrice,
            updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(supplierReturnAllocation.ref, {
            lotId,
            lotCode,
            productId,
            productName,
            supplierId,
            supplierName,
            importReceiptId,
            quantity: plan.quantity,
            landedUnitCost,
            returnedCarryingAmount: plan.returnedCarryingAmount,
            supplierCreditUnitCost,
            supplierCreditAmount: plan.supplierCreditAmount,
            nonRefundableFreightAmount: plan.nonRefundableFreightAmount,
            creditBasis,
            settlementStatus: 'credit_pending',
            reason,
            createdBy: caller.uid,
            createdByName,
            createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(inventoryLogAllocation.ref, {
            productId,
            productName,
            quantity: -plan.quantity,
            costPriceAtLog: landedUnitCost,
            type: 'SUPPLIER_RETURN',
            referenceId: supplierReturnId,
            referenceType: 'supplier_return',
            lotId,
            lotCode,
            supplierId,
            lotsDeducted: [{ lotCode: lotCode || null, supplierId, qty: plan.quantity }],
            reason,
            createdBy: caller.uid,
            createdByName,
            createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(supplierTransactionAllocation.ref, {
            supplierId,
            supplierName,
            type: 'RETURN_CREDIT',
            amount: plan.supplierCreditAmount,
            supplierReturnId,
            importReceiptId,
            settlementStatus: 'credit_pending',
            note: `Ghi giảm chờ đối soát từ lô ${lotCode || lotId}: ${reason}`,
            createdBy: caller.uid,
            createdByName,
            createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(operationRef, {
            status: 'completed',
            type: 'supplier_lot_return',
            actorId: caller.uid,
            lotId,
            quantity: plan.quantity,
            reason,
            referenceId: supplierReturnId,
            supplierCreditAmount: plan.supplierCreditAmount,
            completedAt: FieldValue.serverTimestamp(),
        });

        supplierReturnAllocation.commitCounter();
        inventoryLogAllocation.commitCounter();
        supplierTransactionAllocation.commitCounter();

        return {
            success: true,
            supplierReturnId,
            supplierCreditAmount: plan.supplierCreditAmount,
            fromCache: false,
        };
    });

    return context.json(result);
});
