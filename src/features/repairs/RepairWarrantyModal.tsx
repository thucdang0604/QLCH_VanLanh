import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import type { RepairTicket } from '@/lib/types';
import { isWarrantyEligibleRepairPart } from '@/lib/repairStatus';

interface RepairWarrantyModalProps {
    ticket: RepairTicket | null;
    history: RepairTicket[];
    selectedIndexes: number[];
    onSelectedIndexesChange: (updater: (previous: number[]) => number[]) => void;
    creating: boolean;
    onClose: () => void;
    onCreate: (ticket: RepairTicket, selectedIndexes: number[]) => void;
}

export function RepairWarrantyModal({
    ticket,
    history,
    selectedIndexes,
    onSelectedIndexesChange,
    creating,
    onClose,
    onCreate,
}: RepairWarrantyModalProps) {
    if (!ticket) return null;

    const activeParts = (ticket.parts || [])
        .map((part, index) => ({ ...part, _origIdx: index }))
        .filter(part =>
            isWarrantyEligibleRepairPart(part) &&
            part.warrantyMonths && part.warrantyMonths > 0 &&
            part.warrantyExpiresAt && (
                typeof part.warrantyExpiresAt === 'number'
                    ? part.warrantyExpiresAt
                    : (part.warrantyExpiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0
            ) > Date.now()
        );
    const hasActiveParts = activeParts.length > 0;

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={`Kích hoạt Bảo hành — #${ticket.id.slice(-6).toUpperCase()}`}
            size="lg"
            priority="high"
        >
            <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
                {history.length > 0 && (
                    <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm font-semibold text-amber-800 mb-1 flex items-center gap-1">
                            <AlertCircle size={14} /> Chú ý: Đơn này đã từng được bảo hành {history.length} lần
                        </p>
                        <ul className="text-xs text-amber-700 list-disc list-inside space-y-1">
                            {history.map((item, index) => {
                                const rawDate = item.timing?.receivedAt || item.createdAt;
                                const dateStr = rawDate && typeof rawDate === 'object' && 'toDate' in rawDate
                                    ? (rawDate as { toDate: () => Date }).toDate().toLocaleString('vi-VN')
                                    : '—';

                                return <li key={item.id}>Lần {index + 1}: Phiếu #{item.id.slice(-6).toUpperCase()} ({dateStr})</li>;
                            })}
                        </ul>
                    </div>
                )}
                <p className="text-sm text-gray-600 font-medium">Chọn linh kiện đang bị lỗi cần bảo hành:</p>
                {!hasActiveParts ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                        Phiếu này không có linh kiện còn hạn bảo hành. Hệ thống sẽ tạo phiếu bảo hành dịch vụ/sửa chữa từ cấu hình bảo hành của dịch vụ.
                    </div>
                ) : (
                    activeParts.map(part => {
                        const expiresAt = typeof part.warrantyExpiresAt === 'number'
                            ? part.warrantyExpiresAt
                            : (part.warrantyExpiresAt as { toDate?: () => Date })?.toDate?.()?.getTime() || 0;
                        const expiresLabel = expiresAt ? new Date(expiresAt).toLocaleDateString('vi-VN') : '—';
                        const checked = selectedIndexes.includes(part._origIdx);

                        return (
                            <label
                                key={part._origIdx}
                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'bg-emerald-50 border-emerald-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onSelectedIndexesChange(previous =>
                                        checked ? previous.filter(index => index !== part._origIdx) : [...previous, part._origIdx]
                                    )}
                                    className="w-4 h-4 text-emerald-600 rounded"
                                />
                                <div className="flex-1">
                                    <p className="font-semibold text-sm text-gray-900">{part.productName}</p>
                                    <p className="text-xs text-gray-500">
                                        {part.partType || '—'} · BH {part.warrantyMonths} tháng · Hết hạn: {expiresLabel}
                                    </p>
                                </div>
                            </label>
                        );
                    })
                )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t">
                <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                <button
                    onClick={() => onCreate(ticket, selectedIndexes)}
                    disabled={creating || (hasActiveParts && selectedIndexes.length === 0)}
                    className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                    {creating ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    {hasActiveParts ? `Tạo Phiếu Bảo Hành (${selectedIndexes.length})` : 'Tạo Phiếu Bảo Hành Dịch Vụ'}
                </button>
            </div>
        </Modal>
    );
}
