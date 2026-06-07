'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Barcode, Printer, QrCode } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { useConfig } from '@/lib/ConfigContext';
import type { Product } from '@/lib/types';
import { buildProductQrImageUrl, getCompactProductBarcode, getPrimaryProductCode } from '@/lib/productCodes';

type LabelMode = 'both' | 'qr' | 'barcode';
type LabelTextMode = 'full' | 'compact' | 'code-only';
type BarcodePayloadMode = 'compact' | 'full';
type PaperPresetId = '30x20' | '40x20' | '40x25' | '40x30' | '50x30' | '58x40' | '58-roll' | 'a4-grid' | 'custom';

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
    { id: '30x20', label: 'Tem 30 x 20 mm', note: 'Siêu nhỏ', widthMm: 30, heightMm: 20, qrMm: 9, barcodeHeight: 18, pageSize: '30mm 20mm', pageMargin: '0' },
    { id: '40x20', label: 'Tem 40 x 20 mm', note: 'Nhỏ ngang', widthMm: 40, heightMm: 20, qrMm: 10, barcodeHeight: 20, pageSize: '40mm 20mm', pageMargin: '0' },
    { id: '40x25', label: 'Tem 40 x 25 mm', note: 'Nhỏ phổ biến', widthMm: 40, heightMm: 25, qrMm: 12, barcodeHeight: 22, pageSize: '40mm 25mm', pageMargin: '0' },
    { id: '40x30', label: 'Tem 40 x 30 mm', note: 'Tem nhỏ', widthMm: 40, heightMm: 30, qrMm: 13, barcodeHeight: 25, pageSize: '40mm 30mm', pageMargin: '0' },
    { id: '50x30', label: 'Tem 50 x 30 mm', note: 'Phổ biến', widthMm: 50, heightMm: 30, qrMm: 14, barcodeHeight: 27, pageSize: '50mm 30mm', pageMargin: '0' },
    { id: '58x40', label: 'Tem 58 x 40 mm', note: 'Dễ quét', widthMm: 58, heightMm: 40, qrMm: 18, barcodeHeight: 32, pageSize: '58mm 40mm', pageMargin: '0' },
    { id: '58-roll', label: 'Cuộn 58 mm', note: 'Máy in hóa đơn', widthMm: 58, heightMm: null, qrMm: 18, barcodeHeight: 32, pageSize: '58mm auto', pageMargin: '0' },
    { id: 'a4-grid', label: 'A4 - lưới tem', note: 'Tem 50 x 30 mm', widthMm: 50, heightMm: 30, qrMm: 14, barcodeHeight: 27, pageSize: 'A4', pageMargin: '8mm', grid: true },
    { id: 'custom', label: 'Tự nhập khổ tem', note: 'Theo giấy đang có', widthMm: 40, heightMm: 20, qrMm: 10, barcodeHeight: 20, pageSize: '40mm 20mm', pageMargin: '0' },
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

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function formatMm(value: number): string {
    return Number(value.toFixed(2)).toString();
}

function renderBarcodeSvg(code: string, height: number, fontSize: number): string {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, code, {
        format: 'CODE128',
        displayValue: true,
        font: 'Arial',
        fontSize,
        height,
        margin: 0,
    });
    return new XMLSerializer().serializeToString(svg);
}

export default function ProductQrLabelModal({ product, onClose }: ProductQrLabelModalProps) {
    const { config } = useConfig();
    const barcodePreviewRef = useRef<SVGSVGElement>(null);
    const [paperId, setPaperId] = useState<PaperPresetId>('40x25');
    const [labelMode, setLabelMode] = useState<LabelMode>('both');
    const [textMode, setTextMode] = useState<LabelTextMode>('compact');
    const [copies, setCopies] = useState(1);
    const [customWidthMm, setCustomWidthMm] = useState(40);
    const [customHeightMm, setCustomHeightMm] = useState(20);
    const [safeMarginMm, setSafeMarginMm] = useState(0.8);
    const [contentScale, setContentScale] = useState(88);
    const [labelsPerRow, setLabelsPerRow] = useState<1 | 2>(2);
    const [columnGapMm, setColumnGapMm] = useState(1.4);
    const [barcodePayloadMode, setBarcodePayloadMode] = useState<BarcodePayloadMode>('compact');

    const paper = useMemo(() => {
        if (paperId === 'custom') {
            const widthMm = clampNumber(customWidthMm, 20, 100);
            const heightMm = clampNumber(customHeightMm, 12, 80);
            const compactBase = Math.min(widthMm, heightMm);
            return {
                id: 'custom',
                label: `Tem ${widthMm} x ${heightMm} mm`,
                note: 'Theo giấy đang có',
                widthMm,
                heightMm,
                qrMm: clampNumber(compactBase * 0.48, 7, 22),
                barcodeHeight: clampNumber(heightMm * 0.9, 14, 34),
                pageSize: `${formatMm(widthMm)}mm ${formatMm(heightMm)}mm`,
                pageMargin: '0',
            } satisfies PaperPreset;
        }
        return PAPER_PRESETS.find((item) => item.id === paperId) || PAPER_PRESETS[3];
    }, [customHeightMm, customWidthMm, paperId]);

    const code = product ? getPrimaryProductCode(product) : '';
    const compactBarcodeCode = product ? getCompactProductBarcode(product) : '';
    const barcodeCode = barcodePayloadMode === 'compact' ? compactBarcodeCode : code;
    const shopName = (config.siteName || 'Văn Lành Service').trim();
    const price = product ? product.price_promo || product.price_original || 0 : 0;
    const qrUrl = buildProductQrImageUrl(code, 260);
    const scaleRatio = contentScale / 100;
    const scaledQrMm = paper.qrMm * scaleRatio;
    const scaledBarcodeHeight = Math.round(paper.barcodeHeight * scaleRatio);
    const barcodeFontSize = Math.max(8, Math.round(11 * scaleRatio));
    const printedLabelCount = paper.grid ? copies : copies * labelsPerRow;

    useEffect(() => {
        if (!barcodePreviewRef.current || !barcodeCode || labelMode === 'qr') return;
        JsBarcode(barcodePreviewRef.current, barcodeCode, {
            format: 'CODE128',
            displayValue: true,
            font: 'Arial',
            fontSize: barcodeFontSize,
            height: scaledBarcodeHeight,
            margin: 0,
        });
    }, [barcodeCode, barcodeFontSize, labelMode, scaledBarcodeHeight]);

    if (!product) return null;

    const printLabel = () => {
        const printWindow = window.open('', '_blank', 'width=720,height=720');
        if (!printWindow) return;

        const barcodeSvg = labelMode === 'qr' ? '' : renderBarcodeSvg(barcodeCode, scaledBarcodeHeight, barcodeFontSize);
        const qrMarkup = labelMode === 'barcode' ? '' : `<img class="qr" src="${qrUrl}" alt="${escapeHtml(code)}" />`;
        const barcodeMarkup = labelMode === 'qr' ? '' : `<div class="barcode">${barcodeSvg}</div>`;
        const nameMarkup = textMode === 'code-only' ? '' : `<div class="name">${escapeHtml(product.name)}</div>`;
        const priceMarkup = textMode === 'full' ? `<div class="price">${price.toLocaleString('vi-VN')}đ</div>` : '';
        const codeMarkup = textMode === 'code-only' && labelMode === 'qr' ? `<div class="code">${escapeHtml(code)}</div>` : '';
        const labelMarkup = `
            <article class="label mode-${labelMode} text-${textMode}">
                <div class="brand">${escapeHtml(shopName)}</div>
                <div class="media">
                    ${qrMarkup}
                    ${barcodeMarkup}
                </div>
                ${nameMarkup}
                ${priceMarkup}
                ${codeMarkup}
            </article>
        `;
        const safeMargin = paper.grid ? 0 : clampNumber(safeMarginMm, 0, 3);
        const effectiveLabelsPerRow = paper.grid ? 3 : labelsPerRow;
        const labels = Array.from({ length: paper.grid ? copies : copies * effectiveLabelsPerRow }, () => labelMarkup).join('');
        const effectiveColumnGapMm = paper.grid ? 2 : clampNumber(columnGapMm, 0, 8);
        const pageWidthMm = paper.grid
            ? paper.widthMm * 3 + effectiveColumnGapMm * 2
            : paper.widthMm * effectiveLabelsPerRow + effectiveColumnGapMm * (effectiveLabelsPerRow - 1);
        const labelWidthMm = paper.grid ? paper.widthMm : Math.max(12, paper.widthMm - safeMargin * 2);
        const labelHeightMm = paper.heightMm ? Math.max(10, paper.heightMm - safeMargin * 2) : null;
        const fixedHeight = labelHeightMm ? `height: ${formatMm(labelHeightMm)}mm;` : '';
        const pageSize = paper.grid
            ? paper.pageSize
            : paper.heightMm
                ? `${formatMm(pageWidthMm)}mm ${formatMm(paper.heightMm)}mm`
                : `${formatMm(pageWidthMm)}mm auto`;
        const gridBody = paper.grid
            ? `display: grid; grid-template-columns: repeat(3, ${paper.widthMm}mm); gap: 2mm; align-content: start;`
            : `display: grid; grid-template-columns: repeat(${effectiveLabelsPerRow}, ${formatMm(paper.widthMm)}mm); column-gap: ${formatMm(effectiveColumnGapMm)}mm; row-gap: 0; align-content: start; width: ${formatMm(pageWidthMm)}mm; ${paper.heightMm ? `min-height: ${formatMm(paper.heightMm)}mm;` : ''}`;

        printWindow.document.write(`
            <!doctype html>
            <html>
                <head>
                    <meta charset="utf-8" />
                    <title>Tem sản phẩm ${escapeHtml(code)}</title>
                    <style>
                        @page { size: ${pageSize}; margin: ${paper.pageMargin}; }
                        * { box-sizing: border-box; }
                        body { ${gridBody} margin: 0; padding: 0; color: #111827; font-family: Arial, sans-serif; }
                        body { ${paper.grid ? '' : 'padding: 0;'} }
                        .label {
                            width: ${formatMm(labelWidthMm)}mm;
                            ${fixedHeight}
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            overflow: hidden;
                            border: 0.2mm solid #111827;
                            padding: ${textMode === 'code-only' ? '0.6mm' : '0.8mm'};
                            text-align: center;
                            break-inside: avoid;
                            page-break-inside: avoid;
                            margin: ${formatMm(safeMargin)}mm;
                            ${paper.grid ? '' : 'page-break-after: auto;'}
                        }
                        .brand { margin-bottom: 0.35mm; overflow: hidden; font-size: 5.8pt; font-weight: 900; line-height: 1; letter-spacing: 0; text-transform: uppercase; white-space: nowrap; text-overflow: ellipsis; }
                        .media { display: flex; align-items: center; justify-content: center; gap: 0.8mm; min-width: 0; }
                        .qr { width: ${formatMm(scaledQrMm)}mm; height: ${formatMm(scaledQrMm)}mm; flex: 0 0 auto; }
                        .barcode { flex: 1 1 auto; min-width: 0; overflow: hidden; }
                        .barcode svg { display: block; width: 100%; height: auto; max-height: ${formatMm(Math.max(scaledQrMm, 9))}mm; }
                        .mode-qr .media { margin-bottom: 0.6mm; }
                        .mode-qr .qr { width: ${formatMm(Math.min(scaledQrMm + 3, 23))}mm; height: ${formatMm(Math.min(scaledQrMm + 3, 23))}mm; }
                        .mode-barcode .barcode { width: 100%; flex: 0 1 auto; }
                        .mode-barcode .barcode svg { max-height: ${formatMm(Math.min(scaledQrMm + 4, 23))}mm; }
                        .name { margin-top: 0.45mm; overflow: hidden; font-size: ${textMode === 'full' ? '7pt' : '6.5pt'}; font-weight: 700; line-height: 1.05; white-space: nowrap; text-overflow: ellipsis; }
                        .price { margin-top: 0.3mm; font-size: 7.5pt; font-weight: 800; line-height: 1; }
                        .code { margin-top: 0.4mm; overflow: hidden; font-size: 6.5pt; font-weight: 700; line-height: 1; white-space: nowrap; text-overflow: ellipsis; }
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
                        <p className="mb-1 truncate text-[10px] font-black uppercase leading-none text-gray-900">{shopName}</p>
                        <div className="flex items-center justify-center gap-2">
                            {labelMode !== 'barcode' && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={qrUrl} alt={code} className={labelMode === 'qr' ? 'h-24 w-24' : 'h-16 w-16'} />
                            )}
                            {labelMode !== 'qr' && (
                                <svg ref={barcodePreviewRef} className={labelMode === 'barcode' ? 'w-full' : 'min-w-0 flex-1'} />
                            )}
                        </div>
                        {textMode !== 'code-only' && <p className="mt-2 truncate text-xs font-bold text-gray-900">{product.name}</p>}
                        {textMode === 'full' && <p className="mt-1 text-sm font-bold text-orange-600">{price.toLocaleString('vi-VN')}đ</p>}
                        {textMode === 'code-only' && labelMode === 'qr' && <p className="mt-2 truncate font-mono text-xs font-bold text-gray-900">{code}</p>}
                    </div>
                    <p className="mt-2 font-mono text-xs font-semibold text-gray-600">Mã: {code}</p>
                    <p className="mt-1 text-xs text-gray-500">{paper.label}, {paper.grid ? 'A4' : `${labelsPerRow} tem/dòng`}, scale {contentScale}%</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Khổ giấy in</label>
                        <select
                            title="Khổ giấy in"
                            value={paperId}
                            onChange={(event) => setPaperId(event.target.value as PaperPresetId)}
                            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-orange-500 focus:outline-none"
                        >
                            {PAPER_PRESETS.map((item) => (
                                <option key={item.id} value={item.id}>{item.label} - {item.note}</option>
                            ))}
                        </select>
                    </div>

                    {paperId === 'custom' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Rộng mỗi tem (mm)</label>
                                <input
                                    title="Rộng mỗi tem"
                                    type="number"
                                    min={20}
                                    max={100}
                                    step={1}
                                    value={customWidthMm}
                                    onChange={(event) => setCustomWidthMm(clampNumber(Number(event.target.value), 20, 100))}
                                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-orange-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Cao mỗi tem (mm)</label>
                                <input
                                    title="Cao mỗi tem"
                                    type="number"
                                    min={12}
                                    max={80}
                                    step={1}
                                    value={customHeightMm}
                                    onChange={(event) => setCustomHeightMm(clampNumber(Number(event.target.value), 12, 80))}
                                    className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-orange-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {!paper.grid && (
                        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                            <div>
                                <p className="mb-1.5 text-sm font-semibold text-gray-700">Bố cục giấy</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {([1, 2] as const).map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            title={`${value} tem trên một dòng`}
                                            onClick={() => setLabelsPerRow(value)}
                                            className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                                                labelsPerRow === value ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            {value} tem/dòng
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Khe giữa tem</label>
                                <input
                                    title="Khe giữa hai tem"
                                    type="number"
                                    min={0}
                                    max={8}
                                    step={0.2}
                                    value={columnGapMm}
                                    onChange={(event) => setColumnGapMm(clampNumber(Number(event.target.value), 0, 8))}
                                    className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-orange-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    )}

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
                                        title={item.label}
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

                    {labelMode !== 'qr' && (
                        <div>
                            <p className="mb-1.5 text-sm font-semibold text-gray-700">Mã vạch</p>
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { id: 'compact', label: `Ngắn: ${compactBarcodeCode}` },
                                    { id: 'full', label: `Đầy đủ: ${code}` },
                                ] as const).map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        title={item.label}
                                        onClick={() => setBarcodePayloadMode(item.id)}
                                        className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                                            barcodePayloadMode === item.id ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <p className="mb-1.5 text-sm font-semibold text-gray-700">Chi tiết chữ</p>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { id: 'compact', label: 'Tên ngắn' },
                                { id: 'code-only', label: 'Chỉ mã' },
                                { id: 'full', label: 'Tên + giá' },
                            ] as const).map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    title={item.label}
                                    onClick={() => setTextMode(item.id)}
                                    className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors ${
                                        textMode === item.id ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Co nội dung: {contentScale}%</label>
                            <input
                                title="Co nội dung"
                                type="range"
                                min={70}
                                max={100}
                                step={1}
                                value={contentScale}
                                onChange={(event) => setContentScale(clampNumber(Number(event.target.value), 70, 100))}
                                className="w-full accent-orange-500"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-semibold text-gray-700">Lề an toàn (mm)</label>
                            <input
                                title="Lề an toàn"
                                type="number"
                                min={0}
                                max={3}
                                step={0.2}
                                value={safeMarginMm}
                                onChange={(event) => setSafeMarginMm(clampNumber(Number(event.target.value), 0, 3))}
                                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-orange-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">{labelsPerRow === 2 && !paper.grid ? 'Số hàng tem' : 'Số lượng tem'}</label>
                        <input
                            title={labelsPerRow === 2 && !paper.grid ? 'Số hàng tem' : 'Số lượng tem'}
                            type="number"
                            min={1}
                            max={100}
                            value={copies}
                            onChange={(event) => setCopies(Math.max(1, Math.min(100, Number(event.target.value) || 1)))}
                            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-orange-500 focus:outline-none"
                        />
                        {labelsPerRow === 2 && !paper.grid && (
                            <p className="mt-1 text-xs text-gray-500">
                                {copies} hàng = {printedLabelCount} tem giống nhau.
                            </p>
                        )}
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        QR dùng mã đầy đủ <code>{code}</code>; barcode có thể dùng mã ngắn <code>{compactBarcodeCode}</code> để dễ scan trên tem nhỏ. POS đã nhận cả hai mã.
                    </div>
                </div>

                <div className="flex gap-3 border-t pt-4 md:col-span-2">
                    <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200">
                        Đóng
                    </button>
                    <button type="button" onClick={printLabel} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600">
                        <Printer size={16} />
                        {labelsPerRow === 2 && !paper.grid ? `In ${copies} hàng (${printedLabelCount} tem)` : `In ${printedLabelCount} tem`}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
