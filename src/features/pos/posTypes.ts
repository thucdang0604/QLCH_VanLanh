export interface OrderLineItem {
    productId: string;
    productName: string;
    product_id?: string;
    product_name?: string;
    quantity: number;
    price: number;
    costPrice?: number;
}

export interface LastOrderData {
    id: string;
    customer_info: { name: string; phone: string; email?: string; city?: string; district?: string; ward?: string; address?: string };
    items: OrderLineItem[];
    total_amount: number;
    discount_amount: number;
    subtotal_amount: number;
    shipping_fee: number;
    deposit_amount: number;
    payment_method: string;
    createdByName?: string;
    createdAt: Date;
}

export interface CartItem {
    cartItemId: string;
    productId: string;
    repairTicketId?: string;
    name: string;
    image?: string;
    originalPrice: number;
    sellingPrice: number;
    costPrice?: number;
    quantity: number;
    isRepairTicket?: boolean;
    warrantyType?: string;
    imeis?: string[];
    lotCode?: string;
}

export interface RepairTicketInfo {
    id: string;
    customerName: string;
    customerPhone: string;
    deviceModel: string;
    status: string;
    parts: { productName: string; partType?: string; unitPriceAtUse?: number; status?: string; quantity?: number }[];
    paymentAmount: number;
    paymentLaborCost: number;
    paymentStatus: string;
    gifts?: string[];
    issues?: { estimatedPrice?: number }[];
}

export interface DiscountDetail {
    productName: string;
    discountAmount: number;
    ruleName: string;
}

export interface VoucherStatus {
    message: string;
    type: 'success' | 'error';
}

export interface AppliedVoucher {
    code: string;
    type: string;
    value: number;
    maxDiscount?: number | null;
}
