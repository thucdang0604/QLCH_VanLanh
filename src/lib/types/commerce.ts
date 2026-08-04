import type { FirestoreDateValue, PaymentHistoryEntry } from './common';
import type { ContactMethod, ContactMethodType } from './contact';
import type { PosPaymentBreakdownEntry } from '@/lib/posPaymentBreakdown';

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
    identityMode?: 'guest' | 'existing' | 'verified_phone';
    phoneVerifiedAt?: FirestoreDateValue;
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
    contactVerification?: {
        method: 'phone_otp';
        phone: string;
        verifiedAt?: FirestoreDateValue;
        verifiedBy?: string;
    };
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
    payment_method?: 'COD' | 'Bank' | 'Momo' | 'Card' | 'Installment' | 'Debt' | 'QR' | 'CASH' | 'BANK' | 'MOMO' | 'CARD' | 'INSTALLMENT' | 'DEBT' | 'MIXED';
    deposit_payment_method?: 'CASH' | 'BANK' | 'MOMO' | 'QR' | 'CARD';
    paymentBreakdown?: PosPaymentBreakdownEntry[];
    paymentStatus?: 'paid' | 'unpaid' | 'debt' | 'refunded';
    shippingFee?: number;
    shipping_fee?: number;
    repairShipping?: {
        repairTicketId: string;
        mode: 'customer_paid_now' | 'shop_absorbs' | 'shop_advance_on_credit';
        fee: number;
        customerCharge: number;
        recipientName: string;
        recipientPhone: string;
        recipientAddress: string;
        billingCustomerId?: string;
        shopPaymentMethod?: 'CASH' | 'BANK';
        shippingAdvanceOrderId?: string;
        note?: string;
    };
    isShippingAdvance?: boolean;
    shippingAdvanceRepairTicketId?: string;
    parentOrderId?: string;
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
