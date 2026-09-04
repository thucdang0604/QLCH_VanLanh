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
        id: 'requireInboundArrival',
        label: 'Yêu cầu xác nhận máy gửi đến shop',
        description: 'Chỉ áp dụng cho phiếu chọn “Khách gửi máy đến shop”: chặn KTV thao tác cho đến khi Tiếp nhận xác nhận máy đã đến và hoàn tất thông tin máy.',
        scope: ['admin', 'technician'],
    },
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
        id: 'requirePartsReceivedByTechnician',
        label: 'Yêu cầu KTV xác nhận đã nhận từng linh kiện',
        description: 'Chặn chuyển sang bước sửa chữa nếu bất kỳ linh kiện được chọn nào chưa được KTV xác nhận nhận từ Tiếp nhận.',
        scope: ['admin', 'technician'],
    },
    {
        id: 'requireReturnedPartsReceived',
        label: 'Yêu cầu Tiếp nhận xác nhận linh kiện hoàn lại',
        description: 'Chặn bàn giao khách nếu còn linh kiện KTV trả về nhưng Tiếp nhận chưa xác nhận đã nhận lại.',
        scope: ['admin'],
    },
    {
        id: 'confirmCustomerResponse',
        label: 'Xác nhận từ khách hàng',
        description: 'Chỉ Tiếp nhận xác nhận sau khi đã báo tình trạng và giá. Khi mở sẽ chọn khách đồng ý hoặc không đồng ý sửa.',
        scope: ['admin'],
    },
    {
        id: 'reserveSelectedParts',
        label: 'Giữ tạm linh kiện khi vào trạng thái này',
        description: 'Khi phiếu chuyển vào trạng thái này, hệ thống đối soát và giữ các linh kiện đã chọn để tồn khả dụng giảm chính xác.',
        scope: ['admin', 'technician'],
    },
    {
        id: 'consumeSelectedParts',
        label: 'Xuất/xác nhận linh kiện đã chọn khi vào trạng thái này',
        description: 'Khi phiếu chuyển vào bước này, hệ thống yêu cầu xác nhận linh kiện đã dùng hoặc hoàn trả trước khi chốt tồn kho.',
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
    {
        id: 'requireAssignedTechnician',
        label: 'Yêu cầu phân công KTV',
        description: 'Chặn chuyển sang trạng thái này nếu phiếu chưa có KTV phụ trách',
        scope: ['admin', 'technician'],
    },
    {
        id: 'requireTechnicianNote',
        label: 'Yêu cầu Ghi chú kỹ thuật',
        description: 'Bắt buộc nhập Ghi chú kỹ thuật khi chuyển sang hoặc lưu tại trạng thái này',
        scope: ['admin', 'technician'],
    },
    {
        id: 'allowTechnicianDiagnosis',
        label: 'Cho phép KTV cập nhật chẩn đoán',
        description: 'KTV được thêm/sửa lỗi, taxonomy và giá dự kiến. Dữ liệu này được Tiếp nhận dùng để báo giá khách.',
        scope: ['technician'],
    },
    {
        id: 'requiresHandover',
        label: 'Yêu cầu bàn giao/đối soát với khách',
        description: 'Khi chuyển vào trạng thái này, Admin mở bước bàn giao thay vì chuyển trạng thái trực tiếp.',
        scope: ['admin'],
    },
    {
        id: 'refundOutcome',
        label: 'Kết quả hoàn phí',
        description: 'Bước bàn giao này là hoàn phí cho khách, yêu cầu ghi lý do và xác nhận số tiền hoàn.',
        scope: ['admin'],
    },
    {
        id: 'recordCompletion',
        label: 'Ghi nhận hoàn thành vào báo cáo',
        description: 'Đánh dấu đây là kết quả hoàn thành để thống kê doanh thu/số phiếu theo workflow.',
        scope: ['admin'],
    },
    {
        id: 'releaseHeldParts',
        label: 'Hoàn giữ linh kiện khi kết thúc',
        description: 'Khi vào trạng thái này, giải phóng các linh kiện đã giữ nhưng chưa xuất dùng.',
        scope: ['admin', 'technician'],
    },
    {
        id: 'countsAsActiveRepair',
        label: 'Tính vào số ca đang sửa',
        description: 'Dùng cho chỉ số công việc đang thực hiện của Kỹ thuật viên; không phụ thuộc tên trạng thái.',
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
