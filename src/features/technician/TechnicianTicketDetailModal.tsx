'use client';

/* eslint-disable @next/next/no-img-element */

import { AlertCircle, CheckCircle2, Clock, Image as ImageIcon, Loader2, Package, Search, Trash2, Video } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import type { Product, RepairTicket, User, WorkflowNode } from '@/lib/types';
import { getYouTubeEmbedUrl, isYouTubeUrl } from '@/lib/workflowFeatures';
import { REPAIR_PART_STATUS, REPAIR_STATUS, isRepairPartStatus, isRepairStatus } from '@/lib/repairStatus';

const checklistLabels: Record<string, string> = {
    body: 'Vỏ máy', screen: 'Màn hình', touch: 'Cảm ứng', camera: 'Camera',
    speaker: 'Loa/Mic', connectivity: 'Kết nối', battery: 'Pin', biometric: 'FaceID/Vân tay',
};

type RepairTimelineEntry = NonNullable<RepairTicket['statusTimeline']>[number];

interface TechnicianTicketDetailModalProps {
    selectedTicket: RepairTicket | null;
    setSelectedTicket: (ticket: RepairTicket | null) => void;
    user: Pick<User, 'uid' | 'role'> | null | undefined;
    userNamesMap: Record<string, string>;
    partSearchQuery: string;
    setPartSearchQuery: (value: string) => void;
    partSearchResults: Product[];
    isSearchingParts: boolean;
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
    handleAddPart: (ticket: RepairTicket, product: Product) => Promise<void> | void;
    handleRequestPart: (ticket: RepairTicket, product: Product) => Promise<void> | void;
    handleAddCustomPart: (ticket: RepairTicket) => Promise<void> | void;
    handleStatusChange: (ticketId: string, newStatus: string) => Promise<void> | void;
}

export function TechnicianTicketDetailModal({
    selectedTicket,
    setSelectedTicket,
    user,
    userNamesMap,
    partSearchQuery,
    setPartSearchQuery,
    partSearchResults,
    isSearchingParts,
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
    handleAddPart,
    handleRequestPart,
    handleAddCustomPart,
    handleStatusChange,
}: TechnicianTicketDetailModalProps) {
    if (!selectedTicket) return null;

    return (
<Modal
            isOpen={true}
            onClose={() => setSelectedTicket(null)}
            title={`${selectedTicket.deviceInfo?.model || 'Thiết bị'} — #${selectedTicket.id.slice(-6).toUpperCase()}`}
            size="lg"
        >
            <div className="p-5 space-y-4">
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
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${st.color}`}>
                            {st.label}
                        </div>
                    );
                })()}

                {selectedTicket.issues && selectedTicket.issues.length > 0 ? (
                    <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><AlertCircle size={12} /> Danh sách lỗi</p>
                        <div className="space-y-1">
                            {selectedTicket.issues.map((iss, idx) => (
                                <div key={iss.id || idx} className="flex justify-between text-sm">
                                    <span className="text-gray-800">{idx + 1}. {iss.label}</span>
                                    {iss.estimatedPrice > 0 && <span className="text-gray-400 text-xs">~{iss.estimatedPrice.toLocaleString('vi-VN')}đ</span>}
                                </div>
                            ))}
                        </div>
                        {selectedTicket.issue?.notes && (
                            <p className="text-xs text-gray-500 mt-2 pt-2 border-t">Ghi chú: {selectedTicket.issue.notes}</p>
                        )}
                    </div>
                ) : selectedTicket.issue?.description && (
                    <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><AlertCircle size={12} /> Lỗi / Yêu cầu</p>
                        <p className="text-sm text-gray-800">{selectedTicket.issue.description}</p>
                        {selectedTicket.issue.notes && (
                            <p className="text-xs text-gray-500 mt-1">Ghi chú: {selectedTicket.issue.notes}</p>
                        )}
                    </div>
                )}

                {selectedTicket.deviceInfo?.checklist && (
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
                                <Package size={16} className="text-orange-500" /> Linh kiện sử dụng
                            </p>

                            {selectedTicket.parts && selectedTicket.parts.length > 0 && (
                                <div className="mb-4 space-y-2">
                                    {selectedTicket.parts.map((p, pIdx) => (
                                        <div key={pIdx} className="flex flex-col sm:flex-row sm:items-center justify-between bg-orange-50/50 p-2.5 rounded-lg border border-orange-100">
                                            <div>
                                                <p className="font-medium text-sm text-gray-900">{p.productName}</p>
                                                <p className="text-xs text-gray-500">
                                                    Phân loại: {p.quality} (SL: {p.quantity})
                                                    {p.price ? (
                                                        <> · Giá dự kiến: <span className="font-semibold text-orange-600">{formatPrice((p as Partial<{ price: number }>).price || 0)}</span></>
                                                    ) : null}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 mt-2 sm:mt-0">
                                                <span
                                                    className={`text-[10px] font-bold px-2 py-1 rounded-md border ${isRepairPartStatus(p.status, REPAIR_PART_STATUS.SELECTED)
                                                            ? 'bg-green-50 text-green-700 border-green-200'
                                                            : isRepairPartStatus(p.status, REPAIR_PART_STATUS.IN_STOCK)
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : p.status === 'unavailable'
                                                                    ? 'bg-red-50 text-red-600 border-red-200'
                                                                    : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                                        }`}
                                                >
                                                    {isRepairPartStatus(p.status, REPAIR_PART_STATUS.SELECTED)
                                                        ? 'Đã xuất'
                                                        : isRepairPartStatus(p.status, REPAIR_PART_STATUS.IN_STOCK)
                                                            ? 'Đã tìm được'
                                                            : p.status === 'unavailable'
                                                                ? 'Không có hàng'
                                                                : 'Đang yêu cầu'}
                                                </span>
                                                {!(() => {
                                                    const wf = getWorkflowForTicket(selectedTicket);
                                                    const cfg = wf.find(s => s.id === selectedTicket.status);
                                                    const isTerminal = isRepairStatus(selectedTicket.status, REPAIR_STATUS.CUSTOMER_HANDOVER) || !!cfg?.isTerminal;
                                                    const isAssignedToMe = selectedTicket.staff?.assignedTechnician === user?.uid;
                                                    const isIncomingTransferToMe = selectedTicket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && selectedTicket.pendingTechnicianTransfer?.status === 'pending';
                                                    const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                                                    return isTerminal || isKtvLocked;
                                                })() && (
                                                        <button
                                                            onClick={() => handleRemovePart(selectedTicket, pIdx)}
                                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-md transition-colors"
                                                            title="Xóa linh kiện"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Thêm linh kiện mới</label>
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
                                    <div className="mt-2 bg-white border border-gray-200 rounded-md shadow-sm divide-y max-h-48 overflow-y-auto mb-3">
                                        {isSearchingParts ? (
                                            <div className="p-3 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
                                                <Loader2 size={14} className="animate-spin" /> Đang tìm...
                                            </div>
                                        ) : partSearchResults.length > 0 ? (
                                            partSearchResults.map(product => (
                                                <div key={product.id} className="p-2 hover:bg-orange-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-800 line-clamp-1">{product.name}</p>
                                                        {(() => {
                                                            const available = Math.max(0, (product.stock || 0) - (product.held || 0));
                                                            return (
                                                                <p className={`text-[10px] ${available > 0 ? 'text-gray-500' : 'text-red-500 font-medium'}`}>
                                                                    Khả dụng: {available}
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
                                                                        onClick={() => handleAddPart(selectedTicket, product)}
                                                                        disabled={available <= 0}
                                                                        className={`px-2 py-1 border text-xs font-semibold rounded ${available > 0 ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50' : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-70'}`}
                                                                    >
                                                                        Có sẵn (Thêm)
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleRequestPart(selectedTicket, product)}
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
                                            onClick={() => handleAddCustomPart(selectedTicket)}
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
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Clock size={12} /> Nhật ký phiếu</p>
                        <div className="space-y-2">
                            {[...selectedTicket.statusTimeline].reverse().map((entry, i) => (
                                <div key={`${entry.requestId || entry.timestamp || i}-${i}`} className="rounded-lg border bg-gray-50 p-3 text-xs">
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="font-semibold text-gray-800">{getTimelineTitle(entry, getWorkflowForTicket(selectedTicket))}</span>
                                        <span className="shrink-0 text-gray-400">
                                            {getTimelineTimestamp(entry).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    {(entry.actorName || entry.actorId || entry.by) && (
                                        <p className="mt-1 text-gray-600">Thực hiện: {entry.actorName || userNamesMap[(entry.actorId || entry.by) as string] || entry.actorId || entry.by} {entry.actorRole ? `(${entry.actorRole})` : ''}</p>
                                    )}
                                    {(entry.reason || entry.note) && <p className="mt-1 text-gray-700">Lý do: {entry.reason || entry.note}</p>}
                                    {entry.requestId && <p className="mt-1 break-all text-[10px] text-gray-400">Mã đối soát: {entry.requestId}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {(() => {
                    const workflow = getWorkflowForTicket(selectedTicket);
                    const currentStatusCfg = workflow.find(s => s.id === selectedTicket.status);
                    const isTerminal = isRepairStatus(selectedTicket.status, REPAIR_STATUS.CUSTOMER_HANDOVER) || !!currentStatusCfg?.isTerminal;
                    const isAssignedToMe = selectedTicket.staff?.assignedTechnician === user?.uid;
                    const isIncomingTransferToMe = selectedTicket.pendingTechnicianTransfer?.toTechnicianId === user?.uid && selectedTicket.pendingTechnicianTransfer?.status === 'pending';
                    const isKtvLocked = user?.role !== 'admin' && (!isAssignedToMe || isIncomingTransferToMe);
                    const isReadOnly = isTerminal || isKtvLocked;
                    if (isReadOnly) return null;
                    if (currentStatusCfg?.allowedFeatures?.includes('allowPartsSelection')) {
                        const hasRequestedParts = selectedTicket.parts?.some(p => isRepairPartStatus(p.status, REPAIR_PART_STATUS.REQUESTED) || isRepairPartStatus(p.status, REPAIR_PART_STATUS.ORDERED));
                        const targetStatusId = hasRequestedParts ? 'dang_tim_linh_kien' : 'dang_sua_chua';
                        const targetStatus = workflow.find(ds => ds.id === targetStatusId);

                        if (!targetStatus) return null;
                        return (
                            <div className="pt-3 border-t flex gap-2">
                                <button onClick={() => { handleStatusChange(selectedTicket.id, targetStatus.id); setSelectedTicket(null); }}
                                    className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-md shadow-orange-200/50">
                                    Chuyển → {hasRequestedParts ? 'Tìm linh kiện' : targetStatus.label}
                                </button>
                            </div>
                        );
                    } else {
                        const ticketIdx = workflow.findIndex(s => s.id === selectedTicket.status);
                        const nextStatus = ticketIdx !== -1 && ticketIdx < workflow.length - 1 ? workflow[ticketIdx + 1] : null;
                        if (!nextStatus) return null;
                        return (
                            <div className="pt-3 border-t flex gap-2">
                                <button onClick={() => { handleStatusChange(selectedTicket.id, nextStatus.id); setSelectedTicket(null); }}
                                    className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition-all shadow-md shadow-orange-200/50">
                                    Chuyển → {nextStatus.label}
                                </button>
                            </div>
                        );
                    }
                })()}
            </div>
        </Modal>
    );
}
