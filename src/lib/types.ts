// User types
export interface User {
    uid: string;
    email: string;
    displayName?: string;
    role: 'admin' | 'staff' | 'customer';
    membership_level: 'Smember' | 'Gold' | 'Silver' | 'Bronze';
    phone?: string;
    address?: string;
    createdAt: Date;
}

// Firestore timestamp types
export type FirestoreTimestamp = import('firebase/firestore').Timestamp;
export type FirestoreWriteTimestamp = import('firebase/firestore').FieldValue;
export type FirestoreDateValue = FirestoreTimestamp | FirestoreWriteTimestamp;

// Category and Brand types (Dynamic)
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
    children?: TaxonomyNode[];
}

export interface Brand {
    id: string;
    name: string;
    logoUrl?: string;
    createdAt?: FirestoreDateValue;
    updatedAt?: FirestoreDateValue;
}

// QR Code History (nhật ký thay đổi mã QR)
export interface QrCodeHistoryEntry {
    action: 'add' | 'remove' | 'set_primary';
    code: string;
    adminName: string;
    timestamp: FirestoreDateValue;
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
    sku?: string; // Mã SP dùng cho QR/barcode và tra cứu POS
    barcode?: string; // Alias tương thích với máy quét dạng bàn phím
    productCode?: string; // Legacy/custom alias nếu dữ liệu cũ đã có
    qrCodes?: string[]; // Mảng tất cả mã QR (chính + phụ)
    qrCodeHistory?: QrCodeHistoryEntry[]; // Nhật ký thay đổi mã QR
    name: string;
    brand: string;
    category: typeof import('./constants').RETAIL_CATEGORIES[number] | string;
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
    sold?: number;
    quality?: string;
    partType?: string;
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
    description?: string;
    seoDescription?: string;
    warranty_text?: string;
    repair_time?: string;
    slug?: string;
    tags?: string[];
    videoEmbedUrl?: string;
    imageUrl?: string;
    isActive?: boolean;
    createdAt?: FirestoreDateValue;
    updatedAt?: FirestoreDateValue;
}

// Order types
export interface OrderItem {
    productId: string;
    productName: string;
    quantity: number;
    price: number;
    image?: string;
}

export interface CustomerInfo {
    name: string;
    phone: string;
    email?: string;
    address: string;
    note?: string;
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
    payment_method?: 'COD' | 'Bank' | 'Momo' | 'Card' | 'Installment';
    deposit_amount?: number;
    paymentHistory?: PaymentHistoryEntry[];
    source?: 'web' | 'pos';
    createdBy?: string;
    createdByName?: string;
    assignedSellerId?: string;
    assignedSellerName?: string;
    assignedSellerAt?: FirestoreDateValue;
    createdAt: Date;
    updatedAt: Date;
    completedAt?: FirestoreDateValue;
}

// Article types
export interface Article {
    id: string;
    title: string;
    content: string; // HTML content
    type: 'News' | 'Promo' | 'Tips';
    thumbnail?: string;
    author?: string;
    tags?: string[];
    videoEmbedUrl?: string;
    publishedAt: Date;
    createdAt: Date;
}

// ── Article Comments / Ratings ──
export interface ArticleComment {
    id: string;
    articleId: string;
    rating: number; // 1-5
    name: string;
    phone?: string;
    content: string;
    status: 'pending' | 'approved';
    reply?: {
        content: string;
        createdAt: FirestoreDateValue;
    };
    createdAt: FirestoreDateValue;
}

// Chat types (Realtime DB)
export interface ChatMessage {
    id: string;
    sessionId: string;
    content: string;
    sender: 'user' | 'bot' | 'staff';
    timestamp: number;
}

export interface ChatSession {
    id: string;
    userId?: string;
    userName?: string;
    status: 'active' | 'closed';
    lastMessage?: string;
    createdAt: FirestoreDateValue;
    updatedAt: FirestoreDateValue;
}

// Repair Ticket types
export type RepairStatus = string; // Changed from union to string to support dynamic statuses in DB
export type PaymentStatus = 'unpaid' | 'deposit' | 'paid' | 'pay_later' | 'refunded' | 'warranty';

// Shared payment history entry — used by both RepairTicket and Order
export interface PaymentHistoryEntry {
    amount: number;
    method?: string;
    date?: FirestoreDateValue;
    timestamp?: number;
    type: 'deposit' | 'payment' | 'full' | 'additional' | 'refund';
    note?: string;
}

// Status Timeline Entry
export interface WorkflowNode {
    id: string;
    label: string;
    color: string;
    allowedNext: string[];
    allowedFeatures?: string[];
    isTerminal?: boolean;
}

export interface TrackingGroup {
    id: string;
    name: string;
    mappedStatuses: string[];
    order: number;
    isTerminal?: boolean;
}

export interface StatusTimelineEntry {
    status: string;
    timestamp: number;
    durationInMinutes?: number;
}

// Checklist kiểm tra đầu vào
export interface DeviceChecklist {
    body: string;         // Vỏ máy
    screen: string;       // Màn hình
    touch: string;        // Cảm ứng
    camera: string;       // Camera
    speaker: string;      // Loa/Mic
    connectivity: string; // Kết nối (Wifi/BT/Sóng)
    battery: string;      // Pin
    biometric: string;    // FaceID/Vân tay
    hasPriorRepair?: boolean;
    hasWaterDamage?: boolean;
    hasNonGenuineParts?: boolean;
}

export interface RepairIssue {
    id: string;
    label: string;
    estimatedPrice: number;
    status: 'pending' | 'resolved' | 'unresolved';
}

// Sản phẩm quà tặng kèm khi bàn giao
export interface GiftItem {
    productId: string;
    productName: string;
    price: number;       // Giá bán tại thời điểm chọn
    quantity: number;
}

export interface RepairTicket {
    id: string;
    version?: number; // Dùng cho Optimistic Locking để tránh ghi đè dữ liệu
    partsLockedAt?: FirestoreDateValue; // Thời điểm khoá linh kiện
    appointmentId?: string;
    workflowConfigId?: string; // Tùy chỉnh workflow
    categoryPath?: string[];
    serviceName?: string;
    customer: {
        name: string;
        phone: string;
    };
    deviceInfo: {
        model: string;
        passcode: string;
        imei: string;
        color?: string;
        image?: string;
        checklist?: DeviceChecklist;
    };
    preRepairMedia: string[];   // Ảnh/Video lúc nhận máy
    postRepairMedia: string[];  // Ảnh/Video quá trình sửa hoặc bàn giao
    statusTimeline: StatusTimelineEntry[];
    durationInMinutes?: number;
    issue: {
        description: string;
        notes: string;
    };
    issues?: RepairIssue[];     // Support multiple issues
    serviceReflection?: string; // Phản ánh dịch vụ
    gifts?: string[];           // Quà tặng kèm
    parts?: {
        partLineId?: string;
        productId?: string;
        productName: string;
        name?: string;
        partName?: string;
        quality: string;
        quantity: number;
        partType?: string;  // Loại linh kiện: Màn hình, Pin, Camera, Mainboard…
        // Legacy unit price (backward-compat)
        price?: number;
        // Snapshot pricing at time of use (when status becomes 'selected')
        unitCostAtUse?: number;
        unitPriceAtUse?: number;
        pricedAt?: FirestoreDateValue;
        priceConfirmedAt?: FirestoreDateValue;
        costSource?: 'product.costPrice' | 'product.price_original' | 'import_receipt.importPrice';
        // Optional estimate pricing for requested/in_stock lines (not yet used)
        estimatedUnitCost?: number;
        estimatedUnitPrice?: number;
        // Warranty (stamped when ticket status → done)
        warrantyMonths?: number;
        warrantyExpiresAt?: FirestoreDateValue;
        // [WARRANTY] Đánh dấu linh kiện này được bảo hành miễn phí
        // unitPriceAtUse vẫn giữ giá gốc để audit — KHÔNG ép về 0
        isWarrantyCovered?: boolean;
        // [WARRANTY] Index của part bị lỗi trên phiếu gốc mà linh kiện này thay thế
        replacesPartIndex?: number;
        // [D4] Supplier traceability — snapshot from Product at handover
        supplierName?: string;
        status: 'selected' | 'requested' | 'approved' | 'in_stock' | 'unavailable' | 'ordered' | 'rejected';
    }[];
    timing: {
        receivedAt: FirestoreDateValue;
        estimatedReturnAt?: FirestoreDateValue;
        completedAt?: FirestoreDateValue;
    };
    payment: {
        status: PaymentStatus;
        partsCost: number;    // Tiền linh kiện
        laborCost: number;    // Tiền công thợ
        additionalFees?: number; // Chi phí phát sinh
        discountAmount?: number; // Giảm giá
        giftDiscount?: number;   // Giá trị quà tặng (trừ khi tính hoa hồng)
        giftItems?: GiftItem[];  // Danh sách sản phẩm quà tặng đã chọn
        amount: number;       // Auto = partsCost + laborCost + additionalFees - discountAmount
        depositAmount: number;
    };
    paymentHistory?: PaymentHistoryEntry[];
    staff: {
        createdBy: string;
        createdByName: string;
        assignedTechnician: string;
        assignedTechnicianName: string;
    };
    status: RepairStatus;
    deliveryNote?: string;
    // [WARRANTY] Phân loại phiếu — undefined = 'repair' (backward-compatible)
    // → 'repair' hoặc undefined: dùng repairStatuses
    // → 'warranty': dùng warrantyStatuses
    ticketType?: 'repair' | 'warranty';
    // [WARRANTY] Chỉ tồn tại khi ticketType = 'warranty'
    warrantyClaim?: {
        originalTicketId: string;
        claimedPartIndexes: number[];
        refundedParts?: {
            originalPartIndex: number;
            productName: string;
            refundAmount: number;
        }[];
    };
    createdAt: FirestoreDateValue;
    updatedAt: FirestoreDateValue;
}

// ── Import Receipt (Phiếu nhập hàng) ──
export interface ImportReceiptItem {
    productId: string;
    productName: string;
    quantity: number;
    importPrice: number; // Giá nhập đợt này
    oldCostPrice?: number; // Giá vốn cũ để tính dự báo
    quality?: string;    // Phân loại: Zin, Loại 1, Loại 2, Bóc máy
}

// ── Customer Reviews ──
export interface Review {
    id: string;
    referenceId: string; // ID của đơn hàng hoặc phiếu sửa chữa
    type: 'repair' | 'order';
    customerName: string;
    phone: string; // Chỉ lưu/hiển thị dạng: 098****123
    rating: number; // 1-5 sao
    content: string;
    images: string[];
    status: 'pending' | 'approved';
    createdAt: FirestoreDateValue;
}

export interface ImportReceipt {
    id: string;
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
export interface CommissionRule {
    id: string;
    name: string;
    type: 'repair' | 'order' | 'all';
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
export interface WarrantyRule {
    partType: string;        // Loại linh kiện: "Màn hình", "Pin", "Camera"…
    warrantyMonths: number;  // Số tháng bảo hành
}

export interface Expense {
    id: string;
    category: 'rent' | 'utilities' | 'supplies' | 'salary' | 'other';
    description: string;
    amount: number;
    date: FirestoreDateValue;
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
}

// ── Inventory Audit Log (Nhật ký kho) ──
export interface InventoryLog {
    id: string;
    productId: string;
    productName: string;
    quantity: number;           // Dương = nhập/trả, Âm = xuất/bán
    costPriceAtLog: number;     // Giá vốn tại thời điểm thao tác
    type: 'IMPORT' | 'SALE' | 'WEB_ORDER'
        | 'REPAIR_USE' | 'REPAIR_REFUND' | 'REPAIR_RELEASE'
        | 'TECH_ISSUE' | 'TECH_RETURN'
        | 'ORDER_CANCEL' | 'ORDER_COMPLETE' | 'ORDER_REACTIVATE';
    referenceId: string;
    referenceType: 'import_receipt' | 'order' | 'repair';
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
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
export interface ProductReview {
    id: string;
    productId: string;
    customerName: string;
    phone?: string;              // Lưu dạng ẩn: 098****123
    rating: number;              // 1-5 sao
    content: string;
    images?: string[];
    status: 'pending' | 'approved';
    reply?: {
        content: string;
        createdAt: FirestoreDateValue;
    };
    createdAt: FirestoreDateValue;
}

// ── Import Receipt (Phiếu nhập hàng) ──
export interface ImportReceiptItem {
    productId: string;
    productName: string;
    quantity: number;
    importPrice: number; // Giá nhập đợt này
    oldCostPrice?: number; // Giá vốn cũ để tính dự báo
    quality?: string;    // Phân loại: Zin, Loại 1, Loại 2, Bóc máy
}

// ── Customer Reviews ──
export interface Review {
    id: string;
    referenceId: string; // ID của đơn hàng hoặc phiếu sửa chữa
    type: 'repair' | 'order';
    customerName: string;
    phone: string; // Chỉ lưu/hiển thị dạng: 098****123
    rating: number; // 1-5 sao
    content: string;
    images: string[];
    status: 'pending' | 'approved';
    createdAt: FirestoreDateValue;
}

export interface ImportReceipt {
    id: string;
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
export interface CommissionRule {
    id: string;
    name: string;
    type: 'repair' | 'order' | 'all';
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
export interface WarrantyRule {
    partType: string;        // Loại linh kiện: "Màn hình", "Pin", "Camera"…
    warrantyMonths: number;  // Số tháng bảo hành
}

export interface Expense {
    id: string;
    category: 'rent' | 'utilities' | 'supplies' | 'salary' | 'other';
    description: string;
    amount: number;
    date: FirestoreDateValue;
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
}

// ── Inventory Audit Log (Nhật ký kho) ──
export interface InventoryLog {
    id: string;
    productId: string;
    productName: string;
    quantity: number;           // Dương = nhập/trả, Âm = xuất/bán
    costPriceAtLog: number;     // Giá vốn tại thời điểm thao tác
    type: 'IMPORT' | 'SALE' | 'WEB_ORDER'
        | 'REPAIR_USE' | 'REPAIR_REFUND' | 'REPAIR_RELEASE'
        | 'TECH_ISSUE' | 'TECH_RETURN'
        | 'ORDER_CANCEL' | 'ORDER_COMPLETE' | 'ORDER_REACTIVATE';
    referenceId: string;
    referenceType: 'import_receipt' | 'order' | 'repair';
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
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
export interface ProductReview {
    id: string;
    productId: string;
    customerName: string;
    phone?: string;              // Lưu dạng ẩn: 098****123
    rating: number;              // 1-5 sao
    content: string;
    images?: string[];
    status: 'pending' | 'approved';
    reply?: {
        content: string;
        createdAt: FirestoreDateValue;
    };
    createdAt: FirestoreDateValue;
}

// ── Master Hub Workflow (Repair Workflow) ──
export interface RepairWorkflowNode {
    id: string;
    label: string;
    isTerminal?: boolean;
    allowedNext?: string[];
    allowedFeatures?: string[];
    [key: string]: unknown;
}

export interface RepairWorkflowConfig {
    id: string;
    name: string;
    nodes: RepairWorkflowNode[];
    [key: string]: unknown;
}
