'use client';

import { useState, useEffect } from 'react';
import type React from 'react';
import { Building2, CheckCircle2, ChevronDown, Loader2, PackagePlus, Plus, Save, Search, Trash2 } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import CurrencyInput from '@/components/admin/CurrencyInput';
import Modal from '@/components/admin/Modal';
import { db } from '@/lib/firebase';
import type { Product } from '@/lib/types';
import { normalizeDocId } from '@/lib/idNormalizer';
import { buildProductCodeFromId } from '@/lib/productCodes';
import { createProductWithCodes } from '@/lib/productCodeRegistry';
import { buildInlineSupplierContactInput, buildSupplierContactDocumentFields, reserveSupplierDocumentId } from '@/lib/supplierDocumentIds';
import { toastError, toastSuccess } from '@/lib/toast';
import type { ImportPreviewState, ImportReceiptItem, SupplierOption } from './importReceiptTypes';
import { isPartCategory } from '@/lib/constants';
import { generateSearchKeywords } from '@/lib/utils';

function buildImportReceiptBaseId() {
    const now = new Date();
    const dateKey = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `NH-${dateKey}-${Date.now().toString(36).toUpperCase()}`;
}

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

async function getAvailableImportReceiptId() {
    const baseId = buildImportReceiptBaseId();
    for (let i = 0; i < 20; i += 1) {
        const candidate = i === 0 ? baseId : `${baseId}-${i + 1}`;
        const snap = await getDoc(doc(db, 'import_receipts', candidate));
        if (!snap.exists()) return candidate;
    }
    throw new Error('Không thể tạo mã phiếu nhập không trùng.');
}

interface ImportPreviewModalProps {
    importPreviewModal: ImportPreviewState;
    setImportPreviewModal: React.Dispatch<React.SetStateAction<ImportPreviewState>>;
    forecastCostPrices: Map<string, number>;
    partTypeOptions: string[];
    suppliers: SupplierOption[];
    onConfirm: (paymentMethod: 'cash' | 'bank' | 'debt') => Promise<void>;
}
// Import Preview Modal Component
export function ImportPreviewModal({
    importPreviewModal,
    setImportPreviewModal,
    forecastCostPrices,
    partTypeOptions,
    onConfirm
}: ImportPreviewModalProps) {
    const { receipt, newParts } = importPreviewModal;
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank' | 'debt'>('debt');
    if (!receipt) return null;
    const newItems = receipt.items.filter((i: ImportReceiptItem) => {
        const partKey = i.productId || i.partLineId || '';
        return partKey in newParts;
    });
    const existingItems = receipt.items.filter((i: ImportReceiptItem) => {
        const partKey = i.productId || i.partLineId || '';
        return !(partKey in newParts);
    });
    const handleNewPartChange = (productId: string, field: string, value: string | number | string[]) => {
        setImportPreviewModal((prev) => ({
            ...prev,
            newParts: {
                ...prev.newParts,
                [productId]: {
                    ...prev.newParts[productId],
                    [field]: value
                }
            }
        }));
    };
    const handleNewPartTaxonomyChange = (productId: string, ids: string[], category: string) => {
        setImportPreviewModal((prev) => ({
            ...prev,
            newParts: {
                ...prev.newParts,
                [productId]: {
                    ...prev.newParts[productId],
                    categoryIds: ids,
                    category,
                }
            }
        }));
    };
    const isRetail = receipt?.receiptType === 'retail';
    const isReady = newItems.every((item: ImportReceiptItem, idx: number) => {
        const partKey = item.productId || item.partLineId || `custom_${idx}`;
        const info = newParts[partKey];
        const hasTaxonomy = Boolean(info?.categoryIds && info.categoryIds.length > 0);
        if (isRetail) {
            return info && hasTaxonomy && Number(info.price_promo) > 0;
        }
        return info && hasTaxonomy && info.model && info.partType && Number(info.price_promo) > 0;
    });
    return (
        <Modal
            isOpen={true}
            onClose={() => setImportPreviewModal({ isOpen: false, receipt: null, newParts: {} })}
            title="Chi tiết nhập kho"
            size="2xl"
        >
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {/* Payment Method Toggle */}
                <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                    <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                        <Building2 size={18} className="text-purple-500" />
                        Phương thức thanh toán
                    </h4>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setPaymentMethod('debt')}
                            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${paymentMethod === 'debt'
                                ? 'border-red-500 bg-red-50 text-red-700'
                                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                }`}
                        >
                            📋 Ghi công nợ
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaymentMethod('cash')}
                            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${paymentMethod === 'cash'
                                ? 'border-green-500 bg-green-50 text-green-700'
                                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                }`}
                        >
                            💰 Thanh toán ngay
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaymentMethod('bank')}
                            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${paymentMethod === 'bank'
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                }`}
                        >
                            Chuyen khoan
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        {paymentMethod === 'debt'
                            ? 'Số tiền sẽ được cộng vào công nợ NCC (theo từng SP).'
                            : 'Ghi nhận đã thanh toán, không cộng công nợ.'}
                    </p>
                    {/* Per-item supplier summary */}
                    {(() => {
                        const supplierMap = new Map<string, number>();
                        receipt.items.forEach(it => {
                            const name = it.supplier || 'Chưa gán NCC';
                            supplierMap.set(name, (supplierMap.get(name) || 0) + it.importPrice * it.quantity);
                        });
                        return supplierMap.size > 0 ? (
                            <div className="mt-3 space-y-1">
                                {Array.from(supplierMap).map(([name, amount]) => (
                                    <div key={name} className="flex justify-between text-xs">
                                        <span className={name === 'Chưa gán NCC' ? 'text-yellow-600 italic' : 'text-gray-600'}>{name}</span>
                                        <span className="font-medium text-gray-700">{new Intl.NumberFormat('vi-VN').format(amount)}đ</span>
                                    </div>
                                ))}
                            </div>
                        ) : null;
                    })()}
                </div>
                {/* Existing Items Forecast */}
                {existingItems.length > 0 && (
                    <div>
                        <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <CheckCircle2 size={18} className="text-blue-500" />
                            Linh kiện đã có trong kho ({existingItems.length})
                        </h4>
                        <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100/50 space-y-3">
                            {existingItems.map((item: ImportReceiptItem, idx: number) => {
                                const partKey = item.productId || item.partLineId || `existing_${idx}`;
                                return (
                                    <div key={partKey} className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                        <div>
                                            <p className="font-medium text-sm text-gray-800">{item.productName}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">SL: {item.quantity} x {new Intl.NumberFormat('vi-VN').format(item.importPrice)}đ {item.supplier && <span className="text-purple-600 ml-1">· {item.supplier}</span>}</p>
                                        </div>
                                        {forecastCostPrices.has(item.productId) && (
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-500 uppercase font-medium">Giá vốn sẽ thành</p>
                                                <p className={`text-sm font-bold flex items-center justify-end gap-1 ${forecastCostPrices.get(item.productId)! > (item.oldCostPrice || 0) ? 'text-red-600' : 'text-green-600'
                                                    }`}>
                                                    {new Intl.NumberFormat('vi-VN').format(forecastCostPrices.get(item.productId)!)}đ
                                                    {forecastCostPrices.get(item.productId)! > (item.oldCostPrice || 0) ? <span className="text-xs text-red-500 ml-1">↑ tăng</span> : <span className="text-xs text-green-500 ml-1">↓ giảm</span>}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {/* New Items Configuration */}
                {newItems.length > 0 && (
                    <div>
                        <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <PackagePlus size={18} className="text-orange-500" />
                            {isRetail ? `Sản phẩm mới cần thông tin (${newItems.length})` : `Linh kiện mới cần thông tin (${newItems.length})`}
                        </h4>
                        <div className="space-y-4">
                            {newItems.map((item: ImportReceiptItem, idx: number) => {
                                const partKey = item.productId || item.partLineId || `custom_${idx}`;
                                const info = newParts[partKey] || {};
                                return (
                                    <div key={partKey} className="bg-orange-50/50 border border-orange-100 p-4 rounded-xl space-y-4 shadow-sm">
                                        <div>
                                            <p className="font-medium text-gray-800 text-sm">{item.productName} {item.quality && <span className="text-[10px] bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded ml-2 font-medium">{item.quality}</span>}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">Giá nhập: <span className="font-semibold text-red-500">{new Intl.NumberFormat('vi-VN').format(item.importPrice)}đ</span>, SL: {item.quantity}</p>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {isRetail ? (
                                                /* Retail: Category Taxonomy Selector */
                                                <>
                                                    <div className="md:col-span-2">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Danh mục sản phẩm *</label>
                                                        <CategoryTaxonomySelector
                                                            type="retail"
                                                            value={info.categoryIds || []}
                                                            onChange={(ids, catName) => handleNewPartTaxonomyChange(partKey, ids, catName)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Nguồn cung cấp *</label>
                                                        <input
                                                            type="text"
                                                            value={info.supplier || ''}
                                                            onChange={(e) => handleNewPartChange(partKey, 'supplier', e.target.value)}
                                                            className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:border-orange-500 outline-none transition-colors"
                                                            placeholder="Vd: Apple Store VN"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Giá bán lẻ *</label>
                                                        <CurrencyInput
                                                            value={info.price_promo || ''}
                                                            onChange={(v) => handleNewPartChange(partKey, 'price_promo', v)}
                                                            className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:border-orange-500 outline-none transition-colors"
                                                            placeholder="Vd: 25.000.000"
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                /* Component: taxonomy + model + partType fields */
                                                <>
                                                    <div className="md:col-span-2">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Danh mục linh kiện *</label>
                                                        <CategoryTaxonomySelector
                                                            type="component"
                                                            value={info.categoryIds || []}
                                                            onChange={(ids, catName) => handleNewPartTaxonomyChange(partKey, ids, catName)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Dòng máy tương thích *</label>
                                                        <input
                                                            type="text"
                                                            value={info.model || ''}
                                                            onChange={(e) => handleNewPartChange(partKey, 'model', e.target.value)}
                                                            className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:border-orange-500 outline-none transition-colors"
                                                            placeholder="Vd: iPhone 13 Pro Max"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Loại linh kiện *</label>
                                                        <div className="relative">
                                                            <select
                                                                value={info.partType || ''}
                                                                onChange={(e) => handleNewPartChange(partKey, 'partType', e.target.value)}
                                                                title="Loại linh kiện"
                                                                aria-label="Loại linh kiện"
                                                                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:border-orange-500 outline-none appearance-none bg-white transition-colors"
                                                            >
                                                                <option value="" disabled>-- Chọn loại --</option>
                                                                {partTypeOptions.map((opt: string) => (
                                                                    <option key={opt} value={opt}>{opt}</option>
                                                                ))}
                                                            </select>
                                                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Nguồn cung cấp *</label>
                                                        <input
                                                            type="text"
                                                            value={info.supplier || ''}
                                                            onChange={(e) => handleNewPartChange(partKey, 'supplier', e.target.value)}
                                                            className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:border-orange-500 outline-none transition-colors"
                                                            placeholder="Vd: Zin LK Sài Gòn"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">Giá bán sửa chữa *</label>
                                                        <CurrencyInput
                                                            value={info.price_promo || ''}
                                                            onChange={(v) => handleNewPartChange(partKey, 'price_promo', v)}
                                                            className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:border-orange-500 outline-none transition-colors"
                                                            placeholder="Vd: 500.000"
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-gray-50/80 px-6 py-4 flex items-center gap-3 justify-between border-t border-gray-100 shrink-0">
                <p className="text-sm text-gray-500">
                    {newItems.length > 0 && !isReady ? 'Vui lòng chọn đúng taxonomy và điền đủ thông tin cho mặt hàng mới' : 'Xác nhận nhập kho sẽ cập nhật giá vốn và tồn kho'}
                </p>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setImportPreviewModal({ isOpen: false, receipt: null, newParts: {} })}
                        className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={async () => {
                            setLoading(true);
                            await onConfirm(paymentMethod);
                            setLoading(false);
                        }}
                        disabled={!isReady || loading}
                        className={`px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-sm flex items-center gap-2 ${isReady && !loading ? 'bg-orange-600 hover:bg-orange-700' : 'bg-gray-300 cursor-not-allowed hidden md:flex'
                            }`}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Chốt Nhập Kho
                    </button>

                    {/* Mobile view text for disabled button */}
                    <button
                        disabled={true}
                        className={`px-4 py-2 text-sm font-semibold text-white bg-gray-300 rounded-xl md:hidden ${isReady && !loading ? 'hidden' : 'block flex gap-1 items-center'
                            }`}
                    >
                        Mục (*)
                    </button>
                </div>
            </div>
        </Modal>
    );
}
interface CreateReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    parts: (Product & { id: string })[];
    retailProducts: (Product & { id: string })[];
    onCreated: () => void;
    currentUser: { uid: string; displayName?: string | null; email?: string | null } | null;
    suppliers: SupplierOption[];
    initialReceiptType?: 'component' | 'retail';
    lockReceiptType?: boolean;
}
// Create Receipt Modal
export function CreateReceiptModal({ isOpen, onClose, parts, retailProducts, onCreated, currentUser, suppliers, initialReceiptType = 'component', lockReceiptType = false }: CreateReceiptModalProps) {
    const [search, setSearch] = useState('');
    const [items, setItems] = useState<ImportReceiptItem[]>([]);
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [receiptType, setReceiptType] = useState<'component' | 'retail'>(initialReceiptType);
    // Per-item supplier dropdown state
    const [activeSupplierIdx, setActiveSupplierIdx] = useState<number | null>(null);
    const [itemSupplierSearch, setItemSupplierSearch] = useState('');
    const searchSource = receiptType === 'component' ? parts : (retailProducts || []);
    const filteredOptions = search.length > 1
        ? searchSource.filter((p: Product & { id: string }) => p.name.toLowerCase().includes(search.toLowerCase()))
        : [];
    const addItem = (part: Product & { id: string }) => {
        if (items.find(i => i.productId === part.id)) return;
        setItems([...items, {
            productId: part.id,
            productName: part.name,
            quantity: 1,
            importPrice: part.costPrice || part.price_original || 0,
            quality: part.quality || 'Zin'
        }]);
        setSearch('');
    };
    const addCustomItem = async () => {
        const exactName = search.trim();
        if (!exactName) return;
        try {
            // Search for existing proposed product with same name
            const proposedQ = query(
                collection(db, 'products'),
                where('name', '==', exactName),
                where('isProposed', '==', true)
            );
            const proposedSnap = await getDocs(proposedQ);
            let newId: string;
            if (!proposedSnap.empty) {
                newId = proposedSnap.docs[0].id;
            } else {
                const productMode = receiptType === 'component' ? 'component' : 'retail';
                newId = await normalizeDocId(exactName, productMode);
                const productCode = buildProductCodeFromId(newId, receiptType === 'component' ? 'component' : 'product');
                await createProductWithCodes(newId, {
                    sku: productCode,
                    barcode: productCode,
                    productCode,
                    name: exactName,
                    category: '',
                    categoryIds: [],
                    status: 'hidden',
                    isProposed: true,
                    stock: 0,
                    held: 0,
                    sold: 0,
                    price_original: 0,
                    costPrice: 0,
                }, [productCode]);
            }
            setItems([...items, {
                productId: newId,
                productName: exactName,
                quantity: 1,
                importPrice: 0,
                quality: 'Zin'
            }]);
            setSearch('');
        } catch (err) {
            console.error('Error creating proposed product:', err);
            toastError('Lỗi khi tạo linh kiện mới');
        }
    };
    const removeItem = (idx: number) => {
        setItems(items.filter((_, i) => i !== idx));
    };
    const updateItem = (idx: number, field: string, value: string | number) => {
        const newItems = [...items];
        newItems[idx] = { ...newItems[idx], [field]: value };
        setItems(newItems);
    };
    const totalAmount = items.reduce((sum, item) => sum + (item.importPrice * item.quantity), 0);
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (items.length === 0) return;
        setIsSubmitting(true);
        try {
            await setDoc(doc(db, 'import_receipts', await getAvailableImportReceiptId()), {
                note,
                items,
                totalAmount,
                receiptType,
                status: 'draft',
                createdBy: currentUser?.uid || 'system',
                createdByName: currentUser?.displayName || currentUser?.email || 'Admin',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            onCreated();
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };
    if (!isOpen) return null;
    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Tạo phiếu đề xuất nhập hàng"
            size="2xl"
        >
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 pb-48">
                {!lockReceiptType && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Loại phiếu nhập</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => { setReceiptType('component'); setItems([]); setSearch(''); }}
                                className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all ${receiptType === 'component'
                                    ? 'bg-orange-50 border-orange-300 text-orange-700 shadow-sm'
                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                🔧 Linh kiện
                            </button>
                            <button
                                type="button"
                                onClick={() => { setReceiptType('retail'); setItems([]); setSearch(''); }}
                                className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all ${receiptType === 'retail'
                                    ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                📦 Sản phẩm bán lẻ
                            </button>
                        </div>
                    </div>
                )}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                    <input
                        type="text" value={note} onChange={(e) => setNote(e.target.value)}
                        className="w-full h-10 px-3 border rounded-lg focus:ring-2 focus:ring-orange-500"
                        placeholder="Vd: Nhập hàng gấp cho iPhone 13"
                    />
                </div>
                <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{receiptType === 'retail' ? 'Tìm sản phẩm cần nhập' : 'Tìm linh kiện cần nhập'}</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                            className="w-full h-11 pl-10 pr-4 border rounded-xl focus:ring-2 focus:ring-orange-500"
                            placeholder={receiptType === 'retail' ? 'Gõ tên sản phẩm để tìm...' : 'Gõ tên linh kiện để tìm...'}
                        />
                    </div>

                    {search.length > 1 && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                            {filteredOptions.length > 0 ? (
                                filteredOptions.map((p: Product & { id: string }) => (
                                    <button
                                        key={p.id} type="button" onClick={() => addItem(p)}
                                        className="w-full text-left px-4 py-3 hover:bg-orange-50 flex items-center justify-between border-b last:border-0"
                                    >
                                        <span className="font-medium text-sm">{p.name}</span>
                                        <span className="text-xs text-gray-400">Tồn: {p.stock}</span>
                                    </button>
                                ))
                            ) : (
                                <button
                                    type="button" onClick={addCustomItem}
                                    className="w-full text-left px-4 py-3 hover:bg-blue-50 text-blue-600 flex items-center gap-2"
                                >
                                    <Plus size={16} />
                                    <span className="text-sm">Thêm mới: &quot;{search}&quot;</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <div className="space-y-3">
                    <h4 className="font-semibold text-gray-700 text-sm">{receiptType === 'retail' ? `Danh sách sản phẩm chọn (${items.length})` : `Danh sách linh kiện chọn (${items.length})`}</h4>
                    {items.length === 0 ? (
                        <div className="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-sm">
                            {receiptType === 'retail' ? 'Chưa có sản phẩm nào trong danh sách' : 'Chưa có linh kiện nào trong danh sách'}
                        </div>
                    ) : (
                        <div className="border rounded-xl">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 font-medium [&>tr>th:first-child]:rounded-tl-xl [&>tr>th:last-child]:rounded-tr-xl">
                                    <tr>
                                        <th className="px-4 py-2 text-left">{receiptType === 'retail' ? 'Sản phẩm' : 'Linh kiện'}</th>
                                        <th className="px-4 py-2 text-center w-20">SL</th>
                                        <th className="px-4 py-2 text-right">Giá nhập</th>
                                        <th className="px-4 py-2 text-left min-w-[140px]">NCC</th>
                                        <th className="px-4 py-2 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="px-4 py-3">
                                                <p className="font-medium">{item.productName}</p>
                                                {!parts.find((p) => p.id === item.productId && !p.isProposed) && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Mới</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                                                    title="Số lượng" aria-label="Số lượng" placeholder="SL"
                                                    className="w-full h-8 text-center border rounded" min={1}
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <CurrencyInput
                                                    value={item.importPrice} onChange={(v) => updateItem(idx, 'importPrice', v)}
                                                    title="Giá nhập" aria-label="Giá nhập" placeholder="Giá nhập"
                                                    className="w-full h-8 text-right px-2 border rounded"
                                                />
                                            </td>
                                            <td className="px-4 py-3 relative">
                                                <input
                                                    type="text"
                                                    value={activeSupplierIdx === idx ? itemSupplierSearch : (item.supplier || '')}
                                                    onChange={(e) => {
                                                        setItemSupplierSearch(e.target.value);
                                                        setActiveSupplierIdx(idx);
                                                        if (!e.target.value) {
                                                            const newItems = [...items];
                                                            newItems[idx] = { ...newItems[idx], supplier: '', supplierId: undefined };
                                                            setItems(newItems);
                                                        }
                                                    }}
                                                    onFocus={() => { setActiveSupplierIdx(idx); setItemSupplierSearch(''); }}
                                                    onBlur={() => setTimeout(() => setActiveSupplierIdx(null), 200)}
                                                    className="w-full h-8 px-2 text-sm border rounded focus:ring-1 focus:ring-orange-400"
                                                    placeholder="Chọn NCC"
                                                />
                                                {activeSupplierIdx === idx && (
                                                    <div className="absolute left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-30 max-h-40 overflow-y-auto">
                                                        {suppliers
                                                            .filter(s => supplierMatchesSearch(s, itemSupplierSearch || ''))
                                                            .map(s => (
                                                                <button key={s.id} type="button"
                                                                    onMouseDown={(e) => e.preventDefault()}
                                                                    onClick={() => {
                                                                        const newItems = [...items];
                                                                        newItems[idx] = { ...newItems[idx], supplier: s.name, supplierId: s.id };
                                                                        setItems(newItems);
                                                                        setActiveSupplierIdx(null);
                                                                        setItemSupplierSearch('');
                                                                    }}
                                                                    className="w-full text-left px-3 py-2 hover:bg-orange-50 text-sm border-b last:border-0"
                                                                >
                                                                    {s.name}
                                                                </button>
                                                            ))}
                                                        {(itemSupplierSearch || '').trim() && !suppliers.some(s => s.name.toLowerCase() === (itemSupplierSearch || '').toLowerCase()) && (
                                                            <button type="button"
                                                                onMouseDown={(e) => e.preventDefault()}
                                                                onClick={async () => {
                                                                    const nm = (itemSupplierSearch || '').trim();
                                                                    try {
                                                                        const contactValue = window.prompt('Nhap SDT, Zalo, Facebook hoac lien he khac cho NCC (co the bo trong):') || '';
                                                                        const contactInput = buildInlineSupplierContactInput(nm, contactValue);
                                                                        const supplierId = await reserveSupplierDocumentId(contactInput);
                                                                        await setDoc(doc(db, 'suppliers', supplierId), {
                                                                            name: nm,
                                                                            ...buildSupplierContactDocumentFields(contactInput),
                                                                            totalDebt: 0,
                                                                            isActive: true,
                                                                            createdAt: serverTimestamp(),
                                                                            updatedAt: serverTimestamp(),
                                                                        });
                                                                        const newItems = [...items];
                                                                        newItems[idx] = { ...newItems[idx], supplier: nm, supplierId };
                                                                        setItems(newItems);
                                                                        setActiveSupplierIdx(null);
                                                                        setItemSupplierSearch('');
                                                                        toastSuccess(`Đã tạo NCC "${nm}"`);
                                                                    } catch { toastError('Lỗi tạo NCC'); }
                                                                }}
                                                                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-blue-600 text-sm flex items-center gap-1"
                                                            >
                                                                <Plus size={14} /> Tạo: &quot;{itemSupplierSearch}&quot;
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button type="button" title="Xóa" aria-label="Xóa" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 pt-1"><Trash2 size={16} /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </form>
            <div className="p-6 border-t bg-gray-50 flex items-center justify-between">
                <div>
                    <p className="text-xs text-gray-500 uppercase font-bold">Tổng tiền dự kiến</p>
                    <p className="text-xl font-bold text-orange-600">{new Intl.NumberFormat('vi-VN').format(totalAmount)}đ</p>
                </div>
                <div className="flex gap-3">
                    <button type="button" onClick={onClose} className="px-6 py-2 border rounded-xl font-medium hover:bg-white transition-colors">Hủy</button>
                    <button
                        type="button"
                        onClick={handleSubmit} disabled={items.length === 0 || isSubmitting}
                        className="px-8 py-2 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 disabled:opacity-50 transition-colors shadow-sm"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : 'Lưu bản nháp'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
