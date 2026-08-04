import { useEffect, useState } from 'react';
import { AlertTriangle, Banknote, ChevronDown, CreditCard, QrCode } from 'lucide-react';
import CurrencyInput from '@/components/admin/CurrencyInput';
import { buildPosPaymentBreakdown } from '@/lib/posPaymentBreakdown';
import { PosVietQrPaymentDialog } from './PosVietQrPaymentDialog';

export type PosPaymentMode = 'cash' | 'bank' | 'momo' | 'installment' | 'debt';

type BankAccount = {
    bankId: string;
    accountNo: string;
    accountName: string;
    isDefault?: boolean;
};

type PosPaymentComposerProps = {
    total: number;
    paymentMode: PosPaymentMode;
    setPaymentMode: (value: PosPaymentMode) => void;
    cashTendered: number;
    setCashTendered: (value: number) => void;
    bankTransferAmount: number;
    setBankTransferAmount: (value: number) => void;
    bankTransferConfirmed: boolean;
    setBankTransferConfirmed: (value: boolean) => void;
    debtRequested: boolean;
    setDebtRequested: (value: boolean) => void;
    bankReference: string;
    bankAccounts: BankAccount[];
    hasSelectedDebtCollection: boolean;
    formatPrice: (value: number) => string;
};

function resolveAccounts(accounts: BankAccount[]) {
    const defaults = accounts.filter(account => account.isDefault);
    return defaults.length > 0 ? defaults : accounts.slice(0, 1);
}

export function PosPaymentComposer({
    total,
    paymentMode,
    setPaymentMode,
    cashTendered,
    setCashTendered,
    bankTransferAmount,
    setBankTransferAmount,
    bankTransferConfirmed,
    setBankTransferConfirmed,
    debtRequested,
    setDebtRequested,
    bankReference,
    bankAccounts,
    hasSelectedDebtCollection,
    formatPrice,
}: PosPaymentComposerProps) {
    const [showOtherMethods, setShowOtherMethods] = useState(false);
    const [showPartialBankAmount, setShowPartialBankAmount] = useState(false);
    const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);
    const payment = buildPosPaymentBreakdown({ total, cashTendered, bankTransferAmount, bankReference });
    const accounts = resolveAccounts(bankAccounts);
    const selectedAccount = accounts[0] || null;
    const remainingAfterCash = Math.max(0, total - payment.cashApplied);
    const hasBankPayment = payment.bankApplied > 0;
    const showCashInput = paymentMode === 'cash' || cashTendered > 0;
    const canOfferDebt = !hasSelectedDebtCollection && payment.remainingAmount > 0;

    useEffect(() => {
        if (!hasBankPayment || bankTransferConfirmed) {
            setIsQrDialogOpen(false);
        }
    }, [bankTransferConfirmed, hasBankPayment]);

    const chooseCash = () => {
        setPaymentMode('cash');
        setDebtRequested(false);
        setBankTransferAmount(0);
        setBankTransferConfirmed(false);
        setIsQrDialogOpen(false);
    };
    const chooseBank = () => {
        setPaymentMode('bank');
        setDebtRequested(false);
        setBankTransferAmount(remainingAfterCash);
        setBankTransferConfirmed(false);
        setIsQrDialogOpen(true);
    };
    const chooseDebt = () => {
        setPaymentMode('debt');
        setDebtRequested(true);
    };
    const chooseOtherMethod = (method: 'momo' | 'installment') => {
        setPaymentMode(method);
        setCashTendered(0);
        setBankTransferAmount(0);
        setBankTransferConfirmed(false);
        setDebtRequested(false);
        setIsQrDialogOpen(false);
    };

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={chooseCash} className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${paymentMode === 'cash' ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}><Banknote size={15} /> Tiền mặt</button>
                <button type="button" onClick={chooseBank} className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${paymentMode === 'bank' || hasBankPayment ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}><CreditCard size={15} /> Chuyển khoản</button>
            </div>

            {showCashInput && <label className="block rounded-lg border border-orange-200 bg-orange-50/60 p-2"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-orange-700">Khách đưa tiền mặt</span><CurrencyInput value={cashTendered || ''} onChange={value => { setCashTendered(value); setBankTransferConfirmed(false); }} placeholder="0" className="w-full rounded-lg border border-orange-300 bg-white px-3 py-2.5 text-right text-xl font-bold text-orange-700 shadow-sm focus:ring-2 focus:ring-orange-500/20" /></label>}

            {cashTendered > 0 && payment.remainingAmount > 0 && !hasBankPayment && <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs"><span className="font-semibold text-gray-700">Còn {formatPrice(payment.remainingAmount)}</span><div className="flex items-center gap-2"><button type="button" onClick={chooseBank} className="font-bold text-blue-700 hover:underline">+ Chuyển khoản</button>{canOfferDebt && <button type="button" onClick={chooseDebt} className="font-bold text-red-700 hover:underline">Ghi nợ</button>}</div></div>}

            {hasBankPayment && <div className="rounded-xl border border-blue-200 bg-blue-50 p-2.5">
                <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-blue-800">Chuyển khoản</p><p className="mt-0.5 text-sm font-black text-blue-900">{formatPrice(payment.bankApplied)}</p><p className="text-[10px] text-blue-700">Nội dung: {bankReference}</p></div><div className="flex flex-col items-end gap-1"><button type="button" onClick={() => setShowPartialBankAmount(value => !value)} className="text-xs font-semibold text-blue-700 hover:underline">{showPartialBankAmount ? 'Dùng số còn lại' : 'Chuyển một phần'}</button>{!bankTransferConfirmed && <button type="button" onClick={() => setIsQrDialogOpen(true)} className="text-xs font-bold text-blue-700 hover:underline">Mở mã QR</button>}</div></div>
                {showPartialBankAmount && <label className="mt-2 block"><span className="mb-1 block text-[11px] font-semibold text-blue-800">Số tiền chuyển khoản</span><CurrencyInput value={bankTransferAmount || ''} onChange={value => { setBankTransferAmount(value); setBankTransferConfirmed(false); setIsQrDialogOpen(true); }} placeholder="0" className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-right font-bold text-blue-800" /></label>}
                {selectedAccount ? <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs font-semibold text-blue-900"><input type="checkbox" checked={bankTransferConfirmed} onChange={event => { const confirmed = event.target.checked; setBankTransferConfirmed(confirmed); setIsQrDialogOpen(!confirmed); }} className="h-4 w-4 rounded border-blue-300 text-blue-600" />{bankTransferConfirmed ? <>Đã ghi nhận khách chuyển khoản <b>{formatPrice(payment.bankApplied)}</b>. Bỏ chọn để quét lại mã QR.</> : 'Đã xác nhận tiền vào tài khoản'}</label> : <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">Chưa có tài khoản VietQR mặc định. Vui lòng cấu hình ngân hàng trước.</p>}
            </div>}

            {debtRequested && payment.remainingAmount > 0 && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800"><AlertTriangle className="mt-0.5 shrink-0" size={16} /><div><p className="font-bold">Xác nhận ghi nợ trước khi thanh toán</p><p>Đã thu: <b>{formatPrice(payment.paidAmount)}</b> · Sẽ ghi nợ: <b>{formatPrice(payment.remainingAmount)}</b>.</p></div></div>}

            <button type="button" onClick={() => setShowOtherMethods(value => !value)} className="flex w-full items-center justify-between px-1 text-xs font-semibold text-gray-500 hover:text-gray-700"><span>Phương thức khác</span><ChevronDown size={14} className={`transition-transform ${showOtherMethods ? 'rotate-180' : ''}`} /></button>
            {showOtherMethods && <div className="grid grid-cols-3 gap-1.5"><button type="button" onClick={() => chooseOtherMethod('momo')} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${paymentMode === 'momo' ? 'bg-pink-600 text-white' : 'bg-pink-50 text-pink-700'}`}><QrCode size={14} className="mx-auto mb-0.5" />MoMo</button><button type="button" onClick={() => chooseOtherMethod('installment')} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${paymentMode === 'installment' ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`}><CreditCard size={14} className="mx-auto mb-0.5" />Trả góp</button><button type="button" disabled={hasSelectedDebtCollection} onClick={chooseDebt} className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${paymentMode === 'debt' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'} disabled:cursor-not-allowed disabled:opacity-50`}><AlertTriangle size={14} className="mx-auto mb-0.5" />Ghi nợ</button></div>}

            <PosVietQrPaymentDialog
                open={isQrDialogOpen && hasBankPayment}
                account={selectedAccount}
                amount={payment.bankApplied}
                reference={bankReference}
                onClose={() => setIsQrDialogOpen(false)}
                onConfirmReceived={() => { setBankTransferConfirmed(true); setIsQrDialogOpen(false); }}
                formatPrice={formatPrice}
            />
        </div>
    );
}
