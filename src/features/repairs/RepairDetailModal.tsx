/* eslint-disable @next/next/no-img-element */
'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, ClipboardList, Image as ImageIcon, Truck, Video, Wrench } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { PART_CATEGORY_LABEL } from '@/lib/constants';
import type { RepairTicket, WorkflowNode } from '@/lib/types';
import { getYouTubeEmbedUrl, isYouTubeUrl } from '@/lib/workflowFeatures';
import { formatRepairPrice } from './repairPageUtils';
import { REPAIR_PART_STATUS, isRepairPartStatus } from '@/lib/repairStatus';
import { toastError, toastSuccess } from '@/lib/toast';

interface RepairDetailModalProps {
    ticket: RepairTicket | null;
    dynamicStatuses: WorkflowNode[];
    onConfirmReturnedPart: (ticket: RepairTicket, partIndex: number) => Promise<void>;
    onHandoverPart: (ticket: RepairTicket, partIndex: number) => Promise<void>;
    onRecordCustomerDecision: (ticket: RepairTicket, decision: 'approved' | 'declined', targetStatus: string, customerNote: string) => Promise<void>;
    onInboundShippingPaid: (ticketId: string, inboundShipping: NonNullable<RepairTicket['inboundShipping']>) => void;
    onEditTicket: (ticket: RepairTicket) => void;
    onClose: () => void;
}

const checklistLabels: Record<string, string> = {
    body: 'Vỏ máy',
    screen: 'Màn hình',
    touch: 'Cảm ứng',
    camera: 'Camera',
    speaker: 'Loa/Mic',
    connectivity: 'Kết nối',
    battery: 'Pin',
    biometric: 'FaceID/Vân tay',
};

function checklistClassName(value: unknown) {
    const normalized = value?.toString().toLowerCase();

    if (normalized === 'ok') {
        return 'bg-green-50 border-green-200 text-green-700';
    }

    if (normalized === 'lỗi') {
        return 'bg-red-50 border-red-200 text-red-600';
    }

    if (value && value !== 'N/A' && value !== '—') {
        return 'bg-orange-50 border-orange-200 text-orange-600';
    }

    return 'bg-gray-50 border-gray-200 text-gray-500';
}

function getTimelineTitle(entry: NonNullable<RepairTicket['statusTimeline']>[number], statuses: WorkflowNode[]): string {
    const partName = entry.partName || 'linh kiện';

    switch (entry.eventType) {
        case 'part_selected':
            return `KTV đã chọn ${partName} cho phiếu sửa chữa`;
        case 'part_requested':
            return `KTV đã yêu cầu ${partName}`;
        case 'part_handed_over_to_technician':
            return `Tiếp nhận đã bàn giao ${partName} cho KTV`;
        case 'part_received_by_technician':
            return `KTV đã nhận ${partName}`;
        case 'part_handover_declined':
            return `KTV báo chưa nhận ${partName}`;
        case 'part_selection_cancelled':
            return `Đã bỏ chọn ${partName}`;
        case 'part_request_rejected':
            return `Đã hủy yêu cầu ${partName}`;
        case 'part_return_received':
            return `Tiếp nhận đã nhận lại ${partName}`;
        case 'warranty_created':
            return entry.note || `Tạo phiếu bảo hành #${String((entry as { warrantyTicketId?: string }).warrantyTicketId || '').slice(-6).toUpperCase()}`;
        case 'inbound_device_received':
            return 'Đã xác nhận máy gửi đến shop';
        default:
            return statuses.find(item => item.id === entry.status)?.label || entry.status;
    }
}

export function RepairDetailModal({ ticket, dynamicStatuses, onConfirmReturnedPart, onHandoverPart, onRecordCustomerDecision, onInboundShippingPaid, onEditTicket, onClose }: RepairDetailModalProps) {
    const [confirmingPartLineId, setConfirmingPartLineId] = useState<string | null>(null);
    const [customerNote, setCustomerNote] = useState('');
    const [savingCustomerDecision, setSavingCustomerDecision] = useState<string | null>(null);
    const [isConfirmingCustomerResponse, setIsConfirmingCustomerResponse] = useState(false);
    const [isInboundShippingOpen, setIsInboundShippingOpen] = useState(false);
    const [inboundShippingAmount, setInboundShippingAmount] = useState('');
    const [inboundShippingSettlement, setInboundShippingSettlement] = useState<'customer_paid' | 'shop_paid'>('shop_paid');
    const [inboundShippingMethod, setInboundShippingMethod] = useState<'CASH' | 'BANK'>('CASH');
    const [carrierName, setCarrierName] = useState('');
    const [trackingNumber, setTrackingNumber] = useState('');
    const [inboundShippingNote, setInboundShippingNote] = useState('');
    const [isSavingInboundShipping, setIsSavingInboundShipping] = useState(false);
    const inboundShippingOperationKeyRef = useRef('');
    useEffect(() => {
        setCustomerNote('');
        setSavingCustomerDecision(null);
        setIsConfirmingCustomerResponse(false);
        setIsInboundShippingOpen(false);
        setInboundShippingAmount('');
        setInboundShippingSettlement('shop_paid');
        setInboundShippingMethod('CASH');
        setCarrierName('');
        setTrackingNumber('');
        setInboundShippingNote('');
        inboundShippingOperationKeyRef.current = '';
    }, [ticket?.id]);
    if (!ticket) return null;

    const status: WorkflowNode = dynamicStatuses.find(item => item.id === ticket.status) || {
        id: ticket.status,
        label: ticket.status,
        color: 'text-gray-700 bg-gray-50 border-gray-200',
        allowedNext: [],
    };
    const customerDecision = ticket.customerApproval?.decision
        || (ticket.customerApproval?.approvedAt ? 'approved' : undefined);
    const customerDecisionAt = ticket.customerApproval?.respondedAt || ticket.customerApproval?.approvedAt;
    const canConfirmCustomerResponse = status.allowedFeatures?.includes('confirmCustomerResponse') === true;
    const customerDecisionActions = canConfirmCustomerResponse ? [
        ...(status.allowedFeatures?.includes('recordCustomerApproval')
            ? [{ decision: 'approved' as const, targetStatus: ticket.status }]
            : []),
        ...(status.allowedFeatures?.includes('recordCustomerDecline')
            ? [{ decision: 'declined' as const, targetStatus: ticket.status }]
            : []),
        ...(status.allowedFeatures?.includes('recordCustomerApproval') || status.allowedFeatures?.includes('recordCustomerDecline')
            ? []
            : (status.allowedNext || [])
                .map(statusId => dynamicStatuses.find(item => item.id === statusId))
                .filter((item): item is WorkflowNode => Boolean(item))
                .flatMap(item => [
                    ...(item.allowedFeatures?.includes('recordCustomerApproval') ? [{ decision: 'approved' as const, targetStatus: item.id }] : []),
                    ...(item.allowedFeatures?.includes('recordCustomerDecline') ? [{ decision: 'declined' as const, targetStatus: item.id }] : []),
                ])),
    ] : [];
    const isIncomingDevice = ticket.appointmentIntakeMethod === 'send_to_store'
        && status.allowedFeatures?.includes('requireInboundArrival') === true;
    const inboundShipping = ticket.inboundShipping;
    const inboundShippingSettled = inboundShipping?.status === 'received';
    const inboundIntakeCompleted = Boolean(inboundShipping?.intakeCompletedAt);
    const submitInboundShipping = async () => {
        const amount = Math.round(Number(inboundShippingAmount.replace(/[^0-9]/g, '')) || 0);
        if (inboundShippingSettlement === 'shop_paid' && amount <= 0) {
            toastError('Vui lòng nhập phí ship lớn hơn 0.');
            return;
        }
        setIsSavingInboundShipping(true);
        const idempotencyKey = inboundShippingOperationKeyRef.current || crypto.randomUUID();
        inboundShippingOperationKeyRef.current = idempotencyKey;
        try {
            const { getAuthInstance } = await import('@/lib/firebase');
            const token = await (await getAuthInstance()).currentUser?.getIdToken();
            const response = await fetch('/api/repairs/inbound-shipping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    repairTicketId: ticket.id,
                    amount,
                    settlementType: inboundShippingSettlement,
                    ...(inboundShippingSettlement === 'shop_paid' ? { paymentMethod: inboundShippingMethod } : {}),
                    carrierName,
                    trackingNumber,
                    note: inboundShippingNote,
                    idempotencyKey,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Không thể ghi nhận phí ship nhận máy.');
            onInboundShippingPaid(ticket.id, {
                status: 'received',
                settlementType: data.inboundShipping?.settlementType || inboundShippingSettlement,
                paidAmount: Number(data.inboundShipping?.paidAmount) || 0,
                customerPaidAmount: Number(data.inboundShipping?.customerPaidAmount) || 0,
                lastExpenseId: data.expenseId || undefined,
                lastPaymentMethod: data.inboundShipping?.lastPaymentMethod || (inboundShippingSettlement === 'customer_paid' ? 'CUSTOMER' : inboundShippingMethod),
            });
            setIsInboundShippingOpen(false);
            inboundShippingOperationKeyRef.current = '';
            toastSuccess(inboundShippingSettlement === 'customer_paid'
                ? 'Đã xác nhận khách thanh toán phí ship; máy đã đến shop. Hãy cập nhật thông tin tiếp nhận.'
                : inboundShippingMethod === 'CASH'
                    ? 'Đã chi tiền mặt nhận máy. Hãy cập nhật thông tin tiếp nhận.'
                    : 'Đã chi chuyển khoản công ty nhận máy. Hãy cập nhật thông tin tiếp nhận.');
        } catch (error) {
            toastError(error instanceof Error ? error.message : 'Không thể ghi nhận phí ship nhận máy.');
        } finally {
            setIsSavingInboundShipping(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={`${ticket.deviceInfo?.model || 'Thiết bị'} — #${ticket.id.slice(-6).toUpperCase()}`}
            size="lg"
            priority="high"
        >
            <div className="space-y-3 p-3 sm:p-4">
                <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${status.color}`}>
                    {status.label}
                </div>

                {isIncomingDevice && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <p className="flex items-center gap-1 text-xs font-bold text-sky-900"><Truck size={14} /> Khách gửi máy đến shop</p>
                                <p className="mt-0.5 text-[11px] leading-4 text-sky-800">
                                    {inboundIntakeCompleted
                                        ? 'Đã xác nhận máy đến và hoàn tất thông tin tiếp nhận.'
                                        : inboundShippingSettled
                                            ? inboundShipping?.settlementType === 'customer_paid'
                                                ? 'Khách đã thanh toán phí ship. Hãy cập nhật thông tin tiếp nhận.'
                                                : `Đã chi ship nhận máy ${formatRepairPrice(inboundShipping?.paidAmount || 0)}. Hãy cập nhật thông tin tiếp nhận.`
                                            : 'Xác nhận thanh toán phí ship trước để nhận máy từ người giao hàng.'}
                                </p>
                            </div>
                            {inboundIntakeCompleted ? (
                                <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 size={15} /> Đã tiếp nhận</span>
                            ) : inboundShippingSettled ? (
                                <button type="button" onClick={() => onEditTicket(ticket)} className="rounded-md border border-sky-300 bg-white px-2 py-1.5 text-[11px] font-bold text-sky-800 hover:bg-sky-100">
                                    Cập nhật thông tin tiếp nhận
                                </button>
                            ) : (
                                <button type="button" onClick={() => setIsInboundShippingOpen(true)} className="rounded-md bg-sky-600 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-sky-700">
                                    Thanh toán ship nhận máy
                                </button>
                            )}
                        </div>
                        {isInboundShippingOpen && (
                            <div className="mt-2 grid gap-2 border-t border-sky-200 pt-2">
                                <div className="grid grid-cols-2 gap-1.5">
                                    {(['customer_paid', 'shop_paid'] as const).map(settlement => (
                                        <button key={settlement} type="button" aria-pressed={inboundShippingSettlement === settlement} onClick={() => setInboundShippingSettlement(settlement)} className={`rounded-md px-2 py-1.5 text-xs font-bold ${inboundShippingSettlement === settlement ? 'bg-sky-600 text-white' : 'border border-sky-200 bg-white text-sky-700'}`}>
                                            {settlement === 'customer_paid' ? 'Khách đã thanh toán' : 'Shop chi nhận máy'}
                                        </button>
                                    ))}
                                </div>
                                {inboundShippingSettlement === 'shop_paid' && (
                                    <div className="grid grid-cols-2 gap-1.5">
                                        <label className="block">
                                            <span className="sr-only">Phí ship</span>
                                            <input value={inboundShippingAmount} inputMode="numeric" onChange={event => setInboundShippingAmount(event.target.value)} placeholder="Phí ship *" className="w-full rounded-md border border-sky-200 bg-white px-2 py-1.5 text-right text-sm font-bold outline-none focus:border-sky-500" />
                                        </label>
                                        <div className="grid grid-cols-2 gap-1">
                                            {(['CASH', 'BANK'] as const).map(method => (
                                                <button key={method} type="button" aria-pressed={inboundShippingMethod === method} onClick={() => setInboundShippingMethod(method)} className={`rounded-md px-1.5 py-1.5 text-[11px] font-bold ${inboundShippingMethod === method ? 'bg-sky-600 text-white' : 'border border-sky-200 bg-white text-sky-700'}`}>
                                                    {method === 'CASH' ? 'TM POS' : 'CK công ty'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <details className="rounded-md border border-sky-100 bg-white px-2 py-1 text-xs text-sky-800">
                                    <summary className="cursor-pointer font-medium">Thông tin vận chuyển (tùy chọn)</summary>
                                    <div className="mt-2 grid gap-1.5">
                                        <input value={carrierName} onChange={event => setCarrierName(event.target.value)} placeholder="Hãng vận chuyển" className="rounded-md border border-sky-200 px-2 py-1.5 text-sm outline-none focus:border-sky-500" />
                                        <input value={trackingNumber} onChange={event => setTrackingNumber(event.target.value)} placeholder="Mã vận đơn" className="rounded-md border border-sky-200 px-2 py-1.5 text-sm outline-none focus:border-sky-500" />
                                        <input value={inboundShippingNote} onChange={event => setInboundShippingNote(event.target.value)} placeholder="Ghi chú" className="rounded-md border border-sky-200 px-2 py-1.5 text-sm outline-none focus:border-sky-500" />
                                    </div>
                                </details>
                                <button type="button" disabled={isSavingInboundShipping} onClick={() => void submitInboundShipping()} className="rounded-md bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50">
                                    {isSavingInboundShipping ? 'Đang ghi nhận…' : inboundShippingSettlement === 'customer_paid' ? 'Xác nhận khách đã thanh toán' : inboundShippingMethod === 'CASH' ? 'Xác nhận chi tiền mặt' : 'Xác nhận chi chuyển khoản công ty'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {customerDecision ? (
                    <div className={`rounded-xl border p-3 ${customerDecision === 'approved' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
                        <p className={`text-sm font-bold ${customerDecision === 'approved' ? 'text-emerald-800' : 'text-red-800'}`}>
                            {customerDecision === 'approved' ? 'Khách đã đồng ý sửa' : 'Khách không đồng ý sửa'}
                        </p>
                        <p className="mt-1 text-xs text-gray-600">
                            Tiếp nhận: {ticket.customerApproval?.respondedByName || ticket.customerApproval?.approvedByName || ticket.customerApproval?.respondedBy || ticket.customerApproval?.approvedBy || '—'}
                            {customerDecisionAt ? ` · ${new Date((customerDecisionAt as { toDate?: () => Date })?.toDate?.() || customerDecisionAt as string | number | Date).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}
                        </p>
                        {ticket.customerApproval?.note && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{ticket.customerApproval.note}</p>}
                    </div>
                ) : customerDecisionActions.length > 0 ? (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                        <p className="text-sm font-bold text-indigo-900">Chờ Tiếp nhận báo khách</p>
                        <p className="mt-1 text-xs text-indigo-800">KTV đã hoàn tất kiểm tra. Tiếp nhận xem kết quả và báo giá trước khi chốt phản hồi của khách.</p>
                        {!isConfirmingCustomerResponse ? (
                            <button
                                type="button"
                                onClick={() => setIsConfirmingCustomerResponse(true)}
                                className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
                            >
                                Xác nhận từ khách hàng
                            </button>
                        ) : (
                            <>
                                <textarea
                                    value={customerNote}
                                    onChange={(event) => setCustomerNote(event.target.value)}
                                    rows={2}
                                    placeholder="Nội dung đã trao đổi với khách (không bắt buộc)"
                                    className="mt-3 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
                                />
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {customerDecisionActions.map(action => {
                                        const isApproved = action.decision === 'approved';
                                        return (
                                            <button
                                                key={`${action.decision}-${action.targetStatus}`}
                                                type="button"
                                                disabled={savingCustomerDecision !== null}
                                                onClick={async () => {
                                                    setSavingCustomerDecision(action.decision);
                                                    try {
                                                        await onRecordCustomerDecision(ticket, action.decision, action.targetStatus, customerNote);
                                                    } finally {
                                                        setSavingCustomerDecision(null);
                                                    }
                                                }}
                                                className={`rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50 ${isApproved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                                            >
                                                {savingCustomerDecision === action.decision ? 'Đang lưu…' : isApproved ? 'Khách đồng ý sửa' : 'Khách không đồng ý'}
                                            </button>
                                        );
                                    })}
                                    <button type="button" onClick={() => setIsConfirmingCustomerResponse(false)} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100">Huỷ</button>
                                </div>
                            </>
                        )}
                    </div>
                ) : null}

                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    {ticket.issues && ticket.issues.length > 0 ? (
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><AlertCircle size={12} /> Danh sách lỗi</p>
                            <div className="space-y-1">
                                {ticket.issues.map((issue, index) => (
                                    <div key={issue.id || index} className="flex justify-between text-sm">
                                        <span className="text-gray-800">{index + 1}. {issue.label}</span>
                                        {issue.estimatedPrice > 0 && <span className="text-gray-500 text-xs">~{issue.estimatedPrice.toLocaleString('vi-VN')}đ</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : ticket.issue?.description && (
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1"><AlertCircle size={12} /> Lỗi / Yêu cầu</p>
                            <p className="text-sm text-gray-800">{ticket.issue.description}</p>
                        </div>
                    )}
                    {ticket.issue?.notes && (
                        <div className="pt-2 border-t border-gray-200">
                            <p className="text-xs font-semibold text-orange-600 mb-1 flex items-center gap-1"><Wrench size={12} /> Ghi chú kỹ thuật</p>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{ticket.issue.notes}</p>
                        </div>
                    )}
                </div>

                {ticket.parts && ticket.parts.length > 0 && (
                    <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                        <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1"><ClipboardList size={12} /> Linh kiện trên phiếu</p>
                        <div className="space-y-1.5">
                            {ticket.parts.map((part, index) => {
                                const isReturnPending = Boolean(part.returnedToReceptionPendingAt) && !part.returnedToReceptionReceivedAt;
                                const isConsumed = Boolean(part.inventoryDeductedAt);
                                const isHandoverPending = Boolean(part.receptionHandedOverAt) && !part.technicianReceivedAt;
                                const canHandover = isRepairPartStatus(part.status, REPAIR_PART_STATUS.SELECTED)
                                    && !part.receptionHandedOverAt
                                    && !part.technicianReceivedAt
                                    && !isConsumed;
                                const lineId = part.partLineId || String(index);
                                return (
                                <div key={lineId} className="flex items-center justify-between gap-3 text-[13px]">
                                    <span className="text-gray-700 font-medium">
                                        {part.productName || part.name || part.partName || PART_CATEGORY_LABEL} <span className="text-xs text-gray-400 font-normal">×{part.quantity || 1}</span>
                                        {part.quality && <span className="text-xs ml-1 px-1 bg-blue-100 text-blue-600 rounded font-normal">{part.quality}</span>}
                                        {part.supplierName && <span className="text-xs ml-1 px-1 bg-gray-100 text-gray-500 rounded font-normal" title="Nhà cung cấp">🏭 {part.supplierName}</span>}
                                        {part.issueId && <span className="text-xs ml-1 px-1 bg-sky-100 text-sky-700 rounded font-normal">Lỗi: {ticket.issues?.find(issue => issue.id === part.issueId)?.label || 'Đã gắn'}</span>}
                                        <span className={`ml-1 text-xs font-normal ${isReturnPending ? 'text-amber-700' : isConsumed ? 'text-emerald-700' : isHandoverPending ? 'text-blue-700' : 'text-gray-500'}`}>
                                            {isReturnPending ? '· KTV đã hoàn, chờ Tiếp nhận nhận lại' : isConsumed ? '· Đã sử dụng' : part.technicianReceivedAt ? '· KTV đã nhận' : isHandoverPending ? '· Đã bàn giao, chờ KTV nhận' : part.technicianReceiptRejectedAt ? '· KTV báo chưa nhận' : ''}
                                        </span>
                                    </span>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="font-semibold text-gray-800">{formatRepairPrice((Number(part.unitPriceAtUse ?? part.price ?? 0) || 0) * (part.quantity || 1))}</span>
                                        {isReturnPending && (
                                            <button
                                                type="button"
                                                disabled={confirmingPartLineId === lineId}
                                                onClick={async () => {
                                                    setConfirmingPartLineId(lineId);
                                                    try {
                                                        await onConfirmReturnedPart(ticket, index);
                                                    } finally {
                                                        setConfirmingPartLineId(null);
                                                    }
                                                }}
                                                className="rounded-md border border-amber-300 bg-white px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                                            >
                                                {confirmingPartLineId === lineId ? 'Đang nhận…' : 'TN đã nhận lại'}
                                            </button>
                                        )}
                                        {canHandover && (
                                            <button type="button" onClick={async () => {
                                                setConfirmingPartLineId(lineId);
                                                try { await onHandoverPart(ticket, index); } finally { setConfirmingPartLineId(null); }
                                            }} disabled={confirmingPartLineId === lineId} className="rounded-md border border-blue-300 bg-white px-2 py-1 text-[10px] font-bold text-blue-800 hover:bg-blue-50 disabled:opacity-50">
                                                {confirmingPartLineId === lineId ? 'Đang bàn giao…' : 'Bàn giao LK'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {ticket.deviceInfo?.checklist && (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><CheckCircle2 size={12} /> Checklist kiểm tra</p>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(ticket.deviceInfo.checklist)
                                .filter(([key]) => !['hasPriorRepair', 'hasWaterDamage', 'hasNonGenuineParts', 'historyOtherNote'].includes(key))
                                .map(([key, value]) => (
                                    <div key={key} className={`text-[11px] rounded-lg px-2.5 py-2 border font-medium flex items-center justify-between ${checklistClassName(value)}`}>
                                        <span className="opacity-70">{checklistLabels[key] || key}:</span>
                                        <span>{value as string || '—'}</span>
                                    </div>
                                ))}
                        </div>

                        <div className="mt-3">
                            <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><AlertCircle size={12} /> Lịch sử máy</p>
                            <div className="flex flex-wrap gap-2 text-[11px]">
                                <span className={`px-2 py-1 rounded-md border ${ticket.deviceInfo.checklist.hasPriorRepair ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                    {ticket.deviceInfo.checklist.hasPriorRepair ? '☑' : '☐'} Đã từng sửa
                                </span>
                                <span className={`px-2 py-1 rounded-md border ${ticket.deviceInfo.checklist.hasWaterDamage ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                    {ticket.deviceInfo.checklist.hasWaterDamage ? '☑' : '☐'} Từng vào nước
                                </span>
                                <span className={`px-2 py-1 rounded-md border ${ticket.deviceInfo.checklist.hasNonGenuineParts ? 'bg-orange-50 border-orange-200 text-orange-700 font-medium' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
                                    {ticket.deviceInfo.checklist.hasNonGenuineParts ? '☑' : '☐'} Kém/Lô
                                </span>
                            </div>
                            {ticket.deviceInfo.checklist.historyOtherNote && (
                                <div className="mt-2 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-[11px] text-orange-800">
                                    <span className="font-semibold">Khác: </span>{ticket.deviceInfo.checklist.historyOtherNote}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {(ticket.preRepairMedia?.length || 0) > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><ImageIcon size={12} /> Ảnh/Video nhận máy</p>
                        <div className="grid grid-cols-3 gap-2">
                            {ticket.preRepairMedia.map((url, index) => (
                                <div key={index} className="aspect-square rounded-lg overflow-hidden bg-gray-100 border">
                                    {url.includes('.mp4') || url.includes('video') ? (
                                        <video src={url} controls className="w-full h-full object-cover" />
                                    ) : (
                                        <img src={url} alt={`Pre-repair ${index + 1}`} className="w-full h-full object-cover" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {(ticket.postRepairMedia?.length || 0) > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Video size={12} /> Video / Media bàn giao</p>
                        <div className="grid grid-cols-2 gap-2">
                            {ticket.postRepairMedia.map((url, index) => (
                                <div key={index} className="rounded-lg overflow-hidden bg-gray-100 border">
                                    {isYouTubeUrl(url) ? (
                                        <div className="aspect-video">
                                            <iframe
                                                src={getYouTubeEmbedUrl(url) || ''}
                                                title={`YouTube ${index + 1}`}
                                                className="w-full h-full"
                                                frameBorder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                allowFullScreen
                                            />
                                        </div>
                                    ) : url.includes('.mp4') || url.includes('video') ? (
                                        <video src={url} controls className="w-full" />
                                    ) : (
                                        <img src={url} alt={`Post-repair ${index + 1}`} className="w-full object-cover" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {(ticket.statusTimeline?.length || 0) > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1"><Clock size={12} /> Lịch sử trạng thái</p>
                        <div className="space-y-1">
                            {ticket.statusTimeline.map((entry, index) => (
                                <div key={index} className="flex items-start gap-2 text-xs">
                                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400" />
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium text-gray-700">
                                                {getTimelineTitle(entry, dynamicStatuses)}
                                            </span>
                                            <span className="text-gray-400">
                                                {new Date(entry.timestamp || Date.now()).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {entry.durationInMinutes && (
                                                <span className="text-gray-300">({entry.durationInMinutes} phút)</span>
                                            )}
                                        </div>
                                        {entry.eventType === 'warranty_created' && Array.isArray((entry as { claimedPartsSnapshot?: { productName?: string }[] }).claimedPartsSnapshot) && (
                                            <div className="mt-0.5 text-[11px] text-gray-500">
                                                {((entry as { claimedPartsSnapshot: { productName?: string }[] }).claimedPartsSnapshot)
                                                    .map(part => part.productName)
                                                    .filter(Boolean)
                                                    .join(', ')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
