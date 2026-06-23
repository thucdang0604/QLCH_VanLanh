import { AlertCircle, AlertTriangle, DollarSign } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import Modal from '@/components/admin/Modal';
import type { RepairStatus, RepairTicket } from '@/lib/types';

interface RepairAuxiliaryModalsProps {
    noteModal: { ticket: RepairTicket; targetStatus: RepairStatus } | null;
    deliveryNote: string;
    onDeliveryNoteChange: (value: string) => void;
    onCloseNote: () => void;
    onSubmitNote: MouseEventHandler<HTMLButtonElement>;
    posRedirectModal: { ticket: RepairTicket } | null;
    onClosePosRedirect: () => void;
    assignModal: { ticket: RepairTicket } | null;
    assignTechnicianId: string;
    onAssignTechnicianIdChange: (value: string) => void;
    staffs: { uid: string; displayName: string }[];
    onCloseAssign: () => void;
    onSubmitAssign: () => void;
    managerOverrideModal: { ticket: RepairTicket; targetStatus: string } | null;
    managerOverrideNote: string;
    onManagerOverrideNoteChange: (value: string) => void;
    onCloseManagerOverride: () => void;
    onSubmitManagerOverride: () => void;
}

export function RepairAuxiliaryModals({
    noteModal,
    deliveryNote,
    onDeliveryNoteChange,
    onCloseNote,
    onSubmitNote,
    posRedirectModal,
    onClosePosRedirect,
    assignModal,
    assignTechnicianId,
    onAssignTechnicianIdChange,
    staffs,
    onCloseAssign,
    onSubmitAssign,
    managerOverrideModal,
    managerOverrideNote,
    onManagerOverrideNoteChange,
    onCloseManagerOverride,
    onSubmitManagerOverride,
}: RepairAuxiliaryModalsProps) {
    return (
        <>
            {noteModal && (
                <Modal isOpen={true} onClose={onCloseNote} size="md">
                    <div className="p-5 pb-8 md:p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${noteModal.targetStatus === 'refund' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">
                                    {noteModal.targetStatus === 'refund' ? 'Xác nhận Hoàn phí' : 'Bàn giao máy'}
                                </h3>
                                <p className="text-sm text-gray-500">#{noteModal.ticket.id.slice(-6).toUpperCase()} — {noteModal.ticket.customer.name}</p>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                {noteModal.targetStatus === 'refund' ? 'Lý do hoàn phí *' : 'Ghi chú bàn giao *'}
                            </label>
                            <textarea
                                rows={3}
                                required
                                value={deliveryNote}
                                onChange={event => onDeliveryNoteChange(event.target.value)}
                                placeholder={noteModal.targetStatus === 'refund' ? 'Nhập lý do hoàn phí...' : 'Tình trạng máy khi trả, đã test chức năng...'}
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20"
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={onCloseNote} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Đóng</button>
                            <button onClick={onSubmitNote} className={`px-4 py-2 text-sm font-semibold text-white rounded-lg ${noteModal.targetStatus === 'refund' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}>
                                {noteModal.targetStatus === 'refund' ? 'Xác nhận hoàn phí' : 'Xác nhận trả máy'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {posRedirectModal && (
                <Modal isOpen={true} onClose={onClosePosRedirect} size="md">
                    <div className="p-6 text-center space-y-4">
                        <div className="mx-auto w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                            <DollarSign size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">Thanh Toán Tại Quầy POS</h2>
                        <p className="text-gray-600">
                            Phiếu sửa chữa <b>#{posRedirectModal.ticket.id.slice(-6).toUpperCase()}</b> đã hoàn tất sửa chữa.
                            Để giao máy cho khách và xuất hóa đơn, vui lòng chuyển qua màn hình POS để thanh toán.
                        </p>
                        <div className="pt-4 flex gap-3 justify-center">
                            <button onClick={onClosePosRedirect} className="px-5 py-2.5 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium">Đóng</button>
                            <a
                                href={`/admin/pos?phone=${encodeURIComponent(posRedirectModal.ticket.customer.phone)}&repairId=${posRedirectModal.ticket.id}`}
                                className="px-5 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-medium"
                            >
                                Tới màn hình Thu Ngân
                            </a>
                        </div>
                    </div>
                </Modal>
            )}

            {assignModal && (
                <Modal
                    isOpen={true}
                    onClose={onCloseAssign}
                    title={`Phân công KTV — #${assignModal.ticket.id.slice(-6).toUpperCase()}`}
                    size="sm"
                    mobileSheet={true}
                >
                    <div className="p-4 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Chọn Kỹ thuật viên</label>
                            <select
                                title="Chọn KTV"
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
                                value={assignTechnicianId}
                                onChange={event => onAssignTechnicianIdChange(event.target.value)}
                            >
                                <option value="">-- Chọn KTV --</option>
                                {staffs.map(tech => (
                                    <option key={tech.uid} value={tech.uid}>{tech.displayName}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2 justify-end pt-2">
                            <button onClick={onCloseAssign} className="px-4 py-2 text-sm bg-gray-100 rounded-lg">Hủy</button>
                            <button onClick={onSubmitAssign} disabled={!assignTechnicianId} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">Lưu phân công</button>
                        </div>
                    </div>
                </Modal>
            )}

            {managerOverrideModal && (
                <Modal
                    isOpen={true}
                    onClose={onCloseManagerOverride}
                    title={`Quản lý Ghi đè — #${managerOverrideModal.ticket.id.slice(-6).toUpperCase()}`}
                    size="sm"
                    mobileSheet={true}
                >
                    <div className="p-4 space-y-4">
                        <div className="bg-orange-50 border border-orange-200 text-orange-800 p-3 rounded-lg text-sm">
                            <p className="font-semibold mb-1 flex items-center gap-1"><AlertCircle size={14} /> Chuyển trạng thái bắt buộc</p>
                            <p className="text-xs">Bạn đang thực hiện ghi đè chuyển trạng thái của phiếu do KTV khác phụ trách. Vui lòng nhập lý do cụ thể.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Lý do (Ghi chú kỹ thuật) <span className="text-red-500">*</span></label>
                            <textarea
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                                rows={3}
                                value={managerOverrideNote}
                                onChange={event => onManagerOverrideNoteChange(event.target.value)}
                                placeholder="Nhập lý do chuyển trạng thái..."
                            />
                        </div>
                        <div className="flex gap-2 justify-end pt-2">
                            <button onClick={onCloseManagerOverride} className="px-4 py-2 text-sm bg-gray-100 rounded-lg">Hủy</button>
                            <button onClick={onSubmitManagerOverride} disabled={!managerOverrideNote.trim()} className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg disabled:opacity-50">Xác nhận chuyển</button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
}
