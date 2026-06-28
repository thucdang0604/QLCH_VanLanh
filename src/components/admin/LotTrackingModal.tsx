import React, { useState } from 'react';
import Modal from './Modal';
import { collection, query, where, doc } from 'firebase/firestore';
import { getDocs, getDoc } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { Search, Loader2, Package, Building2, Calendar, FileText, ArrowDownRight, Tag } from 'lucide-react';
import type { FirestoreDateValue } from '@/lib/types';

interface LotTrackingModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialSearchCode?: string;
}

interface LotInfo {
    id: string;
    productId: string;
    productName: string;
    lotCode: string;
    supplierId?: string;
    supplierName?: string;
    quantity: number;
    remainingQuantity: number;
    costPriceAtLog: number;
    createdAt: FirestoreDateValue;
}

interface LotUsageLog {
    id: string;
    productId: string;
    productName: string;
    type: string;
    quantity: number;
    referenceType?: string;
    referenceId?: string;
    createdAt: FirestoreDateValue;
    createdBy?: string;
    deductedQty: number; // Specific to this lot
}

interface DeductedLotEntry {
    lotCode?: string | null;
    qty?: number;
    quantity?: number;
}

const dateValueToMillis = (value?: FirestoreDateValue): number => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
        return value.toMillis();
    }
    if (typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        return value.toDate().getTime();
    }
    return 0;
};

export default function LotTrackingModal({ isOpen, onClose, initialSearchCode }: LotTrackingModalProps) {
    const [searchCode, setSearchCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [lotInfos, setLotInfos] = useState<LotInfo[]>([]);
    const [usageLogs, setUsageLogs] = useState<LotUsageLog[]>([]);
    const [error, setError] = useState('');

    const handleSearch = async (e?: React.FormEvent, forceCode?: string) => {
        if (e) e.preventDefault();
        const code = (forceCode || searchCode).trim().toUpperCase();
        if (!code) return;

        setLoading(true);
        setError('');
        setLotInfos([]);
        setUsageLogs([]);

        try {
            // 1. Find ALL lots for this lotCode
            const lotQ = query(
                collection(db, 'inventory_lots'),
                where('lotCode', '==', code)
            );
            const lotSnap = await getDocs(lotQ);

            if (lotSnap.empty) {
                setError(`Không tìm thấy lô hàng nào với mã: ${code}`);
                setLoading(false);
                return;
            }

            // 2. Collect unique supplierIds for batch fetch (dedup)
            const supplierIds = new Set<string>();
            const rawLots = lotSnap.docs.map(d => {
                const data = d.data();
                if (data.supplierId) supplierIds.add(data.supplierId);
                return { docId: d.id, data };
            });

            // 3. Batch fetch supplier names (1 read per unique supplier)
            const supplierNameMap = new Map<string, string>();
            const supplierFetches = Array.from(supplierIds).map(async (sid) => {
                try {
                    const supDoc = await getDoc(doc(db, 'suppliers', sid));
                    supplierNameMap.set(sid, supDoc.exists() ? (supDoc.data().name || sid) : sid);
                } catch {
                    supplierNameMap.set(sid, sid);
                }
            });
            await Promise.all(supplierFetches);

            // 4. Build LotInfo array
            const lots: LotInfo[] = rawLots.map(({ docId, data }) => ({
                id: docId,
                productId: data.productId,
                productName: data.productName || data.productId,
                lotCode: data.lotCode,
                supplierId: data.supplierId,
                supplierName: data.supplierId ? (supplierNameMap.get(data.supplierId) || 'Không xác định') : 'Không xác định',
                quantity: data.initialQuantity || data.quantity,
                remainingQuantity: data.remainingQuantity,
                costPriceAtLog: data.importPrice || data.costPriceAtLog,
                createdAt: data.createdAt,
            }));
            setLotInfos(lots);

            // 5. Fetch usage logs for ALL productIds in this lot (batched, max 30 per query)
            const uniqueProductIds = [...new Set(lots.map(l => l.productId).filter(Boolean))];
            const allLogs: LotUsageLog[] = [];

            // Batch productIds into chunks of 30 for Firestore 'in' limit
            const pidChunks: string[][] = [];
            for (let i = 0; i < uniqueProductIds.length; i += 30) {
                pidChunks.push(uniqueProductIds.slice(i, i + 30));
            }

            for (const chunk of pidChunks) {
                const usageQ = query(
                    collection(db, 'inventory_logs'),
                    where('productId', 'in', chunk),
                    where('type', 'in', ['POS_SALE', 'SALE', 'REPAIR_USE', 'EXPORT'])
                );
                const usageSnap = await getDocs(usageQ);

                usageSnap.forEach(logDoc => {
                    const data = logDoc.data();
                    if (data.lotsDeducted && Array.isArray(data.lotsDeducted)) {
                        const usage = (data.lotsDeducted as DeductedLotEntry[]).find((lot) => lot.lotCode === code);
                        if (usage) {
                            allLogs.push({
                                id: logDoc.id,
                                productId: data.productId,
                                productName: data.productName || data.productId,
                                type: data.type,
                                quantity: data.quantity,
                                deductedQty: Number(usage.qty ?? usage.quantity ?? 0),
                                referenceType: data.referenceType,
                                referenceId: data.referenceId,
                                createdAt: data.createdAt,
                                createdBy: data.createdBy
                            });
                        }
                    }
                });
            }

            // Sort logs by date descending
            allLogs.sort((a, b) => dateValueToMillis(b.createdAt) - dateValueToMillis(a.createdAt));
            setUsageLogs(allLogs);

        } catch (err: unknown) {
            console.error('Error searching lot:', err);
            setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra khi tra cứu');
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        if (isOpen && initialSearchCode) {
            setSearchCode(initialSearchCode);
            handleSearch(undefined, initialSearchCode);
        } else if (!isOpen) {
            setSearchCode('');
            setLotInfos([]);
            setUsageLogs([]);
            setError('');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, initialSearchCode]);

    const formatDate = (ts?: FirestoreDateValue) => {
        if (!ts) return '—';
        const millis = dateValueToMillis(ts);
        const d = millis > 0 ? new Date(millis) : new Date();
        return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    };

    const formatPrice = (price?: number) => {
        if (!price) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
    };

    const translateType = (type: string) => {
        switch (type) {
            case 'POS_SALE':
            case 'SALE': return 'Bán lẻ POS';
            case 'REPAIR_USE': return 'Xuất cho sửa chữa';
            case 'EXPORT': return 'Xuất kho khác';
            default: return type;
        }
    };

    const totalInitial = lotInfos.reduce((s, l) => s + (l.quantity || 0), 0);
    const totalRemaining = lotInfos.reduce((s, l) => s + (l.remainingQuantity || 0), 0);

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

                {/* ── Lot Summary ── */}
                {lotInfos.length > 0 && (
                    <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                        <h3 className="font-semibold text-lg text-blue-900 mb-4 flex items-center gap-2">
                            <Package className="w-5 h-5" />
                            Thông tin Lô Hàng
                            <span className="ml-auto rounded-full bg-blue-200 text-blue-800 px-2 py-0.5 text-xs font-bold">
                                {lotInfos.length} sản phẩm
                            </span>
                        </h3>

                        {/* Lot code + date (shared) */}
                        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                            <div>
                                <p className="text-gray-500 mb-1 flex items-center gap-1"><Tag className="w-4 h-4" /> Mã Lô</p>
                                <p className="font-bold bg-white text-blue-800 px-2 py-0.5 rounded inline-block border border-blue-200">{lotInfos[0].lotCode}</p>
                            </div>
                            <div>
                                <p className="text-gray-500 mb-1 flex items-center gap-1"><Calendar className="w-4 h-4" /> Ngày nhập</p>
                                <p className="font-medium text-gray-900">{formatDate(lotInfos[0].createdAt)}</p>
                            </div>
                        </div>

                        {/* Per-product detail table */}
                        <div className="border rounded-md overflow-hidden bg-white">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 text-gray-700">
                                    <tr>
                                        <th className="px-3 py-2 font-semibold">Sản phẩm / Linh kiện</th>
                                        <th className="px-3 py-2 font-semibold"><Building2 className="inline w-3.5 h-3.5 -mt-0.5 mr-1" />NCC</th>
                                        <th className="px-3 py-2 font-semibold text-right">Giá nhập</th>
                                        <th className="px-3 py-2 font-semibold text-center">SL nhập</th>
                                        <th className="px-3 py-2 font-semibold text-center">Tồn kho</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {lotInfos.map((lot) => (
                                        <tr key={lot.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-3 py-2 font-medium text-gray-900">{lot.productName}</td>
                                            <td className="px-3 py-2 text-purple-700 text-xs">{lot.supplierName}</td>
                                            <td className="px-3 py-2 text-right text-green-700">{formatPrice(lot.costPriceAtLog)}</td>
                                            <td className="px-3 py-2 text-center">{lot.quantity}</td>
                                            <td className="px-3 py-2 text-center">
                                                <span className={`font-bold ${lot.remainingQuantity > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                                                    {lot.remainingQuantity}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-50 font-semibold text-gray-700">
                                        <td colSpan={3} className="px-3 py-2 text-right">Tổng:</td>
                                        <td className="px-3 py-2 text-center">{totalInitial}</td>
                                        <td className="px-3 py-2 text-center text-blue-700">{totalRemaining}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── Usage History ── */}
                {lotInfos.length > 0 && (
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
                                            <th className="px-4 py-3 font-semibold">Sản phẩm</th>
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
                                                <td className="px-4 py-3 text-gray-800 text-xs max-w-[150px] truncate">
                                                    {log.productName}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${log.type === 'POS_SALE' || log.type === 'SALE' ? 'bg-purple-100 text-purple-700' :
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
