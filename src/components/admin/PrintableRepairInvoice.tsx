'use client';

import type { RepairTicket } from '@/lib/types';
import type { ReceiptConfig } from './PrintableReceipt';

const formatPrice = (p: number) => (p || 0).toLocaleString('vi-VN') + 'đ';

const defaultHeaderConfig: ReceiptConfig = {
    logoUrl: '',
    shopName: 'Văn Lành Service',
    shopTitle: 'Trung Tâm Sửa Chữa & Bảo Hành Thiết Bị Di Động',
    address: '117 Nguyên Hồng, Bình Lợi Trung (P11 cũ), Bình Thạnh, HCM',
    hotline: '0975 24 20 26 - 0981 24 20 26',
    receiptTitle: 'Hóa Đơn Dịch Vụ Sửa Chữa',
    notes: [],
    footerText: 'Cảm ơn Quý khách đã sử dụng dịch vụ của Văn Lành Service.',
    complaintHotline: '0932.24.20.26',
};

interface PrintableRepairInvoiceProps {
    ticket: RepairTicket;
    receiptConfig?: ReceiptConfig;
}

export default function PrintableRepairInvoice({ ticket, receiptConfig }: PrintableRepairInvoiceProps) {
    const now = new Date();
    const cfg: ReceiptConfig = {
        ...defaultHeaderConfig,
        ...receiptConfig,
        // Backward-compat: invoice has its own title; fallback to a sensible default
        receiptTitle: ticket.ticketType === 'warranty'
            ? 'PHIẾU BẢO HÀNH THIẾT BỊ'
            : (receiptConfig?.invoice?.title || 'HÓA ĐƠN DỊCH VỤ SỬA CHỮA'),
    };

    const inv = cfg.invoice || {};
    const showCustomerInfo = inv.showCustomerInfo ?? true;
    const showDeviceInfo = inv.showDeviceInfo ?? true;
    const showImei = inv.showImei ?? false;
    const showIssueDescription = inv.showIssueDescription ?? true;
    const showPartsUsed = inv.showPartsUsed ?? true;
    const showCostBreakdown = inv.showCostBreakdown ?? true;
    const showPaymentNote = inv.showPaymentNote ?? true;
    const showSignatures = inv.showSignatures ?? true;
    const maxWidthPx = inv.maxWidthPx ?? 620;
    const baseFontSizePx = inv.baseFontSizePx ?? 11;

    const pay = ticket.payment || {};
    const computedPartsCost = (ticket.parts || [])
        // Only count parts that were actually used (selected) AND not warranty-covered
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => String(p?.status || '') === 'selected' && !p?.isWarrantyCovered)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .reduce((sum: number, p: any) => {
            const qty = Math.max(1, Number(p?.quantity) || 1);
            const unit = Number(p?.unitPriceAtUse ?? p?.price ?? 0) || 0;
            return sum + unit * qty;
        }, 0);

    // Prefer snapshot pricing when available; fallback to legacy payment.partsCost
    const partsCost = computedPartsCost > 0 ? computedPartsCost : Number(pay.partsCost) || 0;
    const laborCost = Number(pay.laborCost) || 0;
    const additionalFees = Number(pay.additionalFees) || 0;
    const deposit = Number(pay.depositAmount) || 0;
    const total = Number(pay.amount) || partsCost + laborCost + additionalFees;

    // ── Tính toán số tiền khách phải trả / cửa hàng hoàn lại theo trạng thái ──
    const status = ticket.status;
    let customerPay = 0;
    let refundAmount = 0;

    if (status === 'refund') {
        // Hoàn phí: khách không phải trả, cửa hàng hoàn lại tiền cọc (hoặc toàn bộ số đã thu)
        refundAmount = deposit > 0 ? deposit : total > 0 ? total : 0;
        customerPay = 0;
    } else if (status === 'out') {
        // Máy không sửa được:
        // - Nếu có tổng phí (total) và không có cọc → khách phải trả total
        // - Nếu có cọc và không có tổng phí → hoàn lại toàn bộ cọc
        // - Nếu vừa có cọc vừa có tổng phí:
        //   + total >= deposit → khách trả phần chênh lệch
        //   + total < deposit  → hoàn lại phần thừa
        if (total === 0 && deposit > 0) {
            refundAmount = deposit;
        } else if (total > 0 && deposit === 0) {
            customerPay = total;
        } else if (total > 0 && deposit > 0) {
            const diff = total - deposit;
            if (diff >= 0) {
                customerPay = diff;
            } else {
                refundAmount = -diff;
            }
        }
    } else {
        // done / các trạng thái bình thường: khách thanh toán phần còn lại
        customerPay = Math.max(total - deposit, 0);
    }

    return (
        <div id="printable-repair-invoice" className="hidden print:block print:w-full print:bg-white print:text-black">
            <div
                className="mx-auto px-4 py-3 leading-relaxed border border-gray-300 bg-white"
                style={{ maxWidth: maxWidthPx, fontSize: baseFontSizePx }}
            >
                {/* HEADER */}
                <div className="flex items-start gap-3 mb-2">
                    {/* Logo */}
                    {cfg.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={cfg.logoUrl}
                            alt="Logo"
                            className="shrink-0 w-[70px] h-[70px] object-contain rounded-lg border border-gray-300"
                        />
                    ) : (
                        <div className="shrink-0 w-[70px] h-[70px] border-2 border-gray-800 rounded-lg flex items-center justify-center">
                            <span className="text-[10px] font-black text-center leading-tight">
                                VĂN
                                <br />
                                LÀNH
                            </span>
                        </div>
                    )}
                    {/* Store info */}
                    <div className="flex-1 text-right">
                        <p className="font-black text-[11px] uppercase leading-tight">{cfg.shopTitle}</p>
                        <p className="font-black text-[14px] uppercase text-gray-900 tracking-wide">{cfg.shopName}</p>
                        <p className="text-[9px] text-gray-600 mt-0.5">{cfg.address}</p>
                        <p className="text-[9px] text-gray-600">
                            Hotline: <b>{cfg.hotline}</b>
                        </p>
                    </div>
                </div>

                {/* TITLE */}
                <h1 className="text-center font-black text-[16px] uppercase tracking-wider my-2 border-y-2 border-gray-800 py-1">
                    {cfg.receiptTitle}
                </h1>

                {/* META */}
                <div className="flex justify-between text-[10px] text-gray-700 mb-2">
                    <span>
                        Mã phiếu sửa chữa:{' '}
                        <b className="text-black">#{ticket.id.slice(-6).toUpperCase()}</b>
                    </span>
                    <span>
                        Ngày in:{' '}
                        <b className="text-black">{now.toLocaleDateString('vi-VN')}</b>
                    </span>
                </div>

                {/* CUSTOMER & DEVICE */}
                {(showCustomerInfo || showDeviceInfo || showIssueDescription) && (
                    <div className="border border-gray-300 rounded-md p-2 mb-2 text-[10px] space-y-1">
                        {showCustomerInfo && (
                            <div className="flex justify-between">
                                <span>
                                    Khách hàng: <b>{ticket.customer.name}</b>
                                </span>
                                <span>
                                    SĐT: <b>{ticket.customer.phone}</b>
                                </span>
                            </div>
                        )}
                        {showDeviceInfo && (
                            <div className="flex flex-wrap gap-x-4">
                                <span>
                                    Thiết bị:{' '}
                                    <b>{ticket.deviceInfo?.model || '—'}</b>
                                </span>
                                <span>
                                    Màu:{' '}
                                    <b>{ticket.deviceInfo?.color || '—'}</b>
                                </span>
                                {showImei && (
                                    <span>
                                        IMEI:{' '}
                                        <b>{ticket.deviceInfo?.imei ? ticket.deviceInfo.imei : '—'}</b>
                                    </span>
                                )}
                            </div>
                        )}
                        {showIssueDescription && (
                            <div>
                                Nội dung sửa chữa:{' '}
                                <b>
                                    {typeof ticket.issue === 'string' ? ticket.issue : ticket.issue?.description || '—'}
                                </b>
                            </div>
                        )}
                    </div>
                )}

                {/* PARTS USED */}
                {showPartsUsed && (ticket.parts?.length || 0) > 0 && (
                    <div className="border border-gray-300 rounded-md p-2 mb-2 text-[10px]">
                        <p className="font-bold text-[10px] uppercase mb-1">
                            {ticket.ticketType === 'warranty'
                                ? 'Linh kiện đã thay thế (Bảo Hành)'
                                : 'Linh kiện đã sử dụng'}
                        </p>
                        <div className="space-y-1">
                            {ticket.parts
                                ?.filter((p) => p.status === 'selected')
                                .map((p, i) => {
                                    const name = p.name || p.partName || p.productName || '—';
                                    const qty = Number(p.quantity) || 1;
                                    const isCovered = (p as { isWarrantyCovered?: boolean }).isWarrantyCovered;
                                    const price = isCovered ? 0 : Number(p.unitPriceAtUse ?? p.price ?? 0);
                                    return (
                                        <div key={i} className="flex justify-between gap-3">
                                            <div className="text-gray-700">
                                                <b>{name}</b>
                                                <span className="text-gray-400"> ×{qty}</span>
                                                {isCovered && (
                                                    <span className="ml-1 text-emerald-600 font-semibold">(Bảo Hành)</span>
                                                )}
                                            </div>
                                            <div className="font-semibold">
                                                {isCovered ? '0đ' : formatPrice(price * qty)}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {/* COST BREAKDOWN TABLE */}
                {showCostBreakdown && (
                    <table className="w-full text-[10px] mb-2 border border-gray-300 border-collapse">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="border border-gray-300 px-2 py-1 text-left w-10">STT</th>
                                <th className="border border-gray-300 px-2 py-1 text-left">Hạng mục</th>
                                <th className="border border-gray-300 px-2 py-1 text-right w-24">Thành tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            {partsCost > 0 && (
                                <tr>
                                    <td className="border border-gray-200 px-2 py-1 text-center">1</td>
                                    <td className="border border-gray-200 px-2 py-1">Chi phí linh kiện / vật tư thay thế</td>
                                    <td className="border border-gray-200 px-2 py-1 text-right">{formatPrice(partsCost)}</td>
                                </tr>
                            )}
                            {laborCost > 0 && (
                                <tr>
                                    <td className="border border-gray-200 px-2 py-1 text-center">{partsCost > 0 ? 2 : 1}</td>
                                    <td className="border border-gray-200 px-2 py-1">Tiền công sửa chữa / dịch vụ kỹ thuật</td>
                                    <td className="border border-gray-200 px-2 py-1 text-right">{formatPrice(laborCost)}</td>
                                </tr>
                            )}
                            {additionalFees > 0 && (
                                <tr>
                                    <td className="border border-gray-200 px-2 py-1 text-center">
                                        {partsCost > 0 && laborCost > 0 ? 3 : partsCost > 0 || laborCost > 0 ? 2 : 1}
                                    </td>
                                    <td className="border border-gray-200 px-2 py-1">Chi phí phát sinh khác</td>
                                    <td className="border border-gray-200 px-2 py-1 text-right">{formatPrice(additionalFees)}</td>
                                </tr>
                            )}
                            {partsCost === 0 && laborCost === 0 && additionalFees === 0 && (
                                <tr>
                                    <td className="border border-gray-200 px-2 py-1 text-center">1</td>
                                    <td className="border border-gray-200 px-2 py-1">
                                        {ticket.ticketType === 'warranty'
                                            ? 'Dịch vụ bảo hành (miễn phí)'
                                            : 'Tổng chi phí dịch vụ sửa chữa'}
                                    </td>
                                    <td className="border border-gray-200 px-2 py-1 text-right font-semibold text-emerald-600">
                                        {ticket.ticketType === 'warranty' ? 'Miễn phí' : formatPrice(total)}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={2} className="border border-gray-300 px-2 py-1 text-right font-semibold">
                                    TỔNG CỘNG:
                                </td>
                                <td className="border border-gray-300 px-2 py-1 text-right font-bold text-[12px]">
                                    {formatPrice(total)}
                                </td>
                            </tr>
                            {deposit > 0 && (
                                <tr>
                                    <td colSpan={2} className="border border-gray-300 px-2 py-1 text-right text-gray-700">
                                        Đã đặt cọc:
                                    </td>
                                    <td className="border border-gray-300 px-2 py-1 text-right font-semibold text-yellow-700">
                                        -{formatPrice(deposit)}
                                    </td>
                                </tr>
                            )}
                            <tr>
                                <td colSpan={2} className="border border-gray-300 px-2 py-1 text-right font-semibold">
                                    KHÁCH THANH TOÁN:
                                </td>
                                <td className="border border-gray-300 px-2 py-1 text-right font-bold text-[13px] text-red-600">
                                    {formatPrice(customerPay)}
                                </td>
                            </tr>
                            {refundAmount > 0 && (
                                <tr>
                                    <td colSpan={2} className="border border-gray-300 px-2 py-1 text-right font-semibold">
                                        CỬA HÀNG HOÀN LẠI:
                                    </td>
                                    <td className="border border-gray-300 px-2 py-1 text-right font-bold text-[12px] text-emerald-700">
                                        {formatPrice(refundAmount)}
                                    </td>
                                </tr>
                            )}
                        </tfoot>
                    </table>
                )}

                {/* [WARRANTY TH3] Bảng hoàn tiền linh kiện */}
                {ticket.ticketType === 'warranty' &&
                 ticket.status === 'refund' &&
                 (ticket.warrantyClaim as { refundedParts?: { productName: string; refundAmount: number }[] })?.refundedParts &&
                 ((ticket.warrantyClaim as { refundedParts?: { productName: string; refundAmount: number }[] }).refundedParts!.length > 0) && (
                    <div className="border border-red-200 rounded-md p-2 mb-2 text-[10px]">
                        <p className="font-bold text-[10px] uppercase mb-1 text-red-700">
                            Linh kiện hoàn tiền
                        </p>
                        {((ticket.warrantyClaim as { refundedParts: { productName: string; refundAmount: number }[] }).refundedParts).map((rp, i) => (
                            <div key={i} className="flex justify-between">
                                <span>{rp.productName}</span>
                                <span className="font-semibold text-emerald-700">+{formatPrice(rp.refundAmount)}</span>
                            </div>
                        ))}
                    </div>
                )}
                {(() => {
                    // `payment.note` may exist in Firestore even if not declared in the TypeScript type.
                    const paymentNote = (ticket.payment as unknown as { note?: string } | undefined)?.note;
                    if (!showPaymentNote || !paymentNote) return null;
                    return (
                    <div className="mb-2 text-[9px] text-gray-700">
                        Ghi chú thanh toán: {paymentNote}
                    </div>
                    );
                })()}

                {/* WARRANTY SECTION — chỉ hiện khi có linh kiện có BH */}
                {(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const warrantyParts = (ticket.parts || []).filter((p: any) =>
                        String(p?.status || '') === 'selected' && Number(p?.warrantyMonths || 0) > 0
                    );
                    if (warrantyParts.length === 0) return null;
                    return (
                        <div className="mb-3">
                            <p className="font-bold text-[10px] mb-1 uppercase">Bảo hành linh kiện</p>
                            <table className="w-full text-[9px] border-collapse">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="border border-gray-300 px-2 py-0.5 text-left">Linh kiện</th>
                                        <th className="border border-gray-300 px-2 py-0.5 text-left">Loại</th>
                                        <th className="border border-gray-300 px-2 py-0.5 text-center">BH (tháng)</th>
                                        <th className="border border-gray-300 px-2 py-0.5 text-left">Hết hạn</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                    {warrantyParts.map((p: any, i: number) => {
                                        const expiresTs = typeof p.warrantyExpiresAt === 'number'
                                            ? p.warrantyExpiresAt
                                            : p.warrantyExpiresAt?.toDate?.()?.getTime() || 0;
                                        const expiresStr = expiresTs
                                            ? new Date(expiresTs).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                            : '—';
                                        return (
                                            <tr key={i}>
                                                <td className="border border-gray-200 px-2 py-0.5">{p.productName}</td>
                                                <td className="border border-gray-200 px-2 py-0.5">{p.partType || '—'}</td>
                                                <td className="border border-gray-200 px-2 py-0.5 text-center font-semibold">{p.warrantyMonths}</td>
                                                <td className="border border-gray-200 px-2 py-0.5">{expiresStr}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    );
                })()}

                {/* SIGNATURES */}
                {showSignatures && (
                    <div className="grid grid-cols-2 gap-10 mt-4 mb-2 text-[10px]">
                        <div className="text-center">
                            <p className="font-bold mb-10">KHÁCH HÀNG</p>
                            <p className="text-gray-500 italic text-[9px]">(Ký và ghi rõ họ tên)</p>
                            <p className="mt-1 font-semibold">{ticket.customer.name}</p>
                        </div>
                        <div className="text-center">
                            <p className="font-bold mb-10">THU NGÂN / KẾ TOÁN</p>
                            <p className="text-gray-500 italic text-[9px]">(Ký và ghi rõ họ tên)</p>
                            <p className="mt-1 font-semibold">{ticket.staff?.assignedTechnicianName || '____________'}</p>
                        </div>
                    </div>
                )}

                {/* FOOTER */}
                <div className="text-center text-[8px] text-gray-500 border-t border-gray-200 pt-1 mt-2">
                    {inv.footerText || cfg.footerText} Khiếu nại/Bảo hành xin liên hệ:{' '}
                    <b>{inv.complaintHotline || cfg.complaintHotline}</b>
                </div>
            </div>
        </div>
    );
}

