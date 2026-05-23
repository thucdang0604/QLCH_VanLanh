'use client';

import { useState } from 'react';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export default function ExportImportReportButton() {
    const [exporting, setExporting] = useState(false);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [showPicker, setShowPicker] = useState(false);

    const handleExport = async () => {
        if (!fromDate || !toDate) { toast.error('Chọn khoảng ngày'); return; }

        setExporting(true);
        try {
            const from = Timestamp.fromDate(new Date(fromDate + 'T00:00:00'));
            const to = Timestamp.fromDate(new Date(toDate + 'T23:59:59'));

            const q = query(
                collection(db, 'import_receipts'),
                where('createdAt', '>=', from),
                where('createdAt', '<=', to),
                orderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);

            if (snap.empty) { toast.error('Không có dữ liệu trong khoảng ngày này'); setExporting(false); return; }

            // Flatten items
            const rows: Record<string, string | number>[] = [];
            snap.docs.forEach(d => {
                const r = d.data();
                const date = r.createdAt?.toDate?.()?.toLocaleDateString('vi-VN') || '';
                const supplier = r.supplier || '';
                const paymentStatus = r.paymentStatus || '';

                (r.items || []).forEach((item: { productName: string; quantity: number; importPrice: number }) => {
                    rows.push({
                        'Ngày': date,
                        'NCC': supplier,
                        'Tên SP/LK/PK': item.productName,
                        'Loại': r.receiptType === 'retail' ? 'Bán lẻ' : 'Linh kiện',
                        'SL': item.quantity,
                        'Giá nhập': item.importPrice,
                        'Thành tiền': item.quantity * item.importPrice,
                        'Công nợ': paymentStatus === 'unpaid' ? item.quantity * item.importPrice : paymentStatus === 'partial' ? 'Một phần' : 0,
                    });
                });
            });

            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 30 }, { wch: 10 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo nhập hàng');
            XLSX.writeFile(wb, `bao_cao_nhap_hang_${fromDate}_${toDate}.xlsx`);
            toast.success('Đã xuất báo cáo');
            setShowPicker(false);
        } catch (err) {
            console.error(err);
            toast.error('Lỗi khi xuất báo cáo');
        }
        setExporting(false);
    };

    return (
        <div className="relative inline-block">
            <button onClick={() => setShowPicker(!showPicker)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-green-300 text-green-700 rounded-lg hover:bg-green-50 font-medium">
                <FileDown size={16} /> Xuất báo cáo
            </button>

            {showPicker && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border p-4 z-20 w-72 space-y-3">
                    <p className="text-sm font-bold text-gray-700">Chọn khoảng ngày</p>
                    <div className="flex gap-2">
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                            className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                            className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <button onClick={handleExport} disabled={exporting}
                        className="w-full py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2">
                        {exporting ? <><Loader2 size={16} className="animate-spin" /> Đang xuất...</> : 'Xuất Excel'}
                    </button>
                </div>
            )}
        </div>
    );
}
