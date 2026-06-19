'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Archive,
    Plus,
    Search,
    Edit,
    Trash2,
    Loader2,
    Settings,
    Wrench,
    ChevronDown,
    ChevronRight,
    CheckCircle2,
    Clock,
    PackagePlus,
    QrCode,
    AlertTriangle
} from 'lucide-react';
import { useFirestoreCollection, updateDocument } from '@/lib/useFirestore';
import { isPartCategory } from '@/lib/constants';
import Modal from '@/components/admin/Modal';
import UniversalProductModal from '@/components/admin/UniversalProductModal';
import type { Product } from '@/lib/types';
import { orderBy } from 'firebase/firestore';
import {
    collection, getDocs, updateDoc, deleteDoc,
    doc, serverTimestamp, query, orderBy as fbOrderBy, addDoc, onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { toastError, toastSuccess } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import CurrencyInput from '@/components/admin/CurrencyInput';
import ProductQrLabelModal, { PrintBatchItem } from '@/components/admin/ProductQrLabelModal';
import FixHiddenProductsModal from '@/components/admin/FixHiddenProductsModal';
import LotTrackingModal from '@/components/admin/LotTrackingModal';
import { buildArchiveUpdate, getArchiveBlockReason, isProductArchived } from '@/lib/productLifecycle';
import {
    calculateImportableTotal,
    getReceiptItemAvailability,
    isReceiptItemUnavailable,
} from '@/lib/importReceiptAvailability';
import {
    buildImportPreviewState,
    formatReceiptDate,
    formatReceiptPrice,
} from '@/features/parts/importReceiptUtils';
import { CreateReceiptModal, ImportPreviewModal } from '@/features/parts/ImportReceiptModals';
import type {
    ImportPreviewState,
    ImportReceipt,
    ImportReceiptItem,
    SupplierOption,
} from '@/features/parts/importReceiptTypes';
export default function PartsPage() {
    const { user } = useAuth(); // Ensure authenticated
    const router = useRouter();
    const { data: products, loading } = useFirestoreCollection<Product>('products', [orderBy('createdAt', 'desc')]);
    const parts = products.filter(p => isPartCategory(p.category, p.categoryIds));
    const retailProducts = products.filter(p => {
        const firstCatId = p.categoryIds?.[0] || '';
        const isComponent = isPartCategory(p.category, p.categoryIds);
        const isService = p.category === 'service' || firstCatId.startsWith('sua-chua');
        return !isComponent && !isService;
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCreateReceiptOpen, setIsCreateReceiptOpen] = useState(false);
    const [editingPart, setEditingPart] = useState<Product | null>(null);
    const [qrPart, setQrPart] = useState<(Product & { id: string }) | null>(null);
    const [activeTab, setActiveTab] = useState<'parts' | 'proposals' | 'ordered'>('parts');
    const [showFixHidden, setShowFixHidden] = useState(false);
    const [isLotTrackingOpen, setIsLotTrackingOpen] = useState(false);
    // Import Proposals State
    const [draftReceipts, setDraftReceipts] = useState<ImportReceipt[]>([]);
    const [loadingDrafts, setLoadingDrafts] = useState(true);
    const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
    const [editingPrices, setEditingPrices] = useState<Record<string, number[]>>({});
    const [editingQuantities, setEditingQuantities] = useState<Record<string, number[]>>({});
    const [isProcessing, setIsProcessing] = useState(false);

    // Filters and Modals
    const [statusFilter, setStatusFilter] = useState<'all' | 'out_of_stock' | 'bestseller'>('all');
    const [importPreviewModal, setImportPreviewModal] = useState<ImportPreviewState>({ isOpen: false, receipt: null, newParts: {} });
    const [importSuccessLots, setImportSuccessLots] = useState<PrintBatchItem[] | null>(null);
    const [lastImportLots, setLastImportLots] = useState<PrintBatchItem[] | null>(null);
    const [forecastCostPrices, setForecastCostPrices] = useState<Map<string, number>>(new Map());
    // Confirm Modal State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        dangerous?: boolean;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });
    // Warranty part types from config
    const [partTypeOptions, setPartTypeOptions] = useState<string[]>([]);
    // Supplier list for dropdown
    const [supplierList, setSupplierList] = useState<SupplierOption[]>([]);
    // Draft supplier editing state
    const [draftSupplierSearch, setDraftSupplierSearch] = useState('');
    const [draftSupplierActiveKey, setDraftSupplierActiveKey] = useState<string | null>(null);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (new URLSearchParams(window.location.search).get('createImportProposal') === '1') {
            setIsCreateReceiptOpen(true);
        }
    }, []);
    // Fetch suppliers for dropdown
    useEffect(() => {
        const unsub = onSnapshot(
            query(collection(db, 'suppliers'), fbOrderBy('name', 'asc')),
            (snap) => {
                setSupplierList(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierOption)));
            }
        );
        return () => unsub();
    }, []);
    // Load warranty config for partType dropdown
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'system_config', 'repairs'), (snap) => {
            if (snap.exists()) {
                const d = snap.data();
                if (d.warrantyRules && Array.isArray(d.warrantyRules)) {
                    setPartTypeOptions(d.warrantyRules.map((r: { partType: string }) => r.partType).filter(Boolean));
                }
            }
        });
        return () => unsub();
    }, []);
    // Fetch draft import receipts
    const fetchDrafts = async () => {
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
    useEffect(() => {
        fetchDrafts();
    }, []);
    const drafts = draftReceipts.filter(r => r.status === 'draft');
    const orderedReceipts = draftReceipts.filter(r => r.status === 'ordered');
    const handleArchive = (part: Product) => {
        const blockReason = getArchiveBlockReason(part);
        if (blockReason) {
            toastError(`Không thể lưu trữ "${part.name}" vì ${blockReason}.`);
            return;
        }
        setConfirmModal({
            isOpen: true,
            title: 'Lưu trữ linh kiện',
            message: `Lưu trữ linh kiện "${part.name}"? Linh kiện sẽ ẩn khỏi danh sách bán/đặt linh kiện nhưng vẫn giữ lịch sử và mã hàng.`,
            confirmText: 'Lưu trữ',
            dangerous: true,
            onConfirm: async () => {
                try {
                    await updateDocument('products', part.id, buildArchiveUpdate(serverTimestamp()));
                } catch {
                    toastError('Lỗi khi lưu trữ linh kiện!');
                }
            }
        });
    };
    const filteredParts = parts.filter((p) => {
        // Hide soft-deleted and proposed products
        if (isProductArchived(p) || p.isProposed) return false;
        const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));

        let matchStatus = true;
        if (statusFilter === 'out_of_stock') matchStatus = Number(p.stock) <= 0;
        else if (statusFilter === 'bestseller') matchStatus = Number(p.sold) > 0;
        return matchSearch && matchStatus;
    }).sort((a, b) => {
        if (statusFilter === 'bestseller') return Number(b.sold || 0) - Number(a.sold || 0);
        return 0; // fallback default sorting based on initial load
    });
    const formatPrice = formatReceiptPrice;
    const { paginatedData: paginatedParts, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredParts, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery]);
    const formatDate = formatReceiptDate;
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
                setEditingQuantities({
                    [receiptId]: receipt.items.map(i => i.quantity)
                });
            }
        }
    };
    const handleAutoSaveItem = async (receiptId: string, itemIdx: number, newPrice: number, newQty: number) => {
        const receipt = draftReceipts.find(r => r.id === receiptId);
        if (!receipt) return;

        try {
            const updatedItems = [...receipt.items];
            updatedItems[itemIdx] = {
                ...updatedItems[itemIdx],
                importPrice: newPrice,
                quantity: newQty
            };
            const totalAmount = calculateImportableTotal(updatedItems);
            await updateDoc(doc(db, 'import_receipts', receipt.id), {
                items: updatedItems,
                totalAmount,
                updatedAt: serverTimestamp(),
            });
            // Update local draft list optimistically
            setDraftReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, items: updatedItems, totalAmount } : r));
            toastSuccess('Đã tự động lưu!');
        } catch (err) {
            console.error(err);
            toastError('Lỗi tự động lưu!');
        }
    };
    const handleOrderReceipt = async (receipt: ImportReceipt) => {
        const importableItems = receipt.items.filter((item) => !isReceiptItemUnavailable(item));
        if (importableItems.length === 0) {
            toastError('Phiếu không còn linh kiện có thể đặt hàng.');
            return;
        }
        const missingSupplier = importableItems.filter(i => !i.supplier && !i.supplierId);
        if (missingSupplier.length > 0) {
            toastError(`Còn ${missingSupplier.length} sản phẩm chưa gán NCC. Vui lòng chọn NCC cho tất cả trước khi đặt hàng.`);
            return;
        }
        setConfirmModal({
            isOpen: true,
            title: 'Chốt Đặt Hàng',
            message: 'Xác nhận đã đặt hàng với nhà cung cấp. Phiếu này sẽ chuyển sang khu vực "Đã Đặt Hàng".',
            confirmText: 'Xác nhận',
            onConfirm: async () => {
                setIsProcessing(true);
                try {
                    const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
                    const res = await fetch('/api/inventory/import', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${idToken}`,
                        },
                        body: JSON.stringify({
                            action: 'order_receipt',
                            receiptId: receipt.id,
                            receiptVersion: receipt.version || 0,
                            idempotencyKey: crypto.randomUUID(),
                        }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Lỗi khi chốt đặt hàng');
                    await fetchDrafts();
                    toastSuccess('Đã chuyển sang trạng thái ĐẶT HÀNG!');
                } catch (err) {
                    console.error(err);
                    toastError('Lỗi khi chuyển trạng thái!');
                } finally {
                    setIsProcessing(false);
                }
            }
        });
    };
    const handleAutoSaveSupplier = async (receiptId: string, itemIdx: number, supplierName: string, supplierId: string) => {
        const receipt = draftReceipts.find(r => r.id === receiptId);
        if (!receipt) return;
        try {
            const updatedItems = [...receipt.items];
            updatedItems[itemIdx] = { ...updatedItems[itemIdx], supplier: supplierName, supplierId };
            await updateDoc(doc(db, 'import_receipts', receipt.id), {
                items: updatedItems,
                updatedAt: serverTimestamp(),
            });
            setDraftReceipts(prev => prev.map(r => r.id === receiptId ? { ...r, items: updatedItems } : r));
            toastSuccess('Đã cập nhật NCC!');
        } catch (err) {
            console.error(err);
            toastError('Lỗi cập nhật NCC!');
        }
    };
    const handleImportReceipt = async (receipt: ImportReceipt) => {
        const importableItems = receipt.items.filter((item) => !isReceiptItemUnavailable(item));
        if (importableItems.length === 0) {
            toastError('Phiếu không có linh kiện nào để nhập kho.');
            return;
        }
        const { previewState, forecastCostPrices: forecasts } = buildImportPreviewState(receipt, parts);
        setForecastCostPrices(forecasts);
        setImportPreviewModal(previewState);
    };
    const executeFinalImport = async (paymentMethod: 'paid' | 'debt') => {
        const { receipt, newParts } = importPreviewModal;
        if (!receipt) return;

        setIsProcessing(true);
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/inventory/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    action: 'complete_import',
                    receiptId: receipt.id,
                    receiptVersion: (receipt as ImportReceipt & { version?: number }).version || 0,
                    idempotencyKey: crypto.randomUUID(),
                    paymentMethod: paymentMethod,
                    newParts: newParts
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi nhập kho!');
            toastSuccess('Nhập kho thành công!');
            if (data.generatedLots && data.generatedLots.length > 0) {
                setImportSuccessLots(data.generatedLots);
                setLastImportLots(data.generatedLots);
            }
            setImportPreviewModal({ isOpen: false, receipt: null, newParts: {} });
            await fetchDrafts();
        } catch (error) {
            console.error('Final import error:', error);
            toastError(error instanceof Error ? error.message : 'Lỗi nhập kho!');
        } finally {
            setIsProcessing(false);
        }
    };
    const handleDeleteDraft = (id: string) => {
        setConfirmModal({
            isOpen: true,
            title: 'Xóa phiếu?',
            message: 'Hành động này không thể hoàn tác. Bạn có chắc chắn muốn xóa phiếu này không?',
            dangerous: true,
            confirmText: 'Xóa phiếu',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, 'import_receipts', id));
                    toastSuccess('Đã xóa phiếu');
                    await fetchDrafts();
                } catch (error) {
                    console.error(error);
                    toastError('Lỗi xóa phiếu');
                }
            }
        });
    };
    const handleMarkAvailability = async (receipt: ImportReceipt, item: ImportReceiptItem, itemIndex: number, isAvailable: boolean) => {
        setIsProcessing(true);
        const targetAvailability = isAvailable ? ((receipt.status === 'draft' || !receipt.status) ? 'approved' : 'in_stock') : 'unavailable';
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/inventory/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    action: 'mark_availability',
                    receiptId: receipt.id,
                    receiptVersion: (receipt as ImportReceipt & { version?: number }).version || 0,
                    idempotencyKey: crypto.randomUUID(),
                    partLineId: item.partLineId,
                    itemIndex,
                    availability: targetAvailability
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật tình trạng');
            toastSuccess('Đã cập nhật tình trạng hàng');
            await fetchDrafts();
        } catch (error) {
            console.error('Mark availability error:', error);
            toastError(error instanceof Error ? error.message : 'Lỗi cập nhật tình trạng');
        } finally {
            setIsProcessing(false);
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
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsLotTrackingOpen(true)}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-lg font-medium hover:bg-indigo-100 transition-colors shadow-sm"
                    >
                        <Search size={20} />
                        Tra cứu Mã Lô
                    </button>
                    <button
                        onClick={() => setShowFixHidden(true)}
                        className="flex items-center gap-2 border-2 border-amber-300 text-amber-700 px-4 py-2.5 rounded-lg font-medium hover:bg-amber-50 transition-colors text-sm"
                    >
                        <AlertTriangle size={18} />
                        Khắc phục/Khôi phục
                    </button>
                    <button
                        onClick={() => setIsCreateReceiptOpen(true)}
                        className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-sm"
                    >
                        <Plus size={20} />
                        Thêm đề xuất
                    </button>
                </div>
            </div>
            {/* Last Import Reprint Banner */}
            {lastImportLots && lastImportLots.length > 0 && (
                <div className="mb-4 bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2">
                        <PackagePlus size={18} className="text-orange-600" />
                        <span className="text-sm text-orange-800 font-medium">Bạn vừa nhập kho thành công {lastImportLots.length} loại sản phẩm.</span>
                    </div>
                    <button 
                        onClick={() => setImportSuccessLots(lastImportLots)}
                        className="text-xs font-bold bg-white text-orange-600 border border-orange-200 px-3 py-1.5 rounded shadow-sm hover:bg-orange-50 transition-colors"
                    >
                        In lại tem lô hàng
                    </button>
                </div>
            )}
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                <button
                    onClick={() => setActiveTab('parts')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === 'parts'
                        ? 'bg-white text-orange-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <Settings size={16} />
                    Danh sách Linh Kiện
                </button>
                <button
                    onClick={() => setActiveTab('proposals')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === 'proposals'
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
                <button
                    onClick={() => setActiveTab('ordered')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${activeTab === 'ordered'
                        ? 'bg-white text-orange-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <CheckCircle2 size={16} />
                    Đã Đặt Hàng
                    {orderedReceipts.length > 0 && (
                        <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">{orderedReceipts.length}</span>
                    )}
                </button>
            </div>
            {/* ═══════ TAB 1: Parts List ═══════ */}
            {activeTab === 'parts' && (
                <>
                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-4 mb-4">
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
                        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
                            <button
                                onClick={() => setStatusFilter('all')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${statusFilter === 'all' ? 'bg-orange-100 text-orange-700' : 'bg-white text-gray-600 border hover:bg-gray-50'
                                    }`}
                            >
                                Tất cả
                            </button>
                            <button
                                onClick={() => setStatusFilter('out_of_stock')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${statusFilter === 'out_of_stock' ? 'bg-red-100 text-red-700' : 'bg-white text-gray-600 border hover:bg-gray-50'
                                    }`}
                            >
                                Hết hàng
                            </button>
                            <button
                                onClick={() => setStatusFilter('bestseller')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${statusFilter === 'bestseller' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-gray-600 border hover:bg-gray-50'
                                    }`}
                            >
                                Bán chạy nhất
                            </button>
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
                            <>
                                {/* Mobile Card View */}
                                <div className="block md:hidden divide-y divide-gray-100">
                                    {paginatedParts.map((part) => (
                                        <div key={part.id} className="p-4 space-y-2 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 text-sm">{part.name}</p>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {part.partType && (
                                                            <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full">
                                                                {part.partType}
                                                            </span>
                                                        )}
                                                        {part.quality && (
                                                            <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">
                                                                {part.quality}
                                                            </span>
                                                        )}
                                                        {part.status === 'inactive' && (
                                                            <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded-full">
                                                                Tạm ẩn
                                                            </span>
                                                        )}
                                                    </div>
                                                    {part.description && (
                                                        <p className="text-xs text-gray-500 mt-1 line-clamp-1">{part.description}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-baseline ml-3">
                                                    <span className={`text-sm font-bold ${(part.stock || 0) > 10 ? 'text-green-600' : (part.stock || 0) > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                        Tồn: {part.stock || 0}
                                                    </span>
                                                    {(part.held || 0) > 0 && (
                                                        <span className="text-xs font-medium text-gray-400 ml-1">
                                                            (giữ: {part.held})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between bg-gray-50/80 rounded-lg px-3 py-2">
                                                <div>
                                                    <p className="text-[10px] text-gray-400 uppercase font-medium">Giá vốn</p>
                                                    <p className="text-sm font-medium text-gray-800">
                                                        {formatPrice(part.price_original)}
                                                    </p>
                                                    {part.supplier && <p className="text-[10px] text-gray-500 italic mt-0.5 max-w-[100px] truncate" title={part.supplier}>Nguồn: {part.supplier}</p>}
                                                    {part.oldCostPrice && part.oldCostPrice !== part.price_original && (
                                                        <span className={`block text-[10px] font-bold mt-0.5 ${part.price_original > part.oldCostPrice ? 'text-red-500' : 'text-green-500'}`}>
                                                            {part.price_original > part.oldCostPrice ? '▲' : '▼'} {formatPrice(Math.abs(part.price_original - part.oldCostPrice))}
                                                        </span>
                                                    )}
                                                    {forecastCostPrices.has(part.id) && forecastCostPrices.get(part.id) !== part.price_original && (
                                                        <span className="block text-[10px] font-bold mt-0.5 text-blue-500">
                                                            Dự kiến: {formatPrice(forecastCostPrices.get(part.id)!)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-right mr-3">
                                                    <p className="text-[10px] text-gray-400 uppercase font-medium">Giá bán</p>
                                                    <p className="text-sm font-bold text-orange-600">{formatPrice(part.price_promo || 0)}</p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => { setEditingPart(part); setIsModalOpen(true); }} className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg" title="Sửa"><Edit size={18} /></button>
                                                    <button onClick={() => handleArchive(part)} className="p-2 hover:bg-red-100 text-red-600 rounded-lg" title="Lưu trữ"><Archive size={18} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {/* Desktop Table View */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="w-full min-w-[800px]">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Tên Linh Kiện</th>
                                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Phân loại & Dòng máy</th>
                                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Giá Vốn & Nguồn</th>
                                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Giá Bán</th>
                                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Tồn Kho</th>
                                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Hành động</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {paginatedParts.map((part) => (
                                                <tr key={part.id} className="hover:bg-orange-50/50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <p className="font-medium text-gray-900">{part.name}</p>
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {part.partType && (
                                                                <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full">
                                                                    {part.partType}
                                                                </span>
                                                            )}
                                                            {part.quality && (
                                                                <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">
                                                                    {part.quality}
                                                                </span>
                                                            )}
                                                            {part.status === 'inactive' && (
                                                                <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 rounded-full">
                                                                    Tạm ẩn
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="inline-block w-max px-2 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-700 rounded-full">{part.partType || 'Chưa PL'}</span>
                                                            <p className="text-xs text-gray-500 max-w-[180px] break-words line-clamp-2" title={part.description}>{part.description || 'Chưa cung cấp dòng máy'}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <p className="text-sm font-medium text-gray-800">{formatPrice(part.price_original)}</p>
                                                        {part.supplier && (
                                                            <p className="text-[11px] text-gray-500 italic mt-0.5 whitespace-nowrap bg-gray-100 px-1.5 py-0.5 rounded inline-block">
                                                                {part.supplier}
                                                            </p>
                                                        )}
                                                        <div className="flex flex-col items-center gap-0.5 mt-1">
                                                            {part.oldCostPrice && part.oldCostPrice !== part.price_original && (
                                                                <p className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border ${part.price_original > part.oldCostPrice ? 'text-red-500 border-red-100 bg-red-50' : 'text-green-600 border-green-100 bg-green-50'
                                                                    }`}>
                                                                    {part.price_original > part.oldCostPrice ? '▲ Tăng' : '▼ Giảm'} {formatPrice(Math.abs(part.price_original - (part.oldCostPrice || 0)))}
                                                                </p>
                                                            )}
                                                            {forecastCostPrices.has(part.id) && forecastCostPrices.get(part.id) !== part.price_original && (
                                                                <p className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                                                                    Dự báo: {formatPrice(forecastCostPrices.get(part.id)!)}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <p className="text-sm font-bold text-orange-600">{formatPrice(part.price_promo || 0)}</p>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex flex-col items-center justify-center">
                                                            <span className={`text-sm font-bold ${(part.stock || 0) > 10 ? 'text-green-600' : (part.stock || 0) > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                                {part.stock || 0}
                                                            </span>
                                                            {(part.held || 0) > 0 && (
                                                                <span className="text-[10px] font-medium text-gray-400 mt-0.5">
                                                                    (giữ: {part.held})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => setQrPart(part as Product & { id: string })}
                                                                className="p-2 hover:bg-orange-100 text-orange-600 rounded-lg transition-colors"
                                                                title="In tem QR / barcode"
                                                            >
                                                                <QrCode size={18} />
                                                            </button>
                                                            <button
                                                                onClick={() => { setEditingPart(part); setIsModalOpen(true); }}
                                                                className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
                                                                title="Sửa"
                                                            >
                                                                <Edit size={18} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleArchive(part)}
                                                                className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                                                                title="Lưu trữ"
                                                            >
                                                                <Archive size={18} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <PaginationBar
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    pageSize={pageSize}
                                    totalFiltered={totalFiltered}
                                    totalAll={parts.length}
                                    onPageChange={setPage}
                                    onPageSizeChange={setPageSize}
                                    entityLabel="linh kiện"
                                />
                            </>
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
                                const quantities = editingQuantities[receipt.id] || receipt.items.map(i => i.quantity);
                                const unavailableCount = receipt.items.filter(isReceiptItemUnavailable).length;
                                const importableItems = receipt.items.filter((item) => !isReceiptItemUnavailable(item));
                                const missingSupplierCount = importableItems.filter((item) => !item.supplier && !item.supplierId).length;
                                const importableTotal = calculateImportableTotal(receipt.items);
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
                                                        {(() => { const s = [...new Set(importableItems.map(i => i.supplier).filter(Boolean))]; return s.length > 0 ? s.join(', ') : 'Chưa gán NCC'; })()} · {importableItems.length} cần đặt{unavailableCount > 0 ? ` · ${unavailableCount} không có` : ''} · {formatDate(receipt.createdAt)}
                                                    </p>
                                                    {receipt.note && (
                                                        <p className="text-xs text-blue-600 mt-1 italic">{receipt.note}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-gray-700">
                                                    {formatPrice(importableTotal)}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Expanded: Item Details + Price Editing */}
                                        {isExpanded && (
                                            <div className="border-t border-gray-100 overflow-x-auto">
                                                <table className="w-full min-w-[700px]">
                                                    <thead className="bg-gray-50/80">
                                                        <tr>
                                                            <th className="px-6 py-2 text-left text-xs font-semibold text-gray-500">Linh kiện</th>
                                                            <th className="px-6 py-2 text-center text-xs font-semibold text-gray-500">Chất lượng</th>
                                                            <th className="px-6 py-2 text-center text-xs font-semibold text-gray-500">SL</th>
                                                            <th className="px-6 py-2 text-center text-xs font-semibold text-gray-500">Giá nhập (VNĐ)</th>
                                                            <th className="px-6 py-2 text-center text-xs font-semibold text-gray-500">NCC</th>
                                                            <th className="px-6 py-2 text-right text-xs font-semibold text-gray-500">Thành tiền</th>
                                                            <th className="px-6 py-2 text-right text-xs font-semibold text-gray-500">Tình trạng</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {receipt.items.map((item, idx) => {
                                                            const priceVal = prices[idx] ?? item.importPrice;
                                                            const isCustom = !parts.find(p => p.id === item.productId) || parts.find(p => p.id === item.productId)?.isProposed;
                                                            const itemAvailability = getReceiptItemAvailability(item);
                                                            const isUnavailable = itemAvailability === 'unavailable';
                                                            return (
                                                                <tr key={item.partLineId || `${item.productId}_${idx}`} className={isUnavailable ? 'bg-red-50/60 text-gray-400' : 'hover:bg-orange-50/30'}>
                                                                    <td className="px-6 py-3">
                                                                        <p className="font-medium text-gray-800 text-sm">{item.productName}</p>
                                                                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                                            {isCustom && (
                                                                                <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">
                                                                                    Ngoài kho
                                                                                </span>
                                                                            )}
                                                                            {item.supplier && (
                                                                                <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-semibold">
                                                                                    {item.supplier}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-6 py-3 text-center text-sm text-gray-600">{item.quality || '—'}</td>
                                                                    <td className="px-6 py-3 text-center text-sm font-semibold">
                                                                        <input
                                                                            type="number"
                                                                            value={quantities[idx] ?? item.quantity}
                                                                            disabled={isUnavailable}
                                                                            onChange={(e) => {
                                                                                const newQ = [...quantities];
                                                                                newQ[idx] = Number(e.target.value) || 0;
                                                                                setEditingQuantities(prev => ({ ...prev, [receipt.id]: newQ }));
                                                                            }}
                                                                            onBlur={() => handleAutoSaveItem(receipt.id, idx, priceVal, quantities[idx] ?? item.quantity)}
                                                                            className="w-full max-w-[80px] mx-auto block h-9 px-3 text-sm text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                                            min={1}
                                                                            aria-label="Số lượng"
                                                                            title="Số lượng"
                                                                        />
                                                                    </td>
                                                                    <td className="px-6 py-3">
                                                                        <CurrencyInput
                                                                            value={priceVal}
                                                                            disabled={isUnavailable}
                                                                            onChange={(v) => {
                                                                                const newPrices = [...prices];
                                                                                newPrices[idx] = v;
                                                                                setEditingPrices(prev => ({ ...prev, [receipt.id]: newPrices }));
                                                                            }}
                                                                            onBlur={() => handleAutoSaveItem(receipt.id, idx, priceVal, quantities[idx] ?? item.quantity)}
                                                                            className="w-full max-w-[140px] mx-auto block h-9 px-3 text-sm text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                                                        />
                                                                    </td>
                                                                    <td className="px-6 py-3">
                                                                        {(() => {
                                                                            const itemKey = `${receipt.id}_${idx}`;
                                                                            const isActive = draftSupplierActiveKey === itemKey;
                                                                            const filtered = supplierList.filter(s => s.name.toLowerCase().includes((draftSupplierSearch || '').toLowerCase()));
                                                                            const isNew = (draftSupplierSearch || '').trim() && !supplierList.some(s => s.name.toLowerCase() === (draftSupplierSearch || '').trim().toLowerCase());
                                                                            return (
                                                                                <div className="relative">
                                                                                    <input
                                                                                        type="text"
                                                                                        value={isActive ? draftSupplierSearch : (item.supplier || '')}
                                                                                        disabled={isUnavailable}
                                                                                        onChange={(e) => { setDraftSupplierSearch(e.target.value); setDraftSupplierActiveKey(itemKey); }}
                                                                                        onFocus={() => { setDraftSupplierActiveKey(itemKey); setDraftSupplierSearch(item.supplier || ''); }}
                                                                                        onBlur={() => setTimeout(() => setDraftSupplierActiveKey(null), 200)}
                                                                                        placeholder="Chọn NCC"
                                                                                        className={`w-full max-w-[140px] h-9 px-2 text-xs border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${!item.supplier ? 'border-red-300 bg-red-50/50' : 'border-gray-300'
                                                                                            }`}
                                                                                    />
                                                                                    {isActive && (filtered.length > 0 || isNew) && (
                                                                                        <div className="absolute z-50 mt-1 w-48 max-h-40 overflow-y-auto bg-white border rounded-lg shadow-lg text-xs">
                                                                                            {filtered.map(s => (
                                                                                                <button key={s.id} type="button" className="w-full text-left px-3 py-2 hover:bg-orange-50 truncate"
                                                                                                    onMouseDown={(e) => { e.preventDefault(); setDraftSupplierActiveKey(null); handleAutoSaveSupplier(receipt.id, idx, s.name, s.id); }}
                                                                                                >{s.name}</button>
                                                                                            ))}
                                                                                            {isNew && (
                                                                                                <button type="button" className="w-full text-left px-3 py-2 text-green-700 bg-green-50 hover:bg-green-100 font-semibold"
                                                                                                    onMouseDown={async (e) => {
                                                                                                        e.preventDefault();
                                                                                                        const newDoc = await addDoc(collection(db, 'suppliers'), { name: (draftSupplierSearch || '').trim(), totalDebt: 0, isActive: true, createdAt: serverTimestamp() });
                                                                                                        setDraftSupplierActiveKey(null);
                                                                                                        handleAutoSaveSupplier(receipt.id, idx, (draftSupplierSearch || '').trim(), newDoc.id);
                                                                                                    }}
                                                                                                >+ Tạo: {(draftSupplierSearch || '').trim()}</button>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </td>
                                                                    <td className="px-6 py-3 text-right text-sm font-semibold text-gray-700">
                                                                        {isUnavailable ? 'Đã loại' : formatPrice(priceVal * (quantities[idx] ?? item.quantity))}
                                                                    </td>
                                                                    <td className="px-6 py-3 text-right text-xs">
                                                                        <div className="flex items-center justify-end gap-1.5" data-testid={`availability-${item.partLineId || idx}`}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleMarkAvailability(receipt, item, idx, true)}
                                                                                disabled={isProcessing}
                                                                                className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-50 ${(itemAvailability === 'in_stock' || itemAvailability === 'approved')
                                                                                    ? 'bg-emerald-500 text-white border-transparent shadow-sm'
                                                                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                                                                    }`}
                                                                            >
                                                                                {(itemAvailability === 'in_stock' || itemAvailability === 'approved') ? '✓ Có hàng' : 'Có hàng'}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleMarkAvailability(receipt, item, idx, false)}
                                                                                disabled={isProcessing}
                                                                                className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-50 ${itemAvailability === 'unavailable'
                                                                                    ? 'bg-red-500 text-white border-transparent shadow-sm'
                                                                                    : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                                                                                    }`}
                                                                            >
                                                                                {itemAvailability === 'unavailable' ? '✓ Không có' : 'Không có'}
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="bg-gray-50">
                                                            <td colSpan={5} className="px-6 py-3 text-right text-sm font-bold text-gray-700">Tổng cộng:</td>
                                                            <td className="px-6 py-3 text-right text-sm font-bold text-orange-600">
                                                                {formatPrice(receipt.items.reduce((sum, item, idx) => (
                                                                    sum + (isReceiptItemUnavailable(item) ? 0 : prices[idx] * (quantities[idx] ?? item.quantity))
                                                                ), 0))}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                                {/* Warning: missing NCC */}
                                                {missingSupplierCount > 0 && (
                                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-t border-amber-200 text-amber-700 text-xs font-medium">
                                                        <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                                                        Còn {missingSupplierCount}/{importableItems.length} linh kiện cần đặt chưa gán NCC
                                                    </div>
                                                )}
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
                                                        onClick={() => handleOrderReceipt(receipt)}
                                                        disabled={isProcessing || importableItems.length === 0 || missingSupplierCount > 0}
                                                        className={`flex items-center gap-1.5 px-5 py-2 text-sm font-bold rounded-lg transition-colors disabled:opacity-50 shadow-sm ${importableItems.length === 0 || missingSupplierCount > 0
                                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                            : 'text-white bg-blue-600 hover:bg-blue-700'
                                                            }`}
                                                        title={importableItems.length === 0 ? 'Không còn linh kiện có thể đặt' : missingSupplierCount > 0 ? 'Cần gán NCC cho các linh kiện sẽ đặt' : ''}
                                                    >
                                                        {isProcessing ? <Loader2 size={15} className="animate-spin" /> : <PackagePlus size={15} />}
                                                        Chốt Đặt hàng
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
            {/* ═══════ TAB 3: Ordered Receipts ═══════ */}
            {activeTab === 'ordered' && (
                <div className="space-y-4">
                    {loadingDrafts ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 size={32} className="animate-spin text-orange-500" />
                        </div>
                    ) : orderedReceipts.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-100">
                            <CheckCircle2 size={48} className="mx-auto text-gray-300 mb-4" />
                            <p className="text-gray-500">Không có phiếu đã đặt hàng nào chờ nhập kho</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {orderedReceipts.map((receipt) => {
                                const isExpanded = expandedReceiptId === receipt.id;
                                const unavailableCount = receipt.items.filter(isReceiptItemUnavailable).length;
                                const importableItems = receipt.items.filter((item) => !isReceiptItemUnavailable(item));
                                const importableTotal = calculateImportableTotal(receipt.items);
                                return (
                                    <div key={receipt.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                        <div
                                            className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                            onClick={() => handleExpandReceipt(receipt.id)}
                                        >
                                            <div className="flex items-center gap-4">
                                                {isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-blue-100 text-blue-700">
                                                            <PackagePlus size={12} />
                                                            Đã Đặt Hàng
                                                        </span>
                                                        <span className="font-semibold text-gray-800">#{receipt.id.slice(-6).toUpperCase()}</span>
                                                    </div>
                                                    <p className="text-sm text-gray-500 mt-0.5">
                                                        {(() => { const s = [...new Set(importableItems.map(i => i.supplier).filter(Boolean))]; return s.length > 0 ? s.join(', ') : 'Chưa gán NCC'; })()} · {importableItems.length} chờ nhập{unavailableCount > 0 ? ` · ${unavailableCount} không có` : ''} · {formatDate(receipt.createdAt)}
                                                    </p>
                                                    {receipt.note && (
                                                        <p className="text-xs text-blue-600 mt-1 italic">{receipt.note}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-gray-700">
                                                    {formatPrice(importableTotal)}
                                                </span>
                                            </div>
                                        </div>
                                        {isExpanded && (
                                            <div className="border-t border-gray-100 overflow-x-auto">
                                                <table className="w-full min-w-[600px]">
                                                    <thead className="bg-gray-50/80">
                                                        <tr>
                                                            <th className="px-6 py-2 text-left text-xs font-semibold text-gray-500">Linh kiện</th>
                                                            <th className="px-6 py-2 text-center text-xs font-semibold text-gray-500">Chất lượng</th>
                                                            <th className="px-6 py-2 text-center text-xs font-semibold text-gray-500">SL</th>
                                                            <th className="px-6 py-2 text-center text-xs font-semibold text-gray-500">Giá nhập (VNĐ)</th>
                                                            <th className="px-6 py-2 text-right text-xs font-semibold text-gray-500">Thành tiền</th>
                                                            <th className="px-6 py-2 text-right text-xs font-semibold text-gray-500">Tình trạng</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {receipt.items.map((item, idx) => {
                                                            const isCustom = !parts.find(p => p.id === item.productId) || parts.find(p => p.id === item.productId)?.isProposed;
                                                            const itemAvailability = getReceiptItemAvailability(item);
                                                            const isUnavailable = itemAvailability === 'unavailable';
                                                            return (
                                                                <tr key={item.partLineId || `${item.productId}_${idx}`} className={isUnavailable ? 'bg-red-50/60 text-gray-400' : 'hover:bg-blue-50/30'}>
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
                                                                    <td className="px-6 py-3 text-center text-sm">
                                                                        {formatPrice(item.importPrice)}
                                                                    </td>
                                                                    <td className="px-6 py-3 text-right text-sm font-semibold text-gray-700">
                                                                        {isUnavailable ? 'Đã loại' : formatPrice(item.importPrice * item.quantity)}
                                                                    </td>
                                                                    <td className="px-6 py-3 text-right text-xs">
                                                                        <div className="flex items-center justify-end gap-1.5" data-testid={`ordered-availability-${item.partLineId || idx}`}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleMarkAvailability(receipt, item, idx, true)}
                                                                                disabled={isProcessing}
                                                                                className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-50 ${(itemAvailability === 'in_stock' || itemAvailability === 'approved')
                                                                                    ? 'bg-emerald-500 text-white'
                                                                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                                                                    }`}
                                                                            >
                                                                                {(itemAvailability === 'in_stock' || itemAvailability === 'approved') ? '✓ Có hàng' : 'Có hàng'}
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleMarkAvailability(receipt, item, idx, false)}
                                                                                disabled={isProcessing}
                                                                                className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-50 ${itemAvailability === 'unavailable'
                                                                                    ? 'bg-red-500 text-white'
                                                                                    : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                                                                                    }`}
                                                                            >
                                                                                {itemAvailability === 'unavailable' ? '✓ Không có' : 'Không có'}
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="bg-gray-50">
                                                            <td colSpan={4} className="px-6 py-3 text-right text-sm font-bold text-gray-700">Tổng cộng:</td>
                                                            <td className="px-6 py-3 text-right text-sm font-bold text-orange-600">
                                                                {formatPrice(importableTotal)}
                                                            </td>
                                                            <td />
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                                <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50/50">
                                                    <button
                                                        onClick={() => handleDeleteDraft(receipt.id)}
                                                        disabled={isProcessing}
                                                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        <Trash2 size={15} />
                                                        Hủy phiếu
                                                    </button>
                                                    <button
                                                        onClick={() => handleImportReceipt(receipt)}
                                                        disabled={isProcessing || importableItems.length === 0}
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
            <UniversalProductModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingPart(null); }}
                mode="component"
                initialData={editingPart as unknown as (Product & { id: string }) | null}
                onCreated={() => setIsModalOpen(false)}
                onUpdated={() => setIsModalOpen(false)}
                partTypeOptions={partTypeOptions}
            />
            {/* Confirm UI Modal */}
            <Modal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                title={confirmModal.title}
                size="md"
                priority="high"
            >
                <div className="p-6">
                    <p className="text-sm text-gray-600 leading-relaxed">{confirmModal.message}</p>
                </div>
                <div className="bg-gray-50/80 px-6 py-4 flex items-center gap-3 justify-end border-t border-gray-100">
                    <button
                        onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                        className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={() => {
                            confirmModal.onConfirm();
                            setConfirmModal(prev => ({ ...prev, isOpen: false }));
                        }}
                        className={`px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors shadow-sm ${confirmModal.dangerous ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                    >
                        {confirmModal.confirmText || 'Xác nhận'}
                    </button>
                </div>
            </Modal>
            {/* Import Preview Modal */}
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
            {/* Create Receipt Modal */}
            {isCreateReceiptOpen && (
                <CreateReceiptModal
                    isOpen={isCreateReceiptOpen}
                    onClose={() => setIsCreateReceiptOpen(false)}
                    parts={parts}
                    retailProducts={retailProducts}
                    currentUser={user}
                    suppliers={supplierList}
                    onCreated={() => {
                        void fetchDrafts();
                        router.push('/admin/inventory?tab=draft');
                    }}
                />
            )}
            {importSuccessLots && importSuccessLots.length > 0 && (
                <ProductQrLabelModal 
                    batchItems={importSuccessLots} 
                    onClose={() => setImportSuccessLots(null)} 
                />
            )}
            <ProductQrLabelModal product={qrPart} onClose={() => setQrPart(null)} />
            <FixHiddenProductsModal isOpen={showFixHidden} onClose={() => setShowFixHidden(false)} products={products} />
            <LotTrackingModal isOpen={isLotTrackingOpen} onClose={() => setIsLotTrackingOpen(false)} />
        </div>
    );
}
