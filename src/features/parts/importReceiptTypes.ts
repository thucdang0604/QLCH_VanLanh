import type { FirestoreDateValue, Product } from '@/lib/types';
import type { ContactMethod, ContactMethodType } from '@/lib/types/contact';

export interface ImportReceiptItem {
    productId: string;
    productName: string;
    quantity: number;
    importPrice: number;
    quality?: string;
    oldCostPrice?: number;
    status?: 'requested' | 'approved' | 'ordered' | 'in_stock' | 'unavailable' | 'selected';
    availability?: 'in_stock' | 'unavailable';
    supplier?: string;
    supplierId?: string;
    ticketId?: string;
    partLineId?: string;
    requestKey?: string;
    allocatedHeldQuantity?: number;
    surplusQuantity?: number;
    unlinkedReason?: 'missing_line' | 'inactive_line' | 'already_allocated';
}

export interface ImportReceipt {
    id: string;
    supplier?: string;
    supplierId?: string;
    items: ImportReceiptItem[];
    totalAmount: number;
    note?: string;
    receiptType?: 'component' | 'retail';
    status: 'draft' | 'ordered' | 'completed';
    version?: number;
    paymentMethod?: 'paid' | 'cash' | 'bank' | 'debt' | string;
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
    completedAt?: FirestoreDateValue;
    repairTicketId?: string;
}

export interface SupplierOption {
    id: string;
    name: string;
    phone?: string;
    primaryContactType?: ContactMethodType | null;
    primaryContactValue?: string;
    contactMethods?: ContactMethod[];
    searchKeywords?: string[];
    totalDebt: number;
}

export interface NewPartInfo {
    model?: string;
    partType?: string;
    price_promo?: number | string;
    supplier?: string;
    categoryIds?: string[];
    [key: string]: unknown;
}

export interface ImportPreviewState {
    isOpen: boolean;
    receipt: ImportReceipt | null;
    newParts: Record<string, NewPartInfo>;
}

export type ProductWithId = Product & { id: string };
