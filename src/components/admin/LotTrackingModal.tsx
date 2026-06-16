import React, { useState } from 'react';
import Modal from './Modal';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Search, Loader2, Package, Building2, Calendar, FileText, ArrowDownRight, Tag } from 'lucide-react';
import { FirestoreDateValue } from '@/lib/types';

interface LotTrackingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface LotInfo {
    id: string;
    productId: string;
    productName: string;
    lotCode: string;
    supplierId?: string;
    quantity: number;
    remainingQuantity: number;
    costPriceAtLog: number;
    createdAt: FirestoreDateValue;
}

interface LotUsageLog {
    id: string;
    type: string;
    quantity: number;
    referenceType?: string;
    referenceId?: string;
    createdAt: FirestoreDateValue;
    createdBy?: string;
    deductedQty: number; // Specific to this lot
}

export default function LotTrackingModal({ isOpen, onClose }: LotTrackingModalProps) {
    const [searchCode, setSearchCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [lotInfo, setLotInfo] = useState<LotInfo | null>(null);
    const [usageLogs, setUsageLogs] = useState<LotUsageLog[]>([]);
    const [error, setError] = useState('');

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const code = searchCode.trim().toUpperCase();
        if (!code) return;

        setLoading(true);
        setError('');
        setLotInfo(null);
        setUsageLogs([]);

        try {
            // 1. Find the IMPORT log for this lotCode
            const importQ = query(
                collection(db, 'inventory_logs'),
                where('type', '==', 'IMPORT'),
                where('lotCode', '==', code)
            );
            const importSnap = await getDocs(importQ);

            if (importSnap.empty) {
                setError(`Không tìm thấy lô hàng nào với mã: ${code}`);
                setLoading(false);
                return;
            }

            const importDoc = importSnap.docs[0];
            const lotData = { id: importDoc.id, ...importDoc.data() } as LotInfo;
            setLotInfo(lotData);

            // 2. Fetch usage history for this product
            const usageQ = query(
                collection(db, 'inventory_logs'),
                where('productId', '==', lotData.productId),
                where('type', 'in', ['POS_SALE', 'REPAIR_USE', 'EXPORT'])
            );
            const usageSnap = await getDocs(usageQ);
            
            const logs: LotUsageLog[] = [];
            usageSnap.forEach(doc => {
                const data = doc.data();
                if (data.lotsDeducted && Array.isArray(data.lotsDeducted)) {
                    const usage = data.lotsDeducted.find((l: any) => l.lotCode === code);
                    if (usage) {
                        logs.push({
                            id: doc.id,
                            type: data.type,
                            quantity: data.quantity,
                            deductedQty: usage.qty,
                            referenceType: data.referenceType,
                            referenceId: data.referenceId,
                            createdAt: data.createdAt,
                            createdBy: data.createdBy
                        });
                    }
                }
            });

            // Sort logs by date descending locally
            logs.sort((a, b) => {
                const da = a.createdAt && 'toMillis' in a.createdAt ? a.createdAt.toMillis() : Date.now();
                const dbTime = b.createdAt && 'toMillis' in b.createdAt ? b.createdAt.toMillis() : Date.now();
                return dbTime - da;
            });

            setUsageLogs(logs);

        } catch (err: any) {
            console.error('Error tracking lot:', err);
            setError('Đã xảy ra lỗi khi truy vấn dữ liệu.');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (ts: any) => {
        if (!ts) return '—';
        const d = typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    };

    const formatPrice = (price?: number) => {
        if (!price) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
    };

    const translateType = (type: string) => {
        switch (type) {
            case 'POS_SALE': return 'Bán lẻ POS';
            case 'REPAIR_USE': return 'Xuất cho sửa chữa';
            case 'EXPORT': return 'Xuất kho khác';
            default: return type;
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Tra Cứu Nguồn Gốc Lô Hàng" size="3xl">
            <div className="space-y-6">
                <form onSubmit={handleSearch} className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Nhập mã lô (VD: PN-170123...)"
                        value={searchCode}
                        onChange={(e) => setSearchCode(e.target.value)}
                        className="flex-1 px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={loading || !searchCode.trim()}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Tra Cứu
                    </button>
                </form>

                {error && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-md border border-red-100">
                        {error}
                    </div>
                )}

                {lotInfo && (
                    <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                        <h3 className="font-semibold text-lg text-blue-900 mb-4 flex items-center gap-2">
                            <Package className="w-5 h-5" />
                            Thông tin Lô Hàng
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-gray-500 mb-1">Linh kiện / Sản phẩm</p>
                                <p className="font-medium text-gray-900">{lotInfo.productName}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 mb-1 flex items-center gap-1"><Tag className="w-4 h-4" /> Mã Lô</p>
                                <p className="font-bold bg-white text-blue-800 px-2 py-0.5 rounded inline-block border border-blue-200">{lotInfo.lotCode}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 mb-1 flex items-center gap-1"><Building2 className="w-4 h-4" /> Nhà Cung Cấp</p>
                                <p className="font-medium text-gray-900">{lotInfo.supplierId || 'Không xác định'}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 mb-1 flex items-center gap-1"><Calendar className="w-4 h-4" /> Ngày nhập</p>
                                <p className="font-medium text-gray-900">{formatDate(lotInfo.createdAt)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 mb-1">Giá nhập</p>
                                <p className="font-medium text-green-700">{formatPrice(lotInfo.costPriceAtLog)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 mb-1">Tồn kho Lô này</p>
                                <p className="font-medium">
                                    <span className="text-blue-700 font-bold">{lotInfo.remainingQuantity}</span>
                                    <span className="text-gray-400 mx-1">/</span>
                                    <span className="text-gray-600">{lotInfo.quantity}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {lotInfo && (
                    <div>
                        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-gray-600" />
                            Lịch sử xuất / sử dụng lô này
                        </h3>
                        
                        {usageLogs.length === 0 ? (
                            <p className="text-gray-500 text-sm italic py-8 text-center border rounded-md bg-gray-50">Lô hàng này chưa được xuất hoặc sử dụng.</p>
                        ) : (
                            <div className="border rounded-md overflow-hidden bg-white">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-100 text-gray-700">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold">Thời gian</th>
                                            <th className="px-4 py-3 font-semibold">Nghiệp vụ</th>
                                            <th className="px-4 py-3 font-semibold">Mã Phiếu/Đơn</th>
                                            <th className="px-4 py-3 font-semibold text-right">SL Đã Trừ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {usageLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                                    {formatDate(log.createdAt)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                        log.type === 'POS_SALE' ? 'bg-purple-100 text-purple-700' :
                                                        log.type === 'REPAIR_USE' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {translateType(log.type)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-blue-600 font-mono text-xs">
                                                    {log.referenceId || '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-red-600 flex justify-end items-center gap-1">
                                                    <ArrowDownRight className="w-4 h-4" />
                                                    {log.deductedQty}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-end pt-4 border-t">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2 border rounded-md text-gray-700 hover:bg-gray-100 font-medium"
                    >
                        Đóng
                    </button>
                </div>
            </div>
        </Modal>
    );
}
