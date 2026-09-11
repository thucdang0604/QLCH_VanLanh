'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Image as ImageIcon, Loader2, Package, Plus, Search, Trash2, Truck, Video } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import CurrencyInput from '@/components/admin/CurrencyInput';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import type { Product, RepairIssue, RepairTicket, User, WorkflowNode } from '@/lib/types';
import type { RepairPartCatalogSearchResult } from '@/lib/repairPartCatalogSearch';
import { getYouTubeEmbedUrl, isYouTubeUrl } from '@/lib/workflowFeatures';
import { REPAIR_PART_STATUS, REPAIR_STATUS, isRepairPartStatus, isRepairStatus } from '@/lib/repairStatus';
import { getAllowedNextWorkflowNodes, getFirstNonTerminalWorkflowTransition } from '@/lib/repairWorkflowConfig';
import { getInboundTechnicianHoldMessage } from '@/lib/repairInboundIntake';
import { toastError } from '@/lib/toast';

const checklistLabels: Record<string, string> = {
    body: 'Vỏ máy', screen: 'Màn hình', touch: 'Cảm ứng', camera: 'Camera',
    speaker: 'Loa/Mic', connectivity: 'Kết nối', battery: 'Pin', biometric: 'FaceID/Vân tay',
};

type RepairTimelineEntry = NonNullable<RepairTicket['statusTimeline']>[number];

function getDiagnosisIssues(ticket: RepairTicket): RepairIssue[] {
    if (ticket.issues?.length) return ticket.issues.map(issue => ({ ...issue, categoryPath: [...(issue.categoryPath || [])] }));
    if (!ticket.issue?.description?.trim()) return [];
    return [{
        id: `legacy-${ticket.id}`,
        label: ticket.issue.description.trim(),
        estimatedPrice: Number(ticket.payment?.laborCost) || 0,
        status: 'pending',
        categoryPath: [...(ticket.categoryPath || [])],
        serviceName: ticket.serviceName || '',
        serviceId: '',
    }];
}

interface TechnicianTicketDetailModalProps {
    selectedTicket: RepairTicket | null;
    setSelectedTicket: (ticket: RepairTicket | null) => void;
    user: Pick<User, 'uid' | 'role'> | null | undefined;
    // userNamesMap removed
    partSearchQuery: string;
    setPartSearchQuery: (value: string) => void;
    partSearchResults: Product[];
    partSearchSource: RepairPartCatalogSearchResult['source'];
    isSearchingParts: boolean;
    serviceSuggestedParts: Product[];
    serviceSuggestionHint: string;
    isLoadingServiceSuggestions: boolean;
    selectedPartQuality: string;
    setSelectedPartQuality: (value: string) => void;
    customPartName: string;
    setCustomPartName: (value: string) => void;
    getWorkflowForTicket: (ticket: RepairTicket) => WorkflowNode[];
    getTimelineTitle: (entry: RepairTimelineEntry, workflow: WorkflowNode[]) => string;
    getTimelineTimestamp: (entry: RepairTimelineEntry) => Date;
    formatPrice: (price: number) => string;
    handleTransferResponse: (ticket: RepairTicket, responseStatus: 'accepted' | 'rejected') => Promise<void> | void;
    handleRemovePart: (ticket: RepairTicket, partIndex: number) => Promise<void> | void;
    handleConfirmPartReceived: (ticket: RepairTicket, partIndex: number) => Promise<void> | void;
    handleReportPartNotReceived: (ticket: RepairTicket, partIndex: number) => Promise<void> | void;
    handleAddPart: (ticket: RepairTicket, product: Product, issueId?: string) => Promise<void> | void;
    handleRequestPart: (ticket: RepairTicket, product: Product, issueId?: string) => Promise<void> | void;
    handleAddCustomPart: (ticket: RepairTicket, issueId?: string) => Promise<void> | void;
    handleDiagnosisUpdate: (ticket: RepairTicket, issues: RepairIssue[], technicianNote: string) => Promise<RepairTicket | void> | void;
    handleStatusChange: (ticketId: string, newStatus: string) => Promise<void> | void;
}

export function TechnicianTicketDetailModal({
    selectedTicket,
    setSelectedTicket,
    user,
    // userNamesMap removed,
    partSearchQuery,
    setPartSearchQuery,
    partSearchResults,
    partSearchSource,
    isSearchingParts,
    serviceSuggestedParts,
    serviceSuggestionHint,
    isLoadingServiceSuggestions,
    selectedPartQuality,
    setSelectedPartQuality,
    customPartName,
    setCustomPartName,
    getWorkflowForTicket,
    getTimelineTitle,
    getTimelineTimestamp,
    formatPrice,
    handleTransferResponse,
    handleRemovePart,
    handleConfirmPartReceived,
    handleReportPartNotReceived,
    handleAddPart,
    handleRequestPart,
    handleAddCustomPart,
    handleDiagnosisUpdate,
    handleStatusChange,
}: TechnicianTicketDetailModalProps) {
    const [showTimeline, setShowTimeline] = useState(false);
    const [isDiagnosisOpen, setIsDiagnosisOpen] = useState(false);
    const [diagnosisIssues, setDiagnosisIssues] = useState<RepairIssue[]>([]);
    const [technicianNote, setTechnicianNote] = useState('');
    const [expandedTaxonomyIssueId, setExpandedTaxonomyIssueId] = useState<string | null>(null);
    const [isSavingDiagnosis, setIsSavingDiagnosis] = useState(false);
    const [selectedPartIssueId, setSelectedPartIssueId] = useState('');

    useEffect(() => {
        setShowTimeline(false);
        setIsDiagnosisOpen(false);
        setExpandedTaxonomyIssueId(null);
        setDiagnosisIssues(selectedTicket ? getDiagnosisIssues(selectedTicket) : []);
        setTechnicianNote(selectedTicket?.issue?.notes || '');
        setSelectedPartIssueId(selectedTicket?.issues?.[0]?.id || '');
    }, [selectedTicket?.id]);

    if (!selectedTicket) return null;

    const selectedTicketWorkflow = getWorkflowForTicket(selectedTicket);
    const selectedTicketCurrentNode = selectedTicketWorkflow.find((node) => node.id === selectedTicket.status);
    const selectedTicketNextNodes = getAllowedNextWorkflowNodes(selectedTicketWorkflow, selectedTicket.status);
    const isSelectedTicketTerminal = isRepairStatus(selectedTicket.status, REPAIR_STATUS.CUSTOMER_HANDOVER)
        || !!selectedTicketCurrentNode?.isTerminal;
    const isSelectedTicketAssignedToMe = selectedTicket.staff?.assignedTechnician === user?.uid;
    const isSelectedTicketIncomingTransfer = selectedTicket.pendingTechnicianTransfer?.toTechnicianId === user?.uid
        && selectedTicket.pendingTechnicianTransfer?.status === 'pending';
    const inboundTechnicianHoldMessage = getInboundTechnicianHoldMessage(selectedTicket, selectedTicketCurrentNode);
    const isKtvAwaitingInspectionStart = user?.role !== 'admin'
        && isSelectedTicketAssignedToMe
        && !inboundTechnicianHoldMessage
        && selectedTicketWorkflow[0]?.id === selectedTicket.status;
    const technicianNextNodes = selectedTicketNextNodes
        .filter(node => {
            const allowedActors = selectedTicketCurrentNode?.transitionActors?.[node.id];
            return !allowedActors || allowedActors.includes(isSelectedTicketAssignedToMe ? 'technician' : user?.role === 'admin' ? 'manager' : 'technician');
        });
    const workflowCustomerDecision = selectedTicket.customerApproval?.decision
        || (selectedTicket.customerApproval?.approvedAt ? 'approved' : undefined);
    const customerResponsePending = selectedTicketCurrentNode?.allowedFeatures?.includes('confirmCustomerResponse')
        && !workflowCustomerDecision;
    const customerDeclined = workflowCustomerDecision === 'declined';
    const customerFilteredNextNodes = customerResponsePending
        ? []
        : customerDeclined
            ? technicianNextNodes.filter(node => node.terminalAction === 'handover')
            : technicianNextNodes;
    const startNode = isKtvAwaitingInspectionStart
        ? getFirstNonTerminalWorkflowTransition(selectedTicketWorkflow, selectedTicket.status)
        : undefined;
    const visibleTechnicianNextNodes = inboundTechnicianHoldMessage
        ? []
        : isKtvAwaitingInspectionStart
        ? (startNode && technicianNextNodes.some(node => node.id === startNode.id) ? [startNode] : [])
        : customerFilteredNextNodes;
    const canManageSelectedTicketParts = !isSelectedTicketTerminal
        && !inboundTechnicianHoldMessage
        && !isKtvAwaitingInspectionStart
        && (user?.role === 'admin' || (isSelectedTicketAssignedToMe && !isSelectedTicketIncomingTransfer));
    const partIssueOptions = selectedTicket.issues || [];
    const effectivePartIssueId = partIssueOptions.some(issue => issue.id === selectedPartIssueId)
        ? selectedPartIssueId
        : partIssueOptions[0]?.id || '';
    const canTransitionSelectedTicket = !isSelectedTicketTerminal
        && !inboundTechnicianHoldMessage
        && (user?.role === 'admin' || (isSelectedTicketAssignedToMe && !isSelectedTicketIncomingTransfer));
    const canEditDiagnosis = canManageSelectedTicketParts
        && selectedTicketCurrentNode?.allowedFeatures?.includes('allowTechnicianDiagnosis') === true;
    const customerDecision = selectedTicket.customerApproval?.decision
        || (selectedTicket.customerApproval?.approvedAt ? 'approved' : undefined);
    const customerDecisionAt = selectedTicket.customerApproval?.respondedAt || selectedTicket.customerApproval?.approvedAt;

    return (
<Modal
            isOpen={true}
            onClose={() => setSelectedTicket(null)}
            title={`${selectedTicket.deviceInfo?.model || 'Thiết bị'} — #${selectedTicket.id.slice(-6).toUpperCase()}`}
            size="lg"
        >
            <div className="space-y-3 p-3 sm:space-y-4 sm:p-5">
                {(() => {
                    const workflow = getWorkflowForTicket(selectedTicket);
                    const currentCfg = workflow.find(s => s.id === selectedTicket.status);
                    const isTerminalReadOnly = isRepairStatus(selectedTicket.status, REPAIR_STATUS.CUSTOMER_HANDOVER) || !!currentCfg?.isTerminal;

                    const isAssignedToMe = selectedTicket.staff?.assignedTechnician === user?.uid;
                    const isIncomingTransferToMe = selectedTicket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && selectedTicket.pendingTechnicianTransfer?.status === 'pending';
                    const isKtvLocked = user?.role !== 'admin' && !isAssignedToMe;

                    if (isTerminalReadOnly) {
                        return (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800 font-medium flex items-center gap-2">
                                <AlertCircle size={16} /> Phiếu đã hoàn tất kỹ thuật — Chỉ xem, không thể chỉnh sửa.
                            </div>
                        );
                    }

                    if (inboundTechnicianHoldMessage) {
                        return (
                            <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-medium text-sky-900">
                                <Truck size={16} /> {inboundTechnicianHoldMessage} Tiếp nhận sẽ mở phiếu sau khi nhận máy thực tế.
                            </div>
                        );
                    }

                    if (isIncomingTransferToMe) {
                        return (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                                <p className="text-sm text-emerald-800 font-medium flex items-center gap-2 mb-2">
                                    <AlertCircle size={16} /> Phiếu đang chờ bạn tiếp nhận. Bạn không thể chỉnh sửa cho đến khi bấm &quot;Nhận phiếu&quot;.
                                </p>
                                <div className="flex gap-2">
                                    <button onClick={() => handleTransferResponse(selectedTicket, 'accepted')} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700">Nhận phiếu</button>
                                    <button onClick={() => handleTransferResponse(selectedTicket, 'rejected')} className="px-3 py-1.5 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200">Từ chối</button>
                                </div>
                            </div>
                        );
                    }

                    if (isKtvLocked) {
                        return (
                            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-800 font-medium flex items-center gap-2">
                                <AlertCircle size={16} /> Bạn không có quyền chỉnh sửa. Phiếu này đã được chuyển giao cho người khác.
                            </div>
                        );
                    }

                    return null;
                })()}
                {(() => {
                    const workflow = getWorkflowForTicket(selectedTicket);
                    const st = workflow.find(s => s.id === selectedTicket.status) || { id: selectedTicket.status, label: selectedTicket.status, color: 'text-gray-700 bg-gray-50 border-gray-200' };
                    return (
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${inboundTechnicianHoldMessage ? 'border-sky-200 bg-sky-50 text-sky-800' : st.color}`}>
                            {inboundTechnicianHoldMessage ? <Truck size={15} /> : null}
                            {inboundTechnicianHoldMessage || st.label}
                        </div>
                    );
                })()}

                {customerDecision && (
                    <div className={`rounded-xl border p-3 ${customerDecision === 'approved' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                        <p className={`text-sm font-bold ${customerDecision === 'approved' ? 'text-emerald-800' : 'text-red-800'}`}>
                            {customerDecision === 'approved' ? 'Tiếp nhận đã xác nhận: khách đồng ý sửa' : 'Tiếp nhận đã xác nhận: khách không đồng ý sửa'}
                        </p>
                        <p className="mt-1 text-xs text-gray-600">
                            {selectedTicket.customerApproval?.respondedByName || selectedTicket.customerApproval?.approvedByName || selectedTicket.customerApproval?.respondedBy || selectedTicket.customerApproval?.approvedBy || 'Tiếp nhận'}
                            {customerDecisionAt ? ` · ${new Date((customerDecisionAt as { toDate?: () => Date })?.toDate?.() || customerDecisionAt as string | number | Date).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                        </p>
                        {selectedTicket.customerApproval?.note && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{selectedTicket.customerApproval.note}</p>}
                    </div>
                )}

                <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="flex items-center gap-1 text-xs font-semibold text-gray-600"><AlertCircle size={12} /> Chẩn đoán kỹ thuật</p>
                            {!isDiagnosisOpen && (
                                <div className="mt-1 space-y-0.5">
                                    {getDiagnosisIssues(selectedTicket).slice(0, 2).map((issue, index) => (
                                        <p key={issue.id || index} className="flex items-baseline justify-between gap-2 text-sm text-gray-800">
                                            <span className="min-w-0 truncate">{index + 1}. {issue.label}</span>
                                            {issue.estimatedPrice > 0 && <span className="shrink-0 text-xs text-gray-500">~{formatPrice(issue.estimatedPrice)}</span>}
                                        </p>
                                    ))}
                                    {getDiagnosisIssues(selectedTicket).length > 2 && <p className="text-xs text-gray-500">+{getDiagnosisIssues(selectedTicket).length - 2} lỗi khác</p>}
                                    {selectedTicket.issue?.notes && <p className="line-clamp-2 pt-1 text-xs text-gray-500">Ghi chú: {selectedTicket.issue.notes}</p>}
                                </div>
                            )}
                        </div>
                        {canEditDiagnosis && !isDiagnosisOpen && (
                            <button type="button" onClick={() => setIsDiagnosisOpen(true)} className="shrink-0 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-orange-700">Cập nhật</button>
                        )}
                    </div>

                    {isDiagnosisOpen && (
                        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
                            <p className="text-xs text-gray-500">KTV chỉ cập nhật kết quả kiểm tra, taxonomy và giá dự kiến; không thay đổi thông tin khách hoặc thanh toán.</p>
                            {diagnosisIssues.map((issue, index) => (
                                <div key={issue.id || index} className="rounded-lg border border-gray-200 bg-white p-2.5">
                                    <div className="grid grid-cols-[minmax(0,1fr)_112px_auto] items-center gap-2">
                                        <input value={issue.label} onChange={event => setDiagnosisIssues(current => current.map(item => item.id === issue.id ? { ...item, label: event.target.value } : item))} placeholder="Lỗi sau kiểm tra" className="min-w-0 rounded-lg border border-gray-300 px-2.5 py-2 text-sm" aria-label={`Lỗi ${index + 1}`} />
                                        <CurrencyInput value={issue.estimatedPrice || ''} onChange={value => setDiagnosisIssues(current => current.map(item => item.id === issue.id ? { ...item, estimatedPrice: value } : item))} placeholder="Giá" className="min-w-0 rounded-lg border border-gray-300 px-2 py-2 text-right text-sm" aria-label={`Giá dự kiến lỗi ${index + 1}`} />
                                        <button type="button" onClick={() => setDiagnosisIssues(current => current.filter(item => item.id !== issue.id))} disabled={diagnosisIssues.length <= 1} className="p-1.5 text-red-500 disabled:cursor-not-allowed disabled:opacity-30" title="Xóa lỗi"><Trash2 size={16} /></button>
                                    </div>
                                    <button type="button" onClick={() => setExpandedTaxonomyIssueId(current => current === issue.id ? null : issue.id)} className="mt-2 flex w-full items-center justify-between rounded-md bg-orange-50 px-2 py-1.5 text-left text-xs text-orange-800">
                                        <span className="truncate">Taxonomy: {issue.serviceName || 'Chưa phân loại'}</span><span>{expandedTaxonomyIssueId === issue.id ? 'Ẩn' : 'Chọn'}</span>
                                    </button>
                                    {expandedTaxonomyIssueId === issue.id && (
                                        <div className="mt-2 rounded-md border border-orange-100 bg-orange-50/50 p-2">
                                            <CategoryTaxonomySelector type="service" value={issue.categoryPath || []} onChange={(ids, categoryName, subCategoryName) => setDiagnosisIssues(current => current.map(item => item.id === issue.id ? {
                                                ...item, categoryPath: ids, serviceName: subCategoryName || categoryName || '', serviceId: '',
                                            } : item))} />
                                        </div>
                                    )}
                                </div>
                            ))}
                            <button type="button" onClick={() => {
                                const id = crypto.randomUUID();
                                setDiagnosisIssues(current => [...current, { id, label: '', estimatedPrice: 0, status: 'pending', categoryPath: [], serviceName: '', serviceId: '' }]);
                                setExpandedTaxonomyIssueId(id);
                            }} className="flex items-center gap-1 text-sm font-semibold text-orange-700"><Plus size={15} /> Thêm lỗi phát sinh</button>
                            <label className="block text-xs font-semibold text-gray-600">Ghi chú kỹ thuật cho Tiếp nhận
                                <textarea value={technicianNote} onChange={event => setTechnicianNote(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm font-normal" placeholder="Kết quả kiểm tra, lưu ý khi báo khách..." />
                            </label>
                            <div className="sticky bottom-0 -mx-3 flex gap-2 border-t border-gray-200 bg-white/95 px-3 pt-2 backdrop-blur">
                                <button type="button" onClick={() => { setIsDiagnosisOpen(false); setDiagnosisIssues(getDiagnosisIssues(selectedTicket)); setTechnicianNote(selectedTicket.issue?.notes || ''); }} disabled={isSavingDiagnosis} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-semibold text-gray-700">Hủy</button>
                                <button type="button" onClick={async () => {
                                    if (diagnosisIssues.some(item => !item.label.trim())) { toastError('Vui lòng nhập tên cho từng lỗi trước khi lưu.'); return; }
                                    setIsSavingDiagnosis(true);
                                    try { await handleDiagnosisUpdate(selectedTicket, diagnosisIssues, technicianNote); setIsDiagnosisOpen(false); }
                                    catch (error) { console.error('Diagnosis update error:', error); toastError(error instanceof Error ? error.message : 'Không thể cập nhật chẩn đoán kỹ thuật.'); }
                                    finally { setIsSavingDiagnosis(false); }
                                }} disabled={isSavingDiagnosis || diagnosisIssues.some(item => !item.label.trim())} className="flex-1 rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white disabled:opacity-50">
                                    {isSavingDiagnosis ? 'Đang lưu...' : 'Lưu chẩn đoán'}
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                {!isKtvAwaitingInspectionStart && selectedTicket.deviceInfo?.checklist && (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><CheckCircle2 size={12} /> Checklist kiểm tra</p>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(selectedTicket.deviceInfo.checklist)
                                .filter(([k]) => !['hasPriorRepair', 'hasWaterDamage', 'hasNonGenuineParts'].includes(k))
                                .map(([key, val]) => (
                                    <div key={key} className={`text-[11px] rounded-lg px-2.5 py-2 border font-medium flex items-center justify-between ${val === 'OK' ? 'bg-green-50 border-green-200 text-green-700' :
                                            val === 'Lỗi' ? 'bg-red-50 border-red-200 text-red-600' :
                                                val && val !== 'N/A' && val !== '—' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                                                    'bg-gray-50 border-gray-200 text-gray-500'
                                        }`}>
                                        <span className="opacity-70">{checklistLabels[key] || key}:</span>
                                        <span>{val as string || '—'}</span>
                                    </div>
                                ))}
                        </div>

                        <div className="mt-3">
                            <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><AlertCircle size={12} /> Lịch sử máy</p>
                            <div className="flex flex-wrap gap-2 text-[11px]">
                                <span className={`px-2 py-1 rounded-md border ${selectedTicket.deviceInfo.checklist.hasPriorRepair ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                    {selectedTicket.deviceInfo.checklist.hasPriorRepair ? '☑' : '☐'} Đã từng sửa
                                </span>
                                <span className={`px-2 py-1 rounded-md border ${selectedTicket.deviceInfo.checklist.hasWaterDamage ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                    {selectedTicket.deviceInfo.checklist.hasWaterDamage ? '☑' : '☐'} Từng vào nước
                                </span>
                                <span className={`px-2 py-1 rounded-md border ${selectedTicket.deviceInfo.checklist.hasNonGenuineParts ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                    {selectedTicket.deviceInfo.checklist.hasNonGenuineParts ? '☑' : '☐'} Kém/Lô
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {selectedTicket.parts && selectedTicket.parts.length > 0 && (
                    <div className="mt-4 border-t pt-4">
                        <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <Package size={16} className="text-orange-500" /> Linh kiện đã chọn
                        </p>
                        <div className="space-y-2">
                            {selectedTicket.parts.map((p, pIdx) => {
                                const isRequested = isRepairPartStatus(p.status, REPAIR_PART_STATUS.REQUESTED);
                                const isUnavailable = isRepairPartStatus(p.status, REPAIR_PART_STATUS.UNAVAILABLE);
                                const isReserved = isRepairPartStatus(p.status, REPAIR_PART_STATUS.SELECTED)
                                    || isRepairPartStatus(p.status, REPAIR_PART_STATUS.IN_STOCK);
                                const isConsumed = Boolean(p.inventoryDeductedAt);
                                const isReturnPending = Boolean(p.returnedToReceptionPendingAt) && !p.returnedToReceptionReceivedAt;
                                const isReceptionHandoverPending = Boolean(p.receptionHandedOverAt) && !p.technicianReceivedAt;
                                const needsTechnicianReceipt = isRepairPartStatus(p.status, REPAIR_PART_STATUS.SELECTED)
                                    && !isConsumed
                                    && !isReturnPending
                                    && isReceptionHandoverPending
                                    && !p.technicianReceivedAt;
                                const canRemovePart = canManageSelectedTicketParts && !p.receptionHandedOverAt && !p.technicianReceivedAt && (isRequested || isUnavailable || isReserved);
                                const removeLabel = isRequested ? 'Bỏ đề xuất' : isReserved ? 'Bỏ chọn' : 'Loại trừ';

                                return (
                                <div key={p.partLineId || pIdx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-orange-50/50 p-2.5 rounded-lg border border-orange-100">
                                    <div>
                                        <p className="font-medium text-sm text-gray-900">{p.productName || p.name || p.partName || 'Linh kiện'}</p>
                                        <p className="text-xs text-gray-500">
                                            Phân loại: {p.quality || 'Chưa phân loại'} (SL: {p.quantity || 1})
                                            {p.price ? (
                                                <> · Giá dự kiến: <span className="font-semibold text-orange-600">{formatPrice((p as Partial<{ price: number }>).price || 0)}</span></>
                                            ) : null}
                                        </p>
                                        {p.issueId && (
                                            <p className="mt-0.5 text-[11px] text-sky-700">Thuộc lỗi: {partIssueOptions.find(issue => issue.id === p.issueId)?.label || 'Lỗi đã gắn'}</p>
                                        )}
                                    </div>
                                    <div className="mt-2 flex w-fit items-center gap-2 sm:mt-0">
                                        <span
                                            className={`w-fit text-[10px] font-bold px-2 py-1 rounded-md border ${isRepairPartStatus(p.status, REPAIR_PART_STATUS.SELECTED)
                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                    : isRepairPartStatus(p.status, REPAIR_PART_STATUS.IN_STOCK)
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : isRepairPartStatus(p.status, REPAIR_PART_STATUS.UNAVAILABLE)
                                                            ? 'bg-red-50 text-red-600 border-red-200'
                                                            : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                }`}
                                        >
                                            {isReturnPending
                                                ? 'Chờ TN nhận lại'
                                                : isConsumed
                                                    ? 'Đã dùng'
                                                : isRepairPartStatus(p.status, REPAIR_PART_STATUS.SELECTED)
                                                    ? p.technicianReceivedAt ? 'Đã nhận từ TN' : isReceptionHandoverPending ? 'TN đã bàn giao'
                                                        : p.technicianReceiptRejectedAt ? 'KTV báo chưa nhận' : 'Chờ TN bàn giao'
                                                : isRepairPartStatus(p.status, REPAIR_PART_STATUS.IN_STOCK)
                                                    ? 'Đã chọn test'
                                                    : isRepairPartStatus(p.status, REPAIR_PART_STATUS.UNAVAILABLE)
                                                        ? 'Không có hàng'
                                                        : 'Đang yêu cầu'}
                                        </span>
                                        {needsTechnicianReceipt && canManageSelectedTicketParts && (
                                            <>
                                                <button type="button" onClick={() => handleConfirmPartReceived(selectedTicket, pIdx)} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-[10px] font-bold text-blue-700 hover:bg-blue-50">Đã nhận LK</button>
                                                <button type="button" onClick={() => handleReportPartNotReceived(selectedTicket, pIdx)} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-white px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50">Chưa nhận LK</button>
                                            </>
                                        )}
                                        {canRemovePart && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemovePart(selectedTicket, pIdx)}
                                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-50"
                                                title={`${removeLabel} linh kiện khỏi phiếu`}
                                            >
                                                <Trash2 size={12} /> {removeLabel}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {(() => {
                    const workflow = getWorkflowForTicket(selectedTicket);
                    const st = workflow.find(s => s.id === selectedTicket.status);
                    return st?.allowedFeatures?.includes('allowPartsSelection');
                })() && !(() => {
                    const wf = getWorkflowForTicket(selectedTicket);
                    const cfg = wf.find(s => s.id === selectedTicket.status);
                    const isTerminal = isRepairStatus(selectedTicket.status, REPAIR_STATUS.CUSTOMER_HANDOVER) || !!cfg?.isTerminal;
                    const isAssignedToMe = selectedTicket.staff?.assignedTechnician === user?.uid;
                    const isIncomingTransferToMe = selectedTicket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && selectedTicket.pendingTechnicianTransfer?.status === 'pending';
                    const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                    return isTerminal || isKtvLocked;
                })() && (
                        <div className="mt-4 border-t pt-4">
                            <p className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                <Package size={16} className="text-orange-500" /> Thao tác linh kiện
                            </p>

                                 <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Thêm linh kiện mới</label>
                                {partIssueOptions.length > 0 && (
                                    <label className="mb-3 block">
                                        <span className="mb-1 block text-[11px] font-medium text-gray-500">Linh kiện này xử lý lỗi nào?</span>
                                        <select value={effectivePartIssueId} onChange={event => setSelectedPartIssueId(event.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-orange-500/20">
                                            {partIssueOptions.map((issue, index) => <option key={issue.id} value={issue.id}>{index + 1}. {issue.label || 'Chưa đặt tên lỗi'}</option>)}
                                        </select>
                                    </label>
                                )}
                                     <div className="relative mb-3">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search size={14} className="text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Tìm kiếm linh kiện..."
                                        value={partSearchQuery}
                                        onChange={e => setPartSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500/20"
                                    />
                                     </div>

                                {(isLoadingServiceSuggestions || serviceSuggestedParts.length > 0 || serviceSuggestionHint) && !partSearchQuery && (
                                    <div className="mb-3 rounded-md border border-emerald-100 bg-emerald-50 p-2.5">
                                        <p className="mb-2 text-[11px] font-semibold text-emerald-800">Gợi ý theo dịch vụ đã chọn · {selectedPartQuality}</p>
                                        {isLoadingServiceSuggestions ? (
                                            <div className="flex items-center gap-2 text-xs text-emerald-700"><Loader2 size={13} className="animate-spin" /> Đang tải gợi ý…</div>
                                        ) : serviceSuggestionHint ? (
                                            <p className="text-xs leading-5 text-emerald-800">{serviceSuggestionHint}</p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {serviceSuggestedParts.map(product => {
                                                    const available = Math.max(0, (product.stock || 0) - (product.held || 0));
                                                    const isAlreadyRequested = selectedTicket.parts?.some(
                                                        part => part.productId === product.id && isRepairPartStatus(part.status, REPAIR_PART_STATUS.REQUESTED),
                                                    );
                                                    return (
                                                        <div key={product.id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1.5">
                                                            <div className="min-w-0">
                                                                <p className="break-words text-xs font-medium leading-4 text-gray-800" title={product.name}>{product.name}</p>
                                                                <p className={`text-[10px] ${available > 0 ? 'text-gray-500' : 'text-red-500'}`}>Khả dụng: {available}</p>
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAddPart(selectedTicket, product, effectivePartIssueId || undefined)}
                                                                    disabled={available <= 0}
                                                                    className="rounded border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    Có sẵn (Thêm)
                                                                </button>
                                                                {available <= 0 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRequestPart(selectedTicket, product, effectivePartIssueId || undefined)}
                                                                        disabled={isAlreadyRequested}
                                                                        className={`rounded border px-2 py-1 text-[11px] font-semibold ${isAlreadyRequested
                                                                            ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-500 opacity-70'
                                                                            : 'border-orange-200 bg-orange-100 text-orange-700 hover:bg-orange-200'
                                                                            }`}
                                                                    >
                                                                        {isAlreadyRequested ? 'Đã đề xuất' : 'Hết (Đề xuất)'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                 <div className="mb-3">
                                    <label className="text-[11px] font-medium text-gray-500 mb-1 block">Chất lượng / Loại hàng:</label>
                                    <select
                                        value={selectedPartQuality}
                                        onChange={e => setSelectedPartQuality(e.target.value)}
                                        aria-label="Chất lượng / Loại hàng"
                                        title="Chất lượng / Loại hàng"
                                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-orange-500/20"
                                    >
                                        <option value="Zin">Zin</option>
                                        <option value="Loại 1">Loại 1</option>
                                        <option value="Loại 2">Loại 2</option>
                                        <option value="Bóc máy">Bóc máy</option>
                                        <option value="Linh kiện">Linh kiện thay thế</option>
                                    </select>
                                </div>

                                {partSearchQuery && (
                                    <>
                                    <div className="mt-2 bg-white border border-gray-200 rounded-md shadow-sm divide-y max-h-48 overflow-y-auto mb-3">
                                        {isSearchingParts ? (
                                            <div className="p-3 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                                                <Loader2 size={14} className="animate-spin" /> Đang tìm...
                                            </div>
                                        ) : partSearchResults.length > 0 ? (
                                            partSearchResults.map(product => (
                                                <div key={product.id} className="p-2 hover:bg-orange-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                    <div>
                                                        <p className="break-words text-sm font-medium leading-5 text-gray-800" title={product.name}>{product.name}</p>
                                                        {(() => {
                                                            const available = Math.max(0, (product.stock || 0) - (product.held || 0));
                                                            return (
                                                                <p className={`text-[10px] ${available > 0 ? 'text-gray-500' : 'text-red-500 font-medium'}`}>
                                                                    {product.quality ? `${product.quality} · ` : ''}Khả dụng: {available}
                                                                    {((product.held || 0) > 0) && ` (Đang giữ: ${product.held})`}
                                                                </p>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {(() => {
                                                            const available = Math.max(0, (product.stock || 0) - (product.held || 0));
                                                            const isAlreadyRequested = selectedTicket.parts?.some(
                                                                p => p.productId === product.id && isRepairPartStatus(p.status, REPAIR_PART_STATUS.REQUESTED)
                                                            );
                                                            return (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleAddPart(selectedTicket, product, effectivePartIssueId || undefined)}
                                                                        disabled={available <= 0}
                                                                        className={`px-2 py-1 border text-xs font-semibold rounded ${available > 0 ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-70'}`}
                                                                    >
                                                                        Có sẵn (Thêm)
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRequestPart(selectedTicket, product, effectivePartIssueId || undefined)}
                                                                        disabled={isAlreadyRequested}
                                                                        className={`px-2 py-1 text-xs font-semibold rounded border ${isAlreadyRequested
                                                                                ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed opacity-70'
                                                                                : 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200'
                                                                            }`}
                                                                    >
                                                                        {isAlreadyRequested ? 'Đã đề xuất' : 'Hết (Đề xuất)'}
                                                                    </button>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-3 text-center text-xs text-gray-500">Không tìm thấy linh kiện trong hệ thống.</div>
                                        )}
                                    </div>
                                    {partSearchSource === 'unscoped-index' && (
                                        <p className="-mt-1 mb-3 text-[11px] leading-4 text-amber-700">Danh mục dịch vụ chưa có nhóm linh kiện phù hợp; cần cấu hình taxonomy trước khi chọn linh kiện.</p>
                                    )}
                                    </>
                                )}

                                <div className="pt-3 border-t border-gray-200">
                                    <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Linh kiện ngoài / Chưa có trên hệ thống</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="VD: Cáp sạc iPhone 12 Zin bóc máy..."
                                            value={customPartName}
                                            onChange={e => setCustomPartName(e.target.value)}
                                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-orange-500/20"
                                        />
                                        <button
                                            onClick={() => handleAddCustomPart(selectedTicket, effectivePartIssueId || undefined)}
                                            disabled={!customPartName.trim()}
                                            className="px-3 py-1.5 bg-gray-800 text-white text-xs font-semibold rounded-md hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                        >
                                            Thêm & Đề xuất
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                {selectedTicket.preRepairMedia?.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><ImageIcon size={12} /> Ảnh/Video nhận máy</p>
                        <div className="grid grid-cols-3 gap-2">
                            {selectedTicket.preRepairMedia.map((url, i) => (
                                <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100 border">
                                    {url.includes('.mp4') || url.includes('video') ? (
                                        <video src={url} controls className="w-full h-full object-cover" />
                                    ) : (
                                        <img src={url} alt={`Pre-repair ${i + 1}`} className="w-full h-full object-cover" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {selectedTicket.postRepairMedia?.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Video size={12} /> Video / Media bàn giao</p>
                        <div className="grid grid-cols-2 gap-2">
                            {selectedTicket.postRepairMedia.map((url, i) => (
                                <div key={i} className="rounded-lg overflow-hidden bg-gray-100 border">
                                    {isYouTubeUrl(url) ? (
                                        <div className="aspect-video">
                                            <iframe src={getYouTubeEmbedUrl(url) || ''} title={`YouTube ${i + 1}`}
                                                className="w-full h-full" frameBorder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                                        </div>
                                    ) : url.includes('.mp4') || url.includes('video') ? (
                                        <video src={url} controls className="w-full" />
                                    ) : (
                                        <img src={url} alt={`Post-repair ${i + 1}`} className="w-full object-cover" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {selectedTicket.statusTimeline?.length > 0 && (
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowTimeline(value => !value)}
                            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                        >
                            <span className="flex items-center gap-1"><Clock size={12} /> Nhật ký phiếu ({selectedTicket.statusTimeline.length})</span>
                            <span>{showTimeline ? 'Ẩn' : 'Xem'}</span>
                        </button>
                        {showTimeline && (
                            <div className="mt-2 space-y-2">
                                {[...selectedTicket.statusTimeline].reverse().map((entry, i) => (
                                    <div key={`${entry.requestId || entry.timestamp || i}-${i}`} className="rounded-lg border bg-gray-50 p-3 text-xs">
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="font-semibold text-gray-800">{getTimelineTitle(entry, getWorkflowForTicket(selectedTicket))}</span>
                                            <span className="shrink-0 text-gray-400">
                                                {getTimelineTimestamp(entry).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        {(entry.actorName || entry.actorId || entry.by) && (
                                            <p className="mt-1 text-gray-600">Thực hiện: {entry.actorName || entry.actorId || entry.by} {entry.actorRole ? `(${entry.actorRole})` : ''}</p>
                                        )}
                                        {(entry.reason || entry.note) && <p className="mt-1 text-gray-700">Lý do: {entry.reason || entry.note}</p>}
                                        {entry.requestId && <p className="mt-1 break-all text-[10px] text-gray-400">Mã đối soát: {entry.requestId}</p>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {(() => {
                    if (!canTransitionSelectedTicket) return null;

                    if (canManageSelectedTicketParts && selectedTicketCurrentNode?.allowedFeatures?.includes('allowPartsSelection')) {
                        const hasRequestedParts = selectedTicket.parts?.some(p => isRepairPartStatus(p.status, REPAIR_PART_STATUS.REQUESTED) || isRepairPartStatus(p.status, REPAIR_PART_STATUS.ORDERED));
                        const preferredStatusId = hasRequestedParts ? 'dang_tim_linh_kien' : 'dang_sua_chua';
                        const preferredTarget = visibleTechnicianNextNodes.find((node) => node.id === preferredStatusId);
                        const transitionTargets = preferredTarget ? [preferredTarget] : visibleTechnicianNextNodes;

                        if (transitionTargets.length === 0) return null;
                        return (
                            <div className="pt-3 border-t flex gap-2">
                                {transitionTargets.map((targetStatus) => (
                                    <button
                                        key={targetStatus.id}
                                        onClick={() => { handleStatusChange(selectedTicket.id, targetStatus.id); setSelectedTicket(null); }}
                                        className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-md shadow-orange-200/50"
                                    >
                                        Chuyển → {targetStatus.label}
                                    </button>
                                ))}
                            </div>
                        );
                    }

                    if (visibleTechnicianNextNodes.length === 0) return null;
                    return (
                        <div className="pt-3 border-t flex gap-2">
                            {visibleTechnicianNextNodes.map((nextStatus) => (
                                <button
                                    key={nextStatus.id}
                                    onClick={() => { handleStatusChange(selectedTicket.id, nextStatus.id); setSelectedTicket(null); }}
                                    className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-md shadow-orange-200/50"
                                >
                                    {isKtvAwaitingInspectionStart ? 'Bắt đầu kiểm tra' : `Chuyển → ${nextStatus.label}`}
                                </button>
                            ))}
                        </div>
                    );
                })()}
            </div>
        </Modal>
    );
}
