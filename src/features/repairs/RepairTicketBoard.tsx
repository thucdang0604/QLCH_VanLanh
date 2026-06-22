'use client';

import {
    AlertCircle, ArrowRight, Ban, Camera, CheckCircle2, Clock, Eye, FileText,
    Package, Printer, RotateCcw, Smartphone, User, Wrench,
} from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PaymentStatus, RepairTicket, WorkflowNode } from '@/lib/types';
import { uploadMedia } from '@/lib/storage';
import { isYouTubeUrl } from '@/lib/workflowFeatures';
import { REPAIR_STATUS, isPendingRepairPart, isRepairStatus, isSelectedRepairPart, isWarrantyEligibleRepairPart } from '@/lib/repairStatus';
import { toastError } from '@/lib/toast';
import type { WarrantyTemplateConfig } from '@/app/admin/settings/receipt/WarrantyComponents';
import type { WarrantyPrintType } from '@/features/repairs/repairPageUtils';
import { RepairPaginationFooter } from '@/features/repairs/RepairPaginationFooter';

type PageSize = 20 | 50 | 100;

interface RepairTicketBoardProps {
    filtered: RepairTicket[];
    paginatedTickets: RepairTicket[];
    ticketsTotal: number;
    currentPage: number;
    totalPages: number;
    pageSize: PageSize;
    totalFiltered: number;
    hasMore: boolean;
    searchTerm: string;
    canOverrideTerminalStatus: boolean;
    paymentLabels: Record<PaymentStatus, { label: string; color: string }>;
    getWorkflowForTicket: (ticket: RepairTicket) => WorkflowNode[];
    getWarrantyTypeForTicket: (ticket: RepairTicket) => WarrantyPrintType | null;
    getWarrantyConfigForType: (type: WarrantyPrintType | null) => WarrantyTemplateConfig | undefined;
    formatPrice: (price: number) => string;
    handleQuickStatus: (ticket: RepairTicket, nextStatus: string) => void | Promise<void>;
    handleOpenModal: (ticket?: RepairTicket) => void;
    openPrint: (ticket: RepairTicket, mode: 'receipt' | 'invoice' | 'warranty', warrantyType?: WarrantyPrintType | null) => void;
    setViewingTicket: (ticket: RepairTicket) => void;
    setAssignModal: (modal: { ticket: RepairTicket }) => void;
    setWarrantyModal: (ticket: RepairTicket) => void;
    setWarrantySelectedIndexes: (indexes: number[]) => void;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: PageSize) => void;
    onLoadMore: () => void;
}

function hasActiveWarrantyPart(ticket: RepairTicket) {
    return (ticket.parts || []).some(part =>
        isSelectedRepairPart(part) &&
        isWarrantyEligibleRepairPart(part) &&
        (!part.warrantyExpiresAt || (
            typeof part.warrantyExpiresAt === 'number'
                ? part.warrantyExpiresAt
                : (part.warrantyExpiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0
        ) > Date.now())
    );
}

export function RepairTicketBoard({
    filtered,
    paginatedTickets,
    ticketsTotal,
    currentPage,
    totalPages,
    pageSize,
    totalFiltered,
    hasMore,
    searchTerm,
    canOverrideTerminalStatus,
    paymentLabels,
    getWorkflowForTicket,
    getWarrantyTypeForTicket,
    getWarrantyConfigForType,
    formatPrice,
    handleQuickStatus,
    handleOpenModal,
    openPrint,
    setViewingTicket,
    setAssignModal,
    setWarrantyModal,
    setWarrantySelectedIndexes,
    onPageChange,
    onPageSizeChange,
    onLoadMore,
}: RepairTicketBoardProps) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:hidden">
            <div className="block md:hidden divide-y divide-gray-100">
                {filtered.length === 0 ? (
                    <div className="px-6 py-12 text-center text-gray-400">
                        <Wrench size={40} className="mx-auto mb-2 opacity-30" />
                        <p>Không có phiếu sửa chữa nào.</p>
                    </div>
                ) : paginatedTickets.map(ticket => {
                    const workflow = getWorkflowForTicket(ticket);
                    const st = workflow.find(s => s.id === ticket.status) || { id: ticket.status, label: ticket.status, color: 'bg-gray-100 text-gray-700 border-gray-200', allowedNext: [] };
                    const StIcon = Clock; // Fallback
                    const pay = paymentLabels[ticket.payment?.status || 'unpaid'];
                    const warrantyType = getWarrantyTypeForTicket(ticket);
                    const warrantyConfig = getWarrantyConfigForType(warrantyType);
                    const canPrintWarranty = Boolean(st?.isTerminal)
                        && ticket.ticketType !== 'warranty'
                        && Boolean(warrantyConfig);
                    const canCreateWarranty = Boolean(st?.isTerminal)
                        && ticket.ticketType !== 'warranty'
                        && (hasActiveWarrantyPart(ticket) || Boolean(warrantyConfig));

                    return (
                        <div key={ticket.id} className={`p-4 space-y-3 bg-white hover:bg-gray-50 transition-colors ${ticket.payment?.status === 'unpaid' ? 'bg-red-50/50' : ''}`}>
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-mono text-sm font-bold text-gray-900">#{ticket.id.slice(-6).toUpperCase()}</span>
                                        {ticket.ticketType === 'warranty' && (
                                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full font-bold">BẢO HÀNH</span>
                                        )}
                                    </div>
                                    <p className="text-sm font-medium text-gray-900">{ticket.customer.name}</p>
                                    <p className="text-xs text-gray-500">{ticket.customer.phone}</p>
                                </div>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold flex-shrink-0 rounded-full border ${st.color}`}>
                                    <StIcon size={12} /> {st.label}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm bg-gray-50/50 p-2.5 rounded-lg border border-gray-100">
                                <div className="col-span-2 flex items-center gap-1.5">
                                    <Smartphone size={14} className="text-gray-400" />
                                    <span className="font-medium text-sm text-gray-800">{ticket.deviceInfo?.model}</span>
                                </div>
                                <div className="col-span-2 pb-1 text-xs text-gray-600 truncate max-w-full italic">
                                    {ticket.issues && ticket.issues.length > 0
                                        ? ticket.issues.map(i => i.label).join(', ')
                                        : ticket.issue?.description}
                                </div>
                                {(() => {
                                    const pendingParts = (ticket.parts || []).filter(isPendingRepairPart);
                                    if (pendingParts.length > 0) {
                                        return (
                                            <div className="mt-1 col-span-2 inline-flex w-fit items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-[10px] font-medium border border-orange-200">
                                                <Package size={10} />
                                                <span>Chờ {pendingParts.length} linh kiện</span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                                <div>
                                    <p className="text-[10px] text-gray-500 uppercase font-medium">Thanh toán</p>
                                    <span className={`inline-flex px-1.5 py-0.5 rounded mt-0.5 text-[10px] font-semibold ${pay.color}`}>
                                        {pay.label}
                                    </span>
                                </div>
                                <div className="text-right flex flex-col items-end justify-center">
                                    <p className="text-[10px] text-gray-500 uppercase font-medium">KTV</p>
                                    <p className="text-xs font-medium text-gray-700 mt-0.5 truncate">{ticket.staff?.assignedTechnicianName || '—'}</p>
                                    {ticket.pendingTechnicianTransfer?.status === 'pending' && (
                                        <span className="text-[9px] text-orange-600 bg-orange-50 px-1 py-0.5 mt-1 rounded border border-orange-100 flex items-center gap-1 w-max">
                                            <AlertCircle size={8} /> Đang chuyển KTV
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="pt-2 flex flex-col gap-2 border-t border-gray-100">
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                    {st?.isTerminal ? (
                                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-500 rounded-lg text-[10px] font-semibold border border-gray-200">
                                            🔒 {st.label}
                                        </span>
                                    ) : (
                                        st.allowedNext?.map((nextId: string) => {
                                            const nextCfg = workflow.find(ds => ds.id === nextId);
                                            if (!nextCfg) return null;
                                            let btnClass = 'bg-orange-50 text-orange-700 border-orange-200';
                                            let icon = <ArrowRight size={12} />;
                                            if (nextId === 'refund') { btnClass = 'bg-red-50 text-red-600 border-red-200'; icon = <RotateCcw size={12} />; }
                                            else if (nextId === 'out' || nextId.includes('tra_may_khong_sua')) { btnClass = 'bg-gray-50 text-gray-700 border-gray-200'; icon = <Ban size={12} />; }
                                            else if (nextId === 'done') { btnClass = 'bg-emerald-50 text-emerald-700 border-emerald-200'; icon = <CheckCircle2 size={12} />; }
                                            return (
                                                <button key={nextId} onClick={() => handleQuickStatus(ticket, nextId)}
                                                    className={`flex whitespace-nowrap items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded border ${btnClass}`}>
                                                    {icon} {nextCfg.label}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => setViewingTicket(ticket)} className="flex-1 py-2 bg-gray-50 text-gray-700 text-xs font-medium rounded-lg border border-gray-200 flex items-center justify-center gap-1 active:bg-gray-100">
                                        <Eye size={14} /> Chi tiết
                                    </button>
                                    {(!(st?.isTerminal) || canOverrideTerminalStatus) && (
                                        <button onClick={() => handleOpenModal(ticket)} className="flex-1 py-2 bg-orange-50 text-orange-600 text-xs font-medium rounded-lg border border-orange-200 flex items-center justify-center gap-1 active:bg-orange-100">
                                            <Wrench size={14} /> Sửa
                                        </button>
                                    )}
                                    <button onClick={() => setAssignModal({ ticket })} className="flex-1 py-2 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg border border-blue-200 flex items-center justify-center gap-1 active:bg-blue-100">
                                        <User size={14} /> KTV
                                    </button>
                                    {canPrintWarranty && (
                                        <button onClick={() => openPrint(ticket, 'warranty', warrantyType)} className="flex-1 py-2 bg-yellow-50 text-yellow-700 text-xs font-semibold rounded-lg border border-yellow-200 flex items-center justify-center gap-1 active:bg-yellow-100">
                                            <Printer size={14} /> Phiáº¿u BH
                                        </button>
                                    )}
                                    {canCreateWarranty && (
                                        <button onClick={() => { setWarrantyModal(ticket); setWarrantySelectedIndexes([]); }} className="w-full py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg flex items-center justify-center gap-1 mt-1">
                                            <AlertCircle size={14} /> Kích hoạt bảo hành
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left min-w-[800px]">
                    <thead>
                        <tr className="bg-gray-50 border-b text-xs uppercase text-gray-500 font-semibold">
                            <th className="px-4 py-3">Mã</th>
                            <th className="px-4 py-3">Khách hàng</th>
                            <th className="px-4 py-3">Thiết bị</th>
                            <th className="px-4 py-3">Trạng thái</th>
                            <th className="px-4 py-3">Thanh toán</th>
                            <th className="px-4 py-3">KTV</th>
                            <th className="px-4 py-3 text-right">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-gray-400">
                                    <Wrench size={40} className="mx-auto mb-2 opacity-30" />
                                    Không có phiếu sửa chữa nào.
                                </td>
                            </tr>
                        ) : paginatedTickets.map(ticket => {
                            const workflow = getWorkflowForTicket(ticket);
                            const st = workflow.find(s => s.id === ticket.status) || { id: ticket.status, label: ticket.status, color: 'bg-gray-100 text-gray-700 border-gray-200', allowedNext: [] };
                            const StIcon = Clock; // Fallback generic icon
                            const pay = paymentLabels[ticket.payment?.status || 'unpaid'];
                            const warrantyType = getWarrantyTypeForTicket(ticket);
                            const warrantyConfig = getWarrantyConfigForType(warrantyType);
                            const canPrintWarranty = Boolean(st?.isTerminal)
                                && ticket.ticketType !== 'warranty'
                                && Boolean(warrantyConfig);
                            const canCreateWarranty = Boolean(st?.isTerminal)
                                && ticket.ticketType !== 'warranty'
                                && (hasActiveWarrantyPart(ticket) || Boolean(warrantyConfig));
                            return (
                                <tr key={ticket.id} className={`hover:bg-gray-50/50 transition-colors ${ticket.payment?.status === 'unpaid' ? 'bg-red-50' : ''}`}>
                                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                                        <div className="flex items-center gap-1">
                                            <span>#{ticket.id.slice(-6).toUpperCase()}</span>
                                            {ticket.ticketType === 'warranty' && (
                                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] rounded-full font-bold">BH</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-gray-900 text-sm">{ticket.customer.name}</p>
                                        <p className="text-xs text-gray-500">{ticket.customer.phone}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <Smartphone size={14} className="text-gray-400" />
                                            <span className="font-medium text-sm text-gray-900">{ticket.deviceInfo?.model}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 truncate max-w-[180px]">{ticket.issues && ticket.issues.length > 0 ? ticket.issues.map(i => i.label).join(', ') : ticket.issue?.description}</p>
                                        {(() => {
                                            const pendingParts = (ticket.parts || []).filter(isPendingRepairPart);
                                            if (pendingParts.length > 0) {
                                                return (
                                                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-[10px] font-medium border border-orange-200">
                                                        <Package size={10} />
                                                        <span>Chờ {pendingParts.length} linh kiện</span>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${st.color}`}>
                                            <StIcon size={12} /> {st.label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${pay.color}`}>
                                            {pay.label}
                                        </span>
                                        {ticket.payment?.amount > 0 && (
                                            <p className="text-xs text-gray-500 mt-0.5">{formatPrice(ticket.payment.amount)}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="text-sm text-gray-700">{ticket.staff?.assignedTechnicianName || '—'}</p>
                                        {ticket.pendingTechnicianTransfer?.status === 'pending' && (
                                            <span className="text-[9px] text-orange-600 bg-orange-50 px-1 py-0.5 mt-1 rounded border border-orange-100 flex items-center gap-1 w-max">
                                                <AlertCircle size={8} /> Đang đề nghị chuyển
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1 flex-wrap">
                                            {st?.isTerminal ? (
                                                <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-[11px] font-semibold border border-gray-200">
                                                    🔒 Đã đóng ({st.label})
                                                </span>
                                            ) : (
                                                st.allowedNext?.map((nextId: string) => {
                                                    const nextCfg = workflow.find(ds => ds.id === nextId);
                                                    if (!nextCfg) return null;

                                                    let btnClass = 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200';
                                                    let icon = <ArrowRight size={12} />;
                                                    if (nextId === 'refund') {
                                                        btnClass = 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100';
                                                        icon = <RotateCcw size={12} />;
                                                    } else if (nextId === 'out' || nextId.includes('tra_may_khong_sua')) {
                                                        btnClass = 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100';
                                                        icon = <Ban size={12} />;
                                                    } else if (nextId === 'done') {
                                                        btnClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
                                                        icon = <CheckCircle2 size={12} />;
                                                    }
                                                    return (
                                                        <button key={nextId} onClick={() => handleQuickStatus(ticket, nextId)}
                                                            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${btnClass}`}
                                                            title={`Chuyển → ${nextCfg.label}`}>
                                                            {icon}
                                                            {nextCfg.label}
                                                        </button>
                                                    );
                                                })
                                            )}
                                            <button onClick={() => setViewingTicket(ticket)}
                                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Xem chi tiết">
                                                <Eye size={16} />
                                            </button>
                                            <button onClick={() => setAssignModal({ ticket })}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Gán/Chuyển KTV">
                                                <User size={16} />
                                            </button>
                                            <button onClick={() => openPrint(ticket, 'receipt')}
                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="In phiếu tiếp nhận">
                                                <Printer size={16} />
                                            </button>
                                            {isRepairStatus(ticket.status, REPAIR_STATUS.DONE) && (
                                                <button onClick={() => openPrint(ticket, 'invoice')}
                                                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="In hóa đơn">
                                                    <FileText size={16} />
                                                </button>
                                            )}
                                            {(() => {
                                                if (!canPrintWarranty) return null;
                                                return (
                                                    <button onClick={() => openPrint(ticket, 'warranty', warrantyType)}
                                                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 transition-colors"
                                                        title="In phiếu bảo hành">
                                                        <Printer size={12} /> In BH
                                                    </button>
                                                );
                                            })()}
                                            {canCreateWarranty && (
                                                    <button onClick={() => { setWarrantyModal(ticket); setWarrantySelectedIndexes([]); }}
                                                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                                        title="Tạo phiếu bảo hành">
                                                        <AlertCircle size={12} /> Bảo hành
                                                    </button>
                                                )}
                                            {['done', 'out', 'refund'].includes(ticket.status) && (
                                                ticket.postRepairMedia?.length > 0 ? (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[10px] bg-green-50 text-green-600 border border-green-200 px-2 py-1 rounded-lg font-semibold flex items-center gap-1">
                                                            <CheckCircle2 size={10} /> {ticket.postRepairMedia.length} media
                                                        </span>
                                                        <label className="cursor-pointer p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Thêm Video/Ảnh">
                                                            <Camera size={14} />
                                                            <input
                                                                type="file"
                                                                accept="video/*,image/*"
                                                                className="hidden"
                                                                aria-label="Thêm video/ảnh bàn giao"
                                                                title="Thêm video/ảnh bàn giao"
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (!file) return;
                                                                    try {
                                                                        const url = await uploadMedia(file, 'repairs/handover');
                                                                        const existing = ticket.postRepairMedia || [];
                                                                        await updateDoc(doc(db, 'repairs', ticket.id), {
                                                                            postRepairMedia: [...existing, url],
                                                                            updatedAt: serverTimestamp(),
                                                                        });
                                                                    } catch (err) {
                                                                        console.error('Upload error:', err);
                                                                        toastError('Lỗi upload: ' + (err as Error).message);
                                                                    }
                                                                }} />
                                                        </label>
                                                        <button
                                                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Dán link YouTube"
                                                            onClick={async () => {
                                                                const link = prompt('Dán link YouTube tại đây:\n\nVD: https://youtu.be/xxxxx hoặc https://youtube.com/watch?v=xxxxx');
                                                                if (!link?.trim()) return;
                                                                if (!isYouTubeUrl(link)) {
                                                                    toastError('Link không hợp lệ. Vui lòng dán link YouTube.');
                                                                    return;
                                                                }
                                                                try {
                                                                    const existing = ticket.postRepairMedia || [];
                                                                    await updateDoc(doc(db, 'repairs', ticket.id), {
                                                                        postRepairMedia: [...existing, link.trim()],
                                                                        updatedAt: serverTimestamp(),
                                                                    });
                                                                } catch (err) {
                                                                    console.error('YouTube link error:', err);
                                                                    toastError('Lỗi: ' + (err as Error).message);
                                                                }
                                                            }}
                                                        >
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.6 3.5 12 3.5 12 3.5s-7.6 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.8.6 9.4.6 9.4.6s7.6 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z" /></svg>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <label className="cursor-pointer p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Upload Video/Ảnh Bàn Giao">
                                                            <Camera size={16} />
                                                            <input
                                                                type="file"
                                                                accept="video/*,image/*"
                                                                className="hidden"
                                                                aria-label="Upload video/ảnh bàn giao"
                                                                title="Upload video/ảnh bàn giao"
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (!file) return;
                                                                    try {
                                                                        const url = await uploadMedia(file, 'repairs/handover');
                                                                        const existing = ticket.postRepairMedia || [];
                                                                        await updateDoc(doc(db, 'repairs', ticket.id), {
                                                                            postRepairMedia: [...existing, url],
                                                                            updatedAt: serverTimestamp(),
                                                                        });
                                                                    } catch (err) {
                                                                        console.error('Upload error:', err);
                                                                        toastError('Lỗi upload: ' + (err as Error).message);
                                                                    }
                                                                }} />
                                                        </label>
                                                        <button
                                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Dán link YouTube (tiết kiệm dung lượng)"
                                                            onClick={async () => {
                                                                const link = prompt('🎬 Dán link YouTube tại đây:\n\nVD: https://youtu.be/xxxxx hoặc https://youtube.com/watch?v=xxxxx\n\n💡 Sử dụng YouTube tiết kiệm chi phí lưu trữ!');
                                                                if (!link?.trim()) return;
                                                                if (!isYouTubeUrl(link)) {
                                                                    toastError('Link không hợp lệ. Vui lòng dán link YouTube.');
                                                                    return;
                                                                }
                                                                try {
                                                                    const existing = ticket.postRepairMedia || [];
                                                                    await updateDoc(doc(db, 'repairs', ticket.id), {
                                                                        postRepairMedia: [...existing, link.trim()],
                                                                        updatedAt: serverTimestamp(),
                                                                    });
                                                                } catch (err) {
                                                                    console.error('YouTube link error:', err);
                                                                    toastError('Lỗi: ' + (err as Error).message);
                                                                }
                                                            }}
                                                        >
                                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.6 3.5 12 3.5 12 3.5s-7.6 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.8.6 9.4.6 9.4.6s7.6 0 9.4-.6a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z" /></svg>
                                                        </button>
                                                    </div>
                                                )
                                            )}
                                            {(!(st?.isTerminal) || canOverrideTerminalStatus) && (
                                                <button onClick={() => handleOpenModal(ticket)}
                                                    className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg" title="Sửa">
                                                    <Wrench size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <RepairPaginationFooter
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalFiltered={totalFiltered}
                totalAll={ticketsTotal}
                hasMore={hasMore}
                searchTerm={searchTerm}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
                onLoadMore={onLoadMore}
            />
        </div>

    );
}
