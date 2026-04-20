'use client';

import type { RepairTicket } from '@/lib/types';

const formatPrice = (p: number) => p > 0 ? p.toLocaleString('vi-VN') + 'đ' : '—';

// ── Checkbox helpers ──
const Check = () => <span className="text-[11px]">☑</span>;
const Uncheck = () => <span className="text-[11px]">☐</span>;

// ── Receipt Config (from system_config/receipt) ──
export interface ReceiptConfig {
    logoUrl: string;
    shopName: string;
    shopTitle: string;
    address: string;
    hotline: string;
    receiptTitle: string;
    notes: string[];
    footerText: string;
    complaintHotline: string;
    /**
     * Optional invoice configuration (used by `PrintableRepairInvoice`).
     * Stored together in `system_config/receipt` for convenience/backward-compat.
     */
    invoice?: {
        title?: string;
        showCustomerInfo?: boolean;
        showDeviceInfo?: boolean;
        showImei?: boolean;
        showIssueDescription?: boolean;
        showPartsUsed?: boolean;
        showCostBreakdown?: boolean;
        showPaymentNote?: boolean;
        showSignatures?: boolean;
        footerText?: string;
        complaintHotline?: string;
        maxWidthPx?: number;
        baseFontSizePx?: number;
    };
}

const defaultReceiptConfig: ReceiptConfig = {
    logoUrl: '',
    shopName: 'Văn Lành Service',
    shopTitle: 'Trung Tâm Sửa Chữa & Bảo Hành Thiết Bị Di Động',
    address: '117 Nguyên Hồng, Bình Lợi Trung (P11 cũ), Bình Thạnh, HCM',
    hotline: '0975 24 20 26 - 0981 24 20 26',
    receiptTitle: 'Biên Nhận Sửa Chữa',
    notes: [
        'Biên nhận có hiệu lực 30 ngày kể từ ngày tiếp nhận. Quá hạn cửa hàng không chịu trách nhiệm.',
        'Mất biên nhận vui lòng mang theo CCCD/CMND để xác minh danh tính khi nhận máy.',
        'Cửa hàng không giữ SIM, thẻ nhớ, ốp lưng trừ khi có ghi chú. Vui lòng tháo trước khi gửi.',
        'Cửa hàng không chịu trách nhiệm về dữ liệu cá nhân trong thiết bị. Quý khách vui lòng sao lưu trước.',
    ],
    footerText: 'Quý khách vui lòng kiểm tra và ký tên xác nhận thông tin.',
    complaintHotline: '0932.24.20.26',
};

interface PrintableReceiptProps {
    ticket: RepairTicket;
    receiptConfig?: ReceiptConfig;
}

export default function PrintableReceipt({ ticket, receiptConfig }: PrintableReceiptProps) {
    const cl = ticket.deviceInfo?.checklist;
    const now = new Date();
    const cfg = { ...defaultReceiptConfig, ...receiptConfig };

    // ── Body checklist items ──
    const bodyOptions = [
        { label: 'Trầy', values: ['Trầy'] },
        { label: 'Bể', values: ['Nứt', 'Bể'] },
        { label: 'BTH', values: ['OK'] },
    ];
    const touchOptions = [
        { label: 'Liệt', values: ['Lỗi', 'Liệt'] },
        { label: 'Chập', values: ['Chập'] },
        { label: 'OK', values: ['OK'] },
    ];
    const speakerOptions = [
        { label: 'Lỗi', values: ['Lỗi'] },
        { label: 'OK', values: ['OK'] },
    ];
    const batteryOptions = [
        { label: 'Phồng', values: ['Phồng'] },
        { label: 'K nhận sạc', values: ['Lỗi', 'K nhận sạc'] },
        { label: 'OK', values: ['OK'] },
    ];
    const screenOptions = [
        { label: 'Ám', values: ['Ám'] },
        { label: 'Sọc/Mực', values: ['Lỗi', 'Sọc', 'Mực'] },
        { label: 'OK', values: ['OK'] },
    ];
    const cameraOptions = [
        { label: 'Mờ', values: ['Mờ'] },
        { label: 'Lỗi', values: ['Lỗi'] },
        { label: 'OK', values: ['OK'] },
    ];
    const connectivityOptions = [
        { label: 'Wi-Fi', values: ['Wi-Fi', 'Lỗi'] },
        { label: 'Bluetooth', values: ['Bluetooth'] },
        { label: 'OK', values: ['OK'] },
    ];
    const biometricOptions = [
        { label: 'Không nhận', values: ['Lỗi', 'Không nhận', 'Không có'] },
        { label: 'OK', values: ['OK'] },
    ];

    const isChecked = (fieldValue: string | undefined, matchValues: string[]) => {
        if (!fieldValue) return false;
        return matchValues.some(v => fieldValue.toLowerCase().includes(v.toLowerCase()));
    };

    const renderCheckGroup = (label: string, value: string | undefined, options: { label: string; values: string[] }[]) => (
        <div className="flex items-start gap-1 py-[2px]">
            <span className="font-bold text-[10px] uppercase min-w-[70px] shrink-0">{label}:</span>
            <div className="flex flex-wrap gap-x-2 gap-y-0">
                {options.map(opt => (
                    <span key={opt.label} className="flex items-center gap-[2px] text-[10px]">
                        {isChecked(value, opt.values) ? <Check /> : <Uncheck />}
                        {opt.label}
                    </span>
                ))}
            </div>
        </div>
    );

    return (
        <div id="printable-receipt" className="hidden print:block print:w-full print:bg-white print:text-black">
            <div className="max-w-[540px] mx-auto px-2 py-1 text-[11px] leading-[1.5]">

                {/* ═══════════ HEADER ═══════════ */}
                <div className="flex items-start gap-3 mb-1">
                    {/* Logo */}
                    {cfg.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cfg.logoUrl} alt="Logo" className="shrink-0 w-[60px] h-[60px] object-contain rounded-lg border border-gray-300" />
                    ) : (
                        <div className="shrink-0 w-[60px] h-[60px] border-2 border-gray-800 rounded-lg flex items-center justify-center">
                            <span className="text-[9px] font-black text-center leading-tight">VĂN<br />LÀNH</span>
                        </div>
                    )}
                    {/* Info - Right */}
                    <div className="flex-1 text-right">
                        <p className="font-black text-[11px] uppercase leading-tight">
                            {cfg.shopTitle}
                        </p>
                        <p className="font-black text-[13px] uppercase text-gray-900 tracking-wide">{cfg.shopName}</p>
                        <p className="text-[9px] text-gray-600 mt-0.5">{cfg.address}</p>
                        <p className="text-[9px] text-gray-600">
                            Hotline: <b>{cfg.hotline}</b>
                        </p>
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-center font-black text-[16px] uppercase tracking-wider my-2 border-y-2 border-gray-800 py-1">
                    {cfg.receiptTitle}
                </h1>

                {/* Mã phiếu + Ngày */}
                <div className="flex justify-between text-[10px] text-gray-600 mb-1">
                    <span>Mã phiếu: <b className="text-black">#{ticket.id.slice(-6).toUpperCase()}</b></span>
                    <span>Ngày: <b className="text-black">{now.toLocaleDateString('vi-VN')}</b></span>
                </div>

                {/* ═══════════ THÔNG TIN CHUNG ═══════════ */}
                <div className="space-y-[3px] border-b border-dotted border-gray-400 pb-2 mb-2">
                    <div className="flex gap-4">
                        <span>Khách hàng: <b>{ticket.customer.name}</b></span>
                        <span className="ml-auto">SĐT: <b>{ticket.customer.phone}</b></span>
                    </div>
                    <div className="flex gap-4 flex-wrap">
                        <span>Thiết bị: <b>{ticket.deviceInfo?.model || '—'}</b></span>
                        <span>Màu: <b>{ticket.deviceInfo?.color || '—'}</b></span>
                        <span className="ml-auto">IMEI: <b>{ticket.deviceInfo?.imei ? ticket.deviceInfo.imei.slice(0, 4) + '****' + ticket.deviceInfo.imei.slice(-4) : '—'}</b></span>
                    </div>
                    <div className="flex gap-4">
                        <span>Phụ kiện đi kèm: <Uncheck /> Không &nbsp; <Uncheck /> Có (ghi rõ): ....................</span>
                    </div>
                    <div>
                        Tình trạng: <b>{ticket.issue?.description || '—'}</b>
                    </div>
                    <div className="flex gap-4 flex-wrap">
                        <span>Chuẩn bệnh: <b>{ticket.issue?.notes || '.................................'}</b></span>
                        <span className="ml-auto">Giá dự kiến: <b className="text-[12px]">{formatPrice(ticket.payment?.amount || 0)}</b></span>
                    </div>
                </div>

                {/* ═══════════ KIỂM TRA ĐẦU VÀO ═══════════ */}
                <div className="mb-2">
                    <h3 className="font-bold text-[11px] uppercase border-b border-gray-300 pb-[2px] mb-1">
                        Kiểm Tra Đầu Vào
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0">
                        {/* Cột 1 */}
                        <div className="space-y-0">
                            {renderCheckGroup('Vỏ máy', cl?.body, bodyOptions)}
                            {renderCheckGroup('Cảm ứng', cl?.touch, touchOptions)}
                            {renderCheckGroup('Loa/Mic', cl?.speaker, speakerOptions)}
                            {renderCheckGroup('Pin', cl?.battery, batteryOptions)}
                        </div>
                        {/* Cột 2 */}
                        <div className="space-y-0">
                            {renderCheckGroup('Màn hình', cl?.screen, screenOptions)}
                            {renderCheckGroup('Camera T/S', cl?.camera, cameraOptions)}
                            {renderCheckGroup('Kết nối', cl?.connectivity, connectivityOptions)}
                            {renderCheckGroup('Face/Vân tay', cl?.biometric, biometricOptions)}
                        </div>
                    </div>
                    {/* Lịch sử máy */}
                    <div className="mt-1 pb-1 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="font-bold text-[10px] uppercase shrink-0">Lịch sử máy:</span>
                        <span className="flex items-center gap-[2px] text-[10px]">
                            {cl?.hasPriorRepair ? <Check /> : <Uncheck />} Đã từng sửa
                        </span>
                        <span className="flex items-center gap-[2px] text-[10px]">
                            {cl?.hasWaterDamage ? <Check /> : <Uncheck />} Từng vào nước
                        </span>
                        <span className="flex items-center gap-[2px] text-[10px]">
                            {cl?.hasNonGenuineParts ? <Check /> : <Uncheck />} L.kiện lỗi/lô
                        </span>
                    </div>
                    <div className="mt-1 text-[10px] border-t border-dotted border-gray-300 pt-1">
                        Ghi chú khác: ...................................................
                    </div>
                </div>

                {/* ═══════════ LƯU Ý ═══════════ */}
                <div className="border border-gray-400 rounded p-2 mb-2 bg-gray-50">
                    <h3 className="font-bold text-[10px] uppercase mb-1">Lưu ý:</h3>
                    <ol className="text-[9px] text-gray-700 space-y-[1px] list-decimal list-inside leading-tight">
                        {cfg.notes.map((note, i) => (
                            <li key={i}>{note}</li>
                        ))}
                    </ol>
                </div>

                {/* ═══════════ CHỮ KÝ ═══════════ */}
                <div className="text-center text-[10px] text-gray-500 mb-2">
                    Ngày {now.getDate()} tháng {now.getMonth() + 1} năm {now.getFullYear()}
                </div>
                <div className="grid grid-cols-2 gap-8">
                    <div className="text-center text-[10px]">
                        <p className="font-bold mb-[50px]">Khách hàng</p>
                        <p className="text-gray-500 italic text-[9px]">(Ký và ghi rõ họ tên)</p>
                        <p className="mt-1 font-semibold">{ticket.customer.name}</p>
                    </div>
                    <div className="text-center text-[10px]">
                        <p className="font-bold mb-[50px]">Tiếp nhận</p>
                        <p className="text-gray-500 italic text-[9px]">(Ký và ghi rõ họ tên)</p>
                        <p className="mt-1 font-semibold">{ticket.staff?.createdByName || 'Admin'}</p>
                    </div>
                </div>

                {/* ═══════════ FOOTER ═══════════ */}
                <div className="text-center text-[8px] text-gray-400 mt-3 border-t border-gray-200 pt-1">
                    {cfg.footerText} Tiếp nhận khiếu nại: <b>{cfg.complaintHotline}</b>
                </div>
            </div>
        </div>
    );
}
