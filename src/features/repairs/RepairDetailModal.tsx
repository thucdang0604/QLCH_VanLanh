/* eslint-disable @next/next/no-img-element */
import { AlertCircle, CheckCircle2, Clock, ClipboardList, Image as ImageIcon, Video, Wrench } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { PART_CATEGORY_LABEL } from '@/lib/constants';
import type { RepairTicket, WorkflowNode } from '@/lib/types';
import { getYouTubeEmbedUrl, isYouTubeUrl } from '@/lib/workflowFeatures';
import { formatRepairPrice } from './repairPageUtils';

interface RepairDetailModalProps {
    ticket: RepairTicket | null;
    dynamicStatuses: WorkflowNode[];
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

export function RepairDetailModal({ ticket, dynamicStatuses, onClose }: RepairDetailModalProps) {
    if (!ticket) return null;

    const status = dynamicStatuses.find(item => item.id === ticket.status) || {
        id: ticket.status,
        label: ticket.status,
        color: 'text-gray-700 bg-gray-50 border-gray-200',
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={`${ticket.deviceInfo?.model || 'Thiết bị'} — #${ticket.id.slice(-6).toUpperCase()}`}
            size="lg"
            priority="high"
        >
            <div className="p-5 space-y-4">
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${status.color}`}>
                    {status.label}
                </div>

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
                        <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1"><ClipboardList size={12} /> Linh kiện đã sử dụng</p>
                        <div className="space-y-1.5">
                            {ticket.parts.map((part, index) => (
                                <div key={index} className="flex justify-between text-[13px]">
                                    <span className="text-gray-700 font-medium">
                                        {part.productName || part.name || part.partName || PART_CATEGORY_LABEL} <span className="text-xs text-gray-400 font-normal">×{part.quantity || 1}</span>
                                        {part.quality && <span className="text-xs ml-1 px-1 bg-blue-100 text-blue-600 rounded font-normal">{part.quality}</span>}
                                        {part.supplierName && <span className="text-xs ml-1 px-1 bg-gray-100 text-gray-500 rounded font-normal" title="Nhà cung cấp">🏭 {part.supplierName}</span>}
                                    </span>
                                    <span className="font-semibold text-gray-800">{formatRepairPrice((Number(part.unitPriceAtUse ?? part.price ?? 0) || 0) * (part.quantity || 1))}</span>
                                </div>
                            ))}
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
                                <div key={index} className="flex items-center gap-2 text-xs">
                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                    <span className="font-medium text-gray-700">
                                        {dynamicStatuses.find(item => item.id === entry.status)?.label || entry.status}
                                    </span>
                                    <span className="text-gray-400">
                                        {new Date(entry.timestamp || Date.now()).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    {entry.durationInMinutes && (
                                        <span className="text-gray-300">({entry.durationInMinutes} phút)</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
