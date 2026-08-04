'use client';
/* eslint-disable @next/next/no-img-element -- VietQR is fetched through the same-origin image proxy so a cashier can see a direct loading failure. */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Loader2, X } from 'lucide-react';
import { buildVietQrImageUrl } from '@/lib/vietQr';

type BankAccount = {
    bankId: string;
    accountNo: string;
    accountName: string;
};

type PosVietQrPaymentDialogProps = {
    open: boolean;
    account: BankAccount | null;
    amount: number;
    reference: string;
    onClose: () => void;
    onConfirmReceived: () => void;
    formatPrice: (value: number) => string;
};

export function PosVietQrPaymentDialog({
    open,
    account,
    amount,
    reference,
    onClose,
    onConfirmReceived,
    formatPrice,
}: PosVietQrPaymentDialogProps) {
    const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading');
    const qrImageUrl = account ? buildVietQrImageUrl({
        bankId: account.bankId,
        accountNo: account.accountNo,
        accountName: account.accountName,
        amount,
        addInfo: reference,
    }) : '';

    useEffect(() => {
        if (open) setImageState('loading');
    }, [open, qrImageUrl]);

    if (!open) return null;

    const copyReference = async () => {
        try {
            await navigator.clipboard.writeText(reference);
        } catch {
            // Copy is an optional convenience; the visible reference remains the fallback.
        }
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 p-4" role="dialog" aria-modal="true" aria-labelledby="vietqr-payment-title">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b px-5 py-4">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Thanh toán chuyển khoản</p>
                        <h2 id="vietqr-payment-title" className="mt-0.5 text-xl font-black text-slate-900">Quét mã để thanh toán</h2>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng mã QR" title="Đóng mã QR"><X size={20} /></button>
                </div>

                <div className="space-y-4 px-5 py-5 text-center">
                    <p className="text-3xl font-black text-blue-700">{formatPrice(amount)}</p>
                    {account && qrImageUrl ? <div className="relative mx-auto flex min-h-60 w-60 items-center justify-center rounded-2xl border border-blue-100 bg-white p-2 shadow-sm">
                        {imageState === 'loading' && <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/90 text-blue-600"><Loader2 className="animate-spin" size={26} /></div>}
                        <img src={qrImageUrl} alt={`Mã VietQR thanh toán ${formatPrice(amount)}`} className={`h-56 w-56 object-contain ${imageState === 'error' ? 'hidden' : ''}`} onLoad={() => setImageState('ready')} onError={() => setImageState('error')} />
                        {imageState === 'error' && <div className="space-y-2 px-4 text-left text-sm text-amber-800"><AlertTriangle className="mx-auto text-amber-500" size={28} /><p className="text-center font-bold">Không tải được mã QR</p><p>Kiểm tra lại số tài khoản trong Cài đặt ngân hàng rồi mở lại mã.</p></div>}
                    </div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800"><AlertTriangle className="mb-2 text-amber-500" size={22} /><p className="font-bold">Chưa có tài khoản nhận tiền hợp lệ</p><p className="mt-1">Vui lòng cấu hình ngân hàng mặc định trước khi tạo QR.</p></div>}

                    {account && <div className="rounded-xl bg-slate-50 p-3 text-left text-sm text-slate-700"><p className="font-bold text-slate-900">{account.accountName || account.bankId}</p><p>{account.bankId} · {account.accountNo}</p><div className="mt-2 flex items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-2"><span className="min-w-0 truncate text-xs font-semibold text-blue-700">{reference}</span><button type="button" onClick={copyReference} className="shrink-0 rounded p-1 text-blue-700 hover:bg-blue-50" title="Sao chép nội dung chuyển khoản" aria-label="Sao chép nội dung chuyển khoản"><Copy size={15} /></button></div></div>}
                </div>

                <div className="flex gap-2 border-t bg-slate-50 px-5 py-4">
                    <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-100">Chờ khách quét</button>
                    <button type="button" disabled={!account || !qrImageUrl || imageState === 'error'} onClick={onConfirmReceived} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"><CheckCircle2 size={17} /> Đã vào tài khoản</button>
                </div>
            </div>
        </div>
    );
}
