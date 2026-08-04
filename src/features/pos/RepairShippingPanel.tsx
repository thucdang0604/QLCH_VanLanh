import { Truck } from 'lucide-react';
import CurrencyInput from '@/components/admin/CurrencyInput';
import type { RepairShippingDraft, RepairTicketInfo } from './posTypes';

interface RepairShippingPanelProps {
    repair: RepairTicketInfo | null;
    value: RepairShippingDraft | null;
    onChange: (value: RepairShippingDraft | null) => void;
    formatPrice: (value: number) => string;
}

function createDraft(repair: RepairTicketInfo): RepairShippingDraft {
    return {
        repairTicketId: repair.id,
        mode: 'customer_paid_now',
        fee: 0,
        recipientName: repair.customerName,
        recipientPhone: repair.customerPhone,
        recipientAddress: repair.customerAddress || '',
        billingCustomerId: repair.customerId || '',
        shopPaymentMethod: 'CASH',
        note: '',
    };
}

export function RepairShippingPanel({ repair, value, onChange, formatPrice }: RepairShippingPanelProps) {
    if (!repair) return null;
    const enabled = value?.repairTicketId === repair.id;
    const draft = enabled ? value : null;

    return (
        <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-sky-900"><Truck className="mr-1 inline" size={14} />Gửi máy cho khách</div>
                <button
                    type="button"
                    onClick={() => onChange(enabled ? null : createDraft(repair))}
                    className={`rounded-md px-2 py-1 font-semibold ${enabled ? 'bg-sky-600 text-white' : 'bg-white text-sky-700 ring-1 ring-sky-200'}`}
                >
                    {enabled ? 'Có phí ship' : 'Thêm phí ship'}
                </button>
            </div>
            {draft && (
                <div className="mt-2 space-y-2 border-t border-sky-200 pt-2">
                    <label className="block">
                        <span className="mb-1 block font-semibold text-sky-900">Phí ship</span>
                        <CurrencyInput
                            value={draft.fee || ''}
                            onChange={(fee) => onChange({ ...draft, fee })}
                            placeholder="0"
                            className="w-full rounded-md border border-sky-200 bg-white px-2 py-1.5 text-right font-bold text-sky-800"
                        />
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                        {[
                            ['customer_paid_now', 'Khách trả'],
                            ['shop_absorbs', 'Shop chịu'],
                            ['shop_advance_on_credit', 'Shop ứng, ghi nợ'],
                        ].map(([mode, label]) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => onChange({ ...draft, mode: mode as RepairShippingDraft['mode'] })}
                                className={`rounded-md px-1.5 py-1.5 font-semibold leading-tight ${draft.mode === mode ? 'bg-sky-600 text-white' : 'bg-white text-sky-700 ring-1 ring-sky-200'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                        <input value={draft.recipientName} onChange={event => onChange({ ...draft, recipientName: event.target.value })} placeholder="Người nhận" className="rounded-md border border-sky-200 bg-white px-2 py-1.5" />
                        <input value={draft.recipientPhone} onChange={event => onChange({ ...draft, recipientPhone: event.target.value })} placeholder="SĐT người nhận" className="rounded-md border border-sky-200 bg-white px-2 py-1.5" />
                    </div>
                    <input value={draft.recipientAddress} onChange={event => onChange({ ...draft, recipientAddress: event.target.value })} placeholder="Địa chỉ giao máy" className="w-full rounded-md border border-sky-200 bg-white px-2 py-1.5" />
                    {draft.mode !== 'customer_paid_now' && (
                        <div className="rounded-md bg-white/80 p-2">
                            <div className="mb-1 font-semibold text-sky-900">Shop thanh toán ngay</div>
                            <div className="grid grid-cols-2 gap-1">
                                {(['CASH', 'BANK'] as const).map(method => (
                                    <button key={method} type="button" onClick={() => onChange({ ...draft, shopPaymentMethod: method })} className={`rounded px-2 py-1.5 font-semibold ${draft.shopPaymentMethod === method ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'}`}>
                                        {method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {draft.mode === 'shop_advance_on_credit' && (
                        <div className="space-y-1">
                            <input value={draft.billingCustomerId} onChange={event => onChange({ ...draft, billingCustomerId: event.target.value })} placeholder="Mã khách/đối tác chịu phí ship" className="w-full rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 font-medium text-amber-900" />
                            <p className="text-amber-800">Shop chi {formatPrice(draft.fee)} ngay; hệ thống tạo công nợ riêng cho mã này, không tính doanh thu/chi phí.</p>
                        </div>
                    )}
                    {draft.mode === 'shop_absorbs' && <p className="text-sky-800">Khoản {formatPrice(draft.fee)} được ghi là chi phí ship của shop.</p>}
                    {draft.mode === 'customer_paid_now' && <p className="text-sky-800">Phí ship được cộng vào số tiền khách thanh toán, không tính hoa hồng sửa chữa.</p>}
                    <input value={draft.note} onChange={event => onChange({ ...draft, note: event.target.value })} placeholder="Ghi chú giao hàng (không bắt buộc)" className="w-full rounded-md border border-sky-200 bg-white px-2 py-1.5" />
                </div>
            )}
        </div>
    );
}
