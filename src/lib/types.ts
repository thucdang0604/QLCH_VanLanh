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
    category: 'Phone' | 'Laptop' | 'Tablet' | 'Audio' | 'Watch' | 'Accessory' | 'Linh kiện';
    price_original: number;
    price_promo: number;
    costPrice?: number; // Giá vốn bình quân
    specs: ProductSpecs;
    images: string[];
    status: 'active' | 'hidden';
    description?: string;
    videoEmbedUrl?: string;
    stock?: number;
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
    customer_info: CustomerInfo;
    items: OrderItem[];
    total_amount: number;
    status: 'Pending' | 'Confirmed' | 'Shipping' | 'Completed' | 'Cancelled';
    is_vat_exported: boolean;
    payment_method?: 'COD' | 'Bank' | 'Momo' | 'Card';
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createdAt: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updatedAt: any;
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
        quality: string;
        quantity: number;
        status: 'selected' | 'requested';
    }[];
    timing: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receivedAt: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        estimatedReturnAt?: any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        completedAt?: any;
    };
    payment: {
        status: PaymentStatus;
        partsCost: number;    // Tiền linh kiện
        laborCost: number;    // Tiền công thợ
        amount: number;       // Auto = partsCost + laborCost
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createdAt: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updatedAt: any;
}

// ── Import Receipt (Phiếu nhập hàng) ──
export interface ImportReceiptItem {
    productId: string;
    productName: string;
    quantity: number;
    importPrice: number; // Giá nhập đợt này
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
    createdAt: any;
}

export interface ImportReceipt {
    id: string;
    supplier: string;
    items: ImportReceiptItem[];
    totalAmount: number;
    note?: string;
    status: 'draft' | 'completed';
    createdBy: string;
    createdByName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createdAt: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    completedAt?: any;
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
    createdAt: any;
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
    createdAt: any;
}

// ── Expense (Phiếu chi) ──
export interface Expense {
    id: string;
    category: 'rent' | 'utilities' | 'supplies' | 'salary' | 'other';
    description: string;
    amount: number;
    date: any;
    createdBy: string;
    createdByName: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createdAt: any;
}
