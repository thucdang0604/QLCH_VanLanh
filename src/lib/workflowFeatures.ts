// ══════════════════════════════════════════════════════════════
// Centralized Workflow Feature Registry
// ══════════════════════════════════════════════════════════════
import type { WorkflowNode } from '@/lib/types';
import { isPendingRepairPart } from '@/lib/repairStatus';

/**
 * Mỗi feature đại diện cho 1 tính năng có thể bật/tắt trên từng trạng thái workflow.
 * Admin cấu hình features trong Settings → Repairs, sau đó cả repairs + technician
 * pages đọc `allowedFeatures[]` từ Firestore để quyết định UI/logic.
 */
export interface WorkflowFeature {
    id: string;           // Feature ID duy nhất (lưu trong Firestore)
    label: string;        // Tên hiển thị trong Settings
    description?: string; // Mô tả chi tiết (tooltip)
    scope: ('admin' | 'technician')[]; // Trang nào dùng feature này
}

// ── Feature Registry ──
// Thêm feature mới: chỉ cần thêm 1 object vào đây
export const WORKFLOW_FEATURES: WorkflowFeature[] = [
    {
        id: 'requireChecklist',
        label: 'Yêu cầu test full chức năng (Checklist 8 mục)',
        description: 'Chặn chuyển trạng thái nếu chưa hoàn thành checklist kiểm tra thiết bị',
        scope: ['admin', 'technician'],
    },
    {
        id: 'requirePartsReady',
        label: 'Yêu cầu tất cả linh kiện đã về kho',
        description: 'Chặn chuyển sang trạng thái tiếp theo nếu còn linh kiện chưa nhập kho (status: requested hoặc ordered). Dùng cho trạng thái chuyển sang Đang sửa chữa.',
        scope: ['admin', 'technician'],
    },
    {
        id: 'allowPartsSelection',
        label: 'Cho phép chọn hiển thị/xin phần cứng thay thế',
        description: 'Hiển thị UI chọn linh kiện. Nếu linh kiện không có sẵn, tạo phiếu nhập tổng hợp',
        scope: ['admin', 'technician'],
    },
    {
        id: 'requirePaymentGate',
        label: 'Kích hoạt cổng Thanh toán (Bắt buộc xác nhận tiền)',
        description: 'Bắt buộc xác nhận thanh toán khi chuyển sang trạng thái tiếp theo',
        scope: ['admin', 'technician'],
    },
    {
        id: 'allowAssignTech',
        label: 'Cho phép Phân công Kỹ thuật viên',
        description: 'Hiển thị dropdown phân công KTV cho phiếu sửa chữa',
        scope: ['admin'],
    },
    {
        id: 'enableSellerCommission',
        label: 'Tính hoa hồng cho người chốt đơn',
        description: 'Khi chuyển sang trạng thái này, nếu có doanh thu sẽ tính hoa hồng cho nhân viên tạo phiếu sửa chữa',
        scope: ['admin'],
    },
    {
        id: 'enableTechnicianCommission',
        label: 'Tính hoa hồng cho Kỹ thuật viên',
        description: 'Khi chuyển sang trạng thái này, nếu có doanh thu sẽ tính hoa hồng cho KTV được phân công',
        scope: ['admin', 'technician'],
    },
];

// ── Helper: kiểm tra feature có được bật cho status hiện tại ──
export function hasFeature(
    statusId: string,
    featureId: string,
    dynamicStatuses: WorkflowNode[]
): boolean {
    const status = dynamicStatuses.find(s => s.id === statusId);
    return status?.allowedFeatures?.includes(featureId) ?? false;
}

// ── Helper: lấy tất cả features đang bật cho 1 status ──
export function getActiveFeatures(
    statusId: string,
    dynamicStatuses: WorkflowNode[]
): string[] {
    const status = dynamicStatuses.find(s => s.id === statusId);
    return status?.allowedFeatures ?? [];
}

// ── Checklist validation ──
export const CHECKLIST_KEYS = [
    'body', 'screen', 'touch', 'camera',
    'speaker', 'connectivity', 'battery', 'biometric',
] as const;

export const CHECKLIST_LABELS: Record<string, string> = {
    body: 'Vỏ máy',
    screen: 'Màn hình',
    touch: 'Cảm ứng',
    camera: 'Camera',
    speaker: 'Loa/Mic',
    connectivity: 'Kết nối (Wifi/BT/Sóng)',
    battery: 'Pin',
    biometric: 'FaceID/Vân tay',
};

export function isChecklistComplete(checklist?: Record<string, unknown>): boolean {
    if (!checklist) return false;
    return CHECKLIST_KEYS.every(key => {
        const val = checklist[key];
        return val !== undefined && val !== null && val !== '';
    });
}

// ── YouTube URL Helpers ──
/** Check if a URL is a YouTube link */
export function isYouTubeUrl(url: string): boolean {
    return /(?:youtube\.com\/(?:watch|embed|shorts)|youtu\.be\/)/i.test(url);
}

/** Extract YouTube embed URL from any YouTube link format */
export function getYouTubeEmbedUrl(url: string): string | null {
    let videoId: string | null = null;

    // youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) videoId = shortMatch[1];

    // youtube.com/watch?v=VIDEO_ID
    const watchMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) videoId = watchMatch[1];

    // youtube.com/embed/VIDEO_ID
    const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) videoId = embedMatch[1];

    // youtube.com/shorts/VIDEO_ID
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) videoId = shortsMatch[1];

    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

/**
 * Kiểm tra tất cả linh kiện đề xuất đã về kho chưa.
 * Trả về true nếu KHÔNG còn part nào đang chờ (requested/ordered).
 */
export function areAllPartsReady(ticket: { parts?: { status?: string }[] }): boolean {
    const parts = ticket.parts || [];
    if (parts.length === 0) return true;
    const pendingParts = parts.filter(isPendingRepairPart);
    return pendingParts.length === 0;
}
