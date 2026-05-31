'use client';

import { useState, useRef } from 'react';
import { X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { collection, addDoc, serverTimestamp, getDocs, query, where, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useConfig } from '@/lib/ConfigContext';
import { TaxonomyNode } from '@/lib/types';
import { buildProductCodeFromId, normalizeProductCode } from '@/lib/productCodes';
import { createProductWithCodes } from '@/lib/productCodeRegistry';

type ImportMode = 'product' | 'service';

interface ParsedRow {
    rowNum: number;
    data: Record<string, string>;
    errors: string[];
    categoryIds?: string[];
    category?: string;
    finalCategoryName?: string;
}

const PRODUCT_HEADERS = ['Mã SP', 'Tên SP', 'Thương hiệu', 'Danh mục', 'Giá gốc', 'Giá KM', 'Giá vốn', 'NCC', 'Tồn kho', 'Tình trạng', 'Mô tả'];
const SERVICE_HEADERS = ['Tên DV', 'Dòng máy', 'Danh mục', 'Giá gốc', 'Giá KM', 'Bảo hành', 'Thời gian sửa', 'Mô tả'];

function generateTemplate(mode: ImportMode) {
    const headers = mode === 'product' ? PRODUCT_HEADERS : SERVICE_HEADERS;
    
    // Example data
    const exampleProduct = ['VL-IP15PM-256', 'iPhone 15 Pro Max 256GB', 'Apple', 'Điện thoại > Apple > iPhone 15 Series', '29000000', '28500000', '27000000', 'NCC VN/A', '10', 'new', 'Hàng chính hãng VN/A nguyên seal'];
    const exampleService = ['Thay pin iPhone 15 Pro Max', 'iPhone 15 Pro Max', 'Sửa chữa > Điện thoại > Thay Pin', '1500000', '1450000', '6 tháng', '30 phút', 'Pin dung lượng cao, zin bóc máy'];
    const exampleRow = mode === 'product' ? exampleProduct : exampleService;
    
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    
    // Set column widths
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    ws['!cols'][headers.indexOf('Danh mục')] = { wch: 40 };
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mode === 'product' ? 'Sản phẩm' : 'Dịch vụ');

    // Add instruction sheet
    const instructions = [
        ['HƯỚNG DẪN NHẬP DỮ LIỆU TỪ EXCEL', '', ''],
        ['', '', ''],
        ['CỘT', 'HƯỚNG DẪN', 'VÍ DỤ'],
        ['Tên SP / Tên DV', 'Bắt buộc. Nhập tên đầy đủ không được trùng lặp.', mode === 'product' ? 'iPhone 15 Pro Max 256GB' : 'Thay màn hình iPhone 13'],
        ['Danh mục', 'Nhập theo cấp bậc từ lớn đến nhỏ, cách nhau bởi dấu " > ". Giúp hệ thống tự động đưa vào đúng cấu trúc cây 3 tầng.', mode === 'product' ? 'Điện thoại > Apple > iPhone 15 Series' : 'Sửa chữa > Điện thoại > Thay Màn Hình'],
        ['Giá gốc', 'Bắt buộc. Chỉ nhập số, không chứa dấu phẩy hay chữ.', '29000000'],
        ['Giá KM', 'Giá sau khi giảm, chỉ nhập số.', '28500000'],
        mode === 'product' ? ['Giá vốn', 'Giá trị đầu vào để tính lợi nhuận. Chỉ nhập số.', '27000000'] : ['Bảo hành', 'Thời gian bảo hành.', '6 tháng'],
        mode === 'product' ? ['Tồn kho', 'Số lượng có sẵn ban đầu.', '10'] : ['Thời gian sửa', 'Thời gian dự kiến.', '30 phút'],
        mode === 'product' ? ['Tình trạng', 'Chỉ nhập một trong 3 giá trị: new (Mới), like-new (Cũ 99%), used (Cũ).', 'new'] : [],
        ['LƯU Ý', 'Dòng số 2 ở sheet đầu tiên là dữ liệu mẫu, vui lòng xóa hoặc ghi đè dòng đó trước khi tải lên.', '']
    ].filter(row => row.length > 0);

    const wsInstruct = XLSX.utils.aoa_to_sheet(instructions);
    wsInstruct['!cols'] = [{ wch: 20 }, { wch: 80 }, { wch: 40 }];
    
    XLSX.utils.book_append_sheet(wb, wsInstruct, 'Huong_Dan');
    XLSX.writeFile(wb, `mau_import_${mode === 'product' ? 'san_pham' : 'dich_vu'}.xlsx`);
}

function resolveCategoryPath(pathStr: string, taxonomy: TaxonomyNode[]): { categoryIds: string[], category: string } {
    if (!pathStr || !taxonomy) return { categoryIds: [], category: pathStr };
    
    const parts = pathStr.split('>').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return { categoryIds: [], category: '' };
    
    let currentNodes = taxonomy;
    const ids: string[] = [];
    let matchedLeafName = '';
    
    for (const part of parts) {
        const matchedNode = currentNodes.find(n => n.name.toLowerCase() === part.toLowerCase());
        if (matchedNode) {
            ids.push(matchedNode.id);
            matchedLeafName = matchedNode.name;
            currentNodes = matchedNode.children || [];
        } else {
            break;
        }
    }
    
    if (ids.length === parts.length) {
        return { categoryIds: ids, category: matchedLeafName };
    }
    
    return { categoryIds: [], category: pathStr };
}

export default function ExcelImportModal({ mode, onClose }: { mode: ImportMode; onClose: () => void }) {
    const { user } = useAuth();
    const { config } = useConfig();
    const fileRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<'upload' | 'validating' | 'preview' | 'importing' | 'done'>('upload');
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [importResults, setImportResults] = useState({ success: 0, failed: 0 });

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        setStep('validating');
        
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const wb = XLSX.read(evt.target?.result, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
                if (json.length === 0) { toast.error('File rỗng'); setStep('upload'); return; }
                
                const nameKey = mode === 'product' ? 'Tên SP' : 'Tên DV';
                
                // Collect names and check file duplicates
                const namesInFile = json.map(r => r[nameKey]?.trim()).filter(Boolean);
                const seenNames = new Set<string>();
                const duplicateInFileNames = new Set<string>();
                for (const n of namesInFile) {
                    if (seenNames.has(n)) duplicateInFileNames.add(n);
                    seenNames.add(n);
                }
                
                // Check Firestore duplicates
                const existingNamesInDb = new Set<string>();
                const uniqueNames = Array.from(seenNames);
                const chunkSize = 30;
                const collectionName = mode === 'product' ? 'products' : 'services';
                
                for (let i = 0; i < uniqueNames.length; i += chunkSize) {
                    const chunk = uniqueNames.slice(i, i + chunkSize);
                    if (chunk.length === 0) continue;
                    const q = query(collection(db, collectionName), where('name', 'in', chunk));
                    const snap = await getDocs(q);
                    snap.forEach(doc => {
                        const data = doc.data();
                        if (data.status !== 'inactive') {
                            existingNamesInDb.add(data.name);
                        }
                    });
                }
                
                const taxonomy = mode === 'product' ? config?.taxonomy?.retail : config?.taxonomy?.service;
                
                const parsed = json.map((row, i) => {
                    const rowNum = i + 2;
                    const errors: string[] = [];
                    const name = row[nameKey]?.trim();
                    
                    if (!name) errors.push(`Thiếu ${nameKey}`);
                    else if (duplicateInFileNames.has(name)) errors.push(`Tên trùng lặp trong file`);
                    else if (existingNamesInDb.has(name)) errors.push(`Tên đã tồn tại trên hệ thống`);
                    
                    const price = Number(row['Giá gốc']);
                    if (!price || price < 0) errors.push('Giá gốc không hợp lệ');
                    if (mode === 'product') {
                        const stock = Number(row['Tồn kho']);
                        if (row['Tồn kho'] && (isNaN(stock) || stock < 0)) errors.push('Tồn kho không hợp lệ');
                    }
                    
                    const pathStr = row['Danh mục']?.trim() || '';
                    const { categoryIds, category } = resolveCategoryPath(pathStr, taxonomy || []);
                    
                    if (pathStr && categoryIds.length === 0) {
                        errors.push('Danh mục không tồn tại hoặc sai cấu trúc (VD: Điện thoại > Apple).');
                    }
                    
                    return { rowNum, data: row, errors, categoryIds, category: pathStr, finalCategoryName: category };
                });
                
                setRows(parsed);
                setStep('preview');
            } catch (error) {
                console.error("Lỗi parse/validate:", error);
                toast.error("Có lỗi xảy ra khi đọc file.");
                setStep('upload');
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleImport = async () => {
        const valid = rows.filter(r => r.errors.length === 0);
        if (valid.length === 0) { toast.error('Không có dòng hợp lệ'); return; }

        setStep('importing');
        setProgress({ done: 0, total: valid.length });
        let success = 0, failed = 0;

        const BATCH = 10;
        for (let i = 0; i < valid.length; i += BATCH) {
            const batch = valid.slice(i, i + BATCH);
            const promises = batch.map(async (row) => {
                try {
                    const finalCat = row.finalCategoryName || row.category || '';
                    const finalCatIds = row.categoryIds || [];
                    
                    if (mode === 'product') {
                        const stock = Number(row.data['Tồn kho']) || 0;
                        const productRef = doc(collection(db, 'products'));
                        const productCode = normalizeProductCode(row.data['Mã SP']) || buildProductCodeFromId(productRef.id);
                        await createProductWithCodes(productRef.id, {
                            sku: productCode,
                            barcode: productCode,
                            productCode,
                            name: row.data['Tên SP'].trim(),
                            brand: row.data['Thương hiệu']?.trim() || '',
                            category: finalCat,
                            categoryIds: finalCatIds,
                            price_original: Number(row.data['Giá gốc']) || 0,
                            price_promo: Number(row.data['Giá KM']) || 0,
                            costPrice: Number(row.data['Giá vốn']) || 0,
                            supplier: row.data['NCC']?.trim() || '',
                            stock,
                            held: 0,
                            condition: (row.data['Tình trạng']?.trim() || 'new') as 'new' | 'like-new' | 'used',
                            description: row.data['Mô tả']?.trim() || '',
                            specs: {},
                            images: [],
                            status: 'active',
                            sold: 0,
                        }, [productCode]);
                        if (stock > 0) {
                            await addDoc(collection(db, 'inventory_logs'), {
                                productId: productRef.id, productName: row.data['Tên SP'].trim(),
                                quantity: stock, costPriceAtLog: Number(row.data['Giá vốn']) || 0,
                                type: 'IMPORT', referenceId: 'excel-import', referenceType: 'import_receipt',
                                createdBy: user?.uid || '', createdByName: user?.displayName || '',
                                createdAt: serverTimestamp(),
                            });
                        }
                    } else {
                        await addDoc(collection(db, 'services'), {
                            name: row.data['Tên DV'].trim(),
                            device_model: row.data['Dòng máy']?.trim() || '',
                            category: finalCat,
                            categoryIds: finalCatIds,
                            price_original: Number(row.data['Giá gốc']) || 0,
                            price_promo: Number(row.data['Giá KM']) || 0,
                            warranty_text: row.data['Bảo hành']?.trim() || '',
                            repair_time: row.data['Thời gian sửa']?.trim() || '',
                            description: row.data['Mô tả']?.trim() || '',
                            isActive: true,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        });
                    }
                    success++;
                } catch { failed++; }
            });
            await Promise.all(promises);
            setProgress(prev => ({ ...prev, done: Math.min(i + BATCH, valid.length) }));
        }

        setImportResults({ success, failed });
        setStep('done');
        toast.success(`Import hoàn tất: ${success} thành công, ${failed} lỗi`);
    };

    const errorCount = rows.filter(r => r.errors.length > 0).length;
    const validCount = rows.length - errorCount;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b shrink-0">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <FileSpreadsheet size={22} className="text-green-600" />
                        Import {mode === 'product' ? 'Sản phẩm' : 'Dịch vụ'} từ Excel
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                    {step === 'upload' && (
                        <div className="space-y-4">
                            <button onClick={() => generateTemplate(mode)}
                                className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-green-300 text-green-700 rounded-xl hover:bg-green-50 text-sm font-medium w-full justify-center">
                                <Download size={18} /> Tải mẫu Excel
                            </button>
                            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
                                onClick={() => fileRef.current?.click()}>
                                <Upload size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-sm text-gray-500">Kéo thả hoặc <span className="text-orange-600 font-medium">chọn file Excel</span></p>
                                <p className="text-xs text-gray-400 mt-1">Hỗ trợ .xlsx, .xls</p>
                            </div>
                            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
                        </div>
                    )}

                    {step === 'validating' && (
                        <div className="text-center py-10">
                            <Loader2 size={40} className="mx-auto text-orange-500 animate-spin mb-4" />
                            <p className="text-sm text-gray-600">Đang kiểm tra dữ liệu và trùng lặp...</p>
                        </div>
                    )}

                    {step === 'preview' && (
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <div className="flex-1 bg-green-50 rounded-lg p-3 text-sm">
                                    <CheckCircle2 size={16} className="text-green-600 inline mr-1" />
                                    <span className="font-medium text-green-700">{validCount} dòng hợp lệ</span>
                                </div>
                                {errorCount > 0 && (
                                    <div className="flex-1 bg-red-50 rounded-lg p-3 text-sm">
                                        <AlertCircle size={16} className="text-red-500 inline mr-1" />
                                        <span className="font-medium text-red-600">{errorCount} dòng lỗi</span>
                                    </div>
                                )}
                            </div>
                            <div className="overflow-x-auto border rounded-lg">
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-2 py-2 text-left">#</th>
                                            {(mode === 'product' ? PRODUCT_HEADERS : SERVICE_HEADERS).map(h => (
                                                <th key={h} className="px-2 py-2 text-left whitespace-nowrap">{h}</th>
                                            ))}
                                            <th className="px-2 py-2 text-left">Trạng thái</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.slice(0, 50).map((r, i) => (
                                            <tr key={i} className={r.errors.length > 0 ? 'bg-red-50' : ''}>
                                                <td className="px-2 py-1.5 text-gray-400">{r.rowNum}</td>
                                                {(mode === 'product' ? PRODUCT_HEADERS : SERVICE_HEADERS).map(h => (
                                                    <td key={h} className="px-2 py-1.5 max-w-[120px] truncate" title={r.data[h]}>{r.data[h] || ''}</td>
                                                ))}
                                                <td className="px-2 py-1.5">
                                                    {r.errors.length > 0
                                                        ? <span className="text-red-500 font-medium" title={r.errors.join(', ')}>❌ {r.errors[0]}</span>
                                                        : <span className="text-green-600 font-medium">✓</span>
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {rows.length > 50 && <p className="text-xs text-gray-400 text-center">Hiển thị 50/{rows.length} dòng</p>}
                        </div>
                    )}

                    {step === 'importing' && (
                        <div className="text-center py-10">
                            <Loader2 size={40} className="mx-auto text-orange-500 animate-spin mb-4" />
                            <p className="text-sm text-gray-600">Đang import... {progress.done}/{progress.total}</p>
                            <div className="w-64 mx-auto mt-3 bg-gray-200 rounded-full h-2">
                                <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                            </div>
                        </div>
                    )}

                    {step === 'done' && (
                        <div className="text-center py-10">
                            <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Import hoàn tất!</h3>
                            <p className="text-sm text-gray-500">{importResults.success} thành công · {importResults.failed} lỗi</p>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 p-5 border-t shrink-0">
                    {step === 'preview' && (
                        <>
                            <button onClick={() => { setStep('upload'); setRows([]); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Chọn lại</button>
                            <button onClick={handleImport} disabled={validCount === 0}
                                className="px-5 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium">
                                Import {validCount} dòng
                            </button>
                        </>
                    )}
                    {(step === 'done' || step === 'upload') && (
                        <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg">Đóng</button>
                    )}
                </div>
            </div>
        </div>
    );
}

