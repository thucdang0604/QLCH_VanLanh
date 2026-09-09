import type { FirestoreDateValue, PaymentHistoryEntry, PaymentStatus } from './common';
import type { ContactMethod, ContactMethodType } from './contact';

export type RepairStatus = string; // Changed from union to string to support dynamic statuses in DB

/**
 * The business meaning of a terminal workflow node.  This deliberately stays
 * separate from the node ID: stores are free to rename or replace statuses
 * without changing the handover workflow in code.
 */
export type WorkflowTerminalAction = 'handover' | 'refund' | 'close';
export type RepairWorkflowActor = 'reception' | 'technician' | 'manager';

export interface WorkflowNode {
    id: string;
    label: string;
    color: string;
    allowedNext: string[];
    /** Optional permissions for each outgoing edge; omitted keeps legacy behavior. */
    transitionActors?: Partial<Record<string, RepairWorkflowActor[]>>;
    allowedFeatures?: string[];
    isTerminal?: boolean;
    /** Required only for terminal nodes that need a settlement action. */
    terminalAction?: WorkflowTerminalAction;
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
    eventType?: 'status_transition' | 'technician_assigned' | 'transfer_requested' | 'transfer_accepted' | 'transfer_rejected' | 'transfer_cancelled' | 'manager_override' | 'warranty_created' | 'customer_approved' | 'customer_declined' | 'part_selected' | 'part_requested' | 'part_received_by_technician' | 'part_return_received' | 'checklist_updated' | 'diagnosis_updated' | 'part_handed_over_to_technician' | 'part_handover_declined' | 'part_selection_cancelled' | 'part_request_rejected' | 'inbound_device_received';
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
    partLineId?: string | null;
    partName?: string;
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

export type RepairIssueBillingMode = 'service_only' | 'parts_only' | 'parts_and_service' | 'free';

export interface RepairIssue {
    id: string;
    label: string;
    estimatedPrice: number;
    status: 'pending' | 'resolved' | 'unresolved';
    categoryPath?: string[];
    serviceName?: string;
    /** Concrete service record selected during intake; enables its business links. */
    serviceId?: string;
    /**
     * Determines whether the issue's estimated price is billed as service work.
     * Parts are always billed from their own immutable price snapshots.
     */
    billingMode?: RepairIssueBillingMode;
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
    /** How the device reaches the shop; send_to_store may exist without a web appointment. */
    appointmentIntakeMethod?: 'walk_in' | 'send_to_store' | string | null;
    workflowConfigId?: string; // Tùy chỉnh workflow
    /** Revision of the dynamic workflow when this ticket was created; audit-only. */
    workflowRevision?: number;
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
    /**
     * Audit record written by reception after discussing the repair quote with
     * the customer. The old approved* fields remain so existing documents and
     * printed/audit consumers stay backward compatible.
     */
    customerApproval?: {
        decision?: 'approved' | 'declined';
        respondedAt?: FirestoreDateValue;
        respondedBy?: string;
        respondedByName?: string;
        approvedAt?: FirestoreDateValue;
        approvedBy?: string;
        approvedByName?: string;
        note?: string;
    };
    parts?: {
        partLineId?: string;
        /** The diagnosed issue this exact part is intended to resolve. */
        issueId?: string;
        productId?: string;
        productName: string;
        name?: string;
        partName?: string;
        quality: string;
        quantity: number;
        reservedQuantity?: number; // Số lượng đã giữ trong kho cho dòng sửa chữa
        /** KTV confirms the physical item was received from reception. */
        receptionHandedOverAt?: FirestoreDateValue;
        receptionHandedOverBy?: string;
        /** KTV explicitly reports that a reception handover was not received. */
        technicianReceiptRejectedAt?: FirestoreDateValue;
        technicianReceiptRejectedBy?: string;
        technicianReceivedAt?: FirestoreDateValue;
        technicianReceivedBy?: string;
        /** KTV has returned this unused item; reception must acknowledge it. */
        returnedToReceptionPendingAt?: FirestoreDateValue;
        returnedToReceptionBy?: string;
        returnedToReceptionReceivedAt?: FirestoreDateValue;
        returnedToReceptionReceivedBy?: string;
        /** Time this line was converted from a stock hold to actual stock usage. */
        inventoryDeductedAt?: FirestoreDateValue;
        warrantyPolicyId?: string;
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
        method?: string;
        paidAt?: FirestoreDateValue;
        /** Hóa đơn POS đang quản lý phần công nợ còn lại của phiếu. */
        outstandingOrderId?: string;
        outstandingAmount?: number;
    };
    paymentHistory?: PaymentHistoryEntry[];
    delivery?: {
        status: 'pending_dispatch' | 'dispatched' | 'delivered' | 'cancelled';
        mode: 'customer_paid_now' | 'shop_absorbs' | 'shop_advance_on_credit';
        fee: number;
        recipientName: string;
        recipientPhone: string;
        recipientAddress: string;
        billingCustomerId?: string;
        shopPaymentMethod?: 'CASH' | 'BANK';
        checkoutOrderId?: string;
        shippingAdvanceOrderId?: string;
        note?: string;
        createdAt?: FirestoreDateValue;
        updatedAt?: FirestoreDateValue;
    };
    /** Shop-paid inbound freight when a customer sends a device to the shop. */
    inboundShipping?: {
        status: 'awaiting_arrival' | 'received' | 'cancelled';
        /** Who settled the carrier fee when the device physically arrived. */
        settlementType?: 'shop_paid' | 'customer_paid';
        paidAmount: number;
        customerPaidAmount?: number;
        lastExpenseId?: string;
        lastPaymentMethod?: 'CASH' | 'BANK' | 'CUSTOMER';
        lastPaidBy?: string;
        lastPaidByName?: string;
        carrierName?: string;
        trackingNumber?: string;
        note?: string;
        receivedAt?: FirestoreDateValue;
        receivedBy?: string;
        receivedByName?: string;
        /** Reception completed the physical device/issue information after arrival. */
        intakeCompletedAt?: FirestoreDateValue;
        intakeCompletedBy?: string;
        intakeCompletedByName?: string;
        updatedAt?: FirestoreDateValue;
    };
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
    id?: string;
    partType: string;        // Loại linh kiện: "Màn hình", "Pin", "Camera"…
    warrantyMonths: number;  // Số tháng bảo hành
}
