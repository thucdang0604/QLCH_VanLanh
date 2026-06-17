import type { FirestoreDateValue } from './common';

export interface AccessoryDiscountRule {
    id: string;
    name: string;                       // VD: "Giảm 40% cường lực khi thay màn"
    triggerServiceCategory: string;     // Danh mục DV kích hoạt (e.g., 'thay-man-hinh')
    triggerKeywords: string[];          // Keywords: ['thay màn', 'màn hình']
    discountType: 'percentage' | 'fixed';
    discountValue: number;              // 40 = giảm 40% | 50000 = giảm 50k
    targetProductCategory: string;      // Danh mục SP được giảm (e.g., 'cuong-luc')
    targetKeywords: string[];           // Keywords: ['cường lực', 'dán màn']
    maxDiscountAmount?: number;         // Giảm tối đa (VNĐ)
    isActive: boolean;
    createdAt: FirestoreDateValue;
    updatedAt: FirestoreDateValue;
}

// ── Product Review (Đánh giá sản phẩm) ──

export interface StackingRules {
    isExclusive: boolean;       // Nếu true → không dùng chung với bất kỳ ưu đãi nào
    stackWithPromo: boolean;    // Cho phép dùng chung với giá khuyến mãi (price_promo)
    stackWithTier: boolean;     // Cho phép dùng chung với ưu đãi hạng VIP
}

// ── Voucher (Mã giảm giá) ──

export interface Voucher {
    id: string;
    code: string;                       // Mã giảm giá (uppercase, unique)
    type: 'fixed' | 'percentage';       // Loại giảm giá
    value: number;                      // Giá trị giảm
    maxDiscount?: number;               // Giảm tối đa (cho loại %)
    minOrderValue?: number;             // Đơn tối thiểu để áp dụng
    expiryDate?: FirestoreDateValue;    // Ngày hết hạn
    usageLimit: number;                 // 0 = không giới hạn
    usedCount: number;                  // Đã dùng
    isActive: boolean;
    ownerId?: string | null;            // UID cá nhân (Bounty Program)
    stackingRules: StackingRules;
    createdAt: FirestoreDateValue;
    updatedAt: FirestoreDateValue;
}

// ── Master Hub Workflow (Repair Workflow) ──
