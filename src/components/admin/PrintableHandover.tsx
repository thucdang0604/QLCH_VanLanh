'use client';

import type { RepairTicket } from '@/lib/types';
import type { ReceiptConfig } from './PrintableReceipt';
import { REPAIR_STATUS } from '@/lib/repairStatus';

const formatPrice = (value: number) => `${Math.max(0, value || 0).toLocaleString('vi-VN')}đ`;

function resolveDate(value: unknown): Date {
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        const date = value.toDate();
        if (!Number.isNaN(date.getTime())) return date;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date;
    }
    return new Date();
}

const defaultConfig: ReceiptConfig = {
    logoUrl: '',
    shopName: 'Văn Lành Service',
    shopTitle: 'Trung Tâm Sửa Chữa & Bảo Hành Thiết Bị Di Động',
    address: '117 Nguyên Hồng, Bình Lợi Trung (P11 cũ), Bình Thạnh, HCM',
    hotline: '0975 24 20 26 - 0981 24 20 26',
    receiptTitle: 'PHIẾU BÀN GIAO MÁY',
    notes: [],
    footerText: 'Quý khách vui lòng kiểm tra máy và ký xác nhận trước khi rời cửa hàng.',
    complaintHotline: '0932.24.20.26',
};

interface PrintableHandoverProps {
    ticket: RepairTicket;
    receiptConfig?: ReceiptConfig;
}

export default function PrintableHandover({ ticket, receiptConfig }: PrintableHandoverProps) {
    const cfg = { ...defaultConfig, ...receiptConfig };
    const action = ticket.handoverRecord?.action || (ticket.status === REPAIR_STATUS.REFUND ? 'refund' : 'handover');
    const title = action === 'refund' ? 'PHIẾU HOÀN PHÍ / TRẢ MÁY' : 'PHIẾU BÀN GIAO MÁY';
    const confirmedAt = resolveDate(ticket.handoverRecord?.confirmedAt || ticket.updatedAt || ticket.createdAt);
    const payment = ticket.payment || {};
    const total = Math.max(0, Number(payment.amount) || 0);
    const deposit = Math.max(0, Number(payment.depositAmount) || 0);
    const additionalFees = Math.max(0, Number(payment.additionalFees) || 0);
    const amountDue = action === 'refund'
        ? 0
        : Math.max(total - deposit, 0);
    const refundAmount = action === 'refund'
        ? deposit || total
        : Math.max(deposit - total, 0);
    const parts = (ticket.parts || []).filter(part => part.status === 'selected');

    return (
        <div id="printable-handover" className="hidden print:block print:w-full print:bg-white print:text-black">
            <div className="mx-auto max-w-[540px] border border-gray-300 bg-white px-3 py-3 text-[11px] leading-relaxed">
                <div className="mb-2 flex items-start gap-3">
                    {cfg.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cfg.logoUrl} alt="Logo" className="h-[60px] w-[60px] shrink-0 rounded-lg border border-gray-300 object-contain" />
                    ) : (
                        <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-lg border-2 border-gray-800">
                            <span className="text-center text-[9px] font-black leading-tight">VĂN<br />LÀNH</span>
                        </div>
                    )}
                    <div className="flex-1 text-right">
                        <p className="text-[10px] font-black uppercase leading-tight">{cfg.shopTitle}</p>
                        <p className="text-[13px] font-black uppercase tracking-wide">{cfg.shopName}</p>
                        <p className="mt-0.5 text-[9px] text-gray-600">{cfg.address}</p>
                        <p className="text-[9px] text-gray-600">Hotline: <b>{cfg.hotline}</b></p>
                    </div>
                </div>

                <h1 className="my-2 border-y-2 border-gray-800 py-1 text-center text-[16px] font-black uppercase tracking-wider">
                    {title}
                </h1>

                <div className="mb-2 flex justify-between text-[10px] text-gray-700">
                    <span>Mã phiếu sửa chữa: <b className="text-black">#{ticket.id.slice(-6).toUpperCase()}</b></span>
                    <span>Ngày xác nhận: <b className="text-black">{confirmedAt.toLocaleDateString('vi-VN')}</b></span>
                </div>

                <div className="mb-2 space-y-1 rounded-md border border-gray-300 p-2 text-[10px]">
                    <div className="flex justify-between gap-4">
                        <span>Khách hàng: <b>{ticket.customer.name || '—'}</b></span>
                        <span>SĐT: <b>{ticket.customer.phone || '—'}</b></span>
                    </div>
                    <div className="flex flex-wrap gap-x-4">
                        <span>Thiết bị: <b>{ticket.deviceInfo?.model || '—'}</b></span>
                        <span>Màu: <b>{ticket.deviceInfo?.color || '—'}</b></span>
                        <span>IMEI: <b>{ticket.deviceInfo?.imei || '—'}</b></span>
                    </div>
                    <div>Nội dung: <b>{ticket.issues?.map(issue => issue.label).filter(Boolean).join(', ') || ticket.issue?.description || '—'}</b></div>
                </div>

                {parts.length > 0 && (
                    <div className="mb-2 rounded-md border border-gray-300 p-2 text-[10px]">
                        <p className="mb-1 font-bold uppercase">Linh kiện đã sử dụng</p>
                        <div className="space-y-1">
                            {parts.map((part, index) => (
                                <div key={part.partLineId || `${part.productId || 'part'}-${index}`} className="flex justify-between gap-3">
                                    <span><b>{part.productName || part.name || part.partName || 'Linh kiện'}</b> ×{Math.max(1, Number(part.quantity) || 1)}</span>
                                    <span className="font-semibold">{formatPrice((Number(part.unitPriceAtUse ?? part.price) || 0) * Math.max(1, Number(part.quantity) || 1))}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <table className="mb-2 w-full border-collapse border border-gray-300 text-[10px]">
                    <tbody>
                        <tr><td className="border border-gray-300 px-2 py-1">Tổng chi phí dịch vụ</td><td className="border border-gray-300 px-2 py-1 text-right font-semibold">{formatPrice(total)}</td></tr>
                        {additionalFees > 0 && <tr><td className="border border-gray-300 px-2 py-1">Chi phí phát sinh</td><td className="border border-gray-300 px-2 py-1 text-right">{formatPrice(additionalFees)}</td></tr>}
                        {deposit > 0 && <tr><td className="border border-gray-300 px-2 py-1">Đã đặt cọc</td><td className="border border-gray-300 px-2 py-1 text-right">-{formatPrice(deposit)}</td></tr>}
                        {action === 'refund' || refundAmount > 0 ? (
                            <tr><td className="border border-gray-300 px-2 py-1 font-bold text-emerald-700">Cửa hàng hoàn lại</td><td className="border border-gray-300 px-2 py-1 text-right font-bold text-emerald-700">{formatPrice(refundAmount)}</td></tr>
                        ) : (
                            <tr><td className="border border-gray-300 px-2 py-1 font-bold text-red-600">Khách cần thanh toán</td><td className="border border-gray-300 px-2 py-1 text-right font-bold text-red-600">{formatPrice(amountDue)}</td></tr>
                        )}
                    </tbody>
                </table>

                {(ticket.handoverRecord?.note || ticket.handoverRecord?.paymentConfirmationRequired) && (
                    <div className="mb-2 rounded-md border border-gray-300 p-2 text-[10px]">
                        {ticket.handoverRecord?.note && <p>{action === 'refund' ? 'Lý do hoàn phí' : 'Ghi chú bàn giao'}: <b>{ticket.handoverRecord.note}</b></p>}
                        {ticket.handoverRecord?.paymentConfirmationRequired && (
                            <p>Xác nhận hoàn/thu phí: <b>{ticket.handoverRecord.paymentConfirmed ? 'Đã xác nhận' : 'Chưa xác nhận'}</b></p>
                        )}
                    </div>
                )}

                <p className="mb-3 text-[9px] text-gray-600">{cfg.footerText} Khiếu nại/Bảo hành: <b>{cfg.complaintHotline}</b></p>
                <div className="grid grid-cols-2 gap-10 text-center text-[10px]">
                    <div><p className="mb-10 font-bold">KHÁCH HÀNG</p><p className="text-gray-500 italic">(Ký và ghi rõ họ tên)</p><p className="mt-1 font-semibold">{ticket.customer.name}</p></div>
                    <div><p className="mb-10 font-bold">NHÂN VIÊN BÀN GIAO</p><p className="text-gray-500 italic">(Ký và ghi rõ họ tên)</p><p className="mt-1 font-semibold">{ticket.handoverRecord?.confirmedByName || ticket.staff?.createdByName || '____________'}</p></div>
                </div>
            </div>
        </div>
    );
}
