import type { Dispatch, SetStateAction } from 'react';
import { AlertCircle, ArrowRightLeft, Loader2 } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import type { RepairTicket, WorkflowNode } from '@/lib/types';
import { isSelectedRepairPart } from '@/lib/repairStatus';

export type TechnicianStatusModal = { ticketId: string; newStatus: string };
export type TechnicianNoteModal = { ticketId: string; newStatus: string; currentNote: string };
export type TechnicianPartsVerificationModal = { ticketId: string; newStatus: string };
export type TechnicianTransferModal = { ticket: RepairTicket };
export type TechnicianPartVerificationSelection = 'use' | 'return';

interface TechnicianWorkflowModalsProps {
    tickets: RepairTicket[];
    dynamicStatuses: WorkflowNode[];
    warrantyStatuses: WorkflowNode[];
    technicians: { uid: string; displayName: string }[];
    transferModal: TechnicianTransferModal | null;
    transferTechnicianId: string;
    transferReason: string;
    isTransferSubmitting: boolean;
    onTransferTechnicianIdChange: (value: string) => void;
    onTransferReasonChange: (value: string) => void;
    onCloseTransfer: () => void;
    onSubmitTransfer: () => void;
    statusConfirmModal: TechnicianStatusModal | null;
    isStatusChanging: boolean;
    onCloseStatusConfirm: () => void;
    onConfirmStatusChange: (ticketId: string, newStatus: string) => Promise<void>;
    partsVerificationModalPayload: TechnicianPartsVerificationModal | null;
    partsVerificationSelections: Record<string, TechnicianPartVerificationSelection>;
    setPartsVerificationSelections: Dispatch<SetStateAction<Record<string, TechnicianPartVerificationSelection>>>;
    isPartsVerifying: boolean;
    onClosePartsVerification: () => void;
    onSubmitPartsVerification: () => void;
    noteModalPayload: TechnicianNoteModal | null;
    techNoteText: string;
    onTechNoteTextChange: (value: string) => void;
    onCloseNote: () => void;
    onSubmitNote: () => void;
}

function getWorkflowForTicket(ticket: RepairTicket, dynamicStatuses: WorkflowNode[], warrantyStatuses: WorkflowNode[]) {
    return ticket.ticketType === 'warranty' ? warrantyStatuses : dynamicStatuses;
}

export function TechnicianWorkflowModals({
    tickets,
    dynamicStatuses,
    warrantyStatuses,
    technicians,
    transferModal,
    transferTechnicianId,
    transferReason,
    isTransferSubmitting,
    onTransferTechnicianIdChange,
    onTransferReasonChange,
    onCloseTransfer,
    onSubmitTransfer,
    statusConfirmModal,
    isStatusChanging,
    onCloseStatusConfirm,
    onConfirmStatusChange,
    partsVerificationModalPayload,
    partsVerificationSelections,
    setPartsVerificationSelections,
    isPartsVerifying,
    onClosePartsVerification,
    onSubmitPartsVerification,
    noteModalPayload,
    techNoteText,
    onTechNoteTextChange,
    onCloseNote,
    onSubmitNote,
}: TechnicianWorkflowModalsProps) {
    const statusTicket = statusConfirmModal ? tickets.find(ticket => ticket.id === statusConfirmModal.ticketId) : null;
    const partsTicket = partsVerificationModalPayload ? tickets.find(ticket => ticket.id === partsVerificationModalPayload.ticketId) : null;
    const noteTicket = noteModalPayload ? tickets.find(ticket => ticket.id === noteModalPayload.ticketId) : null;

    return (
        <>
            {transferModal && (
                <Modal
                    isOpen={true}
                    onClose={onCloseTransfer}
                    title={`Chuyển KTV — #${transferModal.ticket.id.slice(-6).toUpperCase()}`}
                    size="sm"
                    mobileSheet={true}
                >
                    <div className="p-4 space-y-4">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            KTV hiện tại vẫn chịu trách nhiệm cho đến khi KTV mới bấm chấp nhận.
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">KTV nhận mới</label>
                            <select
                                title="Chọn KTV nhận mới"
                                value={transferTechnicianId}
                                onChange={event => onTransferTechnicianIdChange(event.target.value)}
                                className="w-full min-h-11 px-3 py-2 border rounded-lg bg-white"
                            >
                                <option value="">-- Chọn KTV --</option>
                                {technicians.filter(technician => technician.uid !== transferModal.ticket.staff?.assignedTechnician).map(technician => (
                                    <option key={technician.uid} value={technician.uid}>{technician.displayName}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Lý do chuyển <span className="text-red-500">*</span></label>
                            <textarea
                                value={transferReason}
                                onChange={event => onTransferReasonChange(event.target.value)}
                                rows={4}
                                placeholder="Mô tả rõ nguyên nhân chuyển để lưu nhật ký chống gian lận"
                                className="w-full min-h-28 px-3 py-2 border rounded-lg"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={onCloseTransfer} className="min-h-11 rounded-lg bg-gray-100 text-sm font-medium">Hủy</button>
                            <button
                                onClick={onSubmitTransfer}
                                disabled={isTransferSubmitting || !transferTechnicianId || !transferReason.trim()}
                                className="min-h-11 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isTransferSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowRightLeft size={16} />}
                                Gửi yêu cầu
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {statusConfirmModal && statusTicket && (() => {
                const workflow = getWorkflowForTicket(statusTicket, dynamicStatuses, warrantyStatuses);
                const currentLabel = workflow.find(status => status.id === statusTicket.status)?.label || statusTicket.status;
                const nextLabel = workflow.find(status => status.id === statusConfirmModal.newStatus)?.label || statusConfirmModal.newStatus;

                return (
                    <Modal isOpen={true} onClose={onCloseStatusConfirm} title="Xác nhận chuyển trạng thái" size="md">
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-500">
                                Phiếu #{statusTicket.id.slice(-6).toUpperCase()} • {statusTicket.customer?.name || '—'}
                            </p>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Từ:</span>
                                    <span className="font-semibold text-gray-900">{currentLabel}</span>
                                </div>
                                <div className="flex justify-between mt-1">
                                    <span className="text-gray-600">Sang:</span>
                                    <span className="font-semibold text-orange-600">{nextLabel}</span>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={onCloseStatusConfirm} disabled={isStatusChanging} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
                                    Huỷ
                                </button>
                                <button
                                    onClick={() => onConfirmStatusChange(statusConfirmModal.ticketId, statusConfirmModal.newStatus)}
                                    disabled={isStatusChanging}
                                    className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                                >
                                    Xác nhận
                                </button>
                            </div>
                        </div>
                    </Modal>
                );
            })()}

            {partsVerificationModalPayload && partsTicket && (() => {
                const selectedParts = (partsTicket.parts || []).filter(part => isSelectedRepairPart(part));

                return (
                    <Modal isOpen={true} onClose={onClosePartsVerification} title="Xác nhận sử dụng linh kiện">
                        <div className="p-6">
                            <div className="flex gap-3 text-amber-800 bg-amber-50 p-4 rounded-xl border border-amber-200 mb-6">
                                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                <div className="text-sm">
                                    <p className="font-semibold mb-1">Phiếu đã hoàn tất sửa chữa!</p>
                                    <p>Vui lòng xác nhận các linh kiện đã thêm vào phiếu. Linh kiện <b>Hoàn kho (Test)</b> được trả kho; linh kiện <b>Đã dùng</b> được trừ kho ngay khi chuyển sang Chờ bàn giao.</p>
                                </div>
                            </div>
                            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                                {selectedParts.map(part => (
                                    <div key={part.partLineId} className="border rounded-lg p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <p className="font-medium text-gray-900">{part.productName}</p>
                                            <p className="text-sm text-gray-500 mt-1">SL: {part.quantity} • {part.quality || 'N/A'}</p>
                                        </div>
                                        <div className="flex bg-gray-100 p-1 rounded-lg shrink-0">
                                            <button
                                                onClick={() => setPartsVerificationSelections(prev => ({ ...prev, [part.partLineId!]: 'use' }))}
                                                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${partsVerificationSelections[part.partLineId!] === 'use' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                Đã dùng
                                            </button>
                                            <button
                                                onClick={() => setPartsVerificationSelections(prev => ({ ...prev, [part.partLineId!]: 'return' }))}
                                                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${partsVerificationSelections[part.partLineId!] === 'return' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                Hoàn kho (Test)
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-8 flex justify-end gap-3">
                                <button onClick={onClosePartsVerification} disabled={isPartsVerifying} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50">
                                    Huỷ
                                </button>
                                <button
                                    onClick={onSubmitPartsVerification}
                                    disabled={isPartsVerifying}
                                    className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isPartsVerifying ? <Loader2 size={16} className="animate-spin" /> : 'Xác nhận & Chuyển bước'}
                                </button>
                            </div>
                        </div>
                    </Modal>
                );
            })()}

            {noteModalPayload && (
                <Modal isOpen={true} onClose={onCloseNote} title="Cập nhật Ghi chú kỹ thuật" size="md">
                    <div className="p-6 space-y-4">
                        <p className="text-sm text-gray-500">
                            Chuyển sang: {noteTicket
                                ? getWorkflowForTicket(noteTicket, dynamicStatuses, warrantyStatuses).find(status => status.id === noteModalPayload.newStatus)?.label || noteModalPayload.newStatus
                                : noteModalPayload.newStatus}
                        </p>
                        {noteModalPayload.currentNote && (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                                <p className="mb-1 font-semibold text-gray-800">Ghi chú hiện tại</p>
                                <p className="whitespace-pre-wrap">{noteModalPayload.currentNote}</p>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Ghi chú / Lý do ghi đè (Bắt buộc nếu bạn là Quản lý)
                            </label>
                            <textarea
                                rows={4}
                                value={techNoteText}
                                onChange={event => onTechNoteTextChange(event.target.value)}
                                placeholder="Nhập ghi chú kỹ thuật hoặc lý do ghi đè trước khi chuyển trạng thái..."
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20"
                            />
                            <p className="text-xs text-gray-400 mt-1">Lý do này sẽ được lưu cùng với phiếu sửa chữa và admin có thể xem trong lịch sử trạng thái.</p>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button onClick={onCloseNote} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                                Đóng
                            </button>
                            <button onClick={onSubmitNote} className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 transition-colors">
                                Xác nhận chuyển đổi
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
