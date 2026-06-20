'use client';
/* eslint-disable @next/next/no-img-element */
import { useMemo } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { AlertTriangle, CheckCircle2, DollarSign, Image as ImageIcon, Plus, Save, Smartphone, Trash2, Upload, User, Video, Wrench } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import CurrencyInput from '@/components/admin/CurrencyInput';
import { useConfig } from '@/lib/ConfigContext';
import type { PaymentStatus, RepairIssue, RepairStatus, RepairTicket, TaxonomyNode, WorkflowNode } from '@/lib/types';

type RepairFormValue = string | number | boolean | RepairIssue[] | string[] | PaymentStatus | RepairStatus;

type ServiceSuggestion = {
    id: string;
    name: string;
    path: string[];
    searchText: string;
};

export type RepairEditorFormData = {
    appointmentId: string;
    customerName: string;
    customerPhone: string;
    deviceModel: string;
    deviceImei: string;
    devicePasscode: string;
    deviceColor: string;
    checkBody: string;
    checkScreen: string;
    checkTouch: string;
    checkCamera: string;
    checkSpeaker: string;
    checkConnectivity: string;
    checkBattery: string;
    checkBiometric: string;
    selectedServiceName: string;
    selectedCategoryPath: string[];
    issues: RepairIssue[];
    issueDescription: string;
    techNotes: string;
    status: RepairStatus;
    hasPriorRepair: boolean;
    hasWaterDamage: boolean;
    hasNonGenuineParts: boolean;
    historyOtherNote: string;
    partsCost: string | number;
    laborCost: string | number;
    depositAmount: string | number;
    paymentStatus: PaymentStatus;
    technicianId: string;
    estimatedReturnDate: string;
} & Record<string, RepairFormValue>;

interface RepairEditorModalProps {
    showModal: boolean;
    editingTicket: RepairTicket | null;
    formData: RepairEditorFormData;
    setFormData: Dispatch<SetStateAction<RepairEditorFormData>>;
    dynamicStatuses: WorkflowNode[];
    canOverrideTerminalStatus: boolean;
    staffs: { uid: string; displayName: string }[];
    preMediaFiles: string[];
    setPreMediaFiles: Dispatch<SetStateAction<string[]>>;
    postMediaFiles: string[];
    setPostMediaFiles: Dispatch<SetStateAction<string[]>>;
    setShowPreMediaManager: (value: boolean) => void;
    setShowPostMediaManager: (value: boolean) => void;
    paymentLabels: Record<PaymentStatus, { label: string; color: string }>;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function RepairEditorModal({
    showModal,
    editingTicket,
    formData,
    setFormData,
    dynamicStatuses,
    canOverrideTerminalStatus,
    staffs,
    preMediaFiles,
    setPreMediaFiles,
    postMediaFiles,
    setPostMediaFiles,
    setShowPreMediaManager,
    setShowPostMediaManager,
    paymentLabels,
    onClose,
    onSubmit,
}: RepairEditorModalProps) {
    const selectedStatus = dynamicStatuses.find(s => s.id === formData.status);
    const { config } = useConfig();
    const serviceSuggestions = useMemo(
        () => flattenServiceSuggestions(config.taxonomy?.service || []),
        [config.taxonomy?.service]
    );

    return (
        <>
            {showModal && (
                <Modal
                    isOpen={true}
                    onClose={() => onClose()}
                    title={editingTicket ? 'Cập nhật phiếu' : 'Tạo phiếu sửa chữa'}
                    size="4xl"
                    priority="high"
                >
                    <div className="flex-1 overflow-y-auto w-full">
                        <form onSubmit={onSubmit} className="p-4 md:p-6 space-y-6">
                            {/* ── Customer ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900"><User size={18} className="text-orange-500" /> Khách hàng</legend>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <InputField label="Tên *" value={formData.customerName} onChange={v => setFormData(p => ({ ...p, customerName: v }))} required />
                                    <InputField label="Số điện thoại *" value={formData.customerPhone} onChange={v => setFormData(p => ({ ...p, customerPhone: v }))} type="tel" required />
                                </div>
                            </fieldset>
                            <hr className="border-gray-100" />
                            {/* ── Device ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900"><Smartphone size={18} className="text-orange-500" /> Thiết bị</legend>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <InputField label="Model *" value={formData.deviceModel} onChange={v => setFormData(p => ({ ...p, deviceModel: v }))} required />
                                    <InputField label="IMEI / Serial" value={formData.deviceImei} onChange={v => setFormData(p => ({ ...p, deviceImei: v }))} />
                                    <div className="md:col-span-2 space-y-2">
                                        <InputField label="Mật khẩu màn hình" value={formData.devicePasscode} onChange={v => setFormData(p => ({ ...p, devicePasscode: v }))} placeholder="Để trống nếu không có" />
                                        <ScreenPatternInput
                                            value={formData.devicePasscode}
                                            onChange={v => setFormData(p => ({ ...p, devicePasscode: v }))}
                                        />
                                    </div>
                                    <InputField label="Màu sắc" value={formData.deviceColor} onChange={v => setFormData(p => ({ ...p, deviceColor: v }))} />
                                </div>
                            </fieldset>
                            <hr className="border-gray-100" />
                            {/* ── Issue ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900"><Wrench size={18} className="text-orange-500" /> Chi tiết sửa chữa</legend>
                                {/* Service selector with auto-fill */}
                                <div className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                                    <label className="block text-sm font-medium text-orange-800 mb-2">Chọn nhóm dịch vụ (Category)</label>

                                    {/* Display legacy or auto-filled service if not yet classified in the new taxonomy */}
                                    {formData.selectedServiceName && formData.selectedCategoryPath.length === 0 && (
                                        <div className="flex items-center justify-between bg-orange-100/50 px-3 py-2 rounded-lg border border-orange-200 mb-3 text-sm">
                                            <span className="text-orange-800">
                                                Dịch vụ hiện tại: <strong className="font-semibold">{formData.selectedServiceName}</strong> (Chưa phân loại)
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setFormData(p => ({ ...p, selectedServiceName: '' }))}
                                                className="text-xs text-orange-600 hover:text-orange-800 underline font-medium"
                                            >
                                                Xóa
                                            </button>
                                        </div>
                                    )}
                                    <CategoryTaxonomySelector
                                        type="service"
                                        value={formData.selectedCategoryPath}
                                        onChange={(ids, catName, subCatName) => {
                                            setFormData(p => ({
                                                ...p,
                                                selectedCategoryPath: ids,
                                                selectedServiceName: subCatName || catName || '',
                                            }));
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Danh sách lỗi / vấn đề</label>
                                    {formData.issues.map((issue, idx) => (
                                        <div key={issue.id} className="flex items-center gap-2 mb-2">
                                            <span className="text-xs text-gray-400 w-5 text-center">{idx + 1}</span>
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <input
                                                    type="text"
                                                    placeholder="Tên lỗi (VD: Thay màn hình)"
                                                    value={issue.label}
                                                    onChange={e => setFormData(p => ({
                                                        ...p,
                                                        issues: p.issues.map(i => i.id === issue.id ? { ...i, label: e.target.value } : i)
                                                    }))}
                                                    className="w-full px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20"
                                                />
                                                <IssueServiceSuggestions
                                                    issue={issue}
                                                    suggestions={serviceSuggestions}
                                                    onSelect={suggestion => setFormData(p => ({
                                                        ...p,
                                                        selectedCategoryPath: suggestion.path,
                                                        selectedServiceName: suggestion.name,
                                                        issues: p.issues.map(i => i.id === issue.id ? { ...i, categoryPath: suggestion.path, serviceName: suggestion.name } : i)
                                                    }))}
                                                />
                                            </div>
                                            <CurrencyInput
                                                placeholder="Giá dự kiến"
                                                value={issue.estimatedPrice || ''}
                                                onChange={v => setFormData(p => {
                                                    const newIssues = p.issues.map(i => i.id === issue.id ? { ...i, estimatedPrice: v } : i);
                                                    const newSum = newIssues.reduce((sum, i) => sum + (Number(i.estimatedPrice) || 0), 0);
                                                    return { ...p, issues: newIssues, laborCost: newSum || p.laborCost };
                                                })}
                                                className="w-28 px-3 py-1.5 border rounded-lg text-sm text-right focus:ring-2 focus:ring-orange-500/20"
                                            />
                                            <button type="button" onClick={() => setFormData(p => {
                                                const newIssues = p.issues.filter(i => i.id !== issue.id);
                                                const newSum = newIssues.reduce((sum, i) => sum + (Number(i.estimatedPrice) || 0), 0);
                                                return { ...p, issues: newIssues, laborCost: newSum || (newIssues.length === 0 ? '' : p.laborCost) };
                                            })}
                                                className="p-1 text-red-400 hover:text-red-600" title="Xóa">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                    <button type="button"
                                        onClick={() => setFormData(p => ({
                                            ...p,
                                            issues: [...p.issues, { id: crypto.randomUUID(), label: '', estimatedPrice: 0, status: 'pending' }]
                                        }))}
                                        className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-800 font-medium mt-1">
                                        <Plus size={14} /> Thêm lỗi
                                    </button>
                                </div>
                                {/* Fallback textarea nếu không dùng issues */}
                                {formData.issues.length === 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả lỗi *</label>
                                        <textarea rows={3} required value={formData.issueDescription}
                                            onChange={e => setFormData(p => ({ ...p, issueDescription: e.target.value }))}
                                            aria-label="Mô tả lỗi"
                                            title="Mô tả lỗi"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú kỹ thuật</label>
                                    <textarea rows={2} value={formData.techNotes}
                                        onChange={e => setFormData(p => ({ ...p, techNotes: e.target.value }))}
                                        aria-label="Ghi chú kỹ thuật"
                                        title="Ghi chú kỹ thuật"
                                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                            </fieldset>
                            <hr className="border-gray-100" />
                            {/* ── Checklist kiểm tra đầu vào ── */}
                            {(() => {
                                const st = dynamicStatuses.find(s => s.id === formData.status);
                                return st?.allowedFeatures?.includes('requireChecklist');
                            })() && (
                                    <fieldset className="space-y-3">
                                        <legend className="flex items-center gap-2 font-semibold text-gray-900">
                                            <CheckCircle2 size={18} className="text-orange-500" /> Kiểm tra đầu vào
                                        </legend>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {[
                                                { key: 'checkBody', label: 'Vỏ máy' },
                                                { key: 'checkScreen', label: 'Màn hình' },
                                                { key: 'checkTouch', label: 'Cảm ứng' },
                                                { key: 'checkCamera', label: 'Camera' },
                                                { key: 'checkSpeaker', label: 'Loa/Mic' },
                                                { key: 'checkConnectivity', label: 'Kết nối' },
                                                { key: 'checkBattery', label: 'Pin' },
                                                { key: 'checkBiometric', label: 'FaceID/Vân tay' },
                                            ].map(item => (
                                                <div key={item.key} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                                                    <label className="block text-xs font-semibold text-gray-600 mb-1">{item.label}</label>
                                                    <select
                                                        value={
                                                            ['OK', 'Trầy', 'Nứt', 'Móp', 'Lỗi', 'Không có'].find(
                                                                v => v.toLowerCase() === ((formData as Record<string, unknown>)[item.key] as string)?.toLowerCase()
                                                            ) || ((formData as Record<string, unknown>)[item.key] as string) || 'OK'
                                                        }
                                                        onChange={e => setFormData(p => ({ ...p, [item.key]: e.target.value }))}
                                                        aria-label={`Checklist: ${item.label}`}
                                                        title={`Checklist: ${item.label}`}
                                                        className={`w-full text-xs px-2 py-1.5 border rounded-md bg-white ${(formData as Record<string, unknown>)[item.key]?.toString().toLowerCase() === 'ok' ? 'border-green-300 text-green-700'
                                                            : (formData as Record<string, unknown>)[item.key]?.toString().toLowerCase() === 'lỗi' ? 'border-red-300 text-red-700'
                                                                : ((formData as Record<string, unknown>)[item.key] && (formData as Record<string, unknown>)[item.key] !== '') ? 'border-orange-300 text-orange-700'
                                                                    : 'border-gray-300 text-gray-700'
                                                            }`}
                                                    >
                                                        <option value="OK">✅ OK</option>
                                                        <option value="Trầy">⚠️ Trầy</option>
                                                        <option value="Nứt">⚠️ Nứt</option>
                                                        <option value="Móp">⚠️ Móp</option>
                                                        <option value="Lỗi">❌ Lỗi</option>
                                                        <option value="Không có">➖ Không có</option>
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </fieldset>
                                )}
                            <hr className="border-gray-100" />
                            {/* ── Tình trạng & Lịch sử máy ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900">
                                    <AlertTriangle size={18} className="text-orange-500" /> Tình trạng & Lịch sử máy
                                </legend>
                                <div className="space-y-3 bg-gray-50 rounded-lg p-4 border border-gray-100">
                                    <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                                        <input type="checkbox" checked={formData.hasPriorRepair} onChange={e => setFormData(p => ({ ...p, hasPriorRepair: e.target.checked }))} className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                                        <span>Máy đã từng sửa trước đó</span>
                                    </label>
                                    <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                                        <input type="checkbox" checked={formData.hasWaterDamage} onChange={e => setFormData(p => ({ ...p, hasWaterDamage: e.target.checked }))} className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                                        <span>Máy từng vào nước / oxy hóa</span>
                                    </label>
                                    <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                                        <input type="checkbox" checked={formData.hasNonGenuineParts} onChange={e => setFormData(p => ({ ...p, hasNonGenuineParts: e.target.checked }))} className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                                        <span>Máy đã thay linh kiện không chính hãng</span>
                                    </label>
                                    <div className="space-y-1">
                                        <label className="block text-sm font-medium text-gray-700">Khác</label>
                                        <textarea
                                            rows={2}
                                            value={formData.historyOtherNote}
                                            onChange={e => setFormData(p => ({ ...p, historyOtherNote: e.target.value }))}
                                            aria-label="Lý do khác về tình trạng và lịch sử máy"
                                            title="Lý do khác về tình trạng và lịch sử máy"
                                            placeholder="Nhập lý do khác nếu có"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-orange-500/20"
                                        />
                                    </div>
                                </div>
                            </fieldset>
                            <hr className="border-gray-100" />
                            {/* ── Media Upload: Ảnh/Video lúc nhận máy ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900">
                                    <ImageIcon size={18} className="text-orange-500" /> Ảnh/Video lúc nhận máy
                                </legend>
                                <div className="flex flex-wrap gap-2">
                                    {preMediaFiles.map((url, i) => (
                                        <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border group">
                                            {url.includes('.mp4') || url.includes('.webm') || url.includes('video') ? (
                                                <video src={url} className="w-full h-full object-cover" muted playsInline />
                                            ) : (
                                                <img src={url} alt="" className="w-full h-full object-cover" />
                                            )}
                                            <button type="button" onClick={() => setPreMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setShowPreMediaManager(true)}
                                        className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center hover:border-orange-400 hover:bg-orange-50 transition-colors">
                                        <Upload size={18} className="text-gray-400" />
                                        <span className="text-[10px] text-gray-400 mt-0.5">Thêm</span>
                                    </button>
                                </div>
                            </fieldset>
                            {/* ── Media Upload: Ảnh/Video sau sửa (chỉ hiển khi Done/Out/Hoàn Phí) ── */}
                            {['done', 'out', 'refund'].includes(formData.status) && (
                                <>
                                    <hr className="border-gray-100" />
                                    <fieldset className="space-y-3">
                                        <legend className="flex items-center gap-2 font-semibold text-gray-900">
                                            <Video size={18} className="text-green-500" /> Ảnh/Video sau sửa chữa
                                        </legend>
                                        <div className="flex flex-wrap gap-2">
                                            {postMediaFiles.map((url, i) => (
                                                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border group">
                                                    {url.includes('.mp4') || url.includes('.webm') || url.includes('video') ? (
                                                        <video src={url} className="w-full h-full object-cover" muted playsInline />
                                                    ) : (
                                                        <img src={url} alt="" className="w-full h-full object-cover" />
                                                    )}
                                                    <button type="button" onClick={() => setPostMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                                </div>
                                            ))}
                                            <button type="button" onClick={() => setShowPostMediaManager(true)}
                                                className="w-20 h-20 border-2 border-dashed border-green-300 rounded-lg flex flex-col items-center justify-center hover:border-green-400 hover:bg-green-50 transition-colors">
                                                <Upload size={18} className="text-gray-400" />
                                                <span className="text-[10px] text-gray-400 mt-0.5">Thêm</span>
                                            </button>
                                        </div>
                                    </fieldset>
                                </>
                            )}
                            <hr className="border-gray-100" />
                            {/* ── Payment & Timing & Assignment ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900"><DollarSign size={18} className="text-orange-500" /> Thanh toán & Phân công</legend>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Chi phí SC (VNĐ)</label>
                                        <input type="text" value={formData.laborCost ? Number(formData.laborCost).toLocaleString('vi-VN') : ''}
                                            onChange={e => {
                                                const val = Number(e.target.value.replace(/\D/g, '')) || 0;
                                                setFormData(p => ({ ...p, laborCost: val || '' }));
                                            }}
                                            placeholder="0"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Đặt cọc (VNĐ)</label>
                                        <input type="text" value={formData.depositAmount ? Number(formData.depositAmount).toLocaleString('vi-VN') : ''}
                                            onChange={e => {
                                                const val = Number(e.target.value.replace(/\D/g, '')) || 0;
                                                setFormData(p => {
                                                    let autoStatus = p.paymentStatus;
                                                    if (autoStatus !== 'paid' && autoStatus !== 'refunded') {
                                                        autoStatus = val > 0 ? 'deposit' : 'unpaid';
                                                    }
                                                    return { ...p, depositAmount: val || '', paymentStatus: autoStatus };
                                                });
                                            }}
                                            placeholder="0"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái TT</label>
                                        <div className={`w-full px-4 py-2 border rounded-lg font-bold text-sm flex items-center ${paymentLabels[formData.paymentStatus]?.color || 'bg-gray-50 text-gray-700'}`}>
                                            {paymentLabels[formData.paymentStatus]?.label || formData.paymentStatus}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái phiếu</label>
                                        {editingTicket ? (
                                            <select value={formData.status}
                                                onChange={e => setFormData(p => ({ ...p, status: e.target.value as RepairStatus }))}
                                                disabled={!canOverrideTerminalStatus}
                                                aria-label="Trạng thái phiếu"
                                                title="Trạng thái phiếu"
                                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 bg-white disabled:bg-gray-100 disabled:opacity-70 disabled:cursor-not-allowed">
                                                {dynamicStatuses.map(s => (
                                                    <option key={s.id} value={s.id}>{s.label}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div className="w-full px-4 py-2 border rounded-lg bg-gray-50 text-gray-800">
                                                <div className="font-medium">{selectedStatus?.label || formData.status}</div>
                                                <div className="text-xs text-gray-500">Phiếu mới luôn bắt đầu ở trạng thái tiếp nhận.</div>
                                            </div>
                                        )}
                                    </div>
                                    {(() => {
                                        const st = dynamicStatuses.find(s => s.id === formData.status);
                                        return st?.allowedFeatures?.includes('allowAssignTech');
                                    })() && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Kỹ thuật viên</label>
                                                <select value={formData.technicianId}
                                                    onChange={e => setFormData(p => ({ ...p, technicianId: e.target.value }))}
                                                    aria-label="Chọn kỹ thuật viên"
                                                    title="Chọn kỹ thuật viên"
                                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 bg-white">
                                                    <option value="">— Chọn —</option>
                                                    {staffs.map(s => <option key={s.uid} value={s.uid}>{s.displayName}</option>)}
                                                </select>
                                            </div>
                                        )}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Ngày trả dự kiến</label>
                                        <input type="date" title="Ngày trả dự kiến" value={formData.estimatedReturnDate}
                                            onChange={e => setFormData(p => ({ ...p, estimatedReturnDate: e.target.value }))}
                                            aria-label="Ngày trả dự kiến"
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                    </div>
                                </div>
                            </fieldset>
                            <div className="flex justify-end gap-3 pt-4 border-t sticky bottom-0 bg-white pb-2">
                                <button type="button" title="Hủy bỏ" onClick={() => onClose()}
                                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Hủy bỏ</button>
                                <button type="submit" title="Lưu phiếu"
                                    className="px-5 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 flex items-center gap-2">
                                    <Save size={18} /> Lưu phiếu
                                </button>
                            </div>
                        </form>
                    </div>
                </Modal>
            )}

        </>
    );
}

function InputField({ label, value, onChange, type = 'text', placeholder, required }: {
    label: string; value: string; onChange: (value: string) => void;
    type?: string; placeholder?: string; required?: boolean;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
                type={type}
                value={value}
                onChange={event => onChange(event.target.value)}
                placeholder={placeholder}
                required={required}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
            />
        </div>
    );
}

function normalizeSearchText(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .trim();
}

function flattenServiceSuggestions(nodes: TaxonomyNode[], parentPath: string[] = [], parentNames: string[] = []): ServiceSuggestion[] {
    return nodes.flatMap(node => {
        const path = [...parentPath, node.id];
        const names = [...parentNames, node.name];
        const current: ServiceSuggestion = {
            id: path.join('/'),
            name: node.name,
            path,
            searchText: normalizeSearchText(names.join(' ')),
        };
        return [
            current,
            ...flattenServiceSuggestions(node.children || [], path, names),
        ];
    });
}

function IssueServiceSuggestions({
    issue,
    suggestions,
    onSelect,
}: {
    issue: RepairIssue;
    suggestions: ServiceSuggestion[];
    onSelect: (suggestion: ServiceSuggestion) => void;
}) {
    const query = normalizeSearchText(issue.label);
    const matches = query.length >= 2
        ? suggestions.filter(suggestion => suggestion.searchText.includes(query)).slice(0, 3)
        : [];

    if (matches.length === 0 && !issue.serviceName) return null;

    return (
        <div className="flex flex-wrap items-center gap-1">
            {issue.serviceName && (
                <span className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                    {issue.serviceName}
                </span>
            )}
            {matches.map(suggestion => (
                <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => onSelect(suggestion)}
                    className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:border-orange-300 hover:text-orange-700"
                >
                    {suggestion.name}
                </button>
            ))}
        </div>
    );
}

const screenPatternPoints = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function parseScreenPattern(value: string) {
    const tokens = value
        .trim()
        .split(/\s*(?:->|,|\s)\s*/)
        .filter(Boolean);

    if (tokens.length === 0) return [];

    const points = tokens.map(token => Number(token));
    const isPattern = points.every(point => Number.isInteger(point) && point >= 1 && point <= 9)
        && new Set(points).size === points.length;

    return isPattern ? points : [];
}

function ScreenPatternInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const sequence = parseScreenPattern(value);
    const sequenceText = sequence.join('->');

    const handlePointClick = (point: number) => {
        if (sequence.includes(point)) return;
        onChange([...sequence, point].join('->'));
    };

    return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="grid w-36 grid-cols-3 gap-2">
                    {screenPatternPoints.map(point => {
                        const order = sequence.indexOf(point) + 1;
                        return (
                            <button
                                key={point}
                                type="button"
                                aria-label={`Điểm hình vẽ ${point}`}
                                title={`Điểm ${point}`}
                                onClick={() => handlePointClick(point)}
                                className={`flex h-10 w-10 items-center justify-center rounded-full border text-xs font-bold transition-colors ${order > 0 ? 'border-orange-500 bg-orange-500 text-white' : 'border-gray-300 bg-white text-gray-500 hover:border-orange-400 hover:text-orange-600'}`}
                            >
                                {order > 0 ? order : point}
                            </button>
                        );
                    })}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800">
                        {sequenceText || 'Chưa chọn hình vẽ'}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => onChange('')}
                            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-red-600"
                        >
                            Xóa hình vẽ
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
