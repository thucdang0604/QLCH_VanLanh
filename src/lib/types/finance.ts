import type { FirestoreDateValue } from './common';

export interface CommissionPriceRange {
    min: number;
    max?: number;
    amount: number;
}

export interface CommissionRule {
    id: string;
    name: string;
    type: 'repair' | 'order' | 'all';
    calculationMode?: 'percentage' | 'fixed' | 'fixed_by_price_range';
    priceRanges?: CommissionPriceRange[];
    percentage: number; // % hoa hồng
    fixedAmount?: number; // Số tiền cố định (nếu có)
    hierarchyLevel: 1 | 2 | 3; // 1=Chung, 2=Danh mục, 3=SP cụ thể
    targetType: 'general' | 'category' | 'specific'; // Loại target
    targetValue?: string; // Tên danh mục hoặc productId
    isActive: boolean;
    applyAfterDiscount?: boolean; // Nếu true: tính hoa hồng sau khi trừ đi các phụ kiện khuyến mãi
    createdAt: FirestoreDateValue;
}

export interface Commission {
    id: string;
    staffId: string;
    staffName: string;
    ruleId: string;
    sourceType: 'repair' | 'order';
    sourceId: string;    // repair/order ID
    amount: number;      // Tiền hoa hồng
    baseAmount: number;  // Tiền gốc (doanh thu)
    createdAt: FirestoreDateValue;
}

// ── Warranty Configuration (Cấu hình bảo hành) ──

export interface Expense {
    id: string;
    category: 'rent' | 'utilities' | 'supplies' | 'salary' | 'supplier_payment' | 'other';
    description: string;
    amount: number;
    date: FirestoreDateValue;
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
}

// ── Inventory Audit Log (Nhật ký kho) ──
