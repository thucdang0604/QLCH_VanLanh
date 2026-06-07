'use client';

import React from 'react';
import type { ReceiptConfig } from './PrintableReceipt';
import type { WarrantyTemplateConfig } from '@/app/admin/settings/receipt/WarrantyComponents';
import type { FirestoreDateValue } from '@/lib/types';
import Image from 'next/image';

const formatPrice = (p: number | undefined) => (p && p > 0) ? p.toLocaleString('vi-VN') + 'Ä‘' : 'â€”';
const formatDate = (date: FirestoreDateValue | Date | string | number | null | undefined) => {
    if (!date) return 'â€”';
    try {
        const maybeTimestamp = date as { toDate?: () => Date };
        const d = typeof maybeTimestamp.toDate === 'function' ? maybeTimestamp.toDate() : new Date(date as Date | string | number);
        return d.toLocaleDateString('vi-VN');
    } catch {
        return 'â€”';
    }
};

export interface WarrantyPrintPayload {
    customerName: string;
    customerPhone: string;
    deviceModel: string;
    deviceColor?: string;
    deviceImei?: string;
    devicePasscode?: string; // for repairs
    services?: string;       // for repairs
    totalCost?: number;
    createdAt: FirestoreDateValue | Date | string | number | null;
}

interface PrintableWarrantyProps {
    globalConfig: ReceiptConfig;
    warrantyConfig: WarrantyTemplateConfig;
    type: 'device' | 'repair' | 'accessory';
    payload?: WarrantyPrintPayload;
}

export default function PrintableWarranty({ globalConfig, warrantyConfig, type, payload }: PrintableWarrantyProps) {
    if (!payload) return null; // Wait for data
    const totalCost = Number(payload.totalCost || 0);

    return (
        <div title="Phiếu bảo hành" className="print-warranty hidden print:block bg-white text-black p-4 text-[12px] leading-relaxed mx-auto" style={{ maxWidth: '80mm', fontFamily: 'sans-serif' }}>
            {/* HEADER */}
            <div className="flex items-center justify-between mb-2 border-b-2 border-black pb-2">
                <div className="flex items-center gap-2">
                    {globalConfig.logoUrl ? (
                        <Image src={globalConfig.logoUrl} alt="Logo" width={45} height={45} unoptimized style={{ width: 45, height: 45, objectFit: 'contain' }} />
                    ) : (
                        <div className="w-11 h-11 border-2 border-black rounded-full flex items-center justify-center text-[8px] font-black text-center leading-tight">
                            VÄ‚N<br />LĂ€NH
                        </div>
                    )}
                    <div>
                        <div className="font-black text-[13px] uppercase tracking-wider">{globalConfig.shopName}</div>
                        <div className="text-[7px] font-bold">{globalConfig.shopTitle}</div>
                        <div className="text-[7px]">ÄC: {globalConfig.address}</div>
                        <div className="text-[7px] font-bold">CSKH/Zalo: {globalConfig.hotline}</div>
                    </div>
                </div>
            </div>

            {/* TITLE */}
            <h1 className="text-center font-black text-base uppercase tracking-wider my-3">
                {warrantyConfig.title || 'PHIáº¾U Báº¢O HĂ€NH'}
            </h1>

            {/* CUSTOMER & DEVICE INFO */}
            <div className="border border-dashed border-black rounded p-2 mb-3 text-[10px]">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div className="border-b border-dashed border-gray-400 pb-0.5">KhĂ¡ch hĂ ng: <b className="float-right">{payload.customerName}</b></div>
                    <div className="border-b border-dashed border-gray-400 pb-0.5">Äiá»‡n thoáº¡i: <b className="float-right">{payload.customerPhone}</b></div>

                    {type === 'accessory' ? (
                        <div className="border-b border-dashed border-gray-400 pb-0.5 col-span-2">Sáº£n pháº©m: <b className="float-right">{payload.deviceModel || 'Phá»¥ kiá»‡n'}</b></div>
                    ) : (
                        <div className="border-b border-dashed border-gray-400 pb-0.5 col-span-2">Thiáº¿t bá»‹: <b className="float-right">{payload.deviceModel || 'â€”'}</b></div>
                    )}

                    <div className="border-b border-dashed border-gray-400 pb-0.5">MĂ u: <b className="float-right">{payload.deviceColor || 'â€”'}</b></div>
                    <div className="border-b border-dashed border-gray-400 pb-0.5">Sá»‘ IMEI/SERI: <b className="float-right">{payload.deviceImei || 'â€”'}</b></div>

                    {type === 'repair' && (
                        <>
                            <div className="border-b border-dashed border-gray-400 pb-0.5 col-span-2">Cáº¥u hĂ¬nh/Pass: <b className="float-right">{payload.devicePasscode || 'â€”'}</b></div>
                            <div className="border-b border-dashed border-gray-400 pb-0.5 col-span-2">Dá»‹ch vá»¥: <b className="float-right">{payload.services || 'â€”'}</b></div>
                            <div className="border-b border-dashed border-gray-400 pb-0.5">Chi phĂ­: <b className="float-right">{formatPrice(totalCost)}</b></div>
                            <div className="border-b border-dashed border-gray-400 pb-0.5">Báº£o hĂ nh tá»«: <b className="float-right">{formatDate(payload.createdAt)}</b></div>
                        </>
                    )}

                    {(type === 'device' || type === 'accessory') && (
                        <>
                            <div className="border-b border-dashed border-gray-400 pb-0.5">Chi phĂ­: <b className="float-right">{formatPrice(totalCost)}</b></div>
                            <div className="border-b border-dashed border-gray-400 pb-0.5">NgĂ y mua: <b className="float-right">{formatDate(payload.createdAt)}</b></div>
                        </>
                    )}
                </div>
            </div>

            {/* NOTES */}
            {warrantyConfig.notes && warrantyConfig.notes.length > 0 && (
                <div className="mb-3 text-[9px]">
                    {warrantyConfig.notesTitle && <div className="font-extrabold uppercase mb-1">{warrantyConfig.notesTitle}</div>}
                    <ul className="pl-3 m-0 list-disc">
                        {warrantyConfig.notes.map((note, i) => (
                            <li key={i} className="mb-0.5">{note}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* TABLE */}
            {warrantyConfig.tableRows && warrantyConfig.tableRows.length > 0 && (
                <div className="border border-black rounded overflow-hidden mb-3">
                    <div className="flex bg-gray-200 border-b border-black font-extrabold text-center text-[9px]">
                        {warrantyConfig.tableHeaders.map((header, i) => {
                            const isLast = i === warrantyConfig.tableHeaders.length - 1;
                            let widthStr = 'auto';
                            if (warrantyConfig.tableStyle === '2col') {
                                widthStr = i === 0 ? '30%' : '70%';
                            } else {
                                widthStr = i === 0 ? '30%' : i === 1 ? '20%' : '50%';
                            }
                            return (
                                <div title={header} key={i} style={{ width: widthStr }} className={`p-1 ${!isLast ? 'border-r border-black' : ''}`}>
                                    {header}
                                </div>
                            )
                        })}
                    </div>
                    {warrantyConfig.tableRows.map((row, i) => {
                        const isLastRow = i === warrantyConfig.tableRows.length - 1;
                        return (
                            <div key={row.id} className={`flex text-[8px] ${!isLastRow ? 'border-b border-black' : ''}`}>
                                {warrantyConfig.tableStyle === '2col' ? (
                                    <>
                                        <div className="w-[30%] p-1 border-r border-black flex flex-col items-center justify-center text-center">
                                            <div className="font-extrabold uppercase">{row.col1}</div>
                                            {row.col1Sub && <div className="font-bold">{row.col1Sub}</div>}
                                        </div>
                                        <div className="w-[70%] p-1.5">
                                            <ul className="pl-3 m-0 list-disc">
                                                {row.benefits.map((b, bi) => (
                                                    <li key={bi} className="mb-0.5">{b}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-[30%] p-1 border-r border-black flex items-center justify-center text-center font-extrabold uppercase">
                                            {row.col1}
                                        </div>
                                        <div className="w-[20%] p-1 border-r border-black flex items-center justify-center text-center font-bold">
                                            {row.col1Sub}
                                        </div>
                                        <div className="w-[50%] p-1.5">
                                            <ul className="pl-3 m-0 list-disc">
                                                {row.benefits.map((b, bi) => (
                                                    <li key={bi} className="mb-0.5">{b}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* FOOTER */}
            {warrantyConfig.footerNote && (
                <div className="text-center text-[9px] font-bold italic mb-3">
                    {warrantyConfig.footerNote}
                </div>
            )}

            <div className="text-center mt-6">
                <div className="inline-block border border-dashed border-gray-400 p-2 text-gray-500 rounded text-[8px]">
                    <p>KĂ½ tĂªn xĂ¡c nháº­n</p>
                    <div className="h-10"></div>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    @page { margin: 0; }
                    body * { visibility: hidden; }
                    .print-warranty, .print-warranty * {
                        visibility: visible;
                    }
                    .print-warranty {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    /* Hide header/footer generated by browsers */
                    @page { size: auto; margin: 0mm; }
                }
            `}</style>
        </div>
    );
}
