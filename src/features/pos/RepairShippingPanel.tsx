import { AlertTriangle, Truck } from 'lucide-react';
import CurrencyInput from '@/components/admin/CurrencyInput';
import type { RepairShippingDraft, RepairTicketInfo } from './posTypes';

interface RepairShippingPanelProps {
    repair: RepairTicketInfo | null;
    value: RepairShippingDraft | null;
    onChange: (value: RepairShippingDraft | null) => void;
    formatPrice: (value: number) => string;
    hasRetailProducts?: boolean;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    customerId?: string;
}

function createDraft(
    repair: RepairTicketInfo | null,
    customerName = '',
    customerPhone = '',
    customerAddress = '',
    customerId = '',
): RepairShippingDraft {
    return {
        ...(repair?.id ? { repairTicketId: repair.id } : {}),
        mode: 'customer_paid_now',
        fee: 0,
        recipientName: repair?.customerName || customerName,
        recipientPhone: repair?.customerPhone || customerPhone,
        recipientAddress: repair?.customerAddress || customerAddress || '',
        billingCustomerId: repair?.customerId || customerId || '',
        shopPaymentMethod: 'CASH',
        note: '',
    };
}

export function RepairShippingPanel({
    repair,
    value,
    onChange,
    formatPrice,
    hasRetailProducts = false,
    customerName = '',
    customerPhone = '',
    customerAddress = '',
    customerId = '',
}: RepairShippingPanelProps) {
    if (!repair && !hasRetailProducts) return null;
    const enabled = repair
        ? value?.repairTicketId === repair.id
        : Boolean(value && !value.repairTicketId);
    const draft = enabled ? value : null;

    const hasCustomerProfile = Boolean(customerId || repair?.customerId || draft?.billingCustomerId);
    const availableModes = [
        ['customer_paid_now', 'Khách trả'],
        ['shop_absorbs', 'Shop chịu'],
        ...(hasCustomerProfile ? [['shop_advance_on_credit', 'Shop ứng, ghi nợ']] : []),
    ] as const;

    if (draft && draft.mode === 'shop_advance_on_credit' && !hasCustomerProfile) {
        onChange({ ...draft, mode: 'customer_paid_now' });
    }

    return (
        <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-sky-900">
                    <Truck className="mr-1 inline" size={14} />
                    {repair ? 'Gửi máy cho khách' : 'Giao hàng cho khách'}
                </div>
                <button
                    type="button"
                    onClick={() => onChange(enabled ? null : createDraft(repair, customerName, customerPhone, customerAddress, customerId))}
                    className={`rounded-md px-2 py-1 font-semibold ${enabled ? 'bg-sky-600 text-white' : 'bg-white text-sky-700 ring-1 ring-sky-200'}`}
                >
                    {enabled ? 'Có phí ship' : 'Thêm phí ship'}
                </button>
            </div>
            {draft && (
                <div className="mt-2 space-y-2 border-t border-sky-200 pt-2">
                    <div className={`grid gap-1 ${availableModes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                        {availableModes.map(([mode, label]) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => onChange({ ...draft, mode: mode as RepairShippingDraft['mode'], ...(mode === 'customer_paid_now' ? { fee: 0 } : {}) })}
                                className={`rounded-md px-1.5 py-1.5 font-semibold leading-tight ${draft.mode === mode ? 'bg-sky-600 text-white' : 'bg-white text-sky-700 ring-1 ring-sky-200'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {draft.mode !== 'customer_paid_now' && (
                        <label className="block">
                            <span className="mb-1 block font-semibold text-sky-900">Phí ship</span>
                            <CurrencyInput
                                value={draft.fee || ''}
                                onChange={(fee) => onChange({ ...draft, fee })}
                                placeholder="0"
                                className="w-full rounded-md border border-sky-200 bg-white px-2 py-1.5 text-right font-bold text-sky-800"
                            />
                        </label>
                    )}
                    {!(draft.recipientPhone || customerPhone || repair?.customerPhone)?.trim() && (
                        <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
                            <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                            <span>Vui lòng nhập SĐT khách ở phần Khách hàng.</span>
                        </div>
                    )}
                    <input value={draft.recipientAddress} onChange={event => onChange({ ...draft, recipientAddress: event.target.value })} placeholder="Địa chỉ giao hàng" className="w-full rounded-md border border-sky-200 bg-white px-2 py-1.5" />
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
                    {draft.mode === 'shop_absorbs' && <p className="text-sky-800">Khoản {formatPrice(draft.fee)} được tính vào chi phí ca thu ngân của shop.</p>}
                    {draft.mode === 'customer_paid_now' && <p className="text-sky-800">Khách nhận hàng tự thanh toán phí ship.</p>}
                    <input value={draft.note} onChange={event => onChange({ ...draft, note: event.target.value })} placeholder="Ghi chú giao hàng (không bắt buộc)" className="w-full rounded-md border border-sky-200 bg-white px-2 py-1.5" />
                </div>
            )}
        </div>
    );
}
