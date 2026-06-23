import type { FirestoreDateValue } from './common';

export interface Category {
    id: string;
    name: string;
    slug: string;
    type: 'retail' | 'service' | 'component';
    keywords: string[];
    icon?: string;
    displayCount?: string;
    subCategories?: string[]; // Used mainly for 'retail' to hold things like "Ốp lưng", "Cáp sạc"
    createdAt?: FirestoreDateValue;
    updatedAt?: FirestoreDateValue;
}

export interface TaxonomyNode {
    id: string; // The full path/slug, e.g., "dien-thoai/iphone/iphone-16"
    name: string; // Display name, e.g., "iPhone 16"
    slug: string; // Local slug, e.g., "iphone-16"
    icon?: string;
    seoKeywords?: string;
    seoDescription?: string;
    warrantyType?: 'none' | 'warrantyDevice' | 'warrantyRepair' | 'warrantyAccessory';
    warrantyMonths?: number;
    children?: TaxonomyNode[];
}

export interface Brand {
    id: string;
    name: string;
    logoUrl?: string;
    createdAt?: FirestoreDateValue;
    updatedAt?: FirestoreDateValue;
}

// Product types

export interface ProductSpecs {
    screen?: string;
    cpu?: string;
    ram?: string;
    storage?: string;
    battery?: string;
    camera?: string;
    [key: string]: string | undefined;
}

export interface Product {
    id: string;
    sku?: string; // Mã duy nhất dùng chung cho QR, barcode và tra cứu POS
    barcode?: string; // Đồng bộ với sku để tương thích dữ liệu cũ
    productCode?: string; // Đồng bộ với sku để tương thích dữ liệu cũ
    qrCodes?: string[]; // Tương thích dữ liệu cũ; dữ liệu mới chỉ lưu đúng một mã
    name: string;
    brand: string;
    category: typeof import('../constants').RETAIL_CATEGORIES[number] | string;
    categoryIds?: string[]; // E.g., ['dien-thoai', 'dien-thoai/iphone', 'dien-thoai/iphone/16']
    subCategory?: string;
    price_original: number;
    price_promo: number;
    costPrice?: number; // Giá vốn bình quân
    oldCostPrice?: number;
    supplier?: string; // Nguồn cung cấp
    specs: ProductSpecs;
    images: string[];
    imageUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
    status: 'active' | 'hidden' | 'inactive';
    condition?: 'new' | 'like-new' | 'used';
    isFlashSale?: boolean;
    warrantyType?: 'none' | 'warrantyDevice' | 'warrantyRepair' | 'warrantyAccessory';
    sold?: number;
    quality?: string;
    partType?: string;
    warrantyMonths?: number;
    description?: string;
    videoEmbedUrl?: string;
    stock?: number;
    held?: number;
    isProposed?: boolean; // Added for proposed products not yet in stock
    // ── Variant Grouping (hiển thị kiểu Điện Thoại Vui) ──
    seriesId?: string;           // Nhóm sản phẩm cùng dòng (e.g., 'iphone-16-pro-max')
    color?: string;              // Màu sắc (e.g., 'Titan Sa Mạc')
    storageCapacity?: string;    // Dung lượng (e.g., '256GB')
    conditionLabel?: string;     // Tình trạng chi tiết (e.g., 'Đã kích hoạt', 'Like New 99%')
    createdAt: Date;
    updatedAt: Date;
}

// Service types (Sửa chữa)

export interface Service {
    id: string;
    name: string;
    price_original: number;
    price_promo?: number;
    device_model: string;
    category: string;
    categoryIds?: string[]; // E.g., ['sua-chua', 'sua-chua/iphone']
    linkedProductCategoryIds?: string[]; // Suggested retail/accessory category for POS bundles.
    recommendedPartCategoryIds?: string[]; // Suggested component category for repair intake.
    description?: string;
    seoDescription?: string;
    warranty_text?: string;
    repair_time?: string;
    slug?: string;
    tags?: string[];
    videoEmbedUrl?: string;
    imageUrl?: string;
    images?: string[];
    isActive?: boolean;
    createdAt?: FirestoreDateValue;
    updatedAt?: FirestoreDateValue;
}

// Order types
