'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { AlertTriangle, CheckCircle2, DollarSign, Image as ImageIcon, Plus, Save, Smartphone, Trash2, Upload, User, Video, Wrench } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import CurrencyInput from '@/components/admin/CurrencyInput';
import { useConfig } from '@/lib/ConfigContext';
import type { PaymentStatus, Product, RepairIssue, RepairStatus, RepairTicket, TaxonomyNode, WorkflowNode } from '@/lib/types';
import type { ContactMethodType } from '@/lib/types/contact';
import type { ServiceModel } from './repairPageUtils';
import { db } from '@/lib/firebase';
import { collection, limit, query, where } from 'firebase/firestore';
import { getDocs } from '@/lib/firestoreLogger';
import { PART_CATEGORY_LABEL, isPartCategory } from '@/lib/constants';
import { getRepairPartSearchLookupTokens, productMatchesRepairPartSearch } from '@/lib/repairPartSearch';
import { getRepairIssueLaborCost, resolveRepairIssueBillingMode } from '@/lib/repairIssuePricing';

export type InitialRepairPart = {
    productId: string;
    productName: string;
    issueId: string;
    quantity: number;
};

type RepairFormValue = string | number | boolean | RepairIssue[] | InitialRepairPart[] | string[] | PaymentStatus | RepairStatus;

type ServiceSuggestion = {
    id: string;
    serviceId?: string;
    name: string;
    path: string[];
    searchText: string;
    estimatedPrice?: number;
    source?: 'taxonomy' | 'service';
};

export type RepairEditorFormData = {
    appointmentId: string;
    appointmentIntakeMethod: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerZalo: string;
    customerFacebook: string;
    customerOtherContact: string;
    customerPrimaryContactType: ContactMethodType;
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
    initialParts: InitialRepairPart[];
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
    isInboundIntakeUpdate: boolean;
    isInboundFreightLocked: boolean;
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
    services: ServiceModel[];
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function RepairEditorModal({
    showModal,
    editingTicket,
    isInboundIntakeUpdate,
    isInboundFreightLocked,
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
    services,
    onClose,
    onSubmit,
}: RepairEditorModalProps) {
    const selectedStatus = dynamicStatuses.find(s => s.id === formData.status);
    const { config } = useConfig();
    const serviceSuggestions = useMemo(
        () => mergeServiceSuggestions(flattenServiceSuggestions(config.taxonomy?.service || []), services),
        [config.taxonomy?.service, services]
    );
    const calculatedLaborCost = getRepairIssueLaborCost(formData.issues, formData.initialParts, Number(formData.laborCost) || 0);

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
                                    <InputField label="Tên khách hàng *" value={formData.customerName} onChange={v => setFormData(p => ({ ...p, customerName: v }))} required disabled={isInboundFreightLocked} />
                                    <InputField label="Số điện thoại *" value={formData.customerPhone} onChange={v => setFormData(p => ({ ...p, customerPhone: v }))} type="tel" required disabled={isInboundFreightLocked} />
                                </div>
                                <label className="block max-w-md">
                                    <span className="mb-1 block text-sm font-medium text-gray-700">Cách nhận máy</span>
                                    <select
                                        value={formData.appointmentIntakeMethod || 'walk_in'}
                                        onChange={event => setFormData(previous => ({ ...previous, appointmentIntakeMethod: event.target.value }))}
                                        disabled={isInboundFreightLocked}
                                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                                    >
                                        <option value="walk_in">Khách đến trực tiếp</option>
                                        <option value="send_to_store">Khách gửi máy đến shop</option>
                                    </select>
                                </label>
                            </fieldset>
                            <hr className="border-gray-100" />
                            {/* ── Device ── */}
                            <fieldset className="space-y-3">
                                <legend className="flex items-center gap-2 font-semibold text-gray-900"><Smartphone size={18} className="text-orange-500" /> Thiết bị</legend>
                                <div className="grid md:grid-cols-2 gap-4">
                                    <InputField label={formData.appointmentIntakeMethod === 'send_to_store' && !isInboundIntakeUpdate ? 'Model (có thể bổ sung khi máy đến)' : 'Model *'} value={formData.deviceModel} onChange={v => setFormData(p => ({ ...p, deviceModel: v }))} required={formData.appointmentIntakeMethod !== 'send_to_store' || isInboundIntakeUpdate} />
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
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Danh sách lỗi / vấn đề</label>
                                    {formData.issues.map((issue, idx) => (
                                        <div key={issue.id} className="mb-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                                            <div className="flex items-start gap-2">
                                            <span className="mt-2 text-xs text-gray-400 w-5 text-center">{idx + 1}</span>
                                            <div className="min-w-0 flex-1 space-y-2">
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
                                                <div className="rounded-lg border border-orange-100 bg-orange-50 p-2.5">
                                                    <label className="mb-1.5 block text-xs font-semibold text-orange-800">Nhóm dịch vụ áp dụng cho lỗi này</label>
                                                    <CategoryTaxonomySelector
                                                        type="service"
                                                        value={issue.categoryPath || []}
                                                        onChange={(ids, catName, subCatName) => setFormData(p => ({
                                                            ...p,
                                                            issues: p.issues.map(i => i.id === issue.id ? {
                                                                ...i,
                                                                categoryPath: ids,
                                                                serviceName: subCatName || catName || '',
                                                                serviceId: '',
                                                            } : i),
                                                        }))}
                                                    />
                                                </div>
                                                <IssueServiceSuggestions
                                                    issue={issue}
                                                    suggestions={serviceSuggestions}
                                                    onSelect={suggestion => setFormData(p => ({
                                                        ...p,
                                                        issues: p.issues.map(i => i.id === issue.id ? {
                                                            ...i,
                                                            categoryPath: suggestion.path,
                                                            serviceName: suggestion.name,
                                                            serviceId: suggestion.serviceId || '',
                                                            estimatedPrice: Number(i.estimatedPrice) > 0 ? i.estimatedPrice : suggestion.estimatedPrice || i.estimatedPrice,
                                                        } : i),
                                                        laborCost: (() => {
                                                            const nextIssues = p.issues.map(i => i.id === issue.id ? {
                                                                ...i,
                                                                estimatedPrice: Number(i.estimatedPrice) > 0 ? i.estimatedPrice : suggestion.estimatedPrice || i.estimatedPrice,
                                                            } : i);
                                                            return getRepairIssueLaborCost(nextIssues, p.initialParts, Number(p.laborCost) || 0);
                                                        })(),
                                                    }))}
                                                />
                                            </div>
                                            <CurrencyInput
                                                placeholder="Phí công"
                                                value={issue.estimatedPrice || ''}
                                                onChange={v => setFormData(p => {
                                                    const newIssues = p.issues.map(i => i.id === issue.id ? { ...i, estimatedPrice: v } : i);
                                                    return { ...p, issues: newIssues, laborCost: getRepairIssueLaborCost(newIssues, p.initialParts, Number(p.laborCost) || 0) };
                                                })}
                                                className="w-28 px-3 py-1.5 border rounded-lg text-sm text-right focus:ring-2 focus:ring-orange-500/20"
                                            />
                                            <button type="button" onClick={() => setFormData(p => {
                                                const newIssues = p.issues.filter(i => i.id !== issue.id);
                                                const initialParts = p.initialParts.filter(part => part.issueId !== issue.id);
                                                return { ...p, issues: newIssues, initialParts, laborCost: getRepairIssueLaborCost(newIssues, initialParts, Number(p.laborCost) || 0) };
                                            })}
                                                className="p-1 text-red-400 hover:text-red-600" title="Xóa">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        {(!editingTicket || (isInboundIntakeUpdate && isInboundFreightLocked)) && (
                                            <IssueInitialPartsPicker
                                                issue={issue}
                                                parts={formData.initialParts}
                                                onAdd={(product) => setFormData(previous => {
                                                    const existing = previous.initialParts.find(part => part.issueId === issue.id && part.productId === product.id);
                                                    const initialParts = existing
                                                        ? previous.initialParts.map(part => part === existing ? { ...part, quantity: part.quantity + 1 } : part)
                                                        : [...previous.initialParts, { productId: product.id, productName: product.name, issueId: issue.id, quantity: 1 }];
                                                    const issues = previous.issues.map(item => item.id === issue.id && !item.billingMode
                                                        ? { ...item, billingMode: 'parts_only' as const }
                                                        : item);
                                                    return { ...previous, issues, initialParts, laborCost: getRepairIssueLaborCost(issues, initialParts, Number(previous.laborCost) || 0) };
                                                })}
                                                onRemove={(productId) => setFormData(previous => {
                                                    const initialParts = previous.initialParts.filter(part => !(part.issueId === issue.id && part.productId === productId));
                                                    const hasRemainingForIssue = initialParts.some(part => part.issueId === issue.id);
                                                    const issues = previous.issues.map(item => item.id === issue.id && !hasRemainingForIssue && item.billingMode === 'parts_only'
                                                        ? { ...item, billingMode: undefined }
                                                        : item);
                                                    return { ...previous, issues, initialParts, laborCost: getRepairIssueLaborCost(issues, initialParts, Number(previous.laborCost) || 0) };
                                                })}
                                            />
                                        )}
                                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                                            <label htmlFor={`issue-billing-${issue.id}`} className="font-medium">Tính tiền:</label>
                                            <select
                                                id={`issue-billing-${issue.id}`}
                                                value={resolveRepairIssueBillingMode(issue, formData.initialParts)}
                                                onChange={event => setFormData(previous => {
                                                    const issues = previous.issues.map(item => item.id === issue.id ? { ...item, billingMode: event.target.value as RepairIssue['billingMode'] } : item);
                                                    return { ...previous, issues, laborCost: getRepairIssueLaborCost(issues, previous.initialParts, Number(previous.laborCost) || 0) };
                                                })}
                                                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                                            >
                                                <option value="service_only">Chỉ tính công</option>
                                                <option value="parts_only">Chỉ tính linh kiện</option>
                                                <option value="parts_and_service">Linh kiện + công</option>
                                                <option value="free">Không thu</option>
                                            </select>
                                        </div>
                                        </div>
                                    ))}
                                    <button type="button"
                                        onClick={() => setFormData(p => ({
                                            ...p,
                                            issues: [...p.issues, {
                                                id: crypto.randomUUID(),
                                                label: '',
                                                estimatedPrice: 0,
                                                status: 'pending',
                                                categoryPath: p.selectedCategoryPath,
                                                serviceName: p.selectedServiceName,
                                                billingMode: undefined,
                                            }]
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
                            {/* ── Media Upload: chỉ hiển thị ở node kết thúc của workflow ── */}
                            {selectedStatus?.isTerminal && (
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
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phí công (theo từng lỗi)</label>
                                        <input type="text"
                                            onChange={e => {
                                                const val = Number(e.target.value.replace(/\D/g, '')) || 0;
                                                setFormData(p => ({ ...p, laborCost: val || '' }));
                                            }}
                                            placeholder="0"
                                            readOnly={formData.issues.length > 0}
                                            value={formData.issues.length > 0 ? (calculatedLaborCost ? calculatedLaborCost.toLocaleString('vi-VN') : '') : (formData.laborCost ? Number(formData.laborCost).toLocaleString('vi-VN') : '')}
                                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 read-only:bg-gray-50 read-only:text-gray-600" />
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
                                                <div className="text-xs text-gray-500">Phiếu mới bắt đầu từ node đầu tiên của workflow hiện hành.</div>
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

function InputField({ label, value, onChange, type = 'text', placeholder, required, disabled }: {
    label: string; value: string; onChange: (value: string) => void;
    type?: string; placeholder?: string; required?: boolean; disabled?: boolean;
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
                disabled={disabled}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
            />
        </div>
    );
}

function IssueInitialPartsPicker({
    issue,
    parts,
    onAdd,
    onRemove,
}: {
    issue: RepairIssue;
    parts: InitialRepairPart[];
    onAdd: (product: Product) => void;
    onRemove: (productId: string) => void;
}) {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Product[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const selectedParts = parts.filter(part => part.issueId === issue.id);

    useEffect(() => {
        const term = search.trim();
        if (!term) {
            setResults([]);
            return;
        }
        const tokens = getRepairPartSearchLookupTokens(term);
        if (tokens.length === 0) {
            setResults([]);
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(async () => {
            setIsSearching(true);
            try {
                const snapshot = await getDocs(query(
                    collection(db, 'products'),
                    where('status', '==', 'active'),
                    where('searchKeywords', 'array-contains-any', tokens),
                    limit(10),
                ));
                const matches = snapshot.docs
                    .map(document => ({ id: document.id, ...document.data() } as Product))
                    .filter(product => isPartCategory(product.category, product.categoryIds))
                    .filter(product => productMatchesRepairPartSearch(product, term));
                if (!cancelled) setResults(matches);
            } catch (error) {
                console.error('Repair intake part search failed:', error);
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setIsSearching(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [search]);

    return (
        <div className="mt-2 rounded-lg border border-sky-100 bg-sky-50/70 p-2.5">
            <p className="text-xs font-semibold text-sky-900">Linh kiện dự kiến <span className="font-normal text-sky-700">(để trống nếu chỉ tính công)</span></p>
            {selectedParts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedParts.map(part => (
                        <span key={`${part.issueId}-${part.productId}`} className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs text-sky-900 shadow-sm ring-1 ring-sky-100">
                            {part.productName} ×{part.quantity}
                            <button type="button" onClick={() => onRemove(part.productId)} className="font-bold text-sky-600 hover:text-red-600" aria-label={`Bỏ ${part.productName}`}>×</button>
                        </span>
                    ))}
                </div>
            )}
            <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={`Tìm ${PART_CATEGORY_LABEL.toLowerCase()} chính xác…`}
                className="mt-2 w-full rounded border border-sky-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-sky-500"
            />
            {search && (
                <div className="mt-1 max-h-36 divide-y overflow-y-auto rounded border border-sky-100 bg-white">
                    {isSearching ? <p className="p-2 text-xs text-gray-500">Đang tìm…</p> : results.length > 0 ? results.map(product => {
                        const available = Math.max(0, Number(product.stock || 0) - Number(product.held || 0));
                        return (
                            <button key={product.id} type="button" disabled={available <= 0} onClick={() => { onAdd(product); setSearch(''); }} className="flex w-full items-center justify-between gap-3 p-2 text-left text-xs hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
                                <span className="min-w-0 truncate font-medium text-gray-800">{product.name}</span>
                                <span className={available > 0 ? 'shrink-0 text-emerald-700' : 'shrink-0 text-red-600'}>Còn {available}</span>
                            </button>
                        );
                    }) : <p className="p-2 text-xs text-gray-500">Không tìm thấy linh kiện phù hợp.</p>}
                </div>
            )}
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

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function getServiceSuggestionPrice(service: ServiceModel): number {
    const promo = Number(service.price_promo || 0);
    if (promo > 0) return promo;
    const original = Number(service.price_original || 0);
    if (original > 0) return original;
    const legacy = Number(String(service.price || '').replace(/[^\d]/g, ''));
    return Number.isFinite(legacy) ? legacy : 0;
}

function mergeServiceSuggestions(taxonomySuggestions: ServiceSuggestion[], services: ServiceModel[]): ServiceSuggestion[] {
    const merged = new Map<string, ServiceSuggestion>();

    taxonomySuggestions.forEach(suggestion => {
        merged.set(suggestion.id, { ...suggestion, source: 'taxonomy' });
    });

    services.forEach(service => {
        const name = service.name?.trim();
        if (!name) return;
        const categoryPath = toStringArray(service.categoryIds);
        const categoryText = typeof service.category === 'string' ? service.category : '';
        const path = categoryPath.length > 0 ? categoryPath : (categoryText ? [categoryText] : []);
        const estimatedPrice = getServiceSuggestionPrice(service);
        const suggestion: ServiceSuggestion = {
            id: `service:${service.id}`,
            serviceId: service.id,
            name,
            path,
            estimatedPrice: estimatedPrice > 0 ? estimatedPrice : undefined,
            source: 'service',
            searchText: normalizeSearchText([name, categoryText, ...categoryPath].join(' ')),
        };
        merged.set(suggestion.id, suggestion);
    });

    return Array.from(merged.values());
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
        ? suggestions.filter(suggestion => suggestion.searchText.includes(query)).slice(0, 5)
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
                    {suggestion.estimatedPrice ? ` · ~${suggestion.estimatedPrice.toLocaleString('vi-VN')}đ` : ''}
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
