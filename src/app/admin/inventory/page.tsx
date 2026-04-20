'use client';

import { useState, useEffect } from 'react';
import {
    Package, Plus, Search, CheckCircle2, Clock, Trash2, X,
    Save, Loader2, ChevronDown, ChevronRight,
    ArrowDownToLine, AlertTriangle
} from 'lucide-react';
import Modal from '@/components/admin/Modal';
import UniversalProductModal from '@/components/admin/UniversalProductModal';
import {
    collection, getDocs, addDoc, updateDoc, deleteDoc,
    doc, serverTimestamp, query, orderBy, getDoc, increment, limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import type { ImportReceipt, ImportReceiptItem, Product } from '@/lib/types';
import { toastError, toastSuccess } from '@/lib/toast';

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

    // Modal
    const [showModal, setShowModal] = useState(false);
    const [editingReceipt, setEditingReceipt] = useState<(ImportReceipt & { id: string }) | null>(null);

    // Form
    const [supplier, setSupplier] = useState('');
    const [note, setNote] = useState('');
    const [items, setItems] = useState<ImportReceiptItem[]>([]);
    const [selectedProductId, setSelectedProductId] = useState('');
    const [importQty, setImportQty] = useState(1);
    const [importPrice, setImportPrice] = useState(0);
    const [importQuality, setImportQuality] = useState('Zin');
    const [isProcessing, setIsProcessing] = useState(false);
    const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
    const [importType, setImportType] = useState<'retail' | 'component'>('retail');
    const [freeTextName, setFreeTextName] = useState('');
    const [itemWarning, setItemWarning] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showInlineCreate, setShowInlineCreate] = useState<'product' | 'part' | null>(null);

    // Expanded receipt
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // ── Load data ──
    useEffect(() => {
        const load = async () => {
            try {
                const [rSnap, pSnap] = await Promise.all([
                    getDocs(query(collection(db, 'import_receipts'), orderBy('createdAt', 'desc'))),
                    getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(50))),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatDate = (ts: any) => {
        if (!ts) return '—';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = ts as any;
        const d = t.toDate ? t.toDate() : new Date(t);
        return d.toLocaleDateString('vi-VN');
    };

    const addItem = () => {
        if (importQty <= 0 || importPrice <= 0) return;

        let productId = selectedProductId;
        let productName = '';

        if (selectedProductId) {
            // Selected from dropdown
            const product = products.find(p => p.id === selectedProductId);
            if (!product) return;
            productName = product.name;
        } else if (freeTextName.trim()) {
            // Free text — try to match
            const match = products.find(p => p.name.toLowerCase() === freeTextName.trim().toLowerCase() && (importType === 'component' ? p.category === 'Linh kiện' : p.category !== 'Linh kiện'));
            if (match) {
                productId = match.id;
                productName = match.name;
                setItemWarning('');
            } else {
                // Not found — warn but allow
                productId = 'custom_' + Date.now();
                productName = freeTextName.trim();
                setItemWarning(`"${productName}" chưa tồn tại trong hệ thống. Hệ thống sẽ tự tạo mới khi phiếu hoàn thành.`);
            }
        } else {
            return; // nothing selected
        }

        // Check if already exists with same quality
        const existing = items.find(i => i.productId === productId && i.quality === importQuality);
        if (existing) {
            setItems(prev => prev.map(i =>
                (i.productId === productId && i.quality === importQuality) ? { ...i, quantity: i.quantity + importQty, importPrice } : i
            ));
        } else {
            setItems(prev => [...prev, {
                productId,
                productName,
                quantity: importQty,
                importPrice,
                quality: importQuality,
                isNewProduct: productId.startsWith('custom_'),
                category: importType === 'component' ? 'Linh kiện' : 'Khác'
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any]);
        }
        setSelectedProductId('');
        setFreeTextName('');
        setImportQty(1);
        setImportPrice(0);
    };

    const removeItem = (productId: string) => {
        setItems(prev => prev.filter(i => i.productId !== productId));
    };

    const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.importPrice, 0);

    // ── Open modal ──
    const openModal = (receipt?: ImportReceipt & { id: string }) => {
        if (receipt) {
            setEditingReceipt(receipt);
            setSupplier(receipt.supplier);
            setNote(receipt.note || '');
            setItems(receipt.items || []);
        } else {
            setEditingReceipt(null);
            setSupplier('');
            setNote('');
            setItems([]);
        }
        setShowModal(true);
    };

    // ── Save receipt (draft) ──
    const handleSave = async () => {
        if (items.length === 0) {
            toastError('Chưa có sản phẩm nào!');
            return;
        }
        setIsProcessing(true);
        try {
            const data = {
                supplier,
                items,
                totalAmount,
                note,
                status: 'draft' as const,
                createdBy: user?.uid || '',
                createdByName: user?.displayName || 'Admin',
                updatedAt: serverTimestamp(),
            };

            if (editingReceipt) {
                await updateDoc(doc(db, 'import_receipts', editingReceipt.id), data);
                setReceipts(prev => prev.map(r => r.id === editingReceipt.id ? { ...r, ...data } : r));
            } else {
                const ref = await addDoc(collection(db, 'import_receipts'), { ...data, createdAt: serverTimestamp() });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setReceipts((prev: any) => [{ id: ref.id, ...data, createdAt: new Date() }, ...prev]);
            }
            setShowModal(false);
        } catch (err) {
            console.error(err);
            toastError('Lỗi khi lưu!');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Complete receipt: update stock + cost price (auto-create missing products) ──
    const handleComplete = async (receipt: ImportReceipt & { id: string }) => {
        if (receipt.status === 'completed') return;
        if (!confirm('Xác nhận hoàn thành nhập hàng? Stock và giá vốn sẽ được cập nhật.')) return;

        setIsProcessing(true);
        try {
            for (const item of receipt.items) {
                const productRef = doc(db, 'products', item.productId);
                const productSnap = await getDoc(productRef);

                if (!productSnap.exists()) {
                    // ── Auto-create product if it doesn't exist (custom_* items) ──
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const isNewProduct = (item as any).isNewProduct || item.productId.startsWith('custom_');
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const category = (item as any).category || 'Linh kiện';

                    if (isNewProduct || item.productId.startsWith('custom_')) {
                        // Create new product in products collection
                        const newProductData = {
                            name: item.productName,
                            brand: 'Khác',
                            category,
                            price_original: item.importPrice,
                            price_promo: 0,
                            costPrice: item.importPrice,
                            specs: {},
                            images: [],
                            imageUrl: '',
                            status: 'active',
                            description: `Tạo tự động từ phiếu nhập hàng`,
                            stock: item.quantity,
                            sold: 0,
                            condition: 'new',
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        };

                        // Use a generated ID instead of custom_ prefix
                        const newRef = await addDoc(collection(db, 'products'), newProductData);

                        // Update the item's productId in the receipt to point to the new product
                        const updatedItems = receipt.items.map(i =>
                            i.productId === item.productId
                                ? { ...i, productId: newRef.id }
                                : i
                        );
                        await updateDoc(doc(db, 'import_receipts', receipt.id), {
                            items: updatedItems,
                        });

                        continue; // stock already set during creation
                    } else {
                        // Product ID exists but doc doesn't — skip with warning
                        console.warn(`Product ${item.productId} (${item.productName}) not found, skipping.`);
                        continue;
                    }
                }

                // ── Existing product: update stock + weighted average cost ──
                const pData = productSnap.data();
                const oldStock = Number(pData.stock) || 0;
                const oldCostPrice = Number(pData.costPrice) || 0;

                // Weighted average cost price
                const newCostPrice = oldStock + item.quantity > 0
                    ? ((oldStock * oldCostPrice) + (item.quantity * item.importPrice)) / (oldStock + item.quantity)
                    : item.importPrice;

                await updateDoc(productRef, {
                    stock: increment(item.quantity),
                    costPrice: Math.round(newCostPrice),
                    updatedAt: serverTimestamp(),
                });
            }

            // Mark receipt completed
            await updateDoc(doc(db, 'import_receipts', receipt.id), {
                status: 'completed',
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ts = r.createdAt as any;
            const d = ts.toDate ? ts.toDate() : new Date(ts);
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
                <button onClick={() => openModal()}
                    className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 shadow-md shadow-orange-200/50 font-semibold text-sm">
                    <Plus size={18} /> Tạo phiếu nhập
                </button>
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

                    return (
                        <div key={receipt.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                            <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50"
                                onClick={() => setExpandedId(isExpanded ? null : receipt.id)}>
                                {isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-800 truncate">
                                        {receipt.supplier || 'Không có NCC'} — {receipt.items.length} SP
                                    </p>
                                    <p className="text-xs text-gray-500">{formatDate(receipt.createdAt)} • {receipt.createdByName}</p>
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
                                                <button onClick={() => openModal(receipt)}
                                                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Sửa</button>
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

            {/* ═══ Create/Edit Modal ═══ */}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingReceipt ? 'Sửa phiếu nhập' : 'Tạo phiếu nhập mới'} size="2xl" priority="high">

                        <div className="px-6 py-4 space-y-5 overflow-y-auto flex-1">
                            {/* Supplier + Note */}
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nhà cung cấp</label>
                                    <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)}
                                        placeholder="Tên NCC" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                                    <input type="text" value={note} onChange={e => setNote(e.target.value)}
                                        placeholder="Ghi chú (tùy chọn)" className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                                </div>
                            </div>

                            {/* Import Type Radio */}
                            <div className="bg-orange-50 rounded-xl p-4 space-y-3">
                                <h3 className="text-sm font-semibold text-orange-800 flex items-center gap-1">
                                    <Plus size={14} /> Thêm sản phẩm vào phiếu
                                </h3>
                                <div className="flex gap-4">
                                    <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${importType === 'retail' ? 'bg-white border-orange-400 shadow-sm' : 'border-transparent'
                                        }`}>
                                        <input type="radio" name="importType" value="retail" checked={importType === 'retail'}
                                            onChange={() => setImportType('retail')} className="accent-orange-500" />
                                        <span className="text-sm font-medium">Nhập Sản phẩm bán lẻ</span>
                                    </label>
                                    <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${importType === 'component' ? 'bg-white border-orange-400 shadow-sm' : 'border-transparent'
                                        }`}>
                                        <input type="radio" name="importType" value="component" checked={importType === 'component'}
                                            onChange={() => setImportType('component')} className="accent-orange-500" />
                                        <span className="text-sm font-medium">Nhập Linh kiện sửa chữa</span>
                                    </label>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-12 gap-2">
                                    {/* Product selection: dropdown + text input */}
                                    <div className="col-span-2 md:col-span-4 relative">
                                        <input
                                            type="text"
                                            value={freeTextName || (selectedProductId ? products.find(p => p.id === selectedProductId)?.name || '' : '')}
                                            onChange={(e) => {
                                                setFreeTextName(e.target.value);
                                                setSelectedProductId('');
                                                setItemWarning('');
                                                setShowSuggestions(true);
                                            }}
                                            onFocus={() => setShowSuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                            placeholder={importType === 'retail' ? 'Tên sản phẩm...' : 'Tên linh kiện...'}
                                            className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                                        />
                                        {/* Suggestions dropdown */}
                                        {showSuggestions && freeTextName.trim() && (
                                            <div className="absolute z-20 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                                                {products.filter(p =>
                                                    p.name.toLowerCase().includes(freeTextName.toLowerCase())
                                                ).slice(0, 8).map(p => (
                                                    <button key={p.id}
                                                        onMouseDown={() => {
                                                            setSelectedProductId(p.id);
                                                            setFreeTextName('');
                                                            setItemWarning('');
                                                            setShowSuggestions(false);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 transition-colors">
                                                        <span className="font-medium">{p.name}</span>
                                                        <span className="text-xs text-gray-400 ml-1">(Kho: {p.stock || 0})</span>
                                                    </button>
                                                ))}
                                                {products.filter(p => p.name.toLowerCase().includes(freeTextName.toLowerCase())).length === 0 && (
                                                    <div className="px-3 py-2 text-xs text-amber-600">⚠️ Không tìm thấy — sẽ nhập tên tự do</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <select value={importQuality} onChange={e => setImportQuality(e.target.value)} aria-label="Phân loại chất lượng"
                                        className="col-span-1 md:col-span-2 px-2 py-2 border rounded-lg text-sm bg-white">
                                        <option value="Zin">Zin</option>
                                        <option value="Loại 1">Loại 1</option>
                                        <option value="Loại 2">Loại 2</option>
                                        <option value="Bóc máy">Bóc máy</option>
                                    </select>
                                    <input type="number" value={importQty} onChange={e => setImportQty(Number(e.target.value))}
                                        placeholder="SL" min={1}
                                        className="col-span-1 md:col-span-1 px-2 py-2 border rounded-lg text-sm text-center" />
                                    <input type="number" value={importPrice || ''} onChange={e => setImportPrice(Number(e.target.value))}
                                        placeholder="Giá nhập"
                                        className="col-span-1 md:col-span-3 px-3 py-2 border rounded-lg text-sm text-right" />
                                    <button onClick={addItem}
                                        className="col-span-2 md:col-span-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium flex items-center justify-center gap-1 py-2 md:py-0">
                                        <Plus size={14} /> Thêm
                                    </button>
                                </div>

                                {/* Tạo mã mới button */}
                                <button
                                    type="button"
                                    onClick={() => setShowInlineCreate(importType === 'component' ? 'part' : 'product')}
                                    className="flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 px-3 py-2 rounded-lg border border-green-200 transition-colors"
                                >
                                    <Plus size={14} />
                                    Tạo mã mới ({importType === 'component' ? 'Linh kiện' : 'Sản phẩm bán lẻ'})
                                </button>

                                {/* Warning */}
                                {itemWarning && (
                                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                                        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                                        <span>{itemWarning}</span>
                                    </div>
                                )}
                            </div>

                            {/* Items list */}
                            {items.length > 0 && (
                                <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
                                    <table className="w-full min-w-[600px] text-sm">
                                        <thead>
                                            <tr className="text-gray-500 text-xs border-b">
                                                <th className="text-left py-2 whitespace-nowrap">Sản phẩm</th>
                                                <th className="text-center whitespace-nowrap">Phân loại</th>
                                                <th className="text-center whitespace-nowrap">SL</th>
                                                <th className="text-right whitespace-nowrap">Giá nhập</th>
                                                <th className="text-right whitespace-nowrap">Thành tiền</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((item, i) => (
                                                <tr key={i} className="border-b border-gray-100">
                                                    <td className="py-2">{item.productName}</td>
                                                    <td className="text-center">
                                                        <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{item.quality || '—'}</span>
                                                    </td>
                                                    <td className="text-center">
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={item.quantity}
                                                            aria-label="Số lượng"
                                                            onChange={(e) => {
                                                                const nextQty = Math.max(1, Number(e.target.value) || 1);
                                                                setItems(prev => prev.map((x, idx) => idx === i ? { ...x, quantity: nextQty } : x));
                                                            }}
                                                            className="w-20 px-2 py-1 border rounded-lg text-sm text-center bg-white"
                                                        />
                                                    </td>
                                                    <td className="text-right">
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={item.importPrice}
                                                            aria-label="Giá nhập"
                                                            onChange={(e) => {
                                                                const nextPrice = Math.max(0, Number(e.target.value) || 0);
                                                                setItems(prev => prev.map((x, idx) => idx === i ? { ...x, importPrice: nextPrice } : x));
                                                            }}
                                                            className="w-32 px-2 py-1 border rounded-lg text-sm text-right bg-white"
                                                        />
                                                    </td>
                                                    <td className="text-right font-medium">{formatPrice(item.quantity * item.importPrice)}</td>
                                                    <td className="text-right">
                                                        <button onClick={() => removeItem(item.productId)} aria-label="Xóa dòng" title="Xóa"
                                                            className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="font-bold text-orange-600">
                                                <td colSpan={3} className="py-2 text-right">Tổng cộng:</td>
                                                <td className="text-right">{formatPrice(totalAmount)}</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            {items.length === 0 && (
                                <p className="text-center py-8 text-gray-400 text-sm">Chưa có sản phẩm. Chọn và thêm ở trên.</p>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-white shrink-0 sticky bottom-0 md:static z-10">
                            <button onClick={() => setShowModal(false)} aria-label="Hủy" title="Hủy"
                                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Hủy</button>
                            <button onClick={handleSave} disabled={isProcessing || items.length === 0}
                                className="px-5 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2">
                                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                Lưu phiếu (Nháp)
                            </button>
                        </div>
            </Modal>

            {/* Inline Create Modal — via UniversalProductModal */}
            <UniversalProductModal
                isOpen={showInlineCreate === 'product'}
                onClose={() => setShowInlineCreate(null)}
                mode="retail"
                submitLabel="Tạo & Thêm vào phiếu"
                onCreated={(newProduct) => {
                    setProducts(prev => [...prev, newProduct]);
                    setItems(prev => [...prev, {
                        productId: newProduct.id,
                        productName: newProduct.name,
                        quantity: 1,
                        importPrice: 0,
                        quality: 'Zin',
                    }]);
                    setShowInlineCreate(null);
                }}
            />
            <UniversalProductModal
                isOpen={showInlineCreate === 'part'}
                onClose={() => setShowInlineCreate(null)}
                mode="component"
                submitLabel="Tạo & Thêm vào phiếu"
                onCreated={(newPart) => {
                    setProducts(prev => [...prev, newPart]);
                    setItems(prev => [...prev, {
                        productId: newPart.id,
                        productName: newPart.name,
                        quantity: 1,
                        importPrice: 0,
                        quality: 'Zin',
                    }]);
                    setShowInlineCreate(null);
                }}
            />
        </div>
    );
}

