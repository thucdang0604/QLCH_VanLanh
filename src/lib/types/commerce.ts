import type { FirestoreDateValue, PaymentHistoryEntry } from './common';

export interface OrderItem {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    image?: string;
    imeis?: string[];
    lotCode?: string;
    warrantyMonths?: number;
    warrantyStartedAt?: number;
    warrantyExpiresAt?: number;
    warrantyType?: 'none' | 'warrantyDevice' | 'warrantyAccessory';
}

export interface CustomerInfo {
    name: string;
    phone: string;
    email?: string;
    address: string;
    note?: string;
}

export interface Customer {
    id: string; // phone
    phone: string;
    name: string;
    type?: 'retail' | 'wholesale';
    totalSpent?: number;
    totalOrders?: number;
    totalRepairs?: number;
    totalDebt?: number;
    lastOrderDate?: FirestoreDateValue;
    lastVisit?: FirestoreDateValue;
    createdAt?: FirestoreDateValue;
    updatedAt?: FirestoreDateValue;
    tags?: string[];
    email?: string;
    address?: string;
    note?: string;
}

export interface CustomerTransaction {
    id: string;
    customerId: string; // phone
    customerName: string;
    type: 'DEBT' | 'PAYMENT';
    amount: number;
    orderIds?: string[]; // Orders this transaction links to or clears
    note?: string;
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
}

export interface Order {
    id: string;
    customer_info?: CustomerInfo;
    customer?: { name: string; phone: string; email?: string; address?: string; note?: string; };
    items: OrderItem[];
    subtotal_amount?: number;
    discount_amount?: number;
    total_amount: number;
    status: 'Pending' | 'Confirmed' | 'Shipping' | 'Completed' | 'Cancelled';
    is_vat_exported: boolean;
    payment_method?: 'COD' | 'Bank' | 'Momo' | 'Card' | 'Installment' | 'Debt' | 'QR';
    paymentStatus?: 'paid' | 'unpaid' | 'debt';
    shippingFee?: number;
    linkedRepairIds?: string[];
    deposit_amount?: number;
    paymentHistory?: PaymentHistoryEntry[];
    source?: 'web' | 'pos';
    createdBy?: string;
    createdByName?: string;
    assignedSellerId?: string;
    assignedSellerName?: string;
    assignedSellerAt?: FirestoreDateValue;
    voucherCode?: string;
    voucherDiscount?: number;
    discountSource?: 'voucher' | 'tier';
    createdAt: Date;
    updatedAt: Date;
    completedAt?: FirestoreDateValue;
}

// Article types
