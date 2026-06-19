import type { FirestoreDateValue } from './common';

export interface ImportReceiptItem {
    productId: string;
    productName: string;
    quantity: number;
    importPrice: number; // Giá nhập đợt này
    oldCostPrice?: number; // Giá vốn cũ để tính dự báo
    quality?: string;    // Phân loại: Zin, Loại 1, Loại 2, Bóc máy
    status?: 'requested' | 'approved' | 'ordered' | 'in_stock' | 'unavailable' | 'selected';
    availability?: 'in_stock' | 'unavailable';
    supplier?: string;
    supplierId?: string;
    ticketId?: string;
    partLineId?: string;
    allocatedHeldQuantity?: number;
    surplusQuantity?: number;
    unlinkedReason?: 'missing_line' | 'inactive_line' | 'already_allocated';
}

// ── Customer Reviews ──

export interface ImportReceipt {
    id: string;
    lotCode?: string;
    supplier: string;
    supplierId?: string;         // Link tới collection suppliers
    items: ImportReceiptItem[];
    totalAmount: number;
    note?: string;
    receiptType?: 'component' | 'retail';
    status: 'draft' | 'ordered' | 'completed';
    paymentStatus?: 'paid' | 'partial' | 'unpaid'; // Trạng thái thanh toán NCC
    paidAmount?: number;         // Số tiền đã trả NCC
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
    completedAt?: FirestoreDateValue;
}

// ── Commission (Hoa hồng) ──

export interface InventoryLog {
    id: string;
    productId: string;
    productName: string;
    quantity: number;           // Dương = nhập/trả, Âm = xuất/bán
    costPriceAtLog: number;     // Giá vốn tại thời điểm thao tác
    type: 'IMPORT' | 'SALE' | 'WEB_ORDER'
    | 'REPAIR_USE' | 'REPAIR_REFUND' | 'REPAIR_RELEASE' | 'REPAIR_RETURN'
    | 'TECH_ISSUE' | 'TECH_RETURN'
    | 'ORDER_CANCEL' | 'ORDER_COMPLETE' | 'ORDER_REACTIVATE';
    referenceId: string;
    referenceType: 'import_receipt' | 'order' | 'repair';
    lotsDeducted?: { lotCode: string | null; supplierId: string | null; qty: number }[];
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
}

// ── Inventory Lot (Trạng thái lô hàng) ──

export interface InventoryLot {
    id: string;
    lotCode: string;             // PN-YYMM-XXXX
    productId: string;
    supplierId: string | null;
    importPrice: number;
    initialQuantity: number;
    remainingQuantity: number;
    status: 'active' | 'empty';
    createdAt: FirestoreDateValue;
    updatedAt: FirestoreDateValue;
}

// ── Supplier (Nhà cung cấp) ──

export interface Supplier {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    taxCode?: string;           // Mã số thuế
    bankAccount?: string;       // Số tài khoản
    bankName?: string;
    contactPerson?: string;     // Người liên hệ
    companyName?: string;
    supplierType?: string;
    website?: string;
    paymentTermsDays?: number;
    assignedOwner?: string;
    tags?: string[];
    totalDebt: number;          // Tổng công nợ hiện tại
    note?: string;
    isActive: boolean;
    createdAt: FirestoreDateValue;
    updatedAt: FirestoreDateValue;
}

// ── Supplier Transaction (Lịch sử giao dịch NCC) ──

export interface SupplierTransaction {
    id: string;
    supplierId: string;
    supplierName: string;
    type: 'IMPORT' | 'PAYMENT';       // Nhập hàng tạo nợ | Thanh toán giảm nợ
    amount: number;                     // Số tiền giao dịch
    importReceiptId?: string;           // Link tới phiếu nhập hàng (khi type=IMPORT)
    paymentMethod?: string;             // Phương thức thanh toán (khi type=PAYMENT)
    note?: string;
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
}

// ── Accessory Discount Rule (Cấu hình giảm giá phụ kiện) ──
