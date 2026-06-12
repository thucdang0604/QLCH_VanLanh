import React from 'react';
import Image from 'next/image';
import { Plus, Trash2, X } from 'lucide-react';
import { ReceiptConfig } from './page';
import { WARRANTY_RECEIPT_PREVIEW_FIXTURE } from './warrantyPreviewFixtures';

export interface WarrantyTableRow {
    id: string;
    col1: string;       // Tiêu đề cột 1 (vd: "THAY PIN", "PIN SẠC DỰ PHÒNG", "6 tháng")
    col1Sub?: string;   // Dòng phụ cột 1 (vd: "3 - 12 tháng", "Bảo hành tiêu chuẩn")
    benefits: string[]; // Danh sách quyền lợi (hiển thị dạng bullet)
}

export interface WarrantyTemplateConfig {
    title: string;          // Tiêu đề phiếu (vd: "PHIẾU BẢO HÀNH SỬA CHỮA")
    notesTitle?: string;    // Tiêu đề phần lưu ý (vd: "MIỄN PHÍ TRỌN ĐỜI:")
    notes: string[];        // Danh sách lưu ý
    tableStyle: '2col' | '3col'; // 2 cột (Thời gian | Quyền lợi) hoặc 3 cột (Dịch vụ | Thời gian | Quyền lợi)
    tableHeaders: string[]; // Tên các cột hiển thị trên preview
    tableRows: WarrantyTableRow[];
    footerNote?: string;    // LƯU Ý cuối trang
}

interface WarrantyConfigFormProps {
    config: WarrantyTemplateConfig;
    onChange: (newConfig: WarrantyTemplateConfig) => void;
}

export function WarrantyConfigForm({ config, onChange }: WarrantyConfigFormProps) {
    const updateField = <K extends keyof WarrantyTemplateConfig>(field: K, value: WarrantyTemplateConfig[K]) => {
        onChange({ ...config, [field]: value });
    };

    const updateNote = (index: number, value: string) => {
        const newNotes = [...config.notes];
        newNotes[index] = value;
        updateField('notes', newNotes);
    };

    const addNote = () => updateField('notes', [...config.notes, '']);
    const removeNote = (index: number) => updateField('notes', config.notes.filter((_, i) => i !== index));

    const updateRow = (index: number, updatedRow: WarrantyTableRow) => {
        const newRows = [...config.tableRows];
        newRows[index] = updatedRow;
        updateField('tableRows', newRows);
    };

    const addRow = () => {
        updateField('tableRows', [...config.tableRows, {
            id: Date.now().toString(),
            col1: 'Dịch vụ mới',
            col1Sub: '',
            benefits: ['Quyền lợi 1']
        }]);
    };

    const removeRow = (index: number) => {
        updateField('tableRows', config.tableRows.filter((_, i) => i !== index));
    };

    const updateRowBenefit = (rowIndex: number, benefitIndex: number, value: string) => {
        const row = { ...config.tableRows[rowIndex] };
        row.benefits = [...row.benefits];
        row.benefits[benefitIndex] = value;
        updateRow(rowIndex, row);
    };

    const addRowBenefit = (rowIndex: number) => {
        const row = { ...config.tableRows[rowIndex] };
        row.benefits = [...row.benefits, ''];
        updateRow(rowIndex, row);
    };

    const removeRowBenefit = (rowIndex: number, benefitIndex: number) => {
        const row = { ...config.tableRows[rowIndex] };
        row.benefits = row.benefits.filter((_, i) => i !== benefitIndex);
        updateRow(rowIndex, row);
    };

    return (
        <div className="space-y-6">
            <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <legend className="text-sm font-bold text-gray-900 px-2">📋 Thông tin chung phiếu bảo hành</legend>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Tiêu đề phiếu</label>
                    <input title="Tiêu đề phiếu" type="text" value={config.title}
                        onChange={e => updateField('title', e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none font-black text-center uppercase tracking-wider" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Footer Note (Cuối phiếu)</label>
                    <input title="Footer Note (Cuối phiếu)" type="text" value={config.footerNote || ''}
                        onChange={e => updateField('footerNote', e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                </div>
            </fieldset>

            <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <legend className="text-sm font-bold text-gray-900 px-2">⚠️ Lưu ý & Chính sách chung</legend>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Tiêu đề phần lưu ý (tuỳ chọn)</label>
                    <input title="Tiêu đề phần lưu ý (tuỳ chọn)" type="text" value={config.notesTitle || ''} placeholder="Ví dụ: MIỄN PHÍ TRỌN ĐỜI:"
                        onChange={e => updateField('notesTitle', e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:outline-none" />
                </div>
                <div className="space-y-2 mt-4">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Các dòng lưu ý chi tiết</label>
                    {config.notes.map((note, i) => (
                        <div key={i} className="flex items-start gap-2">
                            <span className="text-xs text-gray-400 font-bold mt-2.5 shrink-0 w-5 text-right">{i + 1}.</span>
                            <textarea
                                title="Các dòng lưu ý chi tiết"
                                rows={2}
                                value={note}
                                onChange={e => updateNote(i, e.target.value)}
                                className="flex-1 px-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:outline-none resize-none"
                            />
                            {config.notes.length > 1 && (
                                <button title="Xóa dòng lưu ý" onClick={() => removeNote(i)}
                                    className="mt-1.5 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <button onClick={addNote}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
                    <Plus size={14} /> Thêm dòng lưu ý
                </button>
            </fieldset>

            <fieldset className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <div className="flex items-center justify-between mb-2">
                    <legend className="text-sm font-bold text-gray-900 px-2">📑 Bảng Quyền lợi bảo hành</legend>
                    <select
                        title="Chọn mẫu bảng"
                        value={config.tableStyle}
                        onChange={e => {
                            const newStyle = e.target.value as '2col' | '3col';
                            let newHeaders = [...config.tableHeaders];
                            if (newStyle === '3col' && newHeaders.length < 3) {
                                newHeaders = ['DỊCH VỤ', 'THỜI GIAN', 'QUYỀN LỢI BẢO HÀNH'];
                            } else if (newStyle === '2col' && newHeaders.length >= 3) {
                                newHeaders = ['THỜI GIAN', 'QUYỀN LỢI BẢO HÀNH'];
                            }
                            onChange({ ...config, tableStyle: newStyle, tableHeaders: newHeaders });
                        }}
                        className="text-xs border rounded px-2 py-1 bg-gray-50 focus:outline-none"
                    >
                        <option value="2col">Mẫu 2 Cột (Thời gian | Quyền lợi)</option>
                        <option value="3col">Mẫu 3 Cột (Dịch vụ | Thời gian | Quyền lợi)</option>
                    </select>
                </div>
                
                <div className="flex gap-2">
                    {config.tableHeaders.map((header, i) => (
                        <input key={i} type="text" value={header}
                            onChange={e => {
                                const newHeaders = [...config.tableHeaders];
                                newHeaders[i] = e.target.value;
                                updateField('tableHeaders', newHeaders);
                            }}
                            placeholder={`Tiêu đề cột ${i+1}`}
                            className="flex-1 px-3 py-2 border rounded-lg text-xs font-bold text-center bg-gray-50 focus:ring-2 focus:ring-orange-500/20 focus:outline-none uppercase" />
                    ))}
                </div>

                <div className="space-y-4 mt-4">
                    {config.tableRows.map((row, i) => (
                        <div key={row.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50 relative">
                            <button title="Xóa nhóm dịch vụ/quyền lợi" onClick={() => removeRow(i)} className="absolute top-3 right-3 text-gray-400 hover:text-red-500">
                                <Trash2 size={16} />
                            </button>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase">Cột 1 (Dịch vụ / Thời gian)</label>
                                    <input title="Cột 1 (Dịch vụ / Thời gian)" type="text" value={row.col1} onChange={e => updateRow(i, { ...row, col1: e.target.value })}
                                        placeholder={config.tableStyle === '3col' ? 'THAY PIN' : '6 tháng'}
                                        className="w-full px-3 py-2 border rounded text-xs focus:outline-none font-bold uppercase" />
                                    <input title="Cột 1 (Dịch vụ / Thời gian)" type="text" value={row.col1Sub || ''} onChange={e => updateRow(i, { ...row, col1Sub: e.target.value })}
                                        placeholder={config.tableStyle === '3col' ? '3 - 12 tháng' : 'Bảo hành tiêu chuẩn'}
                                        className="w-full px-3 py-2 border rounded text-xs focus:outline-none" />
                                </div>
                                <div className="md:col-span-2 space-y-2 border-l pl-4 border-gray-200">
                                    <label className="block text-[10px] font-semibold text-gray-500 uppercase">Danh sách quyền lợi</label>
                                    {row.benefits.map((benefit, bIndex) => (
                                        <div key={bIndex} className="flex gap-2">
                                            <input title="Danh sách quyền lợi" type="text" value={benefit} onChange={e => updateRowBenefit(i, bIndex, e.target.value)}
                                                className="flex-1 px-3 py-1.5 border rounded text-xs focus:outline-none" />
                                            {row.benefits.length > 1 && (
                                                <button title="Xóa quyền lợi" onClick={() => removeRowBenefit(i, bIndex)} className="text-gray-400 hover:text-red-500">
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button onClick={() => addRowBenefit(i)} className="text-[10px] font-semibold text-orange-600 hover:underline">
                                        + Thêm gạch đầu dòng
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <button title="Thêm nhóm dịch vụ/quyền lợi mới" onClick={addRow}
                    className="w-full py-2 border-2 border-dashed border-gray-300 text-gray-500 font-semibold rounded-lg hover:bg-gray-50 hover:text-orange-500 hover:border-orange-300 transition-colors text-sm">
                    + Thêm nhóm dịch vụ/quyền lợi mới
                </button>
            </fieldset>
        </div>
    );
}

// ==========================================
// PREVIEW COMPONENT
// ==========================================

interface WarrantyPreviewProps {
    globalConfig: ReceiptConfig;
    warrantyConfig: WarrantyTemplateConfig;
    type: 'device' | 'repair' | 'accessory';
}

export function WarrantyPreview({ globalConfig, warrantyConfig, type }: WarrantyPreviewProps) {
    const preview = WARRANTY_RECEIPT_PREVIEW_FIXTURE;

    return (
        <div title="Preview" style={{ padding: '0px', fontSize: '10px', lineHeight: '1.4', color: '#000', fontFamily: 'sans-serif' }}>
            {/* HEADER */}
            <div title="Header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '2px solid #000', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {globalConfig.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img title="Logo" src={globalConfig.logoUrl} alt="Logo" style={{ width: 45, height: 45, objectFit: 'contain' }} />
                    ) : (
                        <div style={{ width: 45, height: 45, border: '2px solid #000', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, textAlign: 'center' }}>
                            VĂN<br />LÀNH
                        </div>
                    )}
                    <div>
                        <div style={{ fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>{globalConfig.shopName}</div>
                        <div style={{ fontSize: 7, fontWeight: 700 }}>{globalConfig.shopTitle}</div>
                        <div style={{ fontSize: 7 }}>ĐC: {globalConfig.address}</div>
                        <div style={{ fontSize: 7, fontWeight: 700 }}>CSKH/Zalo: {globalConfig.hotline}</div>
                    </div>
                </div>
                <Image
                    src={preview.qrCodeUrl}
                    alt="QR Code" 
                    width={45}
                    height={45}
                    unoptimized
                    style={{ width: 45, height: 45, objectFit: 'contain', border: '1px solid #000', padding: 2 }} 
                />
            </div>

            {/* TITLE */}
            <h1 style={{ textAlign: 'center', fontWeight: 900, fontSize: 16, textTransform: 'uppercase', letterSpacing: 1, margin: '10px 0' }}>
                {warrantyConfig.title}
            </h1>

            {/* CUSTOMER INFO MOCKUP */}
            <div title="Thông tin khách hàng" style={{ border: '1px dotted #000', borderRadius: 4, padding: 6, marginBottom: 8, fontSize: 9 }}>
                <div title="Thông tin thiết bị" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
                    <div title="Họ & tên" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Họ & tên: <b style={{ float: 'right' }}>{preview.customerName}</b></div>
                    <div title="Điện thoại" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Điện thoại: <b style={{ float: 'right' }}>{preview.phone}</b></div>
                    <div title="Địa chỉ" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2, gridColumn: '1 / -1' }}>Địa chỉ: <b style={{ float: 'right' }}>{preview.address}</b></div>
                    
                    {type === 'accessory' ? (
                        <div title="Sản phẩm" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2, gridColumn: '1 / -1' }}>Sản phẩm: <b style={{ float: 'right' }}>{preview.accessoryProduct}</b></div>
                    ) : (
                        <div title="Thiết bị" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2, gridColumn: '1 / -1' }}>Thiết bị: <b style={{ float: 'right' }}>{preview.deviceModel}</b></div>
                    )}
                    
                    <div title="Màu" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Màu: <b style={{ float: 'right' }}>{preview.color}</b></div>
                    <div title="Số IMEI/SERI" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Số IMEI/SERI: <b style={{ float: 'right' }}>{preview.imei}</b></div>
                    
                    {type === 'device' && (
                        <>
                            <div title="RAM" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>RAM: <b style={{ float: 'right' }}>{preview.ram}</b></div>
                            <div title="Bộ nhớ" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Bộ nhớ: <b style={{ float: 'right' }}>{preview.storage}</b></div>
                            <div title="Giá bán" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Giá bán: <b style={{ float: 'right' }}>{preview.devicePrice}</b></div>
                            <div title="Tình trạng" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Tình trạng: <b style={{ float: 'right' }}>{preview.condition}</b></div>
                            <div title="Phụ kiện" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2, gridColumn: '1 / -1' }}>Phụ kiện: <b style={{ float: 'right' }}>{preview.accessories}</b></div>
                            <div title="Ngày mua" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Ngày mua: <b style={{ float: 'right' }}>{preview.purchaseDate}</b></div>
                            <div title="Thời hạn BH" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Thời hạn BH: <b style={{ float: 'right' }}>{preview.warrantyTerm}</b></div>
                        </>
                    )}
                    {type === 'repair' && (
                        <>
                            <div title="Cấu hình/Pass" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2, gridColumn: '1 / -1' }}>Cấu hình/Pass: <b style={{ float: 'right' }}>{preview.devicePasscode}</b></div>
                            <div title="Dịch vụ" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2, gridColumn: '1 / -1' }}>Dịch vụ: <b style={{ float: 'right' }}>{preview.repairService}</b></div>
                            <div title="Chi phí" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Chi phí: <b style={{ float: 'right' }}>{preview.repairCost}</b></div>
                            <div title="Bảo hành từ" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Bảo hành từ: <b style={{ float: 'right' }}>{preview.warrantyStartDate}</b></div>
                        </>
                    )}
                    {type === 'accessory' && (
                        <>
                            <div title="Giá bán" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Giá bán: <b style={{ float: 'right' }}>250.000đ</b></div>
                            <div title="Ngày mua" style={{ borderBottom: '1px dotted #ccc', paddingBottom: 2 }}>Ngày mua: <b style={{ float: 'right' }}>15/10/2026</b></div>
                        </>
                    )}
                </div>
            </div>

            {/* NOTES */}
            {warrantyConfig.notes.length > 0 && (
                <div title="Lưu ý" style={{ marginBottom: 10, fontSize: 8 }}>
                    {warrantyConfig.notesTitle && <div style={{ fontWeight: 800, textTransform: 'uppercase', marginBottom: 2 }}>{warrantyConfig.notesTitle}</div>}
                    <ul title="Danh sách lưu ý" style={{ paddingLeft: 12, margin: 0 }}>
                        {warrantyConfig.notes.map((note, i) => (
                            <li key={i} style={{ marginBottom: 2 }}>{note}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* TABLE */}
            <div title="Bảng quyền lợi" style={{ border: '1px solid #000', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ display: 'flex', background: '#e5e5e5', borderBottom: '1px solid #000', fontWeight: 800, textAlign: 'center', fontSize: 9 }}>
                    {warrantyConfig.tableHeaders.map((header, i) => {
                        const isLast = i === warrantyConfig.tableHeaders.length - 1;
                        let widthStr = 'auto';
                        if (warrantyConfig.tableStyle === '2col') {
                            widthStr = i === 0 ? '30%' : '70%';
                        } else {
                            widthStr = i === 0 ? '30%' : i === 1 ? '20%' : '50%';
                        }
                        return (
                            <div key={i} style={{ width: widthStr, padding: '4px', borderRight: isLast ? 'none' : '1px solid #000' }}>
                                {header}
                            </div>
                        )
                    })}
                </div>
                {warrantyConfig.tableRows.map((row, i) => {
                    const isLastRow = i === warrantyConfig.tableRows.length - 1;
                    return (
                        <div title="Nhóm dịch vụ/quyền lợi" key={row.id} style={{ display: 'flex', borderBottom: isLastRow ? 'none' : '1px solid #000', fontSize: 8 }}>
                            {warrantyConfig.tableStyle === '2col' ? (
                                <>
                                    <div style={{ width: '30%', padding: '4px', borderRight: '1px solid #000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                                        <div style={{ fontWeight: 800, textTransform: 'uppercase' }}>{row.col1}</div>
                                        {row.col1Sub && <div style={{ fontWeight: 600 }}>{row.col1Sub}</div>}
                                    </div>
                                    <div style={{ width: '70%', padding: '4px 6px' }}>
                                        <ul title="Danh sách quyền lợi" style={{ paddingLeft: 12, margin: 0 }}>
                                            {row.benefits.map((b, bi) => (
                                                <li key={bi} style={{ marginBottom: 2 }}>{b}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ width: '30%', padding: '4px', borderRight: '1px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontWeight: 800, textTransform: 'uppercase' }}>
                                        {row.col1}
                                    </div>
                                    <div style={{ width: '20%', padding: '4px', borderRight: '1px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontWeight: 700 }}>
                                        {row.col1Sub}
                                    </div>
                                    <div style={{ width: '50%', padding: '4px 6px' }}>
                                        <ul title="Danh sách quyền lợi" style={{ paddingLeft: 12, margin: 0 }}>
                                            {row.benefits.map((b, bi) => (
                                                <li key={bi} style={{ marginBottom: 2 }}>{b}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* FOOTER */}
            {warrantyConfig.footerNote && (
                <div title="Lưu ý cuối trang" style={{ textAlign: 'center', fontSize: 8, fontWeight: 700, fontStyle: 'italic', marginBottom: 12 }}>
                    {warrantyConfig.footerNote}
                </div>
            )}
        </div>
    );
}
