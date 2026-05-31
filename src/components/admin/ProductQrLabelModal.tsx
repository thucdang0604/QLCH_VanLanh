'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Barcode, Printer, QrCode } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import type { Product } from '@/lib/types';
import { buildProductQrImageUrl, getPrimaryProductCode } from '@/lib/productCodes';

type LabelMode = 'both' | 'qr' | 'barcode';
type PaperPresetId = '40x30' | '50x30' | '58x40' | '58-roll' | 'a4-grid';

interface PaperPreset {
    id: PaperPresetId;
    label: string;
    note: string;
    widthMm: number;
    heightMm: number | null;
    qrMm: number;
    barcodeHeight: number;
    pageSize: string;
    pageMargin: string;
    grid?: boolean;
}

const PAPER_PRESETS: PaperPreset[] = [
    { id: '40x30', label: 'Tem 40 x 30 mm', note: 'Tem nhỏ', widthMm: 40, heightMm: 30, qrMm: 13, barcodeHeight: 25, pageSize: '40mm 30mm', pageMargin: '0' },
    { id: '50x30', label: 'Tem 50 x 30 mm', note: 'Phổ biến', widthMm: 50, heightMm: 30, qrMm: 14, barcodeHeight: 27, pageSize: '50mm 30mm', pageMargin: '0' },
    { id: '58x40', label: 'Tem 58 x 40 mm', note: 'Dễ quét', widthMm: 58, heightMm: 40, qrMm: 18, barcodeHeight: 32, pageSize: '58mm 40mm', pageMargin: '0' },
    { id: '58-roll', label: 'Cuộn 58 mm', note: 'Máy in hóa đơn', widthMm: 58, heightMm: null, qrMm: 18, barcodeHeight: 32, pageSize: '58mm auto', pageMargin: '0' },
    { id: 'a4-grid', label: 'A4 - lưới tem', note: 'Tem 50 x 30 mm', widthMm: 50, heightMm: 30, qrMm: 14, barcodeHeight: 27, pageSize: 'A4', pageMargin: '8mm', grid: true },
];

interface ProductQrLabelModalProps {
    product: (Product & { id: string }) | null;
    onClose: () => void;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
        if (character === '&') return '&amp;';
        if (character === '<') return '&lt;';
        if (character === '>') return '&gt;';
        if (character === '"') return '&quot;';
        return '&#39;';
    });
}

function renderBarcodeSvg(code: string, height: number): string {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, code, {
        format: 'CODE128',
        displayValue: true,
        font: 'Arial',
        fontSize: 12,
        height,
        margin: 0,
    });
    return new XMLSerializer().serializeToString(svg);
}

export default function ProductQrLabelModal({ product, onClose }: ProductQrLabelModalProps) {
    const barcodePreviewRef = useRef<SVGSVGElement>(null);
    const [paperId, setPaperId] = useState<PaperPresetId>('50x30');
    const [labelMode, setLabelMode] = useState<LabelMode>('both');
    const [copies, setCopies] = useState(1);
    const paper = useMemo(() => PAPER_PRESETS.find((item) => item.id === paperId) || PAPER_PRESETS[1], [paperId]);
    const code = product ? getPrimaryProductCode(product) : '';
    const price = product ? product.price_promo || product.price_original || 0 : 0;
    const qrUrl = buildProductQrImageUrl(code, 260);

    useEffect(() => {
        if (!barcodePreviewRef.current || !code || labelMode === 'qr') return;
        JsBarcode(barcodePreviewRef.current, code, {
            format: 'CODE128',
            displayValue: true,
            font: 'Arial',
            fontSize: 12,
            height: paper.barcodeHeight,
            margin: 0,
        });
    }, [code, labelMode, paper.barcodeHeight]);

    if (!product) return null;

    const printLabel = () => {
        const printWindow = window.open('', '_blank', 'width=720,height=720');
        if (!printWindow) return;

        const barcodeSvg = labelMode === 'qr' ? '' : renderBarcodeSvg(code, paper.barcodeHeight);
        const qrMarkup = labelMode === 'barcode' ? '' : `<img class="qr" src="${qrUrl}" alt="${escapeHtml(code)}" />`;
        const barcodeMarkup = labelMode === 'qr' ? '' : `<div class="barcode">${barcodeSvg}</div>`;
        const labelMarkup = `
            <article class="label mode-${labelMode}">
                <div class="media">
                    ${qrMarkup}
                    ${barcodeMarkup}
                </div>
                <div class="name">${escapeHtml(product.name)}</div>
                <div class="price">${price.toLocaleString('vi-VN')}đ</div>
            </article>
        `;
        const labels = Array.from({ length: copies }, () => labelMarkup).join('');
        const fixedHeight = paper.heightMm ? `height: ${paper.heightMm}mm;` : '';
        const gridBody = paper.grid
            ? `display: grid; grid-template-columns: repeat(3, ${paper.widthMm}mm); gap: 2mm; align-content: start;`
            : `width: ${paper.widthMm}mm;`;

        printWindow.document.write(`
            <!doctype html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>Tem sản phẩm ${escapeHtml(code)}</title>
                    <style>
                        @page { size: ${paper.pageSize}; margin: ${paper.pageMargin}; }
                        * { box-sizing: border-box; }
                        body { ${gridBody} margin: 0; padding: 0; color: #111827; font-family: Arial, sans-serif; }
                        .label {
                            width: ${paper.widthMm}mm;
                            ${fixedHeight}
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            overflow: hidden;
                            border: 0.25mm solid #111827;
                            padding: 1.2mm;
                            text-align: center;
                            break-inside: avoid;
                            page-break-inside: avoid;
                            ${paper.grid ? '' : 'page-break-after: always;'}
                        }
                        .media { display: flex; align-items: center; justify-content: center; gap: 1.2mm; min-width: 0; }
                        .qr { width: ${paper.qrMm}mm; height: ${paper.qrMm}mm; flex: 0 0 auto; }
                        .barcode { flex: 1 1 auto; min-width: 0; overflow: hidden; }
                        .barcode svg { display: block; width: 100%; height: auto; max-height: ${paper.qrMm}mm; }
                        .mode-qr .media { margin-bottom: 0.6mm; }
                        .mode-qr .qr { width: ${Math.min(paper.qrMm + 3, 23)}mm; height: ${Math.min(paper.qrMm + 3, 23)}mm; }
                        .mode-barcode .barcode { width: 100%; flex: 0 1 auto; }
                        .mode-barcode .barcode svg { max-height: ${Math.min(paper.qrMm + 4, 23)}mm; }
                        .name { margin-top: 0.7mm; overflow: hidden; font-size: 8pt; font-weight: 700; line-height: 1.05; white-space: nowrap; text-overflow: ellipsis; }
                        .price { margin-top: 0.5mm; font-size: 9pt; font-weight: 800; line-height: 1; }
                        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
                    </style>
                </head>
                <body>
                    ${labels}
                    <script>
                        window.addEventListener('load', () => setTimeout(() => window.print(), 250));
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    return (
        <Modal isOpen={!!product} onClose={onClose} title="In tem sản phẩm" size="lg">
            <div className="grid gap-5 p-6 md:grid-cols-[240px_1fr]">
                <div className="flex flex-col items-center">
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Xem trước</p>
                    <div className="flex min-h-44 w-full flex-col justify-center overflow-hidden border border-gray-800 bg-white p-3 text-center shadow-sm">
                        <div className="flex items-center justify-center gap-2">
                            {labelMode !== 'barcode' && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={qrUrl} alt={code} className={labelMode === 'qr' ? 'h-28 w-28' : 'h-20 w-20'} />
                            )}
                            {labelMode !== 'qr' && (
                                <svg ref={barcodePreviewRef} className={labelMode === 'barcode' ? 'w-full' : 'min-w-0 flex-1'} />
                            )}
                        </div>
                        <p className="mt-2 truncate text-xs font-bold text-gray-900">{product.name}</p>
                        <p className="mt-1 text-sm font-bold text-orange-600">{price.toLocaleString('vi-VN')}đ</p>
                    </div>
                    <p className="mt-2 font-mono text-xs font-semibold text-gray-600">{code}</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Khổ giấy in</label>
                        <select
                            value={paperId}
                            onChange={(event) => setPaperId(event.target.value as PaperPresetId)}
                            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-orange-500 focus:outline-none"
                        >
                            {PAPER_PRESETS.map((item) => (
                                <option key={item.id} value={item.id}>{item.label} - {item.note}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <p className="mb-1.5 text-sm font-semibold text-gray-700">Nội dung tem</p>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { id: 'both', label: 'QR + Barcode', icon: Barcode },
                                { id: 'qr', label: 'Chỉ QR', icon: QrCode },
                                { id: 'barcode', label: 'Chỉ Barcode', icon: Barcode },
                            ] as const).map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setLabelMode(item.id)}
                                        className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                                            labelMode === item.id ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        <Icon size={17} />
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Số lượng tem</label>
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={copies}
                            onChange={(event) => setCopies(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-orange-500 focus:outline-none"
                        />
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Barcode dùng chuẩn <code>CODE128</code>. QR và barcode cùng chứa mã hàng <code>{code}</code>; không chứa thông tin khách hàng.
                    </div>
                </div>

                <div className="flex gap-3 border-t pt-4 md:col-span-2">
                    <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200">
                        Đóng
                    </button>
                    <button type="button" onClick={printLabel} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600">
                        <Printer size={16} />
                        In {copies} tem
                    </button>
                </div>
            </div>
        </Modal>
    );
}
