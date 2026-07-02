import type { FirestoreDateValue, PaymentHistoryEntry, PaymentStatus } from './common';
import type { ContactMethod, ContactMethodType } from './contact';

export type RepairStatus = string; // Changed from union to string to support dynamic statuses in DB

export interface WorkflowNode {
    id: string;
    label: string;
    color: string;
    allowedNext: string[];
    allowedFeatures?: string[];
    isTerminal?: boolean;
    /** Legacy field retained for lossless migration; runtime uses allowedNext only. */
    next?: string;
}

export interface TrackingGroup {
    id: string;
    name: string;
    mappedStatuses: string[];
    order: number;
    isTerminal?: boolean;
}

export interface PendingTechnicianTransfer {
    id: string;
    fromTechnicianId: string;
    fromTechnicianName: string;
    toTechnicianId: string;
    toTechnicianName: string;
    requestedBy: string;
    requestedByName: string;
    requestedByRole: string;
    reason: string;
    source: string;
    status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'superseded';
    requestedAt: FirestoreDateValue;
    respondedAt?: FirestoreDateValue;
    respondedBy?: string;
    ticketVersion?: number;
}

export interface StatusTimelineEntry {
    status: string;
    timestamp?: number;
    at?: FirestoreDateValue;
    durationInMinutes?: number;
    // Audit fields for tracking transition and assignments
    eventType?: 'status_transition' | 'technician_assigned' | 'transfer_requested' | 'transfer_accepted' | 'transfer_rejected' | 'transfer_cancelled' | 'manager_override' | 'warranty_created';
    fromStatus?: string;
    toStatus?: string;
    actorId?: string;
    actorName?: string;
    actorRole?: string;
    source?: string;
    reason?: string;
    requestId?: string;
    fromTechnicianId?: string;
    fromTechnicianName?: string;
    toTechnicianId?: string;
    toTechnicianName?: string;
    by?: string;
    note?: string | null;
    isOverride?: boolean;
    warrantyTicketId?: string;
    claimedPartsSnapshot?: {
        productName?: string;
        partType?: string;
        warrantyMonths?: number;
        warrantyExpiresAt?: FirestoreDateValue;
    }[];
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
    historyOtherNote?: string;
}

export interface RepairIssue {
    id: string;
    label: string;
    estimatedPrice: number;
    status: 'pending' | 'resolved' | 'unresolved';
    categoryPath?: string[];
    serviceName?: string;
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
        id?: string;
        customerId?: string;
        name: string;
        phone: string;
        contactType?: ContactMethodType;
        contactLabel?: string;
        contactValue?: string;
        primaryContactType?: ContactMethodType | null;
        primaryContactValue?: string;
        contactMethods?: ContactMethod[];
        searchKeywords?: string[];
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
        reservedQuantity?: number; // Số lượng đã giữ trong kho cho dòng sửa chữa
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
        lotCode?: string;
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
        laborCost: number;    // Chi phí sửa chữa (Tiền công / Phí dịch vụ)
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
        assignedTechnician?: string;
        assignedTechnicianName?: string;
    };
    pendingTechnicianTransfer?: PendingTechnicianTransfer;
    status: RepairStatus;
    deliveryNote?: string;
    // [WARRANTY] Phân loại phiếu — undefined = 'repair' (backward-compatible)
    // → 'repair' hoặc undefined: dùng repairStatuses
    // → 'warranty': dùng warrantyStatuses
    ticketType?: 'repair' | 'warranty';
    // [WARRANTY] Chỉ tồn tại khi ticketType = 'warranty'
    warrantyClaim?: {
        originalTicketId: string;
        originalTicketCode?: string;
        originalDeviceModel?: string;
        originalDeviceImei?: string;
        claimedPartIndexes: number[];
        claimedPartsSnapshot?: {
            originalPartIndex: number;
            partLineId?: string | null;
            productId?: string | null;
            productName: string;
            partType?: string;
            quality?: string;
            quantity?: number;
            warrantyMonths?: number;
            warrantyExpiresAt?: FirestoreDateValue | null;
        }[];
        warrantyType?: 'warrantyDevice' | 'warrantyRepair' | 'warrantyAccessory' | null;
        refundedParts?: {
            originalPartIndex: number;
            productName: string;
            refundAmount: number;
        }[];
    };
    serviceWarrantyExpiresAt?: FirestoreDateValue;
    createdAt: FirestoreDateValue;
    updatedAt: FirestoreDateValue;
}

// ── Import Receipt (Phiếu nhập hàng) ──

export interface WarrantyRule {
    partType: string;        // Loại linh kiện: "Màn hình", "Pin", "Camera"…
    warrantyMonths: number;  // Số tháng bảo hành
}
