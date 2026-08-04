'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ExternalLink, Loader2, QrCode } from 'lucide-react';
import type { ContactMethod } from '@/lib/types/contact';
import { resolveZaloProfileQrValue } from '@/lib/zaloContactCardImport';

interface ZaloProfileQrProps {
    contactMethods?: ContactMethod[];
}

export default function ZaloProfileQr({ contactMethods = [] }: ZaloProfileQrProps) {
    const zaloContact = contactMethods.find(method => method.type === 'zalo');
    const qrValue = resolveZaloProfileQrValue(zaloContact || {});
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [qrError, setQrError] = useState(false);

    useEffect(() => {
        let active = true;
        setQrDataUrl('');
        setQrError(false);
        if (!qrValue) return () => { active = false; };

        void import('qrcode')
            .then(({ default: QRCode }) => QRCode.toDataURL(qrValue, {
                errorCorrectionLevel: 'M',
                margin: 1,
                width: 176,
                color: { dark: '#0f172a', light: '#ffffff' },
            }))
            .then(dataUrl => {
                if (active) setQrDataUrl(dataUrl);
            })
            .catch(() => {
                if (active) setQrError(true);
            });

        return () => { active = false; };
    }, [qrValue]);

    if (!qrValue) return null;

    return (
        <section className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <QrCode size={18} className="text-sky-700" />
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900">QR danh thiếp Zalo</h3>
                        <p className="text-xs text-slate-600">Quét bằng app Zalo để mở đúng hồ sơ khách hàng.</p>
                    </div>
                </div>
                <a
                    href={qrValue}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 underline underline-offset-2 hover:text-sky-900"
                >
                    Mở Zalo <ExternalLink size={13} />
                </a>
            </div>
            <div className="mt-3 flex min-h-44 items-center justify-center rounded-lg border border-sky-100 bg-white p-2">
                {qrDataUrl ? (
                    <Image src={qrDataUrl} alt="QR danh thiếp Zalo" width={176} height={176} unoptimized className="h-44 w-44 rounded" />
                ) : qrError ? (
                    <p className="text-xs font-medium text-red-600">Không thể tạo mã QR. Vui lòng thử lại.</p>
                ) : (
                    <Loader2 size={20} className="animate-spin text-sky-600" aria-label="Đang tạo QR Zalo" />
                )}
            </div>
        </section>
    );
}
