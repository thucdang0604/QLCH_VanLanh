'use client';

import { useCallback, useState, useEffect } from 'react';
import {
    Package, Search, CheckCircle2, Clock,
    Loader2, ChevronDown, ChevronRight,
    ArrowDownToLine, ExternalLink, PackagePlus, Trash2
} from 'lucide-react';
import { collection, deleteDoc, doc, serverTimestamp, query, orderBy, updateDoc, setDoc, limit, startAfter, getCountFromServer, where, type DocumentSnapshot, type QueryConstraint, type QuerySnapshot, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { getDocs, onSnapshot } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import type { ImportReceipt, Product } from '@/lib/types';
import { toastError, toastSuccess } from '@/lib/toast';
import { isPartCategory } from '@/lib/constants';
import CurrencyInput from '@/components/admin/CurrencyInput';
import LotTrackingModal from '@/components/admin/LotTrackingModal';
import ProductQrLabelModal, { PrintBatchItem } from '@/components/admin/ProductQrLabelModal';
import {
    calculateImportableTotal,
    getReceiptItemAvailability,
    isReceiptItemUnavailable,
} from '@/lib/importReceiptAvailability';
import { buildImportPreviewState } from '@/features/parts/importReceiptUtils';
import { CreateReceiptModal, ImportPreviewModal } from '@/features/parts/ImportReceiptModals';
import type { ImportPreviewState, ImportReceiptItem, SupplierOption } from '@/features/parts/importReceiptTypes';
import { buildInlineSupplierContactInput, buildSupplierContactDocumentFields, reserveSupplierDocumentId } from '@/lib/supplierDocumentIds';

// ── Status Config ──
const statusConfig = {
    draft: { label: 'Đề xuất', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
    ordered: { label: 'Đã đặt hàng', color: 'bg-blue-100 text-blue-700', icon: Package },
    completed: { label: 'Đã nhập', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
};

function supplierMatchesSearch(supplier: SupplierOption, search: string): boolean {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const values = [
        supplier.id,
        supplier.name,
        supplier.phone,
        supplier.primaryContactValue,
        ...(supplier.searchKeywords || []),
        ...(supplier.contactMethods || []).flatMap(method => [method.value, method.normalizedValue]),
    ];
    return values.some(value => String(value || '').toLowerCase().includes(q));
}

type InventoryTab = 'completed' | 'draft' | 'ordered' | 'all';
const RECEIPT_BATCH_SIZE = 80;

const inventoryTabs: { id: InventoryTab; label: string; description: string }[] = [
    { id: 'completed', label: 'Phiếu nhập hàng', description: 'Đã hoàn tất nhập kho' },
    { id: 'draft', label: 'Phiếu đề xuất', description: 'Cần duyệt hoặc đặt hàng' },
    { id: 'ordered', label: 'Phiếu đã đặt', description: 'Đang chờ hàng về' },
    { id: 'all', label: 'Tất cả', description: 'Toàn bộ phiếu' },
];

export default function InventoryPage() {
    const { user } = useAuth();
    const [receipts, setReceipts] = useState<(ImportReceipt & { id: string })[]>([]);
    const [products, setProducts] = useState<(Product & { id: string })[]>([]);
    const [inStockCount, setInStockCount] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMoreReceipts, setLoadingMoreReceipts] = useState(false);
    const [lastReceiptDoc, setLastReceiptDoc] = useState<DocumentSnapshot | null>(null);
    const [hasMoreReceipts, setHasMoreReceipts] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
    const [activeTab, setActiveTab] = useState<InventoryTab>('completed');
    const [supplierList, setSupplierList] = useState<SupplierOption[]>([]);
    const [partTypeOptions, setPartTypeOptions] = useState<string[]>([]);
    const [editingPrices, setEditingPrices] = useState<Record<string, number[]>>({});
    const [editingQuantities, setEditingQuantities] = useState<Record<string, number[]>>({});
    const [supplierSearch, setSupplierSearch] = useState('');
    const [supplierActiveKey, setSupplierActiveKey] = useState<string | null>(null);
    const [importPreviewModal, setImportPreviewModal] = useState<ImportPreviewState>({ isOpen: false, receipt: null, newParts: {} });
    const [forecastCostPrices, setForecastCostPrices] = useState<Map<string, number>>(new Map());
    const [isCreateReceiptOpen, setIsCreateReceiptOpen] = useState(false);
    const [createReceiptType, setCreateReceiptType] = useState<'component' | 'retail'>('component');

    // Expanded receipt
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [trackingLotCode, setTrackingLotCode] = useState<string | null>(null);
    const [printBatchLots, setPrintBatchLots] = useState<PrintBatchItem[] | null>(null);

    const parts = products.filter(product => isPartCategory(product.category, product.categoryIds));
    const retailProducts = products.filter(product => {
        const firstCatId = product.categoryIds?.[0] || '';
        const isComponent = isPartCategory(product.category, product.categoryIds);
        const isService = product.category === 'service' || firstCatId.startsWith('sua-chua');
        return !isComponent && !isService;
    });

    const buildReceiptQueryConstraints = useCallback((cursor?: DocumentSnapshot | null): QueryConstraint[] => {
        const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(RECEIPT_BATCH_SIZE));
        return constraints;
    }, []);

    const refreshReceipts = useCallback(async (mode: 'reset' | 'more' = 'reset', cursor?: DocumentSnapshot | null) => {
        const isReset = mode === 'reset';
        if (!isReset) setLoadingMoreReceipts(true);
        try {
            const snap = await getDocs(query(
                collection(db, 'import_receipts'),
                ...buildReceiptQueryConstraints(isReset ? null : cursor),
            ));
            const nextReceipts = snap.docs.map(d => ({ id: d.id, ...d.data() } as ImportReceipt & { id: string }));
            setReceipts(current => isReset ? nextReceipts : [...current, ...nextReceipts]);
            setLastReceiptDoc(snap.docs[snap.docs.length - 1] || null);
            setHasMoreReceipts(snap.docs.length === RECEIPT_BATCH_SIZE);
        } finally {
            if (!isReset) setLoadingMoreReceipts(false);
        }
    }, [buildReceiptQueryConstraints]);

    const refreshProducts = useCallback(async () => {
        if (products.length > 0) return; // Lazy load: already loaded
        const snap = await getDocs(collection(db, 'products'));
        setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product & { id: string })));
    }, [products.length]);

    const loadInStockCount = useCallback(async () => {
        try {
            const snap = await getCountFromServer(query(collection(db, 'products'), where('stock', '>', 0)));
            setInStockCount(snap.data().count);
        } catch (e) {
            console.error('Error loading stock count:', e);
            setInStockCount(0);
        }
    }, []);

    const handlePrintLot = async (receipt: ImportReceipt & { id: string }) => {
        let pool = products;
        // If products not yet loaded, fetch only the ones we need (1 query, not full collection)
        if (pool.length === 0) {
            const neededIds = [...new Set(receipt.items.map(i => i.productId).filter(Boolean))];
            if (neededIds.length > 0) {
                // Firestore 'in' supports up to 30 values
                const chunks: string[][] = [];
                for (let i = 0; i < neededIds.length; i += 30) chunks.push(neededIds.slice(i, i + 30));
                const fetched: (Product & { id: string })[] = [];
                for (const chunk of chunks) {
                    const snap = await getDocs(query(collection(db, 'products'), where('__name__', 'in', chunk)));
                    snap.docs.forEach(d => fetched.push({ id: d.id, ...d.data() } as Product & { id: string }));
                }
                pool = fetched;
            }
        }

        const batchItems: PrintBatchItem[] = receipt.items.map(item => {
            const prod = pool.find(p => p.id === item.productId);
            if (!prod) return null;
            return {
                product: prod,
                lotCode: receipt.lotCode || undefined,
                copies: item.quantity
            };
        }).filter(Boolean) as PrintBatchItem[];
        
        if (batchItems.length === 0) {
            toastError('Không thể tạo tem in vì không tìm thấy dữ liệu sản phẩm tương ứng.');
            return;
        }
        setPrintBatchLots(batchItems);
    };

    // ── Load data ──
    useEffect(() => {
        const load = async () => {
            try {
                await Promise.all([refreshReceipts(), loadInStockCount()]);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [refreshReceipts, loadInStockCount]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const tab = new URLSearchParams(window.location.search).get('tab');
        if (tab === 'completed' || tab === 'draft' || tab === 'ordered' || tab === 'all') {
            setActiveTab(tab);
        }
    }, []);

    const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';
    useEffect(() => {
        const unsub = onSnapshot(
            query(collection(db, 'suppliers'), orderBy('name', 'asc')),
            (snap: QuerySnapshot<DocumentData>) => setSupplierList(snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as SupplierOption)))
        );
        return () => unsub();
    }, []);

    useEffect(() => {
        if (isCreateReceiptOpen || importPreviewModal.isOpen) {
            refreshProducts();
        }
    }, [isCreateReceiptOpen, importPreviewModal.isOpen, refreshProducts]);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'system_config', 'repairs'), (snap: DocumentSnapshot<DocumentData>) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const rules = Array.isArray(data.warrantyRules) ? data.warrantyRules : [];
            setPartTypeOptions(rules.map((rule: { partType?: string }) => rule.partType).filter((value: string | undefined): value is string => Boolean(value)));
        });
        return () => unsub();
    }, []);

    const formatDate = (ts: unknown) => {
        if (!ts) return '—';
        const t = ts as { toDate?: () => Date };
        const d = t.toDate ? t.toDate() : new Date(ts as string | number);
        return d.toLocaleDateString('vi-VN');
    };

    const handleExpandReceipt = (receiptId: string) => {
        setExpandedId(prev => prev === receiptId ? null : receiptId);
        const receipt = receipts.find(item => item.id === receiptId);
        if (!receipt) return;
        setEditingPrices({ [receiptId]: receipt.items.map(item => item.importPrice) });
        setEditingQuantities({ [receiptId]: receipt.items.map(item => item.quantity) });
    };

    const handleAutoSaveItem = async (receiptId: string, itemIdx: number, newPrice: number, newQty: number) => {
        const receipt = receipts.find(item => item.id === receiptId);
        if (!receipt) return;

        try {
            const updatedItems = [...receipt.items];
            updatedItems[itemIdx] = { ...updatedItems[itemIdx], importPrice: newPrice, quantity: newQty };
            const totalAmount = calculateImportableTotal(updatedItems);
            await updateDoc(doc(db, 'import_receipts', receipt.id), {
                items: updatedItems,
                totalAmount,
                updatedAt: serverTimestamp(),
            });
            setReceipts(prev => prev.map(item => item.id === receiptId ? { ...item, items: updatedItems, totalAmount } : item));
            toastSuccess('Đã tự động lưu.');
        } catch (err) {
            console.error(err);
            toastError('Lỗi tự động lưu.');
        }
    };

    const handleAutoSaveSupplier = async (receiptId: string, itemIdx: number, supplierName: string, supplierId: string) => {
        const receipt = receipts.find(item => item.id === receiptId);
        if (!receipt) return;

        try {
            const updatedItems = [...receipt.items];
            updatedItems[itemIdx] = { ...updatedItems[itemIdx], supplier: supplierName, supplierId };
            await updateDoc(doc(db, 'import_receipts', receipt.id), {
                items: updatedItems,
                updatedAt: serverTimestamp(),
            });
            setReceipts(prev => prev.map(item => item.id === receiptId ? { ...item, items: updatedItems } : item));
            toastSuccess('Đã cập nhật NCC.');
        } catch (err) {
            console.error(err);
            toastError('Lỗi cập nhật NCC.');
        }
    };

    const handleOrderReceipt = async (receipt: ImportReceipt & { id: string }) => {
        const importableItems = receipt.items.filter(item => !isReceiptItemUnavailable(item));
        if (importableItems.length === 0) {
            toastError('Phiếu không còn hàng có thể đặt.');
            return;
        }
        const missingSupplier = importableItems.filter(item => !item.supplier && !item.supplierId);
        if (missingSupplier.length > 0) {
            toastError(`Còn ${missingSupplier.length} dòng chưa gắn NCC.`);
            return;
        }
        if (!confirm('Chốt đặt hàng với nhà cung cấp?')) return;

        setIsProcessing(true);
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(auth => auth.currentUser?.getIdToken());
            const res = await fetch('/api/inventory/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    action: 'order_receipt',
                    receiptId: receipt.id,
                    receiptVersion: (receipt as ImportReceipt & { version?: number }).version || 0,
                    idempotencyKey: crypto.randomUUID(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi khi chốt đặt hàng');
            await refreshReceipts();
            setActiveTab('ordered');
            toastSuccess('Đã chuyển sang trạng thái đặt hàng.');
        } catch (err) {
            console.error(err);
            toastError(err instanceof Error ? err.message : 'Lỗi khi chốt đặt hàng.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleMarkAvailability = async (receipt: ImportReceipt & { id: string }, item: ImportReceiptItem, itemIndex: number, isAvailable: boolean) => {
        setIsProcessing(true);
        const targetAvailability = isAvailable ? (receipt.status === 'draft' ? 'approved' : 'in_stock') : 'unavailable';
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(auth => auth.currentUser?.getIdToken());
            const res = await fetch('/api/inventory/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    action: 'mark_availability',
                    receiptId: receipt.id,
                    receiptVersion: (receipt as ImportReceipt & { version?: number }).version || 0,
                    idempotencyKey: crypto.randomUUID(),
                    partLineId: item.partLineId,
                    itemIndex,
                    availability: targetAvailability,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật tình trạng');
            await refreshReceipts();
            toastSuccess('Đã cập nhật tình trạng hàng.');
        } catch (err) {
            console.error(err);
            toastError(err instanceof Error ? err.message : 'Lỗi cập nhật tình trạng.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleImportReceipt = async (receipt: ImportReceipt & { id: string }) => {
        const importableItems = receipt.items.filter(item => !isReceiptItemUnavailable(item));
        if (importableItems.length === 0) {
            toastError('Phiếu không có dòng hàng nào để nhập kho.');
            return;
        }
        const { previewState, forecastCostPrices: forecasts } = buildImportPreviewState(receipt, products);
        setForecastCostPrices(forecasts);
        setImportPreviewModal(previewState);
    };

    const executeFinalImport = async (paymentMethod: 'paid' | 'debt') => {
        const { receipt, newParts } = importPreviewModal;
        if (!receipt) return;

        setIsProcessing(true);
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(auth => auth.currentUser?.getIdToken());
            const res = await fetch('/api/inventory/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    action: 'complete_import',
                    receiptId: receipt.id,
                    receiptVersion: receipt.version || 0,
                    idempotencyKey: crypto.randomUUID(),
                    paymentMethod,
                    newParts,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi nhập kho');
            if (data.generatedLots && data.generatedLots.length > 0) {
                setPrintBatchLots(data.generatedLots);
            }
            setImportPreviewModal({ isOpen: false, receipt: null, newParts: {} });
            await Promise.all([refreshReceipts(), refreshProducts()]);
            setActiveTab('completed');
            toastSuccess('Nhập kho thành công.');
        } catch (err) {
            console.error(err);
            toastError(err instanceof Error ? err.message : 'Lỗi nhập kho.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Xóa phiếu này?')) return;
        try {
            await deleteDoc(doc(db, 'import_receipts', id));
            setReceipts(prev => prev.filter(r => r.id !== id));
            toastSuccess('Đã xóa phiếu.');
        } catch (err) {
            console.error(err);
            toastError('Lỗi xóa phiếu.');
        }
    };
    // ── Filter ──
    const tabReceipts = receipts.filter(r => activeTab === 'all' || r.status === activeTab);
    const filtered = tabReceipts.filter(r => {
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
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={() => {
                            setCreateReceiptType('retail');
                            setIsCreateReceiptOpen(true);
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 shadow-md shadow-blue-200/50 font-semibold text-sm transition-colors"
                    >
                        <ExternalLink size={18} /> Đề xuất sản phẩm
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setCreateReceiptType('component');
                            setIsCreateReceiptOpen(true);
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 shadow-md shadow-orange-200/50 font-semibold text-sm transition-colors"
                    >
                        <ExternalLink size={18} /> Đề xuất linh kiện
                    </button>
                </div>
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
                    <p className="text-2xl font-bold text-blue-600">{inStockCount !== null ? inStockCount : '-'}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {inventoryTabs.map(tab => {
                    const count = tab.id === 'all' ? receipts.length : receipts.filter(receipt => receipt.status === tab.id).length;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`rounded-xl border p-3 text-left transition-colors ${isActive ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold">{tab.label}</span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${isActive ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {count}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">{tab.description}</p>
                        </button>
                    );
                })}
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
                    const prices = editingPrices[receipt.id] || receipt.items.map(item => item.importPrice);
                    const quantities = editingQuantities[receipt.id] || receipt.items.map(item => item.quantity);
                    const importableItems = receipt.items.filter(item => !isReceiptItemUnavailable(item));
                    const missingSupplierCount = importableItems.filter(item => !item.supplier && !item.supplierId).length;
                    const importableTotal = calculateImportableTotal(receipt.items);

                    return (
                        <div key={receipt.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                            <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50"
                                onClick={() => handleExpandReceipt(receipt.id)}>
                                {isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-800 truncate">
                                        {receipt.lotCode ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setTrackingLotCode(receipt.lotCode || null);
                                                }}
                                                className="text-orange-600 font-bold mr-2 hover:underline hover:text-orange-700"
                                            >
                                                [{receipt.lotCode}]
                                            </button>
                                        ) : null}
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
                                <span className="font-bold text-orange-600 text-sm">{formatPrice(importableTotal || receipt.totalAmount || 0)}</span>
                            </div>

                            {isExpanded && (
                                <div className="px-4 pb-4 border-t bg-gray-50">
                                    <div className="overflow-x-auto mt-3">
                                        <table className="w-full min-w-[860px] text-sm mt-3">
                                            <thead>
                                                <tr className="text-gray-500 text-xs border-b">
                                                    <th className="text-left py-2 whitespace-nowrap">Sản phẩm</th>
                                                    <th className="text-center whitespace-nowrap">Phân loại</th>
                                                    <th className="text-center whitespace-nowrap">SL</th>
                                                    <th className="text-center whitespace-nowrap">Giá nhập</th>
                                                    <th className="text-center whitespace-nowrap">NCC</th>
                                                    <th className="text-right whitespace-nowrap">Thành tiền</th>
                                                    <th className="text-right whitespace-nowrap">Tình trạng</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {receipt.items.map((item, i) => {
                                                    const priceVal = prices[i] ?? item.importPrice;
                                                    const quantityVal = quantities[i] ?? item.quantity;
                                                    const itemAvailability = getReceiptItemAvailability(item);
                                                    const isUnavailable = itemAvailability === 'unavailable';
                                                    const itemKey = `${receipt.id}_${i}`;
                                                    const isSupplierActive = supplierActiveKey === itemKey;
                                                    const supplierMatches = supplierList.filter(supplier => supplierMatchesSearch(supplier, supplierSearch || ''));
                                                    const canCreateSupplier = Boolean((supplierSearch || '').trim()) && !supplierList.some(supplier => supplier.name.toLowerCase() === (supplierSearch || '').trim().toLowerCase());

                                                    return (
                                                        <tr key={item.partLineId || `${item.productId}_${i}`} className={`border-b border-gray-100 ${isUnavailable ? 'bg-red-50/60 text-gray-400' : ''}`}>
                                                            <td className="py-2 pr-3">
                                                                <p className="font-medium text-gray-800">{item.productName}</p>
                                                                {item.supplier && <p className="text-[10px] text-purple-600">{item.supplier}</p>}
                                                            </td>
                                                            <td className="text-center">
                                                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{item.quality || '-'}</span>
                                                            </td>
                                                            <td className="text-center">
                                                                {receipt.status === 'draft' ? (
                                                                    <input
                                                                        type="number"
                                                                        value={quantityVal}
                                                                        disabled={isUnavailable}
                                                                        min={1}
                                                                        onChange={(event) => {
                                                                            const next = [...quantities];
                                                                            next[i] = Number(event.target.value) || 0;
                                                                            setEditingQuantities(prev => ({ ...prev, [receipt.id]: next }));
                                                                        }}
                                                                        onBlur={() => handleAutoSaveItem(receipt.id, i, priceVal, quantityVal)}
                                                                        className="mx-auto h-9 w-20 rounded-lg border px-2 text-center text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                                                        aria-label="Số lượng"
                                                                    />
                                                                ) : quantityVal}
                                                            </td>
                                                            <td className="text-center">
                                                                {receipt.status === 'draft' ? (
                                                                    <CurrencyInput
                                                                        value={priceVal}
                                                                        disabled={isUnavailable}
                                                                        onChange={(value) => {
                                                                            const next = [...prices];
                                                                            next[i] = value;
                                                                            setEditingPrices(prev => ({ ...prev, [receipt.id]: next }));
                                                                        }}
                                                                        onBlur={() => handleAutoSaveItem(receipt.id, i, priceVal, quantityVal)}
                                                                        className="mx-auto h-9 w-32 rounded-lg border px-2 text-center text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                                                    />
                                                                ) : formatPrice(item.importPrice)}
                                                            </td>
                                                            <td className="text-center">
                                                                {receipt.status === 'draft' ? (
                                                                    <div className="relative mx-auto w-40">
                                                                        <input
                                                                            type="text"
                                                                            value={isSupplierActive ? supplierSearch : (item.supplier || '')}
                                                                            disabled={isUnavailable}
                                                                            onChange={(event) => { setSupplierSearch(event.target.value); setSupplierActiveKey(itemKey); }}
                                                                            onFocus={() => { setSupplierActiveKey(itemKey); setSupplierSearch(item.supplier || ''); }}
                                                                            onBlur={() => setTimeout(() => setSupplierActiveKey(null), 200)}
                                                                            placeholder="Chọn NCC"
                                                                            className={`h-9 w-full rounded-lg border px-2 text-xs focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${!item.supplier ? 'border-red-300 bg-red-50/50' : 'border-gray-300'}`}
                                                                        />
                                                                        {isSupplierActive && (supplierMatches.length > 0 || canCreateSupplier) && (
                                                                            <div className="absolute z-50 mt-1 max-h-40 w-52 overflow-y-auto rounded-lg border bg-white text-xs shadow-lg">
                                                                                {supplierMatches.map(supplier => (
                                                                                    <button
                                                                                        key={supplier.id}
                                                                                        type="button"
                                                                                        className="w-full truncate px-3 py-2 text-left hover:bg-orange-50"
                                                                                        onMouseDown={(event) => {
                                                                                            event.preventDefault();
                                                                                            setSupplierActiveKey(null);
                                                                                            handleAutoSaveSupplier(receipt.id, i, supplier.name, supplier.id);
                                                                                        }}
                                                                                    >
                                                                                        {supplier.name}
                                                                                    </button>
                                                                                ))}
                                                                                {canCreateSupplier && (
                                                                                    <button
                                                                                        type="button"
                                                                                        className="w-full px-3 py-2 text-left font-semibold text-green-700 hover:bg-green-50"
                                                                                        onMouseDown={async (event) => {
                                                                                            event.preventDefault();
                                                                                            const supplierName = (supplierSearch || '').trim();
                                                                                            const contactValue = window.prompt('Nhap SDT, Zalo, Facebook hoac lien he khac cho NCC (co the bo trong):') || '';
                                                                                            const contactInput = buildInlineSupplierContactInput(supplierName, contactValue);
                                                                                            const supplierId = await reserveSupplierDocumentId(contactInput);
                                                                                            await setDoc(doc(db, 'suppliers', supplierId), {
                                                                                                name: supplierName,
                                                                                                ...buildSupplierContactDocumentFields(contactInput),
                                                                                                totalDebt: 0,
                                                                                                isActive: true,
                                                                                                createdAt: serverTimestamp(),
                                                                                                updatedAt: serverTimestamp(),
                                                                                            });
                                                                                            setSupplierActiveKey(null);
                                                                                            handleAutoSaveSupplier(receipt.id, i, supplierName, supplierId);
                                                                                        }}
                                                                                    >
                                                                                        + Tạo: {(supplierSearch || '').trim()}
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (item.supplier || '-')}
                                                            </td>
                                                            <td className="text-right font-medium">{isUnavailable ? 'Đã loại' : formatPrice(priceVal * quantityVal)}</td>
                                                            <td className="text-right">
                                                                {(receipt.status === 'draft' || receipt.status === 'ordered') ? (
                                                                    <div className="flex justify-end gap-1.5">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleMarkAvailability(receipt, item, i, true)}
                                                                            disabled={isProcessing}
                                                                            className={`rounded-full px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${(itemAvailability === 'in_stock' || itemAvailability === 'approved') ? 'bg-emerald-500 text-white' : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                                                                        >
                                                                            Có hàng
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleMarkAvailability(receipt, item, i, false)}
                                                                            disabled={isProcessing}
                                                                            className={`rounded-full px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${itemAvailability === 'unavailable' ? 'bg-red-500 text-white' : 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100'}`}
                                                                        >
                                                                            Không có
                                                                        </button>
                                                                    </div>
                                                                ) : <span className="text-xs text-gray-400">-</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="font-bold">
                                                    <td colSpan={5} className="py-2 text-right">Tổng cộng:</td>
                                                    <td className="text-right text-orange-600">{formatPrice(importableTotal)}</td>
                                                    <td />
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                    {receipt.note && <p className="mt-2 text-xs text-gray-500">{receipt.note}</p>}
                                    {receipt.status === 'draft' && missingSupplierCount > 0 && (
                                        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                                            Còn {missingSupplierCount}/{importableItems.length} dòng cần đặt chưa gắn NCC.
                                        </p>
                                    )}

                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        {receipt.status === 'draft' && (
                                            <>
                                                <button onClick={() => handleDelete(receipt.id)} disabled={isProcessing} className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50">
                                                    <Trash2 size={12} /> Xóa phiếu
                                                </button>
                                                <button onClick={() => handleOrderReceipt(receipt)} disabled={isProcessing || importableItems.length === 0 || missingSupplierCount > 0} className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                                                    {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <PackagePlus size={12} />} Chốt đặt hàng
                                                </button>
                                            </>
                                        )}
                                        {receipt.status === 'ordered' && (
                                            <>
                                                <button onClick={() => handleDelete(receipt.id)} disabled={isProcessing} className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50">
                                                    <Trash2 size={12} /> Hủy phiếu
                                                </button>
                                                <button onClick={() => handleImportReceipt(receipt)} disabled={isProcessing || importableItems.length === 0} className="ml-auto flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                                                    {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Xác nhận nhập kho
                                                </button>
                                            </>
                                        )}
                                        {receipt.status === 'completed' && (
                                            <span className="text-xs text-green-600 flex items-center gap-1">
                                                <CheckCircle2 size={12} /> Đã nhập kho {receipt.completedAt ? `lúc ${formatDate(receipt.completedAt)}` : ''}
                                            </span>
                                        )}
                                        {receipt.lotCode && (
                                            <button onClick={() => handlePrintLot(receipt)} className="ml-auto rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-200">
                                                In tem lô hàng
                                            </button>
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
                {hasMoreReceipts && (
                    <div className="flex justify-center rounded-xl border bg-white px-4 py-3">
                        <button
                            type="button"
                            onClick={() => refreshReceipts('more', lastReceiptDoc)}
                            disabled={loadingMoreReceipts}
                            className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loadingMoreReceipts && <Loader2 size={16} className="animate-spin" />}
                            Tải thêm {RECEIPT_BATCH_SIZE} phiếu
                        </button>
                    </div>
                )}
            </div>

            {/* Lot Tracking Modal */}
            <LotTrackingModal 
                isOpen={!!trackingLotCode} 
                onClose={() => setTrackingLotCode(null)} 
                initialSearchCode={trackingLotCode || ''}
            />

            {importPreviewModal.isOpen && (
                <ImportPreviewModal
                    importPreviewModal={importPreviewModal}
                    setImportPreviewModal={setImportPreviewModal}
                    forecastCostPrices={forecastCostPrices}
                    partTypeOptions={partTypeOptions}
                    suppliers={supplierList}
                    onConfirm={executeFinalImport}
                />
            )}

            <CreateReceiptModal
                isOpen={isCreateReceiptOpen}
                onClose={() => setIsCreateReceiptOpen(false)}
                parts={parts}
                retailProducts={retailProducts}
                onCreated={async () => {
                    setIsCreateReceiptOpen(false);
                    setActiveTab('draft');
                    await refreshReceipts();
                }}
                currentUser={user}
                suppliers={supplierList}
                initialReceiptType={createReceiptType}
                lockReceiptType
            />

            {/* Print Batch Modal */}
            {printBatchLots && printBatchLots.length > 0 && (
                <ProductQrLabelModal 
                    batchItems={printBatchLots} 
                    onClose={() => setPrintBatchLots(null)} 
                />
            )}
        </div>
    );
}
