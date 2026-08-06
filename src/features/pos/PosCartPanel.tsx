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

function useCartPanelState(props: PosCartPanelProps) {
    const [showVoucherEntry, setShowVoucherEntry] = useState(false);
    const [showAdjustments, setShowAdjustments] = useState(false);
    const productItems = props.cart.filter(item => !item.isRepairTicket && !item.isOrderPayment);
    const repairItems = props.cart.filter(item => item.isRepairTicket);
    const debtItems = props.cart.filter(item => item.isOrderPayment);
    const productQuantity = productItems.reduce((sum, item) => sum + item.quantity, 0);
    const selectedDebtTotal = debtItems.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
    const saleTotal = Math.max(0, props.total - selectedDebtTotal);
    const selectedDebtCovered = Math.min(selectedDebtTotal, Math.max(0, props.deposit - saleTotal));
    const surplusAfterSelectedDebt = Math.max(0, props.cashTendered - props.total);
    const remainingDebtAfterSelected = Math.max(0, props.customerDebt - selectedDebtTotal);
    const autoDebtOffset = props.useSurplusToPayDebt ? Math.min(surplusAfterSelectedDebt, remainingDebtAfterSelected) : 0;
    const changeDue = Math.max(0, surplusAfterSelectedDebt - autoDebtOffset);
    const remainingCurrentPayment = Math.max(0, props.total - props.deposit);
    const receivedPaymentMethod = props.paymentBreakdown.length > 1
        ? 'mixed'
        : props.paymentBreakdown[0]?.method === 'CASH'
            ? 'cash'
            : props.paymentBreakdown[0]?.method === 'BANK'
                ? 'bank'
                : props.paymentMethod;
    const shippingCustomerCharge = props.repairShipping?.mode === 'customer_paid_now' ? Math.max(0, props.repairShipping.fee) : 0;
    const shopShippingPayment = Boolean(props.repairShipping && props.repairShipping.mode !== 'customer_paid_now' && props.repairShipping.fee > 0);
    const requiresCashierShift = (
        (props.paymentBreakdown.length > 0 || props.paymentMethod === 'momo' || props.paymentMethod === 'installment')
        && props.cart.length > 0
        && props.total > 0
    ) || shopShippingPayment;
    const missingCashierShift = requiresCashierShift && !props.cashierShiftOpen;
    const hasUnconfirmedBankPayment = props.paymentBreakdown.some(entry => entry.method === 'BANK') && !props.bankTransferConfirmed;
    const hasIncompletePayment = remainingCurrentPayment > 0 && !props.debtRequested && !['momo', 'installment'].includes(props.paymentMethod);
    const checkoutDisabled = props.cart.length === 0 || props.isProcessing || missingCashierShift || hasUnconfirmedBankPayment || hasIncompletePayment;
    const adjustmentCount = Number(props.discount > 0) + Number(props.voucherCode.length > 0 || Boolean(props.appliedVoucher)) + Number(props.discountDetails.length > 0);

    return {
        showVoucherEntry, setShowVoucherEntry,
        showAdjustments, setShowAdjustments,
        productItems, repairItems, debtItems,
        productQuantity, selectedDebtTotal, saleTotal, selectedDebtCovered,
        surplusAfterSelectedDebt, remainingDebtAfterSelected,
        autoDebtOffset, changeDue, remainingCurrentPayment,
        receivedPaymentMethod, shippingCustomerCharge, shopShippingPayment,
        requiresCashierShift, missingCashierShift,
        hasUnconfirmedBankPayment, hasIncompletePayment,
        checkoutDisabled, adjustmentCount,
    };
}

/** Cart items list section — intended for the right column on desktop */
export function PosCartItemsSection(props: PosCartPanelProps) {
    const state = useCartPanelState(props);

    return (
        <>
            <div className="flex items-center gap-2 border-b px-3 py-2">
                <ShoppingCart size={16} className="text-orange-500" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-600">Hàng hóa đã chọn</h3>
                <span className="ml-auto rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600">{state.productQuantity} SP</span>
                <button onClick={props.onCloseMobileCart} className="p-1 text-gray-400 hover:text-gray-600 md:hidden" aria-label="Đóng thanh toán" title="Đóng thanh toán"><X size={18} /></button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
                {state.productItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-gray-400"><ShoppingCart size={24} className="mx-auto mb-1.5 opacity-40" /><p className="text-xs">Chưa chọn hàng hóa</p></div>
                ) : (
                    <div className="space-y-1.5">
                        {state.productItems.map(item => (
                            <div key={item.cartItemId} className="rounded-lg border border-gray-100 bg-white p-2 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="min-w-0 flex-1"><p className="line-clamp-1 text-xs font-semibold text-gray-800">{item.name}</p>{item.lotCode && <p className="mt-0.5 text-[10px] font-bold text-orange-700">Lô: {item.lotCode}</p>}</div>
                                    <div className="flex shrink-0 items-center rounded-lg border bg-gray-50"><button onClick={() => props.onUpdateQuantity(item.cartItemId, -1)} className="rounded-l-lg p-1 hover:bg-gray-100" aria-label="Giảm số lượng" title="Giảm số lượng"><Minus size={13} /></button><span className="min-w-[24px] px-0.5 text-center text-xs font-bold">{item.quantity}</span><button onClick={() => props.onUpdateQuantity(item.cartItemId, 1)} className="rounded-r-lg p-1 hover:bg-gray-100" aria-label="Tăng số lượng" title="Tăng số lượng"><Plus size={13} /></button></div>
                                    <span className="shrink-0 text-xs font-bold text-orange-600">{props.formatPrice(item.sellingPrice * item.quantity)}</span>
                                    <button onClick={() => props.onRemoveFromCart(item.cartItemId)} className="rounded p-0.5 text-red-400 hover:bg-red-50 hover:text-red-600" aria-label="Xóa khỏi giỏ" title="Xóa khỏi giỏ"><Trash2 size={13} /></button>
                                </div>
                                {item.requiresImei && <div className="mt-1.5 space-y-1.5 border-t border-gray-100 pt-1.5"><p className="text-[10px] font-semibold text-gray-600">IMEI / Serial ({item.quantity})</p>{Array.from({ length: item.quantity }).map((_, index) => <div key={index} className="relative"><input type="text" placeholder={`IMEI/Serial #${index + 1}`} value={item.imeis?.[index] || ''} onChange={event => { const value = event.target.value; props.setCart(previous => previous.map(cartItem => { if (cartItem.cartItemId !== item.cartItemId) return cartItem; const imeis = [...(cartItem.imeis || [])]; imeis[index] = value; return { ...cartItem, imeis }; })); }} className="w-full rounded border py-1 pl-2 pr-7 text-[11px] uppercase" />{(item.imeis?.[index]?.length || 0) < 5 && <AlertTriangle size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-400" />}</div>)}</div>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

/** Payment controls section — intended for the full-width bottom area on desktop */
export function PosPaymentSection(props: PosCartPanelProps) {
    const state = useCartPanelState(props);

    return (
        <div className="space-y-3 px-4 py-3">
            {state.missingCashierShift && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-semibold text-red-700">Chưa mở ca thu ngân. Vào tab Thu ngân và mở ca trước khi thanh toán tiền mặt, chuyển khoản, ví hoặc chi phí ship.</div>}

            {/* Repair items + Debt items (moved here from cart items) */}
            {(state.repairItems.length > 0 || state.debtItems.length > 0) && <div className="grid gap-3 md:grid-cols-2">
                {state.repairItems.length > 0 && <section className="rounded-lg border border-blue-100 bg-blue-50/40 p-2.5"><h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-blue-800"><Wrench size={13} /> Dịch vụ sửa chữa</h3><div className="mt-1.5 space-y-1">{state.repairItems.map((item, index) => { const firstInRepair = Boolean(item.repairTicketId) && state.repairItems.findIndex(candidate => candidate.repairTicketId === item.repairTicketId) === index; return <div key={item.cartItemId} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs"><Wrench size={12} className="shrink-0 text-blue-600" /><span className="min-w-0 flex-1 truncate font-semibold text-blue-900">{item.name}</span><span className="font-bold text-blue-800">{props.formatPrice(item.sellingPrice * item.quantity)}</span>{firstInRepair && item.repairTicketId ? <button onClick={() => props.onRemoveRepairFromCart(item.repairTicketId!)} className="ml-1 text-red-500 hover:text-red-700">Bỏ</button> : <span className="ml-1 text-[10px] text-blue-400">Theo phiếu</span>}</div>; })}</div></section>}
                {state.debtItems.length > 0 && <section className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5"><h3 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800"><Receipt size={13} /> Khoản thu công nợ</h3><div className="mt-1.5 space-y-1">{state.debtItems.map(item => <div key={item.cartItemId} className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 text-xs"><Receipt size={12} className="shrink-0 text-amber-600" /><span className="min-w-0 flex-1 truncate font-semibold text-amber-900">{item.name}</span><span className="font-bold text-amber-800">{props.formatPrice(item.sellingPrice * item.quantity)}</span><button onClick={() => props.onRemoveFromCart(item.cartItemId)} className="ml-1 text-red-500 hover:text-red-700">Bỏ</button></div>)}</div></section>}
            </div>}

            <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                {/* Left: Adjustments + Payment method */}
                <div className="space-y-2">
                    <button type="button" onClick={() => state.setShowAdjustments(previous => !previous)} className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-100"><span>Điều chỉnh hóa đơn{state.adjustmentCount > 0 ? ` (${state.adjustmentCount})` : ''}</span><ChevronDown size={15} className={`transition-transform ${state.showAdjustments ? 'rotate-180' : ''}`} /></button>
                    {state.showAdjustments && <div className="space-y-2 rounded-xl border border-gray-100 p-2.5">{state.productItems.length > 0 && props.discountDetails.length > 0 && <div className="rounded-lg border border-green-200 bg-green-50 p-2.5 text-xs"><p className="font-semibold text-green-700">Giảm phụ kiện tự động:</p>{props.discountDetails.map((detail, index) => <p key={`${detail.productName}-${index}`} className="text-green-600">{detail.productName}: -{detail.discountAmount.toLocaleString('vi-VN')}đ ({detail.ruleName})</p>)}<button type="button" onClick={props.onApplyAutoDiscount} disabled={props.autoDiscountApplied} className="mt-1 w-full rounded-lg bg-green-600 py-1.5 text-xs font-semibold text-white disabled:bg-green-300">{props.autoDiscountApplied ? 'Đã áp dụng giảm' : `Áp dụng giảm ${props.autoDiscountAmount.toLocaleString('vi-VN')}đ`}</button></div>}<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><label className="flex min-w-0 items-center gap-2"><span className="whitespace-nowrap text-sm text-gray-500">Giảm:</span><CurrencyInput value={props.discount || ''} onChange={value => props.setDiscount(value)} placeholder="0" className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-right text-sm" /></label><button type="button" onClick={() => state.setShowVoucherEntry(previous => !previous)} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${state.showVoucherEntry || props.voucherCode || props.appliedVoucher ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}><ChevronDown size={14} className={`transition-transform ${state.showVoucherEntry ? 'rotate-180' : ''}`} />Voucher</button></div>{(state.showVoucherEntry || props.voucherCode || props.voucherStatus) && <div className="space-y-1"><div className="flex gap-1 text-sm"><input type="text" placeholder="Nhập mã giảm giá" value={props.voucherCode} onChange={event => props.setVoucherCode(event.target.value.toUpperCase())} className="min-w-0 flex-1 rounded-lg border px-3 py-1.5 uppercase" /><button onClick={props.onApplyVoucher} className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-600">Áp dụng</button></div>{props.voucherStatus && <div className={`pr-1 text-right text-xs ${props.voucherStatus.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>{props.voucherStatus.message}{props.appliedVoucher && <button onClick={() => { props.setAppliedVoucher(null); props.setVoucherCode(''); props.setVoucherStatus(null); }} className="ml-2 underline">Bỏ</button>}</div>}</div>}</div>}

                    <PosPaymentComposer
                        total={props.total}
                        paymentMode={props.paymentMethod}
                        setPaymentMode={props.setPaymentMethod}
                        cashTendered={props.cashTendered}
                        setCashTendered={props.setCashTendered}
                        bankTransferAmount={props.bankTransferAmount}
                        setBankTransferAmount={props.setBankTransferAmount}
                        bankTransferConfirmed={props.bankTransferConfirmed}
                        setBankTransferConfirmed={props.setBankTransferConfirmed}
                        debtRequested={props.debtRequested}
                        setDebtRequested={props.setDebtRequested}
                        bankReference={props.bankTransferReference}
                        bankAccounts={props.bankAccounts}
                        hasSelectedDebtCollection={state.debtItems.length > 0}
                        formatPrice={props.formatPrice}
                    />
                    {props.paymentBreakdown.length > 1 && <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-2.5 py-2 text-xs text-blue-900">
                        <p className="mb-1 font-bold">Đã nhận theo từng kênh</p>
                        {props.paymentBreakdown.map((entry, index) => <div key={`${entry.method}-${index}`} className="flex justify-between gap-3"><span>{entry.method === 'CASH' ? 'Tiền mặt' : entry.method === 'BANK' ? 'Chuyển khoản' : entry.method}</span><span className="font-semibold">{props.formatPrice(entry.amount)}</span></div>)}
                    </div>}
                    {state.remainingDebtAfterSelected > 0 && state.surplusAfterSelectedDebt > 0 && <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2"><input type="checkbox" id="useSurplusDebt" className="mt-0.5 h-4 w-4 rounded text-blue-600" checked={props.useSurplusToPayDebt} onChange={event => props.setUseSurplusToPayDebt(event.target.checked)} /><label htmlFor="useSurplusDebt" className="flex-1 cursor-pointer text-xs text-blue-800"><b>Khách có nợ cũ: {props.formatPrice(props.customerDebt)}</b><br />Dùng tiền dư <b>{props.formatPrice(Math.min(state.surplusAfterSelectedDebt, state.remainingDebtAfterSelected))}</b> để cấn trừ nợ</label></div>}
                </div>

                {/* Right: Totals + Checkout */}
                <div className="space-y-2">
                    <div className="space-y-1 rounded-xl border border-gray-100 bg-gray-50/70 p-3 text-sm">
                        <div className="flex justify-between text-gray-500"><span>Tạm tính ({state.productQuantity} SP)</span><span>{props.formatPrice(props.subtotal)}</span></div>
                        {props.discount > 0 && <div className="flex justify-between text-green-600"><span>Giảm giá NV</span><span>-{props.formatPrice(props.discount)}</span></div>}
                        {props.autoDiscountApplied && props.autoDiscountAmount > 0 && <div className="flex justify-between text-green-600"><span>Giảm phụ kiện</span><span>-{props.formatPrice(props.autoDiscountAmount)}</span></div>}
                        {props.voucherDiscountAmount > 0 && <div className="flex justify-between font-medium text-blue-600"><span>Voucher giảm giá</span><span>-{props.formatPrice(props.voucherDiscountAmount)}</span></div>}
                        {state.shippingCustomerCharge > 0 && <div className="flex justify-between font-medium text-sky-700"><span>Phí ship khách trả</span><span>+{props.formatPrice(state.shippingCustomerCharge)}</span></div>}
                        {props.repairShipping?.mode === 'shop_absorbs' && props.repairShipping.fee > 0 && <div className="flex justify-between text-sky-700"><span>Phí ship shop chịu</span><span>{props.formatPrice(props.repairShipping.fee)}</span></div>}
                        {props.repairShipping?.mode === 'shop_advance_on_credit' && props.repairShipping.fee > 0 && <div className="flex justify-between text-amber-700"><span>Shop ứng, ghi nợ {props.repairShipping.billingCustomerId || 'đối tác'}</span><span>{props.formatPrice(props.repairShipping.fee)}</span></div>}
                        <div className="flex justify-between border-t pt-1.5 text-lg font-bold text-orange-600"><span>TỔNG</span><span>{props.formatPrice(props.total)}</span></div>
                        {state.selectedDebtTotal > 0 && <div className="flex justify-between text-amber-600"><span>Thu nợ đã chọn</span><span>{props.formatPrice(state.selectedDebtTotal)}</span></div>}
                        {props.deposit > 0 && <div className="flex justify-between pt-1 text-blue-600"><span>Đã nhận ({state.receivedPaymentMethod === 'cash' ? 'tiền mặt' : 'chuyển khoản/QR'})</span><span>{props.formatPrice(props.deposit)}</span></div>}
                        {state.selectedDebtCovered > 0 && <div className="flex justify-between text-amber-700"><span>Đã phân bổ thu nợ</span><span>{props.formatPrice(state.selectedDebtCovered)}</span></div>}
                        {state.autoDebtOffset > 0 && <div className="flex justify-between text-blue-700"><span>Cấn nợ cũ</span><span>{props.formatPrice(state.autoDebtOffset)}</span></div>}
                        {props.deposit > 0 && state.remainingCurrentPayment > 0 && <div className="flex justify-between border-t pt-1 font-bold text-red-600"><span>CÒN LẠI</span><span>{props.formatPrice(state.remainingCurrentPayment)}</span></div>}
                        {props.deposit > 0 && state.changeDue > 0 && <div className="flex justify-between border-t pt-1 font-bold text-green-600"><span>Tiền thối lại</span><span>{props.formatPrice(state.changeDue)}</span></div>}
                    </div>
                    <button onClick={props.onCheckout} disabled={state.checkoutDisabled} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-3 font-bold text-white shadow-lg shadow-orange-200/50 transition-all hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]">{props.isProcessing ? <><span className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/40 border-t-white" /> Đang xử lý...</> : state.missingCashierShift ? <><AlertTriangle size={18} /> Mở ca thu ngân trước</> : <><Receipt size={18} /> Thanh toán & Xuất hóa đơn</>}</button>
                </div>
            </div>
        </div>
    );
}

/** Original combined PosCartPanel — used for Mobile full-screen cart sheet */
export function PosCartPanel(props: PosCartPanelProps) {
    const state = useCartPanelState(props);

    return (
        <>
            <div className="flex items-center gap-2 border-b px-3 py-2">
                <Receipt size={18} className="text-orange-500" />
                <div>
                    <h2 className="text-sm font-bold text-gray-800">Thanh toán</h2>
                    <p className="text-[10px] text-gray-400">Hàng hóa, dịch vụ và khoản thu được tách riêng.</p>
                </div>
                <span className="ml-auto rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-600">{state.productQuantity} SP</span>
                <button onClick={props.onCloseMobileCart} className="p-1 text-gray-400 hover:text-gray-600 md:hidden" aria-label="Đóng thanh toán" title="Đóng thanh toán"><X size={18} /></button>
            </div>

            <div className="flex items-center gap-2 border-b bg-orange-50/50 px-3 py-1.5 text-xs">
                <User size={13} className="shrink-0 text-orange-500" />
                <span className="min-w-0 flex-1 truncate font-semibold text-gray-800 text-xs">{props.customerName || 'Khách lẻ'}</span>
                {props.customerPhone && <span className="inline-flex shrink-0 items-center gap-1 text-gray-500 text-xs"><Phone size={11} /> {props.customerPhone}</span>}
                {props.customerDebt > 0 && <span className="shrink-0 font-bold text-red-600 text-xs">Nợ {props.formatPrice(props.customerDebt)}</span>}
            </div>

            <div className="min-h-[120px] flex-1 space-y-2 overflow-y-auto px-3 py-2">
                <section>
                    <div className="mb-1.5 flex items-center justify-between"><h3 className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-600"><ShoppingCart size={13} /> Hàng hóa đã chọn</h3><span className="text-[11px] font-medium text-gray-400">{state.productQuantity} sản phẩm</span></div>
                    {state.productItems.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-gray-400"><ShoppingCart size={24} className="mx-auto mb-1.5 opacity-40" /><p className="text-xs">Chưa chọn hàng hóa</p></div>
                    ) : (
                        <div className="space-y-1.5">
                            {state.productItems.map(item => {
                                return (
                                    <div key={item.cartItemId} className="rounded-xl border border-gray-100 bg-white p-1.5 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <div className="min-w-0 flex-1"><p className="line-clamp-1 text-xs font-semibold text-gray-800">{item.name}</p>{item.lotCode && <p className="mt-0.5 text-[9px] font-bold text-orange-700">Lô: {item.lotCode}</p>}</div>
                                            <div className="flex shrink-0 items-center rounded-lg border bg-gray-50"><button onClick={() => props.onUpdateQuantity(item.cartItemId, -1)} className="rounded-l-lg p-0.5 hover:bg-gray-100" aria-label="Giảm số lượng" title="Giảm số lượng"><Minus size={13} /></button><span className="min-w-[24px] px-1 text-center text-xs font-bold">{item.quantity}</span><button onClick={() => props.onUpdateQuantity(item.cartItemId, 1)} className="rounded-r-lg p-0.5 hover:bg-gray-100" aria-label="Tăng số lượng" title="Tăng số lượng"><Plus size={13} /></button></div>
                                            <button onClick={() => props.onRemoveFromCart(item.cartItemId)} className="rounded p-0.5 text-red-400 hover:bg-red-50 hover:text-red-600" aria-label="Xóa khỏi giỏ" title="Xóa khỏi giỏ"><Trash2 size={13} /></button>
                                        </div>
                                        {item.requiresImei && <div className="mt-1.5 space-y-1 border-t border-gray-100 pt-1.5"><p className="text-[11px] font-semibold text-gray-600">IMEI / Serial ({item.quantity})</p>{Array.from({ length: item.quantity }).map((_, index) => <div key={index} className="relative"><input type="text" placeholder={`IMEI/Serial #${index + 1}`} value={item.imeis?.[index] || ''} onChange={event => { const value = event.target.value; props.setCart(previous => previous.map(cartItem => { if (cartItem.cartItemId !== item.cartItemId) return cartItem; const imeis = [...(cartItem.imeis || [])]; imeis[index] = value; return { ...cartItem, imeis }; })); }} className="w-full rounded border py-1 pl-2 pr-7 text-xs uppercase" />{(item.imeis?.[index]?.length || 0) < 5 && <AlertTriangle size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-400" />}</div>)}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {state.repairItems.length > 0 && <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-3"><h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-800"><Wrench size={14} /> Dịch vụ sửa chữa đã chọn</h3><div className="mt-2 space-y-2">{state.repairItems.map((item, index) => { const firstInRepair = Boolean(item.repairTicketId) && state.repairItems.findIndex(candidate => candidate.repairTicketId === item.repairTicketId) === index; return <div key={item.cartItemId} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs"><Wrench size={14} className="shrink-0 text-blue-600" /><span className="min-w-0 flex-1 truncate font-semibold text-blue-900">{item.name}</span><span className="font-bold text-blue-800">{props.formatPrice(item.sellingPrice * item.quantity)}</span>{firstInRepair && item.repairTicketId ? <button onClick={() => props.onRemoveRepairFromCart(item.repairTicketId!)} className="ml-1 text-red-500 hover:text-red-700">Bỏ</button> : <span className="ml-1 text-[10px] text-blue-400">Theo phiếu</span>}</div>; })}</div></section>}

                {state.debtItems.length > 0 && <section className="rounded-xl border border-amber-100 bg-amber-50/40 p-3"><h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800"><Receipt size={14} /> Khoản thu công nợ đã chọn</h3><div className="mt-2 space-y-2">{state.debtItems.map(item => <div key={item.cartItemId} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs"><Receipt size={14} className="shrink-0 text-amber-600" /><span className="min-w-0 flex-1 truncate font-semibold text-amber-900">{item.name}</span><span className="font-bold text-amber-800">{props.formatPrice(item.sellingPrice * item.quantity)}</span><button onClick={() => props.onRemoveFromCart(item.cartItemId)} className="ml-1 text-red-500 hover:text-red-700">Bỏ</button></div>)}</div></section>}
            </div>

            <div className="shrink-0 space-y-1.5 border-t bg-white px-3 py-2 sm:px-4 sm:py-2.5">
                {state.missingCashierShift && <div className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-xs font-semibold text-red-700">Chưa mở ca thu ngân. Vào tab Thu ngân và mở ca trước khi thanh toán.</div>}
                <button type="button" onClick={() => state.setShowAdjustments(previous => !previous)} className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 text-left text-xs font-bold text-gray-700 hover:bg-gray-100"><span>Điều chỉnh hóa đơn{state.adjustmentCount > 0 ? ` (${state.adjustmentCount})` : ''}</span><ChevronDown size={14} className={`transition-transform ${state.showAdjustments ? 'rotate-180' : ''}`} /></button>
                {state.showAdjustments && <div className="space-y-1.5 rounded-xl border border-gray-100 p-2">{props.discountDetails.length > 0 && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs"><p className="font-semibold text-green-700">Giảm phụ kiện tự động:</p>{props.discountDetails.map((detail, index) => <p key={`${detail.productName}-${index}`} className="text-green-600">{detail.productName}: -{detail.discountAmount.toLocaleString('vi-VN')}đ ({detail.ruleName})</p>)}<button type="button" onClick={props.onApplyAutoDiscount} disabled={props.autoDiscountApplied} className="mt-1 w-full rounded-lg bg-green-600 py-1 text-xs font-semibold text-white disabled:bg-green-300">{props.autoDiscountApplied ? 'Đã áp dụng giảm' : `Áp dụng giảm ${props.autoDiscountAmount.toLocaleString('vi-VN')}đ`}</button></div>}<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><label className="flex min-w-0 items-center gap-2"><span className="whitespace-nowrap text-xs text-gray-500">Giảm:</span><CurrencyInput value={props.discount || ''} onChange={value => props.setDiscount(value)} placeholder="0" className="min-w-0 flex-1 rounded-lg border px-2.5 py-1 text-right text-xs" /></label><button type="button" onClick={() => state.setShowVoucherEntry(previous => !previous)} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${state.showVoucherEntry || props.voucherCode || props.appliedVoucher ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}><ChevronDown size={13} className={`transition-transform ${state.showVoucherEntry ? 'rotate-180' : ''}`} />Voucher</button></div>{(state.showVoucherEntry || props.voucherCode || props.voucherStatus) && <div className="space-y-1"><div className="flex gap-1 text-xs"><input type="text" placeholder="Nhập mã giảm giá" value={props.voucherCode} onChange={event => props.setVoucherCode(event.target.value.toUpperCase())} className="min-w-0 flex-1 rounded-lg border px-2.5 py-1 uppercase" /><button onClick={props.onApplyVoucher} className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">Áp dụng</button></div>{props.voucherStatus && <div className={`pr-1 text-right text-xs ${props.voucherStatus.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>{props.voucherStatus.message}{props.appliedVoucher && <button onClick={() => { props.setAppliedVoucher(null); props.setVoucherCode(''); props.setVoucherStatus(null); }} className="ml-2 underline">Bỏ</button>}</div>}</div>}</div>}

                <PosPaymentComposer
                    total={props.total}
                    paymentMode={props.paymentMethod}
                    setPaymentMode={props.setPaymentMethod}
                    cashTendered={props.cashTendered}
                    setCashTendered={props.setCashTendered}
                    bankTransferAmount={props.bankTransferAmount}
                    setBankTransferAmount={props.setBankTransferAmount}
                    bankTransferConfirmed={props.bankTransferConfirmed}
                    setBankTransferConfirmed={props.setBankTransferConfirmed}
                    debtRequested={props.debtRequested}
                    setDebtRequested={props.setDebtRequested}
                    bankReference={props.bankTransferReference}
                    bankAccounts={props.bankAccounts}
                    hasSelectedDebtCollection={state.debtItems.length > 0}
                    formatPrice={props.formatPrice}
                />
                {props.paymentBreakdown.length > 1 && <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-2 py-1.5 text-xs text-blue-900">
                    <p className="mb-0.5 font-bold">Đã nhận theo từng kênh</p>
                    {props.paymentBreakdown.map((entry, index) => <div key={`${entry.method}-${index}`} className="flex justify-between gap-3"><span>{entry.method === 'CASH' ? 'Tiền mặt' : entry.method === 'BANK' ? 'Chuyển khoản' : entry.method}</span><span className="font-semibold">{props.formatPrice(entry.amount)}</span></div>)}
                </div>}
                {state.remainingDebtAfterSelected > 0 && state.surplusAfterSelectedDebt > 0 && <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-1.5"><input type="checkbox" id="useSurplusDebtMobile" className="mt-0.5 h-3.5 w-3.5 rounded text-blue-600" checked={props.useSurplusToPayDebt} onChange={event => props.setUseSurplusToPayDebt(event.target.checked)} /><label htmlFor="useSurplusDebtMobile" className="flex-1 cursor-pointer text-xs text-blue-800"><b>Khách có nợ cũ: {props.formatPrice(props.customerDebt)}</b><br />Dùng tiền dư <b>{props.formatPrice(Math.min(state.surplusAfterSelectedDebt, state.remainingDebtAfterSelected))}</b> để cấn trừ nợ</label></div>}
                <div className="space-y-0.5 text-xs"><div className="flex justify-between text-gray-500"><span>Tạm tính ({state.productQuantity} SP)</span><span>{props.formatPrice(props.subtotal)}</span></div>{props.discount > 0 && <div className="flex justify-between text-green-600"><span>Giảm giá NV</span><span>-{props.formatPrice(props.discount)}</span></div>}{props.autoDiscountApplied && props.autoDiscountAmount > 0 && <div className="flex justify-between text-green-600"><span>Giảm phụ kiện</span><span>-{props.formatPrice(props.autoDiscountAmount)}</span></div>}{props.voucherDiscountAmount > 0 && <div className="flex justify-between font-medium text-blue-600"><span>Voucher giảm giá</span><span>-{props.formatPrice(props.voucherDiscountAmount)}</span></div>}{state.shippingCustomerCharge > 0 && <div className="flex justify-between font-medium text-sky-700"><span>Phí ship khách trả</span><span>+{props.formatPrice(state.shippingCustomerCharge)}</span></div>}{props.repairShipping?.mode === 'shop_absorbs' && props.repairShipping.fee > 0 && <div className="flex justify-between text-sky-700"><span>Phí ship shop chịu</span><span>{props.formatPrice(props.repairShipping.fee)}</span></div>}{props.repairShipping?.mode === 'shop_advance_on_credit' && props.repairShipping.fee > 0 && <div className="flex justify-between text-amber-700"><span>Shop ứng, ghi nợ {props.repairShipping.billingCustomerId || 'đối tác'}</span><span>{props.formatPrice(props.repairShipping.fee)}</span></div>}<div className="flex justify-between border-t pt-1 text-base font-bold text-orange-600"><span>TỔNG</span><span>{props.formatPrice(props.total)}</span></div>{state.selectedDebtTotal > 0 && <div className="flex justify-between text-amber-600"><span>Thu nợ đã chọn</span><span>{props.formatPrice(state.selectedDebtTotal)}</span></div>}{props.deposit > 0 && <div className="flex justify-between pt-0.5 text-blue-600"><span>Đã nhận ({state.receivedPaymentMethod === 'cash' ? 'tiền mặt' : 'chuyển khoản/QR'})</span><span>{props.formatPrice(props.deposit)}</span></div>}{state.selectedDebtCovered > 0 && <div className="flex justify-between text-amber-700"><span>Đã phân bổ thu nợ</span><span>{props.formatPrice(state.selectedDebtCovered)}</span></div>}{state.autoDebtOffset > 0 && <div className="flex justify-between text-blue-700"><span>Cấn nợ cũ</span><span>{props.formatPrice(state.autoDebtOffset)}</span></div>}{props.deposit > 0 && state.remainingCurrentPayment > 0 && <div className="flex justify-between border-t pt-0.5 font-bold text-red-600"><span>CÒN LẠI</span><span>{props.formatPrice(state.remainingCurrentPayment)}</span></div>}{props.deposit > 0 && state.changeDue > 0 && <div className="flex justify-between border-t pt-0.5 font-bold text-green-600"><span>Tiền thối lại</span><span>{props.formatPrice(state.changeDue)}</span></div>}</div>
                <button onClick={props.onCheckout} disabled={state.checkoutDisabled} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-200/50 transition-all hover:from-orange-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]">{props.isProcessing ? <><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Đang xử lý...</> : state.missingCashierShift ? <><AlertTriangle size={16} /> Mở ca thu ngân trước</> : <><Receipt size={16} /> Thanh toán & Xuất hóa đơn</>}</button>
            </div>
        </>
    );
}
