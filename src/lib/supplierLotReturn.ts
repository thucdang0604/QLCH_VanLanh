export type SupplierLotReturnPlanInput = {
    quantity: unknown;
    lotRemainingQuantity: unknown;
    productStock: unknown;
    productHeld: unknown;
    productCostPrice: unknown;
    landedUnitCost: unknown;
    supplierCreditUnitCost: unknown;
};

export type SupplierLotReturnPlan = {
    quantity: number;
    nextLotRemainingQuantity: number;
    nextLotStatus: 'active' | 'empty';
    nextProductStock: number;
    nextProductCostPrice: number;
    returnedCarryingAmount: number;
    supplierCreditAmount: number;
    nonRefundableFreightAmount: number;
};

function positiveInteger(value: unknown, label: string): number {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`${label} phải là số nguyên lớn hơn 0.`);
    }
    return quantity;
}

function nonNegativeNumber(value: unknown, label: string): number {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error(`${label} không hợp lệ.`);
    }
    return amount;
}

/**
 * Plans a supplier return from one physical FIFO lot without changing state.
 * The caller must apply every returned field in one Firestore transaction.
 */
export function planSupplierLotReturn(input: SupplierLotReturnPlanInput): SupplierLotReturnPlan {
    const quantity = positiveInteger(input.quantity, 'Số lượng trả');
    const lotRemainingQuantity = nonNegativeNumber(input.lotRemainingQuantity, 'Tồn còn lại của lô');
    const productStock = nonNegativeNumber(input.productStock, 'Tồn kho sản phẩm');
    const productHeld = nonNegativeNumber(input.productHeld, 'Số lượng đang giữ');
    const productCostPrice = nonNegativeNumber(input.productCostPrice, 'Giá vốn sản phẩm');
    const landedUnitCost = nonNegativeNumber(input.landedUnitCost, 'Giá vốn lô');
    const supplierCreditUnitCost = nonNegativeNumber(input.supplierCreditUnitCost, 'Giá đề nghị ghi giảm NCC');

    if (productStock < productHeld) {
        throw new Error('Tồn kho hiện tại thấp hơn số hàng đã giữ. Hãy đối soát kho trước khi trả NCC.');
    }
    if (quantity > lotRemainingQuantity) {
        throw new Error(`Lô chỉ còn ${lotRemainingQuantity} linh kiện có thể trả.`);
    }
    if (quantity > productStock - productHeld) {
        throw new Error('Số lượng trả vượt quá tồn khả dụng; không thể trả phần hàng đang giữ cho đơn hoặc phiếu sửa chữa.');
    }

    const returnedCarryingAmount = Math.round(landedUnitCost * quantity);
    const currentInventoryValue = Math.round(productStock * productCostPrice);
    if (returnedCarryingAmount > currentInventoryValue) {
        throw new Error('Giá trị tồn kho không khớp với giá vốn của lô. Hãy kiểm kê hoặc điều chỉnh dữ liệu trước khi trả NCC.');
    }

    const nextProductStock = productStock - quantity;
    const nextInventoryValue = currentInventoryValue - returnedCarryingAmount;
    const nextProductCostPrice = nextProductStock > 0
        ? Math.round(nextInventoryValue / nextProductStock)
        : 0;
    const supplierCreditAmount = Math.round(supplierCreditUnitCost * quantity);

    return {
        quantity,
        nextLotRemainingQuantity: lotRemainingQuantity - quantity,
        nextLotStatus: lotRemainingQuantity === quantity ? 'empty' : 'active',
        nextProductStock,
        nextProductCostPrice,
        returnedCarryingAmount,
        supplierCreditAmount,
        nonRefundableFreightAmount: Math.max(0, returnedCarryingAmount - supplierCreditAmount),
    };
}
