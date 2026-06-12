'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Package, Search, CheckCircle2, Clock,
    Loader2, ChevronDown, ChevronRight,
    ArrowDownToLine, ExternalLink
} from 'lucide-react';
import {
    collection, getDocs, deleteDoc,
    doc, serverTimestamp, query, orderBy, runTransaction
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import type { ImportReceipt, Product } from '@/lib/types';
import { toastError, toastSuccess } from '@/lib/toast';
import { buildReactivateOnImportUpdate } from '@/lib/productLifecycle';

// ── Status Config ──
const statusConfig = {
    draft: { label: 'Nháp', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
    ordered: { label: 'Đã đặt hàng', color: 'bg-blue-100 text-blue-700', icon: Package },
    completed: { label: 'Đã nhập', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

export default function InventoryPage() {
    const { user } = useAuth();
    const [receipts, setReceipts] = useState<(ImportReceipt & { id: string })[]>([]);
    const [products, setProducts] = useState<(Product & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

    // Expanded receipt
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // ── Load data ──
    useEffect(() => {
        const load = async () => {
            try {
                const [rSnap, pSnap] = await Promise.all([
                    getDocs(query(collection(db, 'import_receipts'), orderBy('createdAt', 'desc'))),
                    getDocs(collection(db, 'products')),
                ]);
                setReceipts(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as ImportReceipt & { id: string })));
                setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product & { id: string })));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';
    const formatDate = (ts: unknown) => {
        if (!ts) return '—';
        const t = ts as { toDate?: () => Date };
        const d = t.toDate ? t.toDate() : new Date(ts as string | number);
        return d.toLocaleDateString('vi-VN');
    };

    // ── Complete receipt: update stock + cost price ──
    const handleComplete = async (receipt: ImportReceipt & { id: string }) => {
        if (receipt.status === 'completed') return;
        if (!confirm('Xác nhận hoàn thành nhập hàng? Stock và giá vốn sẽ được cập nhật.')) return;

        setIsProcessing(true);
        try {
            await runTransaction(db, async (transaction) => {
                // Pre-processing: gom nhóm items theo productId để tránh race condition
                const grouped = new Map<string, { productName: string; totalQty: number; totalCost: number }>();
                for (const item of receipt.items) {
                    const existing = grouped.get(item.productId);
                    if (existing) {
                        existing.totalQty += item.quantity;
                        existing.totalCost += item.quantity * item.importPrice;
                    } else {
                        grouped.set(item.productId, {
                            productName: item.productName,
                            totalQty: item.quantity,
                            totalCost: item.quantity * item.importPrice,
                        });
                    }
                }

                // Phase 1: Read all product docs first (Firestore transaction requirement)
                const productReads = new Map<string, { ref: ReturnType<typeof doc>; snap: Awaited<ReturnType<typeof transaction.get>> }>();
                for (const productId of grouped.keys()) {
                    const productRef = doc(db, 'products', productId);
                    const productSnap = await transaction.get(productRef);
                    productReads.set(productId, { ref: productRef, snap: productSnap });
                }

                // Phase 2: Process each grouped product
                for (const [productId, group] of grouped.entries()) {
                    const entry = productReads.get(productId)!;
                    const { ref: productRef, snap: productSnap } = entry;

                    if (!productSnap.exists()) {
                        console.warn(`Product ${productId} (${group.productName}) not found, skipping.`);
                        continue;
                    }

                    const pData = productSnap.data() as Record<string, unknown>;
                    const oldStock = Math.max(0, Number(pData.stock) || 0);
                    const oldCostPrice = Number(pData.costPrice) || 0;

                    // Weighted average cost price (dùng tổng đã gom nhóm)
                    const newCostPrice = oldStock + group.totalQty > 0
                        ? ((oldStock * oldCostPrice) + group.totalCost) / (oldStock + group.totalQty)
                        : group.totalCost / group.totalQty;

                    const newStock = (Number(pData.stock) || 0) + group.totalQty;
                    const updateData: Record<string, unknown> = {
                        stock: newStock,
                        costPrice: Math.round(newCostPrice),
                        updatedAt: serverTimestamp(),
                        ...buildReactivateOnImportUpdate({
                            status: String(pData.status || 'active') as Product['status'],
                            stock: Number(pData.stock) || 0,
                            held: Number(pData.held) || 0,
                            isProposed: pData.isProposed === true,
                        }, newStock),
                    };

                    // If product was proposed, activate it on first import
                    if (pData.isProposed === true) {
                        updateData.isProposed = false;
                        updateData.status = 'active';
                        if (!pData.price_original || pData.price_original === 0) {
                            updateData.price_original = group.totalCost / group.totalQty;
                        }
                    }

                    transaction.update(productRef, updateData);

                    // Audit Trail: ghi inventory_logs
                    const logRef = doc(collection(db, 'inventory_logs'));
                    transaction.set(logRef, {
                        productId,
                        productName: group.productName,
                        quantity: group.totalQty,
                        costPriceAtLog: Math.round(newCostPrice),
                        type: 'IMPORT',
                        referenceId: receipt.id,
                        referenceType: 'import_receipt',
                        createdBy: user?.uid || '',
                        createdByName: user?.displayName || '',
                        createdAt: serverTimestamp(),
                    });
                }

                // Mark receipt completed within the same transaction
                const receiptRef = doc(db, 'import_receipts', receipt.id);
                transaction.update(receiptRef, {
                    status: 'completed',
                    completedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            });

            setReceipts(prev => prev.map(r => r.id === receipt.id ? { ...r, status: 'completed' as const } : r));

            // Reload products to refresh stock/costPrice
            const pSnap = await getDocs(collection(db, 'products'));
            setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product & { id: string })));

            toastSuccess('Nhập hàng thành công! Stock và giá vốn đã cập nhật.');
        } catch (err) {
            console.error(err);
            toastError('Lỗi khi hoàn thành nhập hàng!');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Delete receipt ──
    const handleDelete = async (id: string) => {
        if (!confirm('Xóa phiếu nhập này?')) return;
        try {
            await deleteDoc(doc(db, 'import_receipts', id));
            setReceipts(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    // ── Filter ──
    const filtered = receipts.filter(r => {
        // Text search
        const matchSearch = !searchQuery || r.supplier?.toLowerCase().includes(searchQuery.toLowerCase())
            || r.items.some(i => i.productName.toLowerCase().includes(searchQuery.toLowerCase()));
        // Time filter
        let matchTime = true;
        if (timeFilter !== 'all' && r.createdAt) {
            const ts = r.createdAt as { toDate?: () => Date } | string | number;
            const d = (ts && typeof ts === 'object' && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts as string | number);
            const now = new Date();
            if (timeFilter === 'today') {
                matchTime = d.toDateString() === now.toDateString();
            } else if (timeFilter === 'week') {
                const weekAgo = new Date(now.getTime() - 7 * 86400000);
                matchTime = d >= weekAgo;
            } else if (timeFilter === 'month') {
                matchTime = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }
        }
        return matchSearch && matchTime;
    });

    if (loading) return (
        <div className="flex items-center justify-center h-[60vh]">
            <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
    );

    return (
        <div className="p-4 md:p-6 space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <ArrowDownToLine className="text-orange-500" /> Nhập hàng & Kho
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Quản lý phiếu nhập, giá vốn bình quân</p>
                </div>
                <Link href="/admin/parts"
                    className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 shadow-md shadow-orange-200/50 font-semibold text-sm transition-colors">
                    <ExternalLink size={18} /> Tạo phiếu nhập mới
                </Link>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Tổng phiếu nhập</p>
                    <p className="text-2xl font-bold text-gray-900">{receipts.length}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Đã hoàn thành</p>
                    <p className="text-2xl font-bold text-green-600">{receipts.filter(r => r.status === 'completed').length}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Tổng giá trị nhập</p>
                    <p className="text-lg font-bold text-orange-600">
                        {formatPrice(receipts.filter(r => r.status === 'completed').reduce((s, r) => s + (r.totalAmount || 0), 0))}
                    </p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Sản phẩm có tồn kho</p>
                    <p className="text-2xl font-bold text-blue-600">{products.filter(p => (p.stock || 0) > 0).length}</p>
                </div>
            </div>

            {/* Search + Time Filter */}
            <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input type="text" placeholder="Tìm NCC hoặc sản phẩm..."
                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-orange-500/30 bg-white shadow-sm" />
                </div>
                <div className="flex gap-1.5">
                    {([['all', 'Tất cả'], ['today', 'Hôm nay'], ['week', 'Tuần này'], ['month', 'Tháng này']] as const).map(([key, label]) => (
                        <button key={key} onClick={() => setTimeFilter(key)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${timeFilter === key
                                ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}>
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Receipt list */}
            <div className="space-y-3">
                {filtered.map(receipt => {
                    const st = statusConfig[receipt.status as keyof typeof statusConfig] || statusConfig.draft;
                    const StIcon = st.icon;
                    const isExpanded = expandedId === receipt.id;
                    const rType = (receipt as { receiptType?: string }).receiptType;

                    return (
                        <div key={receipt.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                            <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50"
                                onClick={() => setExpandedId(isExpanded ? null : receipt.id)}>
                                {isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-800 truncate">
                                        {receipt.supplier || 'Không có NCC'} — {receipt.items.length} SP
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {formatDate(receipt.createdAt)} • {receipt.createdByName}
                                        {rType && <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${rType === 'retail' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{rType === 'retail' ? '📦 Bán lẻ' : '🔧 Linh kiện'}</span>}
                                    </p>
                                </div>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${st.color}`}>
                                    <StIcon size={12} /> {st.label}
                                </span>
                                <span className="font-bold text-orange-600 text-sm">{formatPrice(receipt.totalAmount || 0)}</span>
                            </div>

                            {isExpanded && (
                                <div className="px-4 pb-4 border-t bg-gray-50">
                                    <div className="overflow-x-auto mt-3">
                                        <table className="w-full min-w-[600px] text-sm mt-3">
                                            <thead>
                                                <tr className="text-gray-500 text-xs border-b">
                                                    <th className="text-left py-2 whitespace-nowrap">Sản phẩm</th>
                                                    <th className="text-center whitespace-nowrap">Phân loại</th>
                                                    <th className="text-center whitespace-nowrap">SL</th>
                                                    <th className="text-right whitespace-nowrap">Giá nhập</th>
                                                    <th className="text-right whitespace-nowrap">Thành tiền</th>
                                                </tr>
                                            </thead>
                                        <tbody>
                                            {receipt.items.map((item, i) => (
                                                <tr key={i} className="border-b border-gray-100">
                                                    <td className="py-2">{item.productName}</td>
                                                    <td className="text-center">
                                                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{item.quality || '—'}</span>
                                                    </td>
                                                    <td className="text-center">{item.quantity}</td>
                                                    <td className="text-right">{formatPrice(item.importPrice)}</td>
                                                    <td className="text-right font-medium">{formatPrice(item.quantity * item.importPrice)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="font-bold">
                                                <td colSpan={3} className="py-2 text-right">Tổng cộng:</td>
                                                <td className="text-right text-orange-600">{formatPrice(receipt.totalAmount || 0)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                    </div>
                                    {receipt.note && <p className="text-xs text-gray-500 mt-2">📝 {receipt.note}</p>}

                                    <div className="flex gap-2 mt-3">
                                        {receipt.status === 'draft' && (
                                            <>
                                                <button onClick={() => handleComplete(receipt)}
                                                    disabled={isProcessing}
                                                    className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-1">
                                                    <CheckCircle2 size={12} /> Hoàn thành nhập
                                                </button>
                                                <button onClick={() => handleDelete(receipt.id)}
                                                    className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg ml-auto">Xóa</button>
                                            </>
                                        )}
                                        {receipt.status === 'completed' && (
                                            <span className="text-xs text-green-600 flex items-center gap-1">
                                                <CheckCircle2 size={12} /> Đã nhập kho {receipt.completedAt ? `lúc ${formatDate(receipt.completedAt)}` : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
                {filtered.length === 0 && (
                    <div className="text-center py-16 text-gray-400">
                        <Package size={48} className="mx-auto mb-3 opacity-50" />
                        <p>Chưa có phiếu nhập nào</p>
                    </div>
                )}
            </div>
        </div>
    );
}
