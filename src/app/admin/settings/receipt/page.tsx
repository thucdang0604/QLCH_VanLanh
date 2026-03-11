'use client';

import { useState, useEffect } from 'react';
import {
    Save, Loader2, Image as ImageIcon, Plus, Trash2, RotateCcw, Printer, X
} from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import MediaManager from '@/components/admin/MediaManager';

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
};

export default function ReceiptSettingsPage() {
    const [config, setConfig] = useState<ReceiptConfig>(defaultConfig);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showMediaManager, setShowMediaManager] = useState(false);

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
            alert('Đã lưu cấu hình biên nhận!');
        } catch (err) {
            console.error(err);
            alert('Lỗi khi lưu!');
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
                            <input type="text" value={config.shopName}
                                onChange={e => setConfig(prev => ({ ...prev, shopName: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Mô tả / Slogan</label>
                            <input type="text" value={config.shopTitle}
                                onChange={e => setConfig(prev => ({ ...prev, shopTitle: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Địa chỉ</label>
                            <input type="text" value={config.address}
                                onChange={e => setConfig(prev => ({ ...prev, address: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Hotline</label>
                            <input type="text" value={config.hotline}
                                onChange={e => setConfig(prev => ({ ...prev, hotline: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                        </div>
                    </fieldset>

                    {/* Receipt Title */}
                    <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                        <legend className="text-sm font-bold text-gray-900 px-2">📋 Tiêu đề biên nhận</legend>
                        <input type="text" value={config.receiptTitle}
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
                                        value={note}
                                        onChange={e => updateNote(i, e.target.value)}
                                        className="flex-1 px-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:outline-none resize-none"
                                    />
                                    {config.notes.length > 1 && (
                                        <button onClick={() => removeNote(i)}
                                            className="mt-1.5 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button onClick={addNote}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                            <Plus size={14} /> Thêm dòng lưu ý
                        </button>
                    </fieldset>

                    {/* Footer */}
                    <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                        <legend className="text-sm font-bold text-gray-900 px-2">📝 Footer</legend>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Dòng cuối biên nhận</label>
                            <input type="text" value={config.footerText}
                                onChange={e => setConfig(prev => ({ ...prev, footerText: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Hotline khiếu nại</label>
                            <input type="text" value={config.complaintHotline}
                                onChange={e => setConfig(prev => ({ ...prev, complaintHotline: e.target.value }))}
                                className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                        </div>
                    </fieldset>
                </div>

                {/* ════ CỘT PHẢI: LIVE PREVIEW ════ */}
                <div className="sticky top-20">
                    <div className="bg-white rounded-xl border-2 border-gray-200 shadow-lg overflow-hidden">
                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 border-b border-orange-100 flex items-center gap-2">
                            <Printer size={16} className="text-orange-500" />
                            <span className="text-sm font-bold text-orange-800">Xem trước bản in (A5)</span>
                        </div>
                        <div className="p-4 bg-gray-100">
                            <div className="bg-white shadow-md mx-auto text-black" style={{ maxWidth: '400px', padding: '16px', fontSize: '10px', lineHeight: '1.6' }}>

                                {/* HEADER */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '6px' }}>
                                    {config.logoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={config.logoUrl} alt="Logo" style={{ width: 50, height: 50, objectFit: 'contain', borderRadius: 6, border: '1px solid #ddd' }} />
                                    ) : (
                                        <div style={{ width: 50, height: 50, border: '2px solid #333', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 900, textAlign: 'center' }}>
                                            VĂN<br />LÀNH
                                        </div>
                                    )}
                                    <div style={{ flex: 1, textAlign: 'right' }}>
                                        <p style={{ fontWeight: 900, fontSize: 9, textTransform: 'uppercase', lineHeight: 1.2 }}>
                                            {config.shopTitle}
                                        </p>
                                        <p style={{ fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                                            {config.shopName}
                                        </p>
                                        <p style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{config.address}</p>
                                        <p style={{ fontSize: 8, color: '#666' }}>Hotline: <b>{config.hotline}</b></p>
                                    </div>
                                </div>

                                {/* TITLE */}
                                <h1 style={{ textAlign: 'center', fontWeight: 900, fontSize: 14, textTransform: 'uppercase', letterSpacing: 2, margin: '8px 0', borderTop: '2px solid #333', borderBottom: '2px solid #333', padding: '4px 0' }}>
                                    {config.receiptTitle}
                                </h1>

                                {/* MOCK DATA */}
                                <div style={{ fontSize: 9, color: '#666', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span>Mã phiếu: <b style={{ color: '#000' }}>#AB12CD</b></span>
                                    <span>Ngày: <b style={{ color: '#000' }}>{new Date().toLocaleDateString('vi-VN')}</b></span>
                                </div>

                                <div style={{ borderBottom: '1px dotted #aaa', paddingBottom: 8, marginBottom: 8, fontSize: 9 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Khách hàng: <b>Nguyễn Văn A</b></span>
                                        <span>SĐT: <b>0912 345 678</b></span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                                        <span>Thiết bị: <b>iPhone 15 Pro Max</b></span>
                                        <span>Màu: <b>Titan Đen</b></span>
                                        <span>IMEI: <b>3568****1234</b></span>
                                    </div>
                                    <div>Tình trạng: <b>Thay màn hình, ép kính</b></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Chuẩn bệnh: <b>Nứt kính ngoài, LCD ok</b></span>
                                        <span>Giá dự kiến: <b>1,500,000đ</b></span>
                                    </div>
                                </div>

                                {/* CHECKLIST */}
                                <div style={{ marginBottom: 8 }}>
                                    <h3 style={{ fontWeight: 700, fontSize: 9, textTransform: 'uppercase', borderBottom: '1px solid #ccc', paddingBottom: 2, marginBottom: 4 }}>Kiểm Tra Đầu Vào</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px', fontSize: 8 }}>
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
                                    <div style={{ display: 'flex', gap: '8px', fontSize: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700 }}>LỊCH SỬ MÁY:</span>
                                        <span>☑ Đã từng sửa</span>
                                        <span>☐ Từng vào nước</span>
                                        <span>☑ L.kiện lỗi/lô</span>
                                    </div>
                                    <div style={{ fontSize: 8, marginTop: 4, borderTop: '1px dotted #ccc', paddingTop: 4 }}>Ghi chú khác: ..............................................</div>
                                </div>

                                {/* NOTES */}
                                <div style={{ border: '1px solid #bbb', borderRadius: 4, padding: 6, marginBottom: 8, background: '#fafafa' }}>
                                    <h3 style={{ fontWeight: 700, fontSize: 8, textTransform: 'uppercase', marginBottom: 3 }}>Lưu ý:</h3>
                                    <ol style={{ fontSize: 7, color: '#555', margin: 0, paddingLeft: 12, lineHeight: 1.4 }}>
                                        {config.notes.map((note, i) => (
                                            <li key={i}>{note || '...'}</li>
                                        ))}
                                    </ol>
                                </div>

                                {/* SIGNATURES */}
                                <div style={{ textAlign: 'center', fontSize: 8, color: '#888', marginBottom: 6 }}>
                                    Ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                                    <div style={{ textAlign: 'center', fontSize: 8 }}>
                                        <p style={{ fontWeight: 700, marginBottom: 35 }}>Khách hàng</p>
                                        <p style={{ color: '#999', fontStyle: 'italic', fontSize: 7 }}>(Ký và ghi rõ họ tên)</p>
                                        <p style={{ fontWeight: 600, marginTop: 4 }}>Nguyễn Văn A</p>
                                    </div>
                                    <div style={{ textAlign: 'center', fontSize: 8 }}>
                                        <p style={{ fontWeight: 700, marginBottom: 35 }}>Tiếp nhận</p>
                                        <p style={{ color: '#999', fontStyle: 'italic', fontSize: 7 }}>(Ký và ghi rõ họ tên)</p>
                                        <p style={{ fontWeight: 600, marginTop: 4 }}>Admin</p>
                                    </div>
                                </div>

                                {/* FOOTER */}
                                <div style={{ textAlign: 'center', fontSize: 6, color: '#aaa', marginTop: 10, borderTop: '1px solid #eee', paddingTop: 4 }}>
                                    {config.footerText} Tiếp nhận khiếu nại: <b>{config.complaintHotline}</b>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Media Manager Modal ── */}
            <MediaManager
                isOpen={showMediaManager}
                onClose={() => setShowMediaManager(false)}
                onSelect={(url) => {
                    setConfig(prev => ({ ...prev, logoUrl: url }));
                    setShowMediaManager(false);
                }}
                title="Chọn Logo Biên Nhận"
            />
        </div>
    );
}
