import type { FirestoreDateValue, PaymentHistoryEntry } from './common';
import type { ContactMethod, ContactMethodType } from './contact';

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
    customerId?: string;
    name: string;
    phone: string;
    contactType?: ContactMethodType;
    contactLabel?: string;
    contactValue?: string;
    email?: string;
    address: string;
    note?: string;
}

export interface Customer {
    id: string; // legacy docs may still use phone as id
    code?: string;
    legacyPhoneId?: string;
    phone: string;
    primaryPhone?: string;
    name: string;
    type?: 'retail' | 'wholesale';
    primaryContactType?: ContactMethodType;
    primaryContactValue?: string;
    contactMethods?: ContactMethod[];
    searchKeywords?: string[];
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
    customerId: string; // legacy transactions may still store phone
    customerPhone?: string;
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
    customer?: { id?: string; customerId?: string; name: string; phone: string; contactLabel?: string; contactType?: ContactMethodType; contactValue?: string; email?: string; address?: string; note?: string; };
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
