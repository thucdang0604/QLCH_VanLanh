import { Ban, CheckCircle2, RotateCcw } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import type { RepairTicket } from '@/lib/types';
import { formatRepairPrice } from './repairPageUtils';

export interface RepairHandoverModalState {
    ticket: RepairTicket;
    action: 'out' | 'refund';
    targetStatus?: string;
}

interface RepairHandoverModalProps {
    modal: RepairHandoverModalState | null;
    note: string;
    onNoteChange: (value: string) => void;
    paymentConfirmed: boolean;
    onPaymentConfirmedChange: (value: boolean) => void;
    additionalFees: string;
    onAdditionalFeesChange: (value: string) => void;
    laborCost: string;
    onLaborCostChange: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}

export function RepairHandoverModal({
    modal,
    note,
    onNoteChange,
    paymentConfirmed,
    onPaymentConfirmedChange,
    additionalFees,
    onAdditionalFeesChange,
    laborCost,
    onLaborCostChange,
    onClose,
    onConfirm,
}: RepairHandoverModalProps) {
    if (!modal) return null;

    const { ticket, action } = modal;
    const deposit = ticket.payment?.depositAmount || 0;
    const additionalFeeAmount = Number(additionalFees.replace(/[^0-9-]/g, '')) || 0;
    const laborCostAmount = Number(laborCost.replace(/[^0-9-]/g, '')) || 0;
    const titles: Record<RepairHandoverModalState['action'], string> = {
        out: '↩️ Trả Máy — Xác nhận Hoàn/Thu phí',
        refund: '🔴 Hoàn Phí — Xác nhận Hoàn tiền',
    };
    const colors: Record<RepairHandoverModalState['action'], string> = {
        out: 'bg-gray-500 hover:bg-gray-600',
        refund: 'bg-red-500 hover:bg-red-600',
    };
    const outRefundAmount = action === 'out' && deposit > 0 ? deposit : 0;
    const outChargeAmount = action === 'out' && (additionalFeeAmount + laborCostAmount - deposit > 0)
        ? additionalFeeAmount + laborCostAmount - deposit
        : 0;
    const isConfirmDisabled =
        (action === 'out' && outRefundAmount > 0 && !paymentConfirmed) ||
        (action === 'refund' && deposit > 0 && !paymentConfirmed) ||
        ((action === 'refund' || action === 'out') && !note.trim());

    return (
        <Modal isOpen={true} onClose={onClose} size="md" priority="high">
            <div className={`px-6 py-4 text-white sticky top-0 z-10 ${action === 'refund' ? 'bg-red-600' : 'bg-gray-600'}`}>
                <h2 className="text-lg font-bold flex items-center gap-2">
                    {action === 'refund' ? <RotateCcw size={20} /> : <Ban size={20} />}
                    {titles[action]}
                </h2>
                <p className="text-sm opacity-80 mt-0.5">
                    #{ticket.id.slice(-6).toUpperCase()} • <b>{ticket.customer.name}</b> • {ticket.deviceInfo?.model}
                </p>
            </div>
            <div className="px-6 py-5 space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-200">
                    <div className="flex justify-between text-sm items-center py-1">
                        <span className="text-gray-500">Chi phí SC:</span>
                        <input
                            type="text"
                            value={laborCost ? Number(laborCost.replace(/[^0-9-]/g, '')).toLocaleString('vi-VN') : ''}
                            onChange={event => onLaborCostChange(event.target.value)}
                            placeholder="0"
                            className="w-32 px-3 py-1 text-right border rounded-lg focus:ring-1 focus:ring-orange-500 text-gray-900 font-medium bg-white"
                        />
                    </div>
                    <div className="flex justify-between text-sm items-center py-1">
                        <span className="text-gray-500">Phụ phí (nếu có):</span>
                        <input
                            type="text"
                            value={additionalFees ? Number(additionalFees.replace(/[^0-9-]/g, '')).toLocaleString('vi-VN') : ''}
                            onChange={event => onAdditionalFeesChange(event.target.value)}
                            placeholder="0"
                            className="w-32 px-3 py-1 text-right border rounded-lg focus:ring-1 focus:ring-orange-500 text-gray-900 font-medium bg-white"
                        />
                    </div>
                    {deposit > 0 && (
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Đã đặt cọc:</span>
                            <span className="font-semibold text-yellow-600">-{formatRepairPrice(deposit)}</span>
                        </div>
                    )}
                    {action === 'out' && deposit > 0 && (
                        <div className="flex justify-between items-center text-sm border-t border-orange-200 pt-3 mt-2 font-bold bg-orange-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                            <span className="text-orange-700">🔄 TIỀN CỬA HÀNG HOÀN LẠI KHÁCH:</span>
                            <span className="text-orange-600 text-xl">{formatRepairPrice(outRefundAmount)}</span>
                        </div>
                    )}
                    {action === 'out' && outChargeAmount > 0 && (
                        <div className="flex justify-between items-center text-sm border-t border-yellow-200 pt-3 mt-2 font-bold bg-yellow-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                            <span className="text-yellow-700">⚠️ KHÁCH CẦN THANH TOÁN PHÍ PHÁT SINH:</span>
                            <span className="text-yellow-600 text-xl">{formatRepairPrice(outChargeAmount)}</span>
                        </div>
                    )}
                    {action === 'out' && deposit === 0 && additionalFeeAmount === 0 && laborCostAmount === 0 && (
                        <div className="text-sm text-gray-500 border-t pt-2 mt-2 italic flex items-center justify-center gap-2">
                            <Ban size={16} />
                            Trả lại máy, không thu/hoàn phí.
                        </div>
                    )}
                    {action === 'refund' && (
                        <div className="flex justify-between items-center text-sm border-t border-red-200 pt-3 mt-2 font-bold bg-red-50 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                            <span className="text-red-700">🔴 SỐ TIỀN CẦN HOÀN TRẢ KHÁCH:</span>
                            <span className="text-red-600 text-xl">{formatRepairPrice(deposit > 0 ? deposit : 0)}</span>
                        </div>
                    )}
                </div>
                {action === 'out' && outRefundAmount > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <div className="mt-0.5 bg-white border rounded">
                                <input type="checkbox" checked={paymentConfirmed} onChange={event => onPaymentConfirmedChange(event.target.checked)} className="w-5 h-5 text-orange-600 rounded border-gray-300 focus:ring-orange-500" />
                            </div>
                            <span className="text-sm font-semibold text-orange-800 leading-snug">
                                Tôi xác nhận đã hoàn trả <span className="text-orange-600 underline decoration-2 underline-offset-2">{formatRepairPrice(outRefundAmount)}</span> tiền cọc cho khách hàng.
                            </span>
                        </label>
                    </div>
                )}
                {action === 'refund' && deposit > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <div className="mt-0.5 bg-white border rounded">
                                <input type="checkbox" checked={paymentConfirmed} onChange={event => onPaymentConfirmedChange(event.target.checked)} className="w-5 h-5 text-red-600 rounded border-gray-300 focus:ring-red-500" />
                            </div>
                            <span className="text-sm font-semibold text-red-800 leading-snug">
                                Tôi xác nhận đã hoàn trả <span className="text-red-600 underline decoration-2 underline-offset-2">{formatRepairPrice(deposit)}</span> cho khách hàng.
                            </span>
                        </label>
                    </div>
                )}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        {action === 'refund' ? 'Lý do hoàn phí *' : 'Lý do trả máy *'}
                    </label>
                    <textarea
                        value={note}
                        onChange={event => onNoteChange(event.target.value)}
                        rows={2}
                        placeholder={action === 'refund' ? 'Máy bảo hành, không tìm được linh kiện...' : 'Không sửa được, trả máy cho khách...'}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 text-sm"
                    />
                </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t sticky bottom-0 bg-white">
                <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                <button
                    title="Xác nhận"
                    onClick={onConfirm}
                    disabled={isConfirmDisabled}
                    className={`px-5 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 ${colors[action]} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    <CheckCircle2 size={16} />
                    {action === 'refund' ? 'Xác nhận Hoàn Phí' : 'Xác nhận Trả Máy'}
                </button>
            </div>
        </Modal>
    );
}
