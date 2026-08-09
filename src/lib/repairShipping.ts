export const REPAIR_SHIPPING_MODES = [
    'customer_paid_now',
    'shop_absorbs',
    'shop_advance_on_credit',
] as const;

export type RepairShippingMode = typeof REPAIR_SHIPPING_MODES[number];
export type RepairShippingPaymentMethod = 'CASH' | 'BANK';

export interface RepairShippingInput {
    repairTicketId?: string;
    mode: RepairShippingMode;
    fee: number;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
    billingCustomerId?: string;
    shopPaymentMethod?: RepairShippingPaymentMethod;
    note?: string;
}

function readText(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function readPositiveAmount(value: unknown) {
    const amount = Math.round(Number(value) || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Phí ship phải lớn hơn 0.');
    }
    return amount;
}

function readShopPaymentMethod(value: unknown): RepairShippingPaymentMethod | undefined {
    const method = readText(value, 12).toUpperCase();
    if (!method) return undefined;
    if (method === 'CASH' || method === 'BANK') return method;
    throw new Error('Shop chỉ có thể thanh toán ship bằng tiền mặt hoặc chuyển khoản.');
}

/** Normalizes the POS shipping contract before checkout writes (supports repairs & retail product orders). */
export function readRepairShippingInput(
    value: unknown,
    repairTicketIds: Set<string>,
    hasRetailProducts = false,
): RepairShippingInput | null {
    if (value === undefined || value === null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Thông tin phí ship không hợp lệ.');
    }

    const raw = value as Record<string, unknown>;
    const repairTicketId = readText(raw.repairTicketId, 160);
    const mode = readText(raw.mode, 64) as RepairShippingMode;

    if (!REPAIR_SHIPPING_MODES.includes(mode)) {
        throw new Error('Chế độ giao hàng không hợp lệ.');
    }

    if (repairTicketIds.size > 0) {
        if (repairTicketIds.size > 1) {
            throw new Error('Mỗi lần thanh toán ship chỉ áp dụng cho đúng một phiếu sửa chữa.');
        }
        if (!repairTicketId || !repairTicketIds.has(repairTicketId)) {
            throw new Error('Phí ship phải gắn với đúng phiếu sửa chữa trong giỏ POS.');
        }
    } else {
        if (!hasRetailProducts) {
            throw new Error('Không tìm thấy sản phẩm hoặc phiếu sửa chữa để áp dụng giao hàng.');
        }
    }

    const fee = mode === 'customer_paid_now'
        ? Math.max(0, Math.round(Number(raw.fee) || 0))
        : readPositiveAmount(raw.fee);
    const recipientName = readText(raw.recipientName, 120);
    const recipientPhone = readText(raw.recipientPhone, 40);
    const recipientAddress = readText(raw.recipientAddress, 500);
    if (!recipientName || !recipientPhone || !recipientAddress) {
        throw new Error('Vui lòng nhập đủ người nhận, số điện thoại và địa chỉ giao hàng.');
    }

    const shopPaymentMethod = readShopPaymentMethod(raw.shopPaymentMethod);
    const billingCustomerId = readText(raw.billingCustomerId, 160);
    if (mode !== 'customer_paid_now' && !shopPaymentMethod) {
        throw new Error('Vui lòng chọn kênh shop thanh toán phí ship.');
    }
    if (mode === 'shop_advance_on_credit' && !billingCustomerId) {
        throw new Error('Vui lòng chọn mã khách/đối tác để ghi nợ phí ship shop ứng hộ.');
    }

    return {
        ...(repairTicketId ? { repairTicketId } : {}),
        mode,
        fee,
        recipientName,
        recipientPhone,
        recipientAddress,
        ...(billingCustomerId ? { billingCustomerId } : {}),
        ...(shopPaymentMethod ? { shopPaymentMethod } : {}),
        ...(readText(raw.note, 500) ? { note: readText(raw.note, 500) } : {}),
    };
}
