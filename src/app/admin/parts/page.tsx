'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect } from 'react';
import {
    Plus,
    Search,
    Edit,
    Trash2,
    X,
    Loader2,
    Settings,
    Wrench,
    ChevronDown,
    ChevronRight,
    CheckCircle2,
    Clock,
    PackagePlus,
    Save
} from 'lucide-react';
import { useFirestoreCollection, updateDocument, deleteDocument, addDocumentWithId } from '@/lib/useFirestore';
import { generateSlug } from '@/lib/utils';
import { orderBy } from 'firebase/firestore';
import {
    collection, getDocs, updateDoc, deleteDoc,
    doc, serverTimestamp, query, orderBy as fbOrderBy, getDoc, increment, addDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';

// Product type specifically tailored for Parts
interface Part {
    id: string;
    name: string;
    price_original: number;
    price_promo?: number;
    category: string;
    description: string;
    stock: number;
    status: 'active' | 'inactive';
    quality?: string;
    createdAt?: any;
}

interface ImportReceiptItem {
    productId: string;
    productName: string;
    quantity: number;
    importPrice: number;
    quality?: string;
}

interface ImportReceipt {
    id: string;
    supplier: string;
    items: ImportReceiptItem[];
    totalAmount: number;
    note?: string;
    status: 'draft' | 'completed';
    createdBy: string;
    createdByName: string;
    createdAt: any;
    completedAt?: any;
}

const QUALITY_OPTIONS = ['Zin', 'Loại 1', 'Loại 2', 'Bóc máy'];

export default function PartsPage() {
    useAuth(); // Ensure authenticated
    const { data: products, loading } = useFirestoreCollection<Part>('products', [orderBy('createdAt', 'desc')]);
    const parts = products.filter(p => p.category === 'Linh kiện');

    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPart, setEditingPart] = useState<Part | null>(null);
    const [activeTab, setActiveTab] = useState<'parts' | 'proposals'>('parts');

    // Import Proposals State
    const [draftReceipts, setDraftReceipts] = useState<ImportReceipt[]>([]);
    const [loadingDrafts, setLoadingDrafts] = useState(true);
    const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
    const [editingPrices, setEditingPrices] = useState<Record<string, number[]>>({});
    const [isProcessing, setIsProcessing] = useState(false);

    // Fetch draft import receipts
    useEffect(() => {
        const loadDrafts = async () => {
            setLoadingDrafts(true);
            try {
                const snap = await getDocs(query(collection(db, 'import_receipts'), fbOrderBy('createdAt', 'desc')));
                const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as ImportReceipt));
                setDraftReceipts(all);
            } catch (err) {
                console.error('Error loading import receipts:', err);
            } finally {
                setLoadingDrafts(false);
            }
        };
        loadDrafts();
    }, []);

    const drafts = draftReceipts.filter(r => r.status === 'draft');

    const handleDelete = async (part: Part) => {
        if (confirm(`Bạn có chắc muốn xóa linh kiện "${part.name}"?`)) {
            try {
                await deleteDocument('products', part.id);
            } catch {
                alert('Lỗi khi xóa linh kiện!');
            }
        }
    };

    const filteredParts = parts.filter((p) => {
        const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchSearch;
    });

    const formatPrice = (price?: number) => {
        if (!price) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
    };

    const formatDate = (ts: any) => {
        if (!ts) return '—';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    };

    // ─── Draft Receipt Actions ─────────────
    const handleExpandReceipt = (receiptId: string) => {
        if (expandedReceiptId === receiptId) {
            setExpandedReceiptId(null);
        } else {
            setExpandedReceiptId(receiptId);
            const receipt = draftReceipts.find(r => r.id === receiptId);
            if (receipt) {
                setEditingPrices({
                    [receiptId]: receipt.items.map(i => i.importPrice)
                });
            }
        }
    };

    const handleUpdatePrices = async (receipt: ImportReceipt) => {
        const prices = editingPrices[receipt.id];
        if (!prices) return;

        setIsProcessing(true);
        try {
            const updatedItems = receipt.items.map((item, idx) => ({
                ...item,
                importPrice: prices[idx] ?? item.importPrice,
            }));
            const totalAmount = updatedItems.reduce((sum, i) => sum + i.importPrice * i.quantity, 0);

            await updateDoc(doc(db, 'import_receipts', receipt.id), {
                items: updatedItems,
                totalAmount,
                updatedAt: serverTimestamp(),
            });

            setDraftReceipts(prev => prev.map(r =>
                r.id === receipt.id ? { ...r, items: updatedItems, totalAmount } : r
            ));
            alert('✅ Đã cập nhật giá nhập!');
        } catch (err) {
            console.error(err);
            alert('Lỗi khi cập nhật giá!');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCompleteReceipt = async (receipt: ImportReceipt) => {
        // First, check if there are items with importPrice = 0
        const hasZeroPrice = receipt.items.some(i => i.importPrice <= 0);
        if (hasZeroPrice) {
            if (!confirm('Có linh kiện chưa cập nhật giá nhập (= 0đ). Bạn vẫn muốn tiếp tục?')) return;
        } else {
            if (!confirm('Xác nhận nhập kho? Stock và giá vốn sẽ được cập nhật.')) return;
        }

        setIsProcessing(true);
        try {
            for (const item of receipt.items) {
                // Check if productId starts with custom_ → need to create the product first
                if (item.productId.startsWith('custom_')) {
                    // Check if a product with the same name already exists
                    const existingPart = parts.find(p => p.name.toLowerCase() === item.productName.toLowerCase());
                    if (existingPart) {
                        // Use existing part
                        item.productId = existingPart.id;
                    } else {
                        // Create new product in collection
                        const newPartRef = await addDoc(collection(db, 'products'), {
                            name: item.productName,
                            brand: '',
                            category: 'Linh kiện',
                            price_original: item.importPrice,
                            price_promo: 0,
                            specs: {},
                            images: [],
                            status: 'active',
                            description: '',
                            stock: 0,
                            sold: 0,
                            quality: item.quality || 'Zin',
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        });
                        item.productId = newPartRef.id;
                    }
                }

                const productRef = doc(db, 'products', item.productId);
                const productSnap = await getDoc(productRef);

                if (productSnap.exists()) {
                    const pData = productSnap.data();
                    const oldStock = Number(pData.stock) || 0;
                    const oldCostPrice = Number(pData.costPrice) || Number(pData.price_original) || 0;

                    // Weighted average cost price
                    const newCostPrice = oldStock + item.quantity > 0
                        ? ((oldStock * oldCostPrice) + (item.quantity * item.importPrice)) / (oldStock + item.quantity)
                        : item.importPrice;

                    await updateDoc(productRef, {
                        stock: increment(item.quantity),
                        costPrice: Math.round(newCostPrice),
                        price_original: Math.round(newCostPrice),
                        updatedAt: serverTimestamp(),
                    });
                }
            }

            // Mark receipt completed
            await updateDoc(doc(db, 'import_receipts', receipt.id), {
                status: 'completed',
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            setDraftReceipts(prev => prev.map(r =>
                r.id === receipt.id ? { ...r, status: 'completed' as const } : r
            ));

            alert('✅ Nhập kho thành công! Stock và giá vốn đã cập nhật.');
        } catch (err) {
            console.error(err);
            alert('Lỗi khi hoàn thành nhập hàng!');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeleteDraft = async (id: string) => {
        if (!confirm('Xóa phiếu đề xuất này?')) return;
        try {
            await deleteDoc(doc(db, 'import_receipts', id));
            setDraftReceipts(prev => prev.filter(r => r.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Wrench className="text-orange-500" /> Quản lý Kho Linh Kiện
                    </h1>
                    <p className="text-gray-500">{parts.length} linh kiện · {drafts.length} đề xuất nhập hàng</p>
                </div>
                {activeTab === 'parts' && (
                    <button
                        onClick={() => { setEditingPart(null); setIsModalOpen(true); }}
                        className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        <Plus size={20} />
                        Thêm linh kiện
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('parts')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
                        activeTab === 'parts'
                            ? 'bg-white text-orange-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Settings size={16} />
                    Danh sách Linh Kiện
                </button>
                <button
                    onClick={() => setActiveTab('proposals')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
                        activeTab === 'proposals'
                            ? 'bg-white text-orange-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <PackagePlus size={16} />
                    Đề xuất Nhập Hàng
                    {drafts.length > 0 && (
                        <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{drafts.length}</span>
                    )}
                </button>
            </div>

            {/* ═══════ TAB 1: Parts List ═══════ */}
            {activeTab === 'parts' && (
                <>
                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Tìm theo tên linh kiện hoặc dòng máy..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Parts Table */}
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 size={32} className="animate-spin text-orange-500" />
                            </div>
                        ) : filteredParts.length === 0 ? (
                            <div className="text-center py-20">
                                <Settings size={48} className="mx-auto text-gray-300 mb-4" />
                                <p className="text-gray-500">{searchQuery ? 'Không tìm thấy linh kiện nào' : 'Chưa có linh kiện nào trong kho'}</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tên Linh Kiện</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Dòng máy tương thích</th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Giá Nhập (Vốn)</th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Giá Bán (Sửa chữa)</th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Tồn Kho</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Hành động</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredParts.map((part) => (
                                        <tr key={part.id} className="hover:bg-orange-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="font-medium text-gray-900">{part.name}</p>
                                                {part.quality && (
                                                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">
                                                        {part.quality}
                                                    </span>
                                                )}
                                                {part.status === 'inactive' && (
                                                    <span className="inline-block ml-2 mt-1 px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded-full">
                                                        Tạm ẩn
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] truncate">
                                                {part.description || '—'}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <p className="text-sm text-gray-500">{formatPrice(part.price_original)}</p>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <p className="text-sm font-bold text-orange-600">{formatPrice(part.price_promo)}</p>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`text-sm font-bold ${part.stock > 10 ? 'text-green-600' : part.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                    {part.stock}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => { setEditingPart(part); setIsModalOpen(true); }}
                                                        className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                                                        title="Sửa"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(part)}
                                                        className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                                                        title="Xóa"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {/* ═══════ TAB 2: Import Proposals ═══════ */}
            {activeTab === 'proposals' && (
                <div className="space-y-4">
                    {loadingDrafts ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 size={32} className="animate-spin text-orange-500" />
                        </div>
                    ) : drafts.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-100">
                            <PackagePlus size={48} className="mx-auto text-gray-300 mb-4" />
                            <p className="text-gray-500">Không có đề xuất nhập hàng nào</p>
                            <p className="text-gray-400 text-sm mt-1">Đề xuất sẽ tự động xuất hiện khi KTV yêu cầu linh kiện ngoài kho</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {drafts.map((receipt) => {
                                const isExpanded = expandedReceiptId === receipt.id;
                                const prices = editingPrices[receipt.id] || receipt.items.map(i => i.importPrice);

                                return (
                                    <div key={receipt.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                        {/* Receipt Header */}
                                        <div
                                            className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                            onClick={() => handleExpandReceipt(receipt.id)}
                                        >
                                            <div className="flex items-center gap-4">
                                                {isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-yellow-100 text-yellow-700">
                                                            <Clock size={12} />
                                                            Nháp
                                                        </span>
                                                        <span className="font-semibold text-gray-800">#{receipt.id.slice(-6).toUpperCase()}</span>
                                                    </div>
                                                    <p className="text-sm text-gray-500 mt-0.5">
                                                        {receipt.supplier} · {receipt.items.length} sản phẩm · {formatDate(receipt.createdAt)}
                                                    </p>
                                                    {receipt.note && (
                                                        <p className="text-xs text-blue-600 mt-1 italic">{receipt.note}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-gray-700">
                                                    {formatPrice(receipt.totalAmount)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Expanded: Item Details + Price Editing */}
                                        {isExpanded && (
                                            <div className="border-t border-gray-100">
                                                <table className="w-full">
                                                    <thead className="bg-gray-50/80">
                                                        <tr>
                                                            <th className="px-6 py-2 text-left text-xs font-semibold text-gray-500">Linh kiện</th>
                                                            <th className="px-6 py-2 text-center text-xs font-semibold text-gray-500">Chất lượng</th>
                                                            <th className="px-6 py-2 text-center text-xs font-semibold text-gray-500">SL</th>
                                                            <th className="px-6 py-2 text-center text-xs font-semibold text-gray-500">Giá nhập (VNĐ)</th>
                                                            <th className="px-6 py-2 text-right text-xs font-semibold text-gray-500">Thành tiền</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {receipt.items.map((item, idx) => {
                                                            const priceVal = prices[idx] ?? item.importPrice;
                                                            const isCustom = item.productId?.startsWith('custom_');
                                                            return (
                                                                <tr key={idx} className="hover:bg-orange-50/30">
                                                                    <td className="px-6 py-3">
                                                                        <p className="font-medium text-gray-800 text-sm">{item.productName}</p>
                                                                        {isCustom && (
                                                                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">
                                                                                Ngoài kho
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-6 py-3 text-center text-sm text-gray-600">{item.quality || '—'}</td>
                                                                    <td className="px-6 py-3 text-center text-sm font-semibold">{item.quantity}</td>
                                                                    <td className="px-6 py-3">
                                                                        <input
                                                                            type="number"
                                                                            value={priceVal}
                                                                            onChange={(e) => {
                                                                                const newPrices = [...prices];
                                                                                newPrices[idx] = Number(e.target.value) || 0;
                                                                                setEditingPrices(prev => ({ ...prev, [receipt.id]: newPrices }));
                                                                            }}
                                                                            className="w-full max-w-[140px] mx-auto block h-9 px-3 text-sm text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                                            min={0}
                                                                        />
                                                                    </td>
                                                                    <td className="px-6 py-3 text-right text-sm font-semibold text-gray-700">
                                                                        {formatPrice(priceVal * item.quantity)}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="bg-gray-50">
                                                            <td colSpan={4} className="px-6 py-3 text-right text-sm font-bold text-gray-700">Tổng cộng:</td>
                                                            <td className="px-6 py-3 text-right text-sm font-bold text-orange-600">
                                                                {formatPrice(prices.reduce((sum, p, idx) => sum + p * (receipt.items[idx]?.quantity || 1), 0))}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>

                                                {/* Action Buttons */}
                                                <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50/50">
                                                    <button
                                                        onClick={() => handleDeleteDraft(receipt.id)}
                                                        disabled={isProcessing}
                                                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        <Trash2 size={15} />
                                                        Xóa phiếu
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdatePrices(receipt)}
                                                        disabled={isProcessing}
                                                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        <Save size={15} />
                                                        Lưu giá nhập
                                                    </button>
                                                    <button
                                                        onClick={() => handleCompleteReceipt(receipt)}
                                                        disabled={isProcessing}
                                                        className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                                                    >
                                                        {isProcessing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                                                        Xác nhận Nhập kho
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <PartModal
                    part={editingPart}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </div>
    );
}

// Part Modal Component
function PartModal({
    part,
    onClose,
}: {
    part: Part | null;
    onClose: () => void;
}) {
    const [formData, setFormData] = useState({
        name: part?.name || '',
        price_original: part?.price_original || '' as number | '',
        price_promo: part?.price_promo || '' as number | '',
        description: part?.description || '',
        stock: part?.stock ?? '' as number | '',
        status: part?.status || 'active',
        quality: part?.quality || 'Zin',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const data = {
                ...formData,
                category: 'Linh kiện',
                price_original: Number(formData.price_original) || 0,
                price_promo: Number(formData.price_promo) || 0,
                stock: Number(formData.stock) || 0,
            };

            if (part) {
                await updateDocument('products', part.id, data);
            } else {
                const baseSlug = generateSlug(data.name);
                let finalSlug = baseSlug;
                const checkRef = await getDoc(doc(db, 'products', baseSlug));
                if (checkRef.exists()) {
                    finalSlug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
                }
                await addDocumentWithId('products', finalSlug, { ...data, sold: 0, imageUrl: '' });
            }

            onClose();
        } catch (error) {
            console.error('Error saving part:', error);
            alert('Lỗi khi lưu linh kiện!');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b bg-gray-50/80">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                            <Settings size={20} />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800">{part ? 'Sửa thông tin linh kiện' : 'Thêm linh kiện mới'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên linh kiện *</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                            className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                            placeholder="Vd: Màn hình iPhone 13 Pro Max"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        {/* Device Compatibility */}
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Dòng máy tương thích</label>
                            <input
                                type="text"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                                placeholder="Vd: iPhone 13 Pro, iPhone 13 Pro Max"
                            />
                        </div>

                        {/* Quality */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phân loại/Chất lượng</label>
                            <select
                                value={formData.quality}
                                onChange={(e) => setFormData({ ...formData, quality: e.target.value })}
                                className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                            >
                                {QUALITY_OPTIONS.map(q => (
                                    <option key={q} value={q}>{q}</option>
                                ))}
                            </select>
                        </div>

                        {/* Stock */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Số lượng Tồn kho gốc</label>
                            <input
                                type="number"
                                value={formData.stock}
                                onChange={(e) => setFormData({ ...formData, stock: e.target.value ? Number(e.target.value) : '' })}
                                min={0}
                                className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                                placeholder="0"
                            />
                            <p className="text-xs text-gray-500 mt-1">Sẽ tự động cập nhật khi nhập kho</p>
                        </div>

                        {/* Price Original/Import */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá vốn (VNĐ) *</label>
                            <input
                                type="number"
                                value={formData.price_original}
                                onChange={(e) => setFormData({ ...formData, price_original: e.target.value ? Number(e.target.value) : '' })}
                                required
                                min={0}
                                className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                                placeholder="0"
                            />
                        </div>

                        {/* Price Promo/Selling */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá Bán / Giá Sửa thay thế (VNĐ) *</label>
                            <input
                                type="number"
                                value={formData.price_promo}
                                onChange={(e) => setFormData({ ...formData, price_promo: e.target.value ? Number(e.target.value) : '' })}
                                required
                                min={0}
                                className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow font-semibold text-orange-600"
                                placeholder="0"
                            />
                        </div>
                    </div>
                    
                    {/* Status */}
                    <div>
                        <label className="flex items-center gap-3 cursor-pointer mt-4 p-3 border rounded-xl hover:bg-gray-50 transition-colors">
                            <input
                                type="checkbox"
                                checked={formData.status === 'active'}
                                onChange={(e) => setFormData({ ...formData, status: e.target.checked ? 'active' : 'inactive' })}
                                className="w-5 h-5 accent-orange-500 rounded"
                            />
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-800">Đang hoạt động</span>
                                <span className="text-xs text-gray-500">Bỏ chọn nếu muốn tạm ẩn linh kiện này khỏi danh sách chọn của Kỹ Thuật Viên</span>
                            </div>
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-1/3 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm transition-all"
                        >
                            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : null}
                            {part ? 'Cập nhật linh kiện' : 'Lưu linh kiện mới'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
