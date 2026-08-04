import { useState, type Dispatch, type SetStateAction } from 'react';
import { AlertTriangle, ChevronDown, Minus, Phone, Plus, Receipt, ShoppingCart, Trash2, User, Wrench, X } from 'lucide-react';
import CurrencyInput from '@/components/admin/CurrencyInput';
import type { AppliedVoucher, CartItem, DiscountDetail, RepairShippingDraft, VoucherStatus } from './posTypes';
import { PosPaymentComposer, type PosPaymentMode } from './PosPaymentComposer';
import type { PosPaymentBreakdownEntry } from '@/lib/posPaymentBreakdown';

interface PosCartPanelProps {
    cart: CartItem[];
    setCart: Dispatch<SetStateAction<CartItem[]>>;
    customerName: string;
    customerPhone: string;
    customerDebt: number;
    repairShipping: RepairShippingDraft | null;
    discountDetails: DiscountDetail[];
    autoDiscountAmount: number;
    autoDiscountApplied: boolean;
    onApplyAutoDiscount: () => void;
    setDiscount: Dispatch<SetStateAction<number>>;
    paymentMethod: PosPaymentMode;
    setPaymentMethod: (value: PosPaymentMode) => void;
    discount: number;
    voucherCode: string;
    setVoucherCode: (value: string) => void;
    voucherStatus: VoucherStatus | null;
    appliedVoucher: AppliedVoucher | null;
    setAppliedVoucher: (value: AppliedVoucher | null) => void;
    setVoucherStatus: (value: VoucherStatus | null) => void;
    voucherDiscountAmount: number;
    deposit: number;
    paymentBreakdown: PosPaymentBreakdownEntry[];
    cashTendered: number;
    setCashTendered: (value: number) => void;
    bankTransferAmount: number;
    setBankTransferAmount: (value: number) => void;
    bankTransferConfirmed: boolean;
    setBankTransferConfirmed: (value: boolean) => void;
    debtRequested: boolean;
    setDebtRequested: (value: boolean) => void;
    bankTransferReference: string;
    bankAccounts: { bankId: string; accountNo: string; accountName: string; isDefault?: boolean }[];
    useSurplusToPayDebt: boolean;
    setUseSurplusToPayDebt: (value: boolean) => void;
    subtotal: number;
    total: number;
    isProcessing: boolean;
    cashierShiftOpen: boolean;
    onCloseMobileCart: () => void;
    onApplyVoucher: () => void;
    onUpdateQuantity: (cartItemId: string, delta: number) => void;
    onRemoveFromCart: (cartItemId: string) => void;
    onRemoveRepairFromCart: (repairTicketId: string) => void;
    onCheckout: () => void;
    formatPrice: (value: number) => string;
}

export function PosCartPanel({
    cart,
    setCart,
    customerName,
    customerPhone,
    customerDebt,
    repairShipping,
    discountDetails,
    autoDiscountAmount,
    autoDiscountApplied,
    onApplyAutoDiscount,
    setDiscount,
    paymentMethod,
    setPaymentMethod,
    discount,
    voucherCode,
    setVoucherCode,
    voucherStatus,
    appliedVoucher,
    setAppliedVoucher,
    setVoucherStatus,
    voucherDiscountAmount,
    deposit,
    paymentBreakdown,
    cashTendered,
    setCashTendered,
    bankTransferAmount,
    setBankTransferAmount,
    bankTransferConfirmed,
    setBankTransferConfirmed,
    debtRequested,
    setDebtRequested,
    bankTransferReference,
    bankAccounts,
    useSurplusToPayDebt,
    setUseSurplusToPayDebt,
    subtotal,
    total,
    isProcessing,
    cashierShiftOpen,
    onCloseMobileCart,
    onApplyVoucher,
    onUpdateQuantity,
    onRemoveFromCart,
    onRemoveRepairFromCart,
    onCheckout,
    formatPrice,
}: PosCartPanelProps) {
    const [showVoucherEntry, setShowVoucherEntry] = useState(false);
    const [showAdjustments, setShowAdjustments] = useState(false);
    const productItems = cart.filter(item => !item.isRepairTicket && !item.isOrderPayment);
    const repairItems = cart.filter(item => item.isRepairTicket);
    const debtItems = cart.filter(item => item.isOrderPayment);
    const productQuantity = productItems.reduce((sum, item) => sum + item.quantity, 0);
    const selectedDebtTotal = debtItems.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
    const saleTotal = Math.max(0, total - selectedDebtTotal);
    const selectedDebtCovered = Math.min(selectedDebtTotal, Math.max(0, deposit - saleTotal));
    const surplusAfterSelectedDebt = Math.max(0, cashTendered - total);
    const remainingDebtAfterSelected = Math.max(0, customerDebt - selectedDebtTotal);
    const autoDebtOffset = useSurplusToPayDebt ? Math.min(surplusAfterSelectedDebt, remainingDebtAfterSelected) : 0;
    const changeDue = Math.max(0, surplusAfterSelectedDebt - autoDebtOffset);
    const remainingCurrentPayment = Math.max(0, total - deposit);
    const receivedPaymentMethod = paymentBreakdown.length > 1
        ? 'mixed'
        : paymentBreakdown[0]?.method === 'CASH'
            ? 'cash'
            : paymentBreakdown[0]?.method === 'BANK'
                ? 'bank'
                : paymentMethod;
    const shippingCustomerCharge = repairShipping?.mode === 'customer_paid_now' ? Math.max(0, repairShipping.fee) : 0;
    const shopShippingPayment = Boolean(repairShipping && repairShipping.mode !== 'customer_paid_now' && repairShipping.fee > 0);
    const requiresCashierShift = (
        (paymentBreakdown.length > 0 || paymentMethod === 'momo' || paymentMethod === 'installment')
        && cart.length > 0
        && total > 0
    ) || shopShippingPayment;
    const missingCashierShift = requiresCashierShift && !cashierShiftOpen;
    const hasUnconfirmedBankPayment = paymentBreakdown.some(entry => entry.method === 'BANK') && !bankTransferConfirmed;
    const hasIncompletePayment = remainingCurrentPayment > 0 && !debtRequested && !['momo', 'installment'].includes(paymentMethod);
    const checkoutDisabled = cart.length === 0 || isProcessing || missingCashierShift || hasUnconfirmedBankPayment || hasIncompletePayment;
    const adjustmentCount = Number(discount > 0) + Number(voucherCode.length > 0 || Boolean(appliedVoucher)) + Number(discountDetails.length > 0);

    return (
        <>
            <div className="flex items-center gap-2 border-b px-4 py-3">
                <Receipt size={20} className="text-orange-500" />
                <div>
                    <h2 className="font-bold text-gray-800">Thanh toán</h2>
                    <p className="text-[11px] text-gray-400">Hàng hóa, dịch vụ và khoản thu được tách riêng.</p>
                </div>
                <span className="ml-auto rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600">{productQuantity} SP</span>
                <button onClick={onCloseMobileCart} className="p-1 text-gray-400 hover:text-gray-600 md:hidden" aria-label="Đóng thanh toán" title="Đóng thanh toán"><X size={20} /></button>
            </div>

            <div className="flex items-center gap-2 border-b bg-orange-50/50 px-4 py-2 text-xs">
                <User size={14} className="shrink-0 text-orange-500" />
                <span className="min-w-0 flex-1 truncate font-semibold text-gray-800">{customerName || 'Khách lẻ'}</span>
                {customerPhone && <span className="inline-flex shrink-0 items-center gap-1 text-gray-500"><Phone size={12} /> {customerPhone}</span>}
                {customerDebt > 0 && <span className="shrink-0 font-bold text-red-600">Nợ {formatPrice(customerDebt)}</span>}
            </div>

            <div className="min-h-[150px] flex-1 space-y-3 overflow-y-auto px-4 py-3">
                <section>
                    <div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-600"><ShoppingCart size={14} /> Hàng hóa đã chọn</h3><span className="text-xs font-medium text-gray-400">{productQuantity} sản phẩm</span></div>
                    {productItems.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 py-7 text-center text-gray-400"><ShoppingCart size={28} className="mx-auto mb-2 opacity-40" /><p className="text-xs">Chưa chọn hàng hóa</p></div>
                    ) : (
                        <div className="space-y-2">
                            {productItems.map(item => {
                                return (
                                    <div key={item.cartItemId} className="rounded-xl border border-gray-100 bg-white p-2 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="min-w-0 flex-1"><p className="line-clamp-1 text-sm font-semibold text-gray-800">{item.name}</p>{item.lotCode && <p className="mt-0.5 text-[10px] font-bold text-orange-700">Lô: {item.lotCode}</p>}</div>
                                            <div className="flex shrink-0 items-center rounded-lg border bg-gray-50"><button onClick={() => onUpdateQuantity(item.cartItemId, -1)} className="rounded-l-lg p-1 hover:bg-gray-100" aria-label="Giảm số lượng" title="Giảm số lượng"><Minus size={14} /></button><span className="min-w-[28px] px-1 text-center text-sm font-bold">{item.quantity}</span><button onClick={() => onUpdateQuantity(item.cartItemId, 1)} className="rounded-r-lg p-1 hover:bg-gray-100" aria-label="Tăng số lượng" title="Tăng số lượng"><Plus size={14} /></button></div>
                                            <button onClick={() => onRemoveFromCart(item.cartItemId)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600" aria-label="Xóa khỏi giỏ" title="Xóa khỏi giỏ"><Trash2 size={14} /></button>
                                        </div>
                                        {item.requiresImei && <div className="mt-2 space-y-2 border-t border-gray-100 pt-2"><p className="text-xs font-semibold text-gray-600">IMEI / Serial ({item.quantity})</p>{Array.from({ length: item.quantity }).map((_, index) => <div key={index} className="relative"><input type="text" placeholder={`IMEI/Serial #${index + 1}`} value={item.imeis?.[index] || ''} onChange={event => { const value = event.target.value; setCart(previous => previous.map(cartItem => { if (cartItem.cartItemId !== item.cartItemId) return cartItem; const imeis = [...(cartItem.imeis || [])]; imeis[index] = value; return { ...cartItem, imeis }; })); }} className="w-full rounded border py-1.5 pl-2 pr-8 text-xs uppercase" />{(item.imeis?.[index]?.length || 0) < 5 && <AlertTriangle size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-400" />}</div>)}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {repairItems.length > 0 && <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-3"><h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-800"><Wrench size={14} /> Dịch vụ sửa chữa đã chọn</h3><div className="mt-2 space-y-2">{repairItems.map((item, index) => { const firstInRepair = Boolean(item.repairTicketId) && repairItems.findIndex(candidate => candidate.repairTicketId === item.repairTicketId) === index; return <div key={item.cartItemId} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs"><Wrench size={14} className="shrink-0 text-blue-600" /><span className="min-w-0 flex-1 truncate font-semibold text-blue-900">{item.name}</span><span className="font-bold text-blue-800">{formatPrice(item.sellingPrice * item.quantity)}</span>{firstInRepair && item.repairTicketId ? <button onClick={() => onRemoveRepairFromCart(item.repairTicketId!)} className="ml-1 text-red-500 hover:text-red-700">Bỏ</button> : <span className="ml-1 text-[10px] text-blue-400">Theo phiếu</span>}</div>; })}</div></section>}

                {debtItems.length > 0 && <section className="rounded-xl border border-amber-100 bg-amber-50/40 p-3"><h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800"><Receipt size={14} /> Khoản thu công nợ đã chọn</h3><div className="mt-2 space-y-2">{debtItems.map(item => <div key={item.cartItemId} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs"><Receipt size={14} className="shrink-0 text-amber-600" /><span className="min-w-0 flex-1 truncate font-semibold text-amber-900">{item.name}</span><span className="font-bold text-amber-800">{formatPrice(item.sellingPrice * item.quantity)}</span><button onClick={() => onRemoveFromCart(item.cartItemId)} className="ml-1 text-red-500 hover:text-red-700">Bỏ</button></div>)}</div></section>}
            </div>

            <div className="shrink-0 space-y-2 border-t bg-white px-4 py-2.5">
                {missingCashierShift && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">Chưa mở ca thu ngân. Vào tab Thu ngân và mở ca trước khi thanh toán tiền mặt, chuyển khoản, ví hoặc chi phí ship.</div>}
                <button type="button" onClick={() => setShowAdjustments(previous => !previous)} className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-100"><span>Điều chỉnh hóa đơn{adjustmentCount > 0 ? ` (${adjustmentCount})` : ''}</span><ChevronDown size={15} className={`transition-transform ${showAdjustments ? 'rotate-180' : ''}`} /></button>
                {showAdjustments && <div className="space-y-2 rounded-xl border border-gray-100 p-2.5">{discountDetails.length > 0 && <div className="rounded-lg border border-green-200 bg-green-50 p-2.5 text-xs"><p className="font-semibold text-green-700">Giảm phụ kiện tự động:</p>{discountDetails.map((detail, index) => <p key={`${detail.productName}-${index}`} className="text-green-600">{detail.productName}: -{detail.discountAmount.toLocaleString('vi-VN')}đ ({detail.ruleName})</p>)}<button type="button" onClick={onApplyAutoDiscount} disabled={autoDiscountApplied} className="mt-1 w-full rounded-lg bg-green-600 py-1.5 text-xs font-semibold text-white disabled:bg-green-300">{autoDiscountApplied ? 'Đã áp dụng giảm' : `Áp dụng giảm ${autoDiscountAmount.toLocaleString('vi-VN')}đ`}</button></div>}<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><label className="flex min-w-0 items-center gap-2"><span className="whitespace-nowrap text-sm text-gray-500">Giảm:</span><CurrencyInput value={discount || ''} onChange={value => setDiscount(value)} placeholder="0" className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-right text-sm" /></label><button type="button" onClick={() => setShowVoucherEntry(previous => !previous)} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${showVoucherEntry || voucherCode || appliedVoucher ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}><ChevronDown size={14} className={`transition-transform ${showVoucherEntry ? 'rotate-180' : ''}`} />Voucher</button></div>{(showVoucherEntry || voucherCode || voucherStatus) && <div className="space-y-1"><div className="flex gap-1 text-sm"><input type="text" placeholder="Nhập mã giảm giá" value={voucherCode} onChange={event => setVoucherCode(event.target.value.toUpperCase())} className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 uppercase" /><button onClick={onApplyVoucher} className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-600">Áp dụng</button></div>{voucherStatus && <div className={`pr-1 text-right text-xs ${voucherStatus.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>{voucherStatus.message}{appliedVoucher && <button onClick={() => { setAppliedVoucher(null); setVoucherCode(''); setVoucherStatus(null); }} className="ml-2 underline">Bỏ</button>}</div>}</div>}</div>}

                <PosPaymentComposer
                    total={total}
                    paymentMode={paymentMethod}
                    setPaymentMode={setPaymentMethod}
                    cashTendered={cashTendered}
                    setCashTendered={setCashTendered}
                    bankTransferAmount={bankTransferAmount}
                    setBankTransferAmount={setBankTransferAmount}
                    bankTransferConfirmed={bankTransferConfirmed}
                    setBankTransferConfirmed={setBankTransferConfirmed}
                    debtRequested={debtRequested}
                    setDebtRequested={setDebtRequested}
                    bankReference={bankTransferReference}
                    bankAccounts={bankAccounts}
                    hasSelectedDebtCollection={debtItems.length > 0}
                    formatPrice={formatPrice}
                />
                {paymentBreakdown.length > 1 && <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-2 text-xs text-blue-900">
                    <p className="mb-1 font-bold">Đã nhận theo từng kênh</p>
                    {paymentBreakdown.map((entry, index) => <div key={`${entry.method}-${index}`} className="flex justify-between gap-3"><span>{entry.method === 'CASH' ? 'Tiền mặt' : entry.method === 'BANK' ? 'Chuyển khoản' : entry.method}</span><span className="font-semibold">{formatPrice(entry.amount)}</span></div>)}
                </div>}
                {remainingDebtAfterSelected > 0 && surplusAfterSelectedDebt > 0 && <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2"><input type="checkbox" id="useSurplusDebt" className="mt-0.5 h-4 w-4 rounded text-blue-600" checked={useSurplusToPayDebt} onChange={event => setUseSurplusToPayDebt(event.target.checked)} /><label htmlFor="useSurplusDebt" className="flex-1 cursor-pointer text-xs text-blue-800"><b>Khách có nợ cũ: {formatPrice(customerDebt)}</b><br />Dùng tiền dư <b>{formatPrice(Math.min(surplusAfterSelectedDebt, remainingDebtAfterSelected))}</b> để cấn trừ nợ</label></div>}
                <div className="space-y-1 text-sm"><div className="flex justify-between text-gray-500"><span>Tạm tính ({productQuantity} SP)</span><span>{formatPrice(subtotal)}</span></div>{discount > 0 && <div className="flex justify-between text-green-600"><span>Giảm giá NV</span><span>-{formatPrice(discount)}</span></div>}{autoDiscountApplied && autoDiscountAmount > 0 && <div className="flex justify-between text-green-600"><span>Giảm phụ kiện</span><span>-{formatPrice(autoDiscountAmount)}</span></div>}{voucherDiscountAmount > 0 && <div className="flex justify-between font-medium text-blue-600"><span>Voucher giảm giá</span><span>-{formatPrice(voucherDiscountAmount)}</span></div>}{shippingCustomerCharge > 0 && <div className="flex justify-between font-medium text-sky-700"><span>Phí ship khách trả</span><span>+{formatPrice(shippingCustomerCharge)}</span></div>}{repairShipping?.mode === 'shop_absorbs' && repairShipping.fee > 0 && <div className="flex justify-between text-sky-700"><span>Phí ship shop chịu</span><span>{formatPrice(repairShipping.fee)}</span></div>}{repairShipping?.mode === 'shop_advance_on_credit' && repairShipping.fee > 0 && <div className="flex justify-between text-amber-700"><span>Shop ứng, ghi nợ {repairShipping.billingCustomerId || 'đối tác'}</span><span>{formatPrice(repairShipping.fee)}</span></div>}<div className="flex justify-between border-t pt-1 text-lg font-bold text-orange-600"><span>TỔNG</span><span>{formatPrice(total)}</span></div>{selectedDebtTotal > 0 && <div className="flex justify-between text-amber-600"><span>Thu nợ đã chọn</span><span>{formatPrice(selectedDebtTotal)}</span></div>}{deposit > 0 && <div className="flex justify-between pt-1 text-blue-600"><span>Đã nhận ({receivedPaymentMethod === 'cash' ? 'tiền mặt' : 'chuyển khoản/QR'})</span><span>{formatPrice(deposit)}</span></div>}{selectedDebtCovered > 0 && <div className="flex justify-between text-amber-700"><span>Đã phân bổ thu nợ</span><span>{formatPrice(selectedDebtCovered)}</span></div>}{autoDebtOffset > 0 && <div className="flex justify-between text-blue-700"><span>Cấn nợ cũ</span><span>{formatPrice(autoDebtOffset)}</span></div>}{deposit > 0 && remainingCurrentPayment > 0 && <div className="flex justify-between border-t pt-1 font-bold text-red-600"><span>CÒN LẠI</span><span>{formatPrice(remainingCurrentPayment)}</span></div>}{deposit > 0 && changeDue > 0 && <div className="flex justify-between border-t pt-1 font-bold text-green-600"><span>Tiền thối lại</span><span>{formatPrice(changeDue)}</span></div>}</div>
                <button onClick={onCheckout} disabled={checkoutDisabled} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-3 font-bold text-white shadow-lg shadow-orange-200/50 transition-all hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]">{isProcessing ? <><span className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/40 border-t-white" /> Đang xử lý...</> : missingCashierShift ? <><AlertTriangle size={18} /> Mở ca thu ngân trước</> : <><Receipt size={18} /> Thanh toán & Xuất hóa đơn</>}</button>
            </div>
        </>
    );
}
