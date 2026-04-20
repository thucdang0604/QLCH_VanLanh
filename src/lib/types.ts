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
    name: string;
    brand: string;
    category: typeof import('./constants').RETAIL_CATEGORIES[number] | string;
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
    createdAt: Date;
    updatedAt: Date;
}

// Service types (Sửa chữa)
export interface Service {
    id: string;
    name: string;
    price: number;
    costPrice?: number; // Giá vốn linh kiện
    device_model: string;
    category: string;
    description?: string;
    videoEmbedUrl?: string;
    estimatedTime?: string;
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
    source?: 'web' | 'pos';
    createdBy?: string;
    createdByName?: string;
    createdAt: Date;
    updatedAt: Date;
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
export type PaymentStatus = 'unpaid' | 'deposit' | 'paid' | 'pay_later' | 'refunded';

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

export interface RepairTicket {
    id: string;
    appointmentId?: string;
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
    issue: {
        description: string;
        notes: string;
    };
    parts?: {
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
        status: 'selected' | 'requested' | 'approved' | 'in_stock' | 'unavailable' | 'ordered';
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
        amount: number;       // Auto = partsCost + laborCost + additionalFees - discountAmount
        depositAmount: number;
    };
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
    items: ImportReceiptItem[];
    totalAmount: number;
    note?: string;
    status: 'draft' | 'ordered' | 'completed';
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
