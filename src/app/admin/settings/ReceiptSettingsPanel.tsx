'use client';

import { useState, useEffect } from 'react';
import {
    Save, Loader2, Image as ImageIcon, Plus, Trash2, RotateCcw, Printer, X
} from 'lucide-react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getDoc } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import MediaManager from '@/components/admin/MediaManager';
import { toastError, toastSuccess } from '@/lib/toast';
import { WarrantyTemplateConfig, WarrantyConfigForm, WarrantyPreview } from './receipt/WarrantyComponents';

// ── Receipt Config Interface ──
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
    warrantyDevice?: WarrantyTemplateConfig;
    warrantyRepair?: WarrantyTemplateConfig;
    warrantyAccessory?: WarrantyTemplateConfig;
}

const defaultConfig: ReceiptConfig = {
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
    invoice: {
        title: 'HÓA ĐƠN DỊCH VỤ SỬA CHỮA',
        showCustomerInfo: true,
        showDeviceInfo: true,
        showImei: false,
        showIssueDescription: true,
        showPartsUsed: true,
        showCostBreakdown: true,
        showPaymentNote: true,
        showSignatures: true,
        footerText: 'Cảm ơn Quý khách đã sử dụng dịch vụ của Văn Lành Service.',
        complaintHotline: '0932.24.20.26',
        maxWidthPx: 620,
        baseFontSizePx: 11,
    },
    warrantyDevice: {
        title: 'PHIẾU BẢO HÀNH THIẾT BỊ',
        notesTitle: 'Dùng thử 7 ngày miễn phí:',
        notes: [
            'Áp dụng tất cả sản phẩm (Điện thoại, Tablet, Laptop...) mua tại cửa hàng.',
            'Quý khách hoàn toàn thoải mái đổi máy mới (Cùng loại/khác loại) hoặc trả máy không cần lý do.',
            'Nếu sản phẩm bị lỗi do NSX quý khách được hoàn trả 100% chi phí.',
            'LƯU Ý: máy đổi trả phải còn đầy đủ tem và phiếu bảo hành, được giữ nguyên hiện trạng ban đầu. Lỗi cấn móp, rơi vỡ... từ chối bảo hành.'
        ],
        tableStyle: '2col',
        tableHeaders: ['THỜI GIAN', 'QUYỀN LỢI BẢO HÀNH'],
        tableRows: [
            { id: '1', col1: '6 tháng', col1Sub: 'Bảo hành tiêu chuẩn', benefits: [
                'Hư lỗi liên quan tới lỗi phần cứng (bảo hành 6 tháng)',
                'Từ ngày thứ 31 đến hết 6 tháng, chi phí kiểm tra sửa chữa do cửa hàng chịu trách nhiệm.',
                'Trong 30 ngày đầu (có tính 7 ngày trải nghiệm), cửa hàng 1 đổi 1 hoặc nhập lại máy với chiết khấu từ 15%.',
                'Sau 30 ngày nhập lại máy theo giá thoả thuận.'
            ] }
        ],
        footerNote: 'LƯU Ý: Máy gửi bảo hành phải còn đầy đủ tem và phiếu bảo hành.'
    },
    warrantyRepair: {
        title: 'PHIẾU BẢO HÀNH SỬA CHỮA',
        notesTitle: 'MIỄN PHÍ TRỌN ĐỜI:',
        notes: [
            'Bảo hành miễn phí trọn đời trong trường hợp hở keo, hở ron bụi bọt màn hình...',
            'Bảo hành miễn phí trọn đời hở keo linh kiện thay thế.'
        ],
        tableStyle: '3col',
        tableHeaders: ['DỊCH VỤ', 'THỜI GIAN', 'QUYỀN LỢI BẢO HÀNH'],
        tableRows: [
            { id: '1', col1: 'THAY PIN', col1Sub: '3 - 12 tháng', benefits: [
                'Thay pin iPhone (6 tháng)',
                'Thay pin iPad (6 tháng)',
                'Thay pin Macbook (12 tháng)',
                'Thay pin Apple Watch (3 tháng)',
                'Thay pin Android (3-6 tháng)'
            ] },
            { id: '2', col1: 'THAY MÀN', col1Sub: '30 ngày', benefits: [
                'Không bảo hành sọc màn, vỡ mực do tỳ đè, cấn vỡ kính, vô nước, mất tem ráp máy...',
                'Bảo hành cảm ứng 30 ngày.'
            ] },
            { id: '3', col1: 'THAY LINH KIỆN', col1Sub: '3 tháng', benefits: [
                'Sửa chữa phần cứng (mainboard)',
                'Sửa lỗi FaceID, vân tay...',
                'Loa trong, loa ngoài, mic...',
                'Cụm chân sạc, rung, wifi...',
                'Cáp volume, cáp nguồn...'
            ] }
        ],
        footerNote: 'LƯU Ý: Máy gửi bảo hành phải còn đầy đủ tem và phiếu bảo hành.'
    },
    warrantyAccessory: {
        title: 'PHIẾU BẢO HÀNH PHỤ KIỆN',
        notesTitle: 'LƯU Ý:',
        notes: [
            'Sản phẩm đổi/trả phải còn tem Bảo hành, được giữ nguyên hiện trạng ban đầu (còn hộp nếu có).',
            'Từ chối bảo hành đối với các trường hợp: Rơi rớt, cấn móp, vô nước, đứt dây, gãy chân sạc...'
        ],
        tableStyle: '2col',
        tableHeaders: ['THỜI GIAN', 'QUYỀN LỢI BẢO HÀNH'],
        tableRows: [
            { id: '1', col1: 'PIN SẠC DỰ PHÒNG', col1Sub: '6 tháng', benefits: ['Hư lỗi liên quan tới phần cứng do nhà sản xuất'] },
            { id: '2', col1: 'BỘ SẠC CÁP/CỐC', col1Sub: '1 tháng', benefits: ['Hư lỗi liên quan tới phần cứng do nhà sản xuất'] },
            { id: '3', col1: 'AIRPODS, AP WATCH', col1Sub: '3 tháng', benefits: ['Hư lỗi liên quan tới phần cứng do nhà sản xuất'] },
            { id: '4', col1: 'BAO DA, ỐP LƯNG', col1Sub: 'Không BH', benefits: ['Vui lòng kiểm tra kỹ trước khi thanh toán'] },
            { id: '5', col1: 'DÁN MÀN, PPF', col1Sub: 'Không BH', benefits: ['Vui lòng kiểm tra kỹ trước khi thanh toán'] }
        ],
        footerNote: ''
    }
};

export default function ReceiptSettingsPanel() {
    const [config, setConfig] = useState<ReceiptConfig>(defaultConfig);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showMediaManager, setShowMediaManager] = useState(false);
    const [previewTab, setPreviewTab] = useState<'receipt' | 'invoice' | 'warrantyDevice' | 'warrantyRepair' | 'warrantyAccessory'>('receipt');

    // ── Load config ──
    useEffect(() => {
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'system_config', 'receipt'));
                if (snap.exists()) {
                    const data = snap.data() as Partial<ReceiptConfig>;
                    setConfig(prev => ({ ...prev, ...data }));
                }
            } catch (err) {
                console.error('Error loading receipt config:', err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // ── Save config ──
    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'system_config', 'receipt'), {
                ...config,
                updatedAt: serverTimestamp(),
            }, { merge: true });
            toastSuccess('Đã lưu cấu hình biên nhận!');
        } catch (err) {
            console.error(err);
            toastError('Lỗi khi lưu!');
        } finally {
            setSaving(false);
        }
    };

    // ── Reset to defaults ──
    const handleReset = () => {
        if (!confirm('Khôi phục về mặc định? Dữ liệu hiện tại sẽ bị ghi đè khi Lưu.')) return;
        setConfig(defaultConfig);
    };

    // ── Note helpers ──
    const updateNote = (index: number, value: string) => {
        setConfig(prev => ({
            ...prev,
            notes: prev.notes.map((n, i) => i === index ? value : n),
        }));
    };
    const addNote = () => {
        setConfig(prev => ({ ...prev, notes: [...prev.notes, ''] }));
    };
    const removeNote = (index: number) => {
        if (config.notes.length <= 1) return;
        setConfig(prev => ({ ...prev, notes: prev.notes.filter((_, i) => i !== index) }));
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
                <Loader2 className="animate-spin text-orange-500" size={40} />
                <p className="text-gray-500">Đang tải cấu hình biên nhận...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 bg-gray-50 z-40 py-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Printer className="text-orange-500" /> Mẫu Biên Nhận Sửa Chữa
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Tuỳ chỉnh nội dung, logo và khung biên nhận in</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleReset}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors text-sm font-semibold">
                        <RotateCcw size={16} /> Mặc định
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 shadow-lg shadow-green-200/50 disabled:opacity-50 transition-all active:scale-95">
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Lưu cấu hình
                    </button>
                </div>
            </div>

            {/* ── 2 Columns: Editor + Preview ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

                {/* ════ CỘT TRÁI: FORM CHỈNH SỬA ════ */}
                <div className="space-y-6">

                    {/* Logo */}
                    <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                        <legend className="text-sm font-bold text-gray-900 px-2">📸 Logo</legend>
                        <div className="flex items-center gap-4">
                            {config.logoUrl ? (
                                <div className="relative w-20 h-20 border-2 border-gray-200 rounded-lg overflow-hidden group">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={config.logoUrl} alt="Logo" className="w-full h-full object-contain bg-white" />
                                    <button
                                        title="Xóa logo"
                                        onClick={() => setConfig(prev => ({ ...prev, logoUrl: '' }))}
                                        className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400">
                                    <ImageIcon size={24} />
                                </div>
                            )}
                            <button
                                onClick={() => setShowMediaManager(true)}
                                className="px-4 py-2 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg text-sm font-semibold hover:bg-orange-100 transition-colors"
                            >
                                <ImageIcon size={14} className="inline mr-1.5 -mt-0.5" />
                                Chọn từ Media
                            </button>
                        </div>
                    </fieldset>

                    {/* Header Info */}
                    <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                        <legend className="text-sm font-bold text-gray-900 px-2">🏪 Thông tin cửa hàng</legend>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Tên cửa hàng</label>
                            <input title="Tên cửa hàng" type="text" value={config.shopName}
                                onChange={e => setConfig(prev => ({ ...prev, shopName: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Mô tả / Slogan</label>
                            <input title="Mô tả / Slogan" type="text" value={config.shopTitle}
                                onChange={e => setConfig(prev => ({ ...prev, shopTitle: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Địa chỉ</label>
                            <input title="Địa chỉ" type="text" value={config.address}
                                onChange={e => setConfig(prev => ({ ...prev, address: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Hotline</label>
                            <input title="Hotline" type="text" value={config.hotline}
                                onChange={e => setConfig(prev => ({ ...prev, hotline: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                        </div>
                    </fieldset>

                    {(previewTab === 'receipt' || previewTab === 'invoice') && (
                        <>
                            {/* Receipt Title */}
                            <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                        <legend className="text-sm font-bold text-gray-900 px-2">📋 Tiêu đề biên nhận</legend>
                        <input title="Tiêu đề biên nhận" type="text" value={config.receiptTitle}
                            onChange={e => setConfig(prev => ({ ...prev, receiptTitle: e.target.value }))}
                            className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-black text-center uppercase tracking-wider" />
                    </fieldset>

                    {/* Notes */}
                    <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                        <legend className="text-sm font-bold text-gray-900 px-2">⚠️ Lưu ý (hiển thị trên biên nhận)</legend>
                        <div className="space-y-2">
                            {config.notes.map((note, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <span className="text-xs text-gray-400 font-bold mt-2.5 shrink-0 w-5 text-right">{i + 1}.</span>
                                    <textarea
                                        rows={2}
                                        title="Lưu ý"
                                        value={note}
                                        onChange={e => updateNote(i, e.target.value)}
                                        className="flex-1 px-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:outline-none resize-none"
                                    />
                                    {config.notes.length > 1 && (
                                        <button title="Xóa lưu ý" onClick={() => removeNote(i)}
                                            className="mt-1.5 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button title="Thêm lưu ý" onClick={addNote}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                            <Plus size={14} /> Thêm dòng lưu ý
                        </button>
                    </fieldset>

                    {/* Footer */}
                    <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                        <legend className="text-sm font-bold text-gray-900 px-2">📝 Footer</legend>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Dòng cuối biên nhận</label>
                            <input title="Dòng cuối biên nhận" type="text" value={config.footerText}
                                onChange={e => setConfig(prev => ({ ...prev, footerText: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Hotline khiếu nại</label>
                            <input title="Hotline khiếu nại" type="text" value={config.complaintHotline}
                                onChange={e => setConfig(prev => ({ ...prev, complaintHotline: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                        </div>
                    </fieldset>

                    {/* Invoice settings */}
                    <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                        <legend className="text-sm font-bold text-gray-900 px-2">🧾 Mẫu Hóa Đơn (khi hoàn tất sửa chữa)</legend>

                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Tiêu đề hóa đơn</label>
                            <input
                                title="Tiêu đề hóa đơn"
                                type="text"
                                value={config.invoice?.title || ''}
                                onChange={(e) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        invoice: { ...(prev.invoice || {}), title: e.target.value },
                                    }))
                                }
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-black text-center uppercase tracking-wider"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {(
                                [
                                    ['showCustomerInfo', 'Hiện thông tin khách hàng'],
                                    ['showDeviceInfo', 'Hiện thông tin thiết bị'],
                                    ['showImei', 'Hiện IMEI (không khuyến nghị)'],
                                    ['showIssueDescription', 'Hiện nội dung sửa chữa'],
                                    ['showPartsUsed', 'Hiện linh kiện đã sử dụng'],
                                    ['showCostBreakdown', 'Hiện bảng chi phí'],
                                    ['showPaymentNote', 'Hiện ghi chú thanh toán'],
                                    ['showSignatures', 'Hiện khung chữ ký'],
                                ] as const
                            ).map(([key, label]) => (
                                <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        title={label}
                                        type="checkbox"
                                        checked={Boolean(config.invoice?.[key])}
                                        onChange={(e) =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                invoice: { ...(prev.invoice || {}), [key]: e.target.checked },
                                            }))
                                        }
                                        className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Max width (px)</label>
                                <input
                                    title="Max width (px)"
                                    type="number"
                                    value={config.invoice?.maxWidthPx ?? 620}
                                    onChange={(e) =>
                                        setConfig((prev) => ({
                                            ...prev,
                                            invoice: { ...(prev.invoice || {}), maxWidthPx: Number(e.target.value) || 620 },
                                        }))
                                    }
                                    className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Cỡ chữ base (px)</label>
                                <input
                                    title="Cỡ chữ base (px)"
                                    type="number"
                                    value={config.invoice?.baseFontSizePx ?? 11}
                                    onChange={(e) =>
                                        setConfig((prev) => ({
                                            ...prev,
                                            invoice: { ...(prev.invoice || {}), baseFontSizePx: Number(e.target.value) || 11 },
                                        }))
                                    }
                                    className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Footer hóa đơn</label>
                            <input
                                title="Footer hóa đơn"
                                type="text"
                                value={config.invoice?.footerText || ''}
                                onChange={(e) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        invoice: { ...(prev.invoice || {}), footerText: e.target.value },
                                    }))
                                }
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Hotline khiếu nại (hóa đơn)</label>
                            <input
                                title="Hotline khiếu nại (hóa đơn)"
                                type="text"
                                value={config.invoice?.complaintHotline || ''}
                                onChange={(e) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        invoice: { ...(prev.invoice || {}), complaintHotline: e.target.value },
                                    }))
                                }
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            />
                        </div>
                    </fieldset>


                        </>
                    )}

                    {previewTab === 'warrantyDevice' && config.warrantyDevice && (
                        <WarrantyConfigForm
                            config={config.warrantyDevice}
                            onChange={updated => setConfig(prev => ({ ...prev, warrantyDevice: updated }))}
                        />
                    )}
                    {previewTab === 'warrantyRepair' && config.warrantyRepair && (
                        <WarrantyConfigForm
                            config={config.warrantyRepair}
                            onChange={updated => setConfig(prev => ({ ...prev, warrantyRepair: updated }))}
                        />
                    )}
                    {previewTab === 'warrantyAccessory' && config.warrantyAccessory && (
                        <WarrantyConfigForm
                            config={config.warrantyAccessory}
                            onChange={updated => setConfig(prev => ({ ...prev, warrantyAccessory: updated }))}
                        />
                    )}
                </div>

                {/* ════ CỘT PHẢI: LIVE PREVIEW ════ */}
                <div className="sticky top-20">
                    <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 border-b border-orange-100 flex items-center gap-2">
                            <Printer size={16} className="text-orange-500" />
                            <span className="text-sm font-bold text-orange-800">Xem trước bản in (A5)</span>
                            <div className="ml-auto flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setPreviewTab('receipt')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${previewTab === 'receipt'
                                        ? 'bg-white text-orange-700 border-orange-200'
                                        : 'bg-transparent text-orange-700/70 border-transparent hover:border-orange-200 hover:bg-white/60'
                                        }`}
                                    title="Xem trước Biên nhận"
                                >
                                    Biên nhận
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewTab('invoice')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors ${previewTab === 'invoice'
                                        ? 'bg-white text-emerald-700 border-emerald-200'
                                        : 'bg-transparent text-emerald-700/70 border-transparent hover:border-emerald-200 hover:bg-white/60'
                                        }`}
                                    title="Xem trước Hóa đơn"
                                >
                                    Hóa đơn
                                </button>
                                <button type="button" onClick={() => setPreviewTab('warrantyDevice')} className={`px-2 py-1 rounded-lg text-xs font-bold border transition-colors ${previewTab === 'warrantyDevice' ? 'bg-white text-blue-700 border-blue-200' : 'bg-transparent text-blue-700/70 border-transparent hover:border-blue-200 hover:bg-white/60'}`} title="Bảo hành Thiết bị">BH Thiết bị</button>
                                <button type="button" onClick={() => setPreviewTab('warrantyRepair')} className={`px-2 py-1 rounded-lg text-xs font-bold border transition-colors ${previewTab === 'warrantyRepair' ? 'bg-white text-purple-700 border-purple-200' : 'bg-transparent text-purple-700/70 border-transparent hover:border-purple-200 hover:bg-white/60'}`} title="Bảo hành Sửa chữa">BH Sửa chữa</button>
                                <button type="button" onClick={() => setPreviewTab('warrantyAccessory')} className={`px-2 py-1 rounded-lg text-xs font-bold border transition-colors ${previewTab === 'warrantyAccessory' ? 'bg-white text-pink-700 border-pink-200' : 'bg-transparent text-pink-700/70 border-transparent hover:border-pink-200 hover:bg-white/60'}`} title="Bảo hành Phụ kiện">BH Phụ kiện</button>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-100">
                            <div title="Xem trước" className="bg-white shadow-md mx-auto text-black max-w-[400px] p-4 text-[10px] leading-[1.6]">

                                {previewTab === 'receipt' && (
                                    <>
                                        {/* HEADER */}
                                        <div title="Header" className="flex items-start gap-[10px] mb-[6px]">
                                            {config.logoUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={config.logoUrl} alt="Logo" className="w-[50px] h-[50px] object-contain rounded-md border border-[#ddd]" />
                                            ) : (
                                                <div className="w-[50px] h-[50px] border-2 border-[#333] rounded-md flex items-center justify-center text-[7px] font-black text-center">
                                                    VĂN<br />LÀNH
                                                </div>
                                            )}
                                            <div title="Thông tin cửa hàng" className="flex-1 text-right">
                                                <p className="font-black text-[9px] uppercase leading-[1.2]">
                                                    {config.shopTitle}
                                                </p>
                                                <p className="font-black text-[11px] uppercase tracking-[1px]">
                                                    {config.shopName}
                                                </p>
                                                <p className="text-[8px] text-[#666] mt-[2px]">{config.address}</p>
                                                <p className="text-[8px] text-[#666]">Hotline: <b>{config.hotline}</b></p>
                                            </div>
                                        </div>

                                        {/* TITLE */}
                                        <h1 title="Title" className="text-center font-black text-[14px] uppercase tracking-[2px] my-[8px] border-y-2 border-[#333] py-[4px]">
                                            {config.receiptTitle}
                                        </h1>

                                        {/* MOCK DATA */}
                                        <div title="Mock data" className="text-[9px] text-[#666] flex justify-between mb-1">
                                            <span>Mã phiếu: <b className="text-black">#AB12CD</b></span>
                                            <span>Ngày: <b className="text-black">{new Date().toLocaleDateString('vi-VN')}</b></span>
                                        </div>

                                        <div title="Thông tin khách hàng" className="border-b border-dotted border-[#aaa] pb-2 mb-2 text-[9px]">
                                            <div title="Thông tin khách hàng" className="flex justify-between">
                                                <span>Khách hàng: <b>Nguyễn Văn A</b></span>
                                                <span>SĐT: <b>0912 345 678</b></span>
                                            </div>
                                            <div title="Thông tin thiết bị" className="flex justify-between flex-wrap gap-1">
                                                <span>Thiết bị: <b>iPhone 15 Pro Max</b></span>
                                                <span>Màu: <b>Titan Đen</b></span>
                                                <span>IMEI: <b>3568****1234</b></span>
                                            </div>
                                            <div>Tình trạng: <b>Thay màn hình, ép kính</b></div>
                                            <div title="Thông tin chuẩn bị" className="flex justify-between">
                                                <span>Chuẩn bệnh: <b>Nứt kính ngoài, LCD ok</b></span>
                                                <span>Giá dự kiến: <b>1,500,000đ</b></span>
                                            </div>
                                        </div>

                                        {/* CHECKLIST */}
                                        <div title="Kiểm tra đầu vào" className="mb-2">
                                            <h3 className="font-bold text-[9px] uppercase border-b border-[#ccc] pb-0.5 mb-1">Kiểm Tra Đầu Vào</h3>
                                            <div title="Kiểm tra đầu vào" className="grid grid-cols-2 gap-x-3 text-[8px]">
                                                <div>
                                                    <span><b>VỎ MÁY:</b> ☑Trầy ☐Bể ☐BTH</span><br />
                                                    <span><b>CẢM ỨNG:</b> ☐Liệt ☐Chập ☑OK</span><br />
                                                    <span><b>LOA/MIC:</b> ☐Lỗi ☑OK</span><br />
                                                    <span><b>PIN:</b> ☐Phồng ☐K nhận sạc ☑OK</span>
                                                </div>
                                                <div>
                                                    <span><b>MÀN HÌNH:</b> ☐Ám ☐Sọc ☑OK</span><br />
                                                    <span><b>CAMERA:</b> ☐Mờ ☐Lỗi ☑OK</span><br />
                                                    <span><b>KẾT NỐI:</b> ☐Wi-Fi ☐BT ☑OK</span><br />
                                                    <span><b>FACE/VÂN TAY:</b> ☐Không nhận ☑OK</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 text-[8px] mt-1 flex-wrap">
                                                <span className="font-bold">LỊCH SỬ MÁY:</span>
                                                <span>☑ Đã từng sửa</span>
                                                <span>☐ Từng vào nước</span>
                                                <span>☑ L.kiện lỗi/lô</span>
                                            </div>
                                            <div className="text-[8px] mt-1 border-t border-dotted border-[#ccc] pt-1">Ghi chú khác: ..............................................</div>
                                        </div>

                                        {/* NOTES */}
                                        <div title="Lưu ý" className="border border-[#bbb] rounded-[4px] p-1.5 mb-2 bg-[#fafafa]">
                                            <h3 className="font-bold text-[8px] uppercase mb-[3px]">Lưu ý:</h3>
                                            <ol className="text-[7px] text-[#555] m-0 pl-3 leading-[1.4] list-decimal">
                                                {config.notes.map((note, i) => (
                                                    <li key={i}>{note || '...'}</li>
                                                ))}
                                            </ol>
                                        </div>

                                        {/* SIGNATURES */}
                                        <div title="Ngày in" className="text-center text-[8px] text-[#888] mb-1.5">
                                            Ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
                                        </div>
                                        <div title="Khách hàng và Tiếp nhận" className="grid grid-cols-2 gap-6">
                                            <div className="text-center text-[8px]">
                                                <p className="font-bold mb-9">Khách hàng</p>
                                                <p className="text-[#999] italic text-[7px]">(Ký và ghi rõ họ tên)</p>
                                                <p className="font-semibold mt-1">Nguyễn Văn A</p>
                                            </div>
                                            <div title="Tiếp nhận" className="text-center text-[8px]">
                                                <p className="font-bold mb-9">Tiếp nhận</p>
                                                <p className="text-[#999] italic text-[7px]">(Ký và ghi rõ họ tên)</p>
                                                <p className="font-semibold mt-1">Admin</p>
                                            </div>
                                        </div>

                                        {/* FOOTER */}
                                        <div title="Footer" className="text-center text-[6px] text-[#aaa] mt-2.5 border-t border-[#eee] pt-1">
                                            {config.footerText} Tiếp nhận khiếu nại: <b>{config.complaintHotline}</b>
                                        </div>
                                    </>
                                )}

                                {previewTab === 'invoice' && (() => {
                                    const inv = config.invoice || {};
                                    const showCustomerInfo = inv.showCustomerInfo ?? true;
                                    const showDeviceInfo = inv.showDeviceInfo ?? true;
                                    const showImei = inv.showImei ?? false;
                                    const showIssueDescription = inv.showIssueDescription ?? true;
                                    const showPartsUsed = inv.showPartsUsed ?? true;
                                    const showCostBreakdown = inv.showCostBreakdown ?? true;
                                    const showPaymentNote = inv.showPaymentNote ?? true;
                                    const showSignatures = inv.showSignatures ?? true;

                                    const partsCost = 950000;
                                    const laborCost = 450000;
                                    const additionalFees = 100000;
                                    const deposit = 200000;
                                    const total = partsCost + laborCost + additionalFees;
                                    const customerPay = Math.max(total - deposit, 0);

                                    return (
                                        <>
                                            {/* HEADER */}
                                            <div className="flex items-start gap-[10px] mb-[6px]">
                                                {config.logoUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={config.logoUrl} alt="Logo" className="w-[50px] h-[50px] object-contain rounded-md border border-[#ddd]" />
                                                ) : (
                                                    <div className="w-[50px] h-[50px] border-2 border-[#333] rounded-md flex items-center justify-center text-[7px] font-black text-center">
                                                        VĂN<br />LÀNH
                                                    </div>
                                                )}
                                                <div className="flex-1 text-right">
                                                    <p className="font-black text-[9px] uppercase leading-[1.2]">
                                                        {config.shopTitle}
                                                    </p>
                                                    <p className="font-black text-[11px] uppercase tracking-[1px]">
                                                        {config.shopName}
                                                    </p>
                                                    <p className="text-[8px] text-[#666] mt-[2px]">{config.address}</p>
                                                    <p className="text-[8px] text-[#666]">Hotline: <b>{config.hotline}</b></p>
                                                </div>
                                            </div>

                                            {/* TITLE */}
                                            <h1 className="text-center font-black text-[14px] uppercase tracking-[2px] my-[8px] border-y-2 border-[#333] py-[4px]">
                                                {inv.title || 'HÓA ĐƠN DỊCH VỤ SỬA CHỮA'}
                                            </h1>

                                            {/* META */}
                                            <div className="text-[9px] text-[#666] flex justify-between mb-1.5">
                                                <span>Mã phiếu: <b className="text-black">#AB12CD</b></span>
                                                <span>Ngày in: <b className="text-black">{new Date().toLocaleDateString('vi-VN')}</b></span>
                                            </div>

                                            {(showCustomerInfo || showDeviceInfo || showIssueDescription) && (
                                                <div className="border border-[#ddd] rounded-md p-2 mb-2 text-[9px]">
                                                    {showCustomerInfo && (
                                                        <div className="flex justify-between gap-2">
                                                            <span>Khách hàng: <b>Nguyễn Văn A</b></span>
                                                            <span>SĐT: <b>0912 345 678</b></span>
                                                        </div>
                                                    )}
                                                    {showDeviceInfo && (
                                                        <div className="flex justify-between flex-wrap gap-1.5 mt-1">
                                                            <span>Thiết bị: <b>iPhone 15 Pro Max</b></span>
                                                            <span>Màu: <b>Titan Đen</b></span>
                                                            {showImei && <span>IMEI: <b>3568 1234 5678 1234</b></span>}
                                                        </div>
                                                    )}
                                                    {showIssueDescription && (
                                                        <div className="mt-1">
                                                            Nội dung sửa chữa: <b>Thay màn hình + vệ sinh máy</b>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {showPartsUsed && (
                                                <div className="border border-[#ddd] rounded-md p-2 mb-2 text-[9px]">
                                                    <div className="font-extrabold uppercase text-[8px] mb-1">Linh kiện đã sử dụng</div>
                                                    <div className="flex justify-between">
                                                        <span><b>Màn hình iPhone</b> <span className="text-[#999]">×1</span></span>
                                                        <span><b>950,000đ</b></span>
                                                    </div>
                                                </div>
                                            )}

                                            {showCostBreakdown && (
                                                <div title="Bảng chi phí" className="border border-[#ddd] rounded-md overflow-hidden mb-2 text-[9px]">
                                                    <div title="Header" className="bg-[#f5f5f5] px-2 py-1.5 font-extrabold flex">
                                                        <span className="w-[28px]">STT</span>
                                                        <span className="flex-1">Hạng mục</span>
                                                        <span className="w-[90px] text-right">Thành tiền</span>
                                                    </div>
                                                    <div title="Linh kiện / vật tư" className="px-2 py-1.5 flex border-t border-[#eee]">
                                                        <span className="w-[28px]">1</span>
                                                        <span className="flex-1">Linh kiện / vật tư</span>
                                                        <span className="w-[90px] text-right"><b>{partsCost.toLocaleString('vi-VN')}đ</b></span>
                                                    </div>
                                                    <div title="Tiền công" className="px-2 py-1.5 flex border-t border-[#eee]">
                                                        <span className="w-[28px]">2</span>
                                                        <span className="flex-1">Tiền công</span>
                                                        <span className="w-[90px] text-right"><b>{laborCost.toLocaleString('vi-VN')}đ</b></span>
                                                    </div>
                                                    <div title="Phát sinh" className="px-2 py-1.5 flex border-t border-[#eee]">
                                                        <span className="w-[28px]">3</span>
                                                        <span className="flex-1">Phát sinh</span>
                                                        <span className="w-[90px] text-right"><b>{additionalFees.toLocaleString('vi-VN')}đ</b></span>
                                                    </div>
                                                    {/* TOTAL */}
                                                    <div title="Tổng cộng" className="px-2 py-1.5 flex border-t border-[#ddd] font-black">
                                                        <span className="flex-1 text-right">TỔNG CỘNG:</span>
                                                        <span className="w-[90px] text-right">{total.toLocaleString('vi-VN')}đ</span>
                                                    </div>
                                                    {deposit > 0 && (
                                                        <div title="Đã đặt cọc" className="px-2 py-1.5 flex border-t border-[#eee] text-[#a16207] font-extrabold">
                                                            <span className="flex-1 text-right">Đã đặt cọc:</span>
                                                            <span className="w-[90px] text-right">-{deposit.toLocaleString('vi-VN')}đ</span>
                                                        </div>
                                                    )}
                                                    <div title="Khách thanh toán" className="px-2 py-1.5 flex border-t border-[#eee] font-black">
                                                        <span className="flex-1 text-right">KHÁCH THANH TOÁN:</span>
                                                        <span className="w-[90px] text-right text-[#dc2626]">{customerPay.toLocaleString('vi-VN')}đ</span>
                                                    </div>
                                                </div>
                                            )}
                                            {showPaymentNote && (
                                                <div title="Ghi chú thanh toán" className="text-[8px] text-[#555] mb-2">
                                                    Ghi chú thanh toán: Khách thanh toán chuyển khoản.
                                                </div>
                                            )}

                                            {showSignatures && (
                                                <div title="Chữ ký" className="grid grid-cols-2 gap-6 mt-2.5">
                                                    <div title="Khách hàng" className="text-center text-[8px]">
                                                        <div className="font-extrabold mb-7">KHÁCH HÀNG</div>
                                                        <div className="text-[#999] italic text-[7px]">(Ký và ghi rõ họ tên)</div>
                                                        <div className="font-bold mt-1">Nguyễn Văn A</div>
                                                    </div>
                                                    <div title="Thu ngân / Kế toán" className="text-center text-[8px]">
                                                        <div className="font-extrabold mb-7">THU NGÂN / KẾ TOÁN</div>
                                                        <div className="text-[#999] italic text-[7px]">(Ký và ghi rõ họ tên)</div>
                                                        <div className="font-bold mt-1">KTV</div>
                                                    </div>
                                                </div>
                                            )}

                                            <div title="Footer" className="text-center text-[6px] text-[#aaa] mt-2.5 border-t border-[#eee] pt-1">
                                                {inv.footerText || 'Cảm ơn Quý khách đã sử dụng dịch vụ.'} Khiếu nại/Bảo hành xin liên hệ: <b>{inv.complaintHotline || config.complaintHotline}</b>
                                            </div>
                                        </>
                                    );
                                })()}

                                {previewTab === 'warrantyDevice' && config.warrantyDevice && (
                                    <WarrantyPreview globalConfig={config} warrantyConfig={config.warrantyDevice} type="device" />
                                )}
                                {previewTab === 'warrantyRepair' && config.warrantyRepair && (
                                    <WarrantyPreview globalConfig={config} warrantyConfig={config.warrantyRepair} type="repair" />
                                )}
                                {previewTab === 'warrantyAccessory' && config.warrantyAccessory && (
                                    <WarrantyPreview globalConfig={config} warrantyConfig={config.warrantyAccessory} type="accessory" />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Media Manager Modal ── */}
            <MediaManager
                title="Chọn Logo Biên Nhận"
                isOpen={showMediaManager}
                onClose={() => setShowMediaManager(false)}
                defaultFolder="logo-brand"
                onSelect={(url) => {
                    setConfig(prev => ({ ...prev, logoUrl: url }));
                    setShowMediaManager(false);
                }}
            />
        </div>
    );
}
