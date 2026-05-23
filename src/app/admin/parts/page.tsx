'use client';

import { useState, useEffect } from 'react';
import {
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
    Save,
    Building2
} from 'lucide-react';
import { useFirestoreCollection, updateDocument } from '@/lib/useFirestore';
import { PART_CATEGORY, isPartCategory } from '@/lib/constants';

import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import Modal from '@/components/admin/Modal';
import UniversalProductModal from '@/components/admin/UniversalProductModal';
import type { Product, FirestoreDateValue, RepairTicket } from '@/lib/types';
import type { DocumentReference, DocumentSnapshot } from 'firebase/firestore';
import { orderBy } from 'firebase/firestore';
import {
    collection, getDocs, updateDoc, deleteDoc,
    doc, serverTimestamp, query, orderBy as fbOrderBy, getDoc, addDoc, onSnapshot, writeBatch, where,
    runTransaction, increment
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { toastError, toastSuccess } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import CurrencyInput from '@/components/admin/CurrencyInput';

interface ImportReceiptItem {
    productId: string;
    productName: string;
    quantity: number;
    importPrice: number;
    quality?: string;
    oldCostPrice?: number;
    availability?: 'in_stock' | 'unavailable';
    supplier?: string;
    supplierId?: string;
}

interface ImportReceipt {
    id: string;
    supplier?: string;
    supplierId?: string;
    items: ImportReceiptItem[];
    totalAmount: number;
    note?: string;
    receiptType?: 'component' | 'retail';
    status: 'draft' | 'ordered' | 'completed';
    paymentMethod?: 'paid' | 'debt';
    createdBy: string;
    createdByName: string;
    createdAt: FirestoreDateValue;
    completedAt?: FirestoreDateValue;
    // Optional: link back to repair ticket that requested these parts
    repairTicketId?: string;
}

interface SupplierOption {
    id: string;
    name: string;
    totalDebt: number;
}



interface NewPartInfo {
    model?: string;
    partType?: string;
    price_promo?: number | string;
    supplier?: string;
    categoryIds?: string[];
    [key: string]: unknown;
}

interface ImportPreviewState {
    isOpen: boolean;
    receipt: ImportReceipt | null;
    newParts: Record<string, NewPartInfo>;
}

export default function PartsPage() {
    const { user } = useAuth(); // Ensure authenticated
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
    const [activeTab, setActiveTab] = useState<'parts' | 'proposals' | 'ordered'>('parts');

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
    const [forecastCostPrices, setForecastCostPrices] = useState<Map<string, number>>(new Map());

    // Confirm Modal State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        dangerous?: boolean;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

    // Warranty part types from config
    const [partTypeOptions, setPartTypeOptions] = useState<string[]>([]);

    // Supplier list for dropdown
    const [supplierList, setSupplierList] = useState<SupplierOption[]>([]);
    // Draft supplier editing state
    const [draftSupplierSearch, setDraftSupplierSearch] = useState('');
    const [draftSupplierActiveKey, setDraftSupplierActiveKey] = useState<string | null>(null);

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

    const handleDelete = (part: Product) => {
        // Pre-flight: block deletion if stock > 0
        if (Number(part.stock) > 0) {
            toastError(`Không thể xóa "${part.name}" — còn ${part.stock} trong kho. Hãy xuất kho trước.`);
            return;
        }
        setConfirmModal({
            isOpen: true,
            title: 'Xóa linh kiện',
            message: `Bạn có chắc muốn xóa linh kiện "${part.name}"? Sản phẩm sẽ bị ẩn khỏi danh sách nhưng vẫn giữ lịch sử.`,
            confirmText: 'Xóa',
            dangerous: true,
            onConfirm: async () => {
                try {
                    // Soft Delete: mark inactive to preserve historical references
                    await updateDocument('products', part.id, { status: 'inactive' });
                } catch {
                    toastError('Lỗi khi xóa linh kiện!');
                }
            }
        });
    };

    const filteredParts = parts.filter((p) => {
        // Hide soft-deleted and proposed products
        if (p.status === 'inactive' || p.isProposed) return false;

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

    const formatPrice = (price?: number) => {
        if (!price) return '0đ';
        return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
    };

    const { paginatedData: paginatedParts, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredParts, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery]);

    const formatDate = (ts: FirestoreDateValue | Date | number | null | undefined) => {
        if (!ts) return '—';
        const d = typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts as number | Date);
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
            const totalAmount = updatedItems.reduce((sum, i) => sum + i.importPrice * i.quantity, 0);

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
        // Validate: all items must have supplier assigned
        const missingSupplier = receipt.items.filter(i => !i.supplier);
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
                    await updateDoc(doc(db, 'import_receipts', receipt.id), {
                        status: 'ordered',
                        updatedAt: serverTimestamp()
                    });
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
        // Identify proposed/new items by checking against known products
        const initNewParts: Record<string, NewPartInfo> = {};
        for (const item of receipt.items) {
            const existingPart = parts.find(p => p.id === item.productId);
            if (!existingPart || existingPart.isProposed) {
                initNewParts[item.productId] = {
                    model: '',
                    partType: '',
                    price_promo: 0,
                    supplier: item.supplier || ''
                };
            }
        }
        
        // Final prep for forecast (only for existing active products)
        const forecasts = new Map<string, number>();
        for (const item of receipt.items) {
            if (!(item.productId in initNewParts)) {
                const p = parts.find(part => part.id === item.productId);
                if (p) {
                    const oldStock = Number(p.stock) || 0;
                    const oldCost = Number(p.costPrice) || Number(p.price_original) || 0;
                    const newQty = Number(item.quantity);
                    const newCost = Number(item.importPrice);
                    const totalQty = oldStock + newQty;
                    const avgCost = totalQty > 0 ? Math.round(((oldStock * oldCost) + (newQty * newCost)) / totalQty) : newCost;
                    forecasts.set(item.productId, avgCost);
                }
            }
        }

        setForecastCostPrices(forecasts);
        setImportPreviewModal({
            isOpen: true,
            receipt: receipt,
            newParts: initNewParts
        });
    };

    const executeFinalImport = async (paymentMethod: 'paid' | 'debt') => {
        const { receipt, newParts } = importPreviewModal;
        if (!receipt) return;
        
        setIsProcessing(true);
        try {
            await runTransaction(db, async (transaction) => {
                const estimateByProductId = new Map<string, { estimatedUnitCost: number; estimatedUnitPrice: number }>();
                const itemUpdatesByName = new Map<string, { newProductId: string; unitCost: number; unitPrice: number }>();

                // Phase 1: READ all documents inside transaction
                // 1a. Read ticket if linked
                let ticketData: Record<string, unknown> | null = null;
                let ticketParts: NonNullable<RepairTicket['parts']> = [];
                let ticketRef: DocumentReference | null = null;

                if (receipt.repairTicketId) {
                    ticketRef = doc(db, 'repairs', receipt.repairTicketId);
                    const tSnap = await transaction.get(ticketRef);
                    if (tSnap.exists()) {
                        ticketData = tSnap.data();
                        ticketParts = Array.isArray(ticketData.parts) ? [...ticketData.parts] : (Array.isArray(ticketData.selectedParts) ? [...ticketData.selectedParts] : []);
                    }
                }

                // 1b. Read all product docs (fresh data inside transaction)
                const productDocs = new Map<string, { ref: DocumentReference; data: Record<string, unknown> | null; exists: boolean }>();
                for (const item of receipt.items) {
                    if (!productDocs.has(item.productId)) {
                        const pRef = doc(db, 'products', item.productId);
                        const pSnap = await transaction.get(pRef);
                        productDocs.set(item.productId, {
                            ref: pRef,
                            data: pSnap.exists() ? (pSnap.data() as Record<string, unknown>) : null,
                            exists: pSnap.exists()
                        });
                    }
                }

                // 1c. Read all unique supplier docs from item-level supplierId (must read before any writes)
                const supplierDocs = new Map<string, { ref: DocumentReference; snap: DocumentSnapshot }>();
                for (const item of receipt.items) {
                    if (item.supplierId && !supplierDocs.has(item.supplierId)) {
                        const sRef = doc(db, 'suppliers', item.supplierId);
                        const sSnap = await transaction.get(sRef);
                        supplierDocs.set(item.supplierId, { ref: sRef, snap: sSnap });
                    }
                }

                // Phase 2: COMPUTE & WRITE
                // Track subtotal per supplier for grouped debt
                const supplierSubtotals = new Map<string, { name: string; amount: number }>();

                for (const item of receipt.items) {
                    const currentProductId = item.productId;
                    let pricePromo = 0;
                    
                    const matchTicketPart = ticketParts.find(p => p.name === item.productName || p.productName === item.productName || p.partName === item.productName);
                    const ticketQty = matchTicketPart ? (Number(matchTicketPart.quantity) || 1) : 0;
                    
                    const isProposedItem = item.productId in newParts;
                    const pDoc = productDocs.get(item.productId);
                    const existingData = pDoc?.data;
                    const existingExists = pDoc?.exists ?? false;

                    // Accumulate supplier subtotal
                    if (item.supplierId) {
                        const prev = supplierSubtotals.get(item.supplierId) || { name: item.supplier || '', amount: 0 };
                        prev.amount += item.importPrice * item.quantity;
                        if (!prev.name && item.supplier) prev.name = item.supplier;
                        supplierSubtotals.set(item.supplierId, prev);
                    }

                    if (isProposedItem) {
                        // 1. Activate proposed product
                        const info = newParts[item.productId];
                        pricePromo = Number(info?.price_promo) || 0;

                        const isRetailReceipt = receipt.receiptType === 'retail';
                        const oldStock = existingData ? (Number(existingData.stock) || 0) : 0;
                        const oldHeld = existingData ? (Number(existingData.held) || 0) : 0;
                        const updateData: Record<string, unknown> = {
                            name: item.productName,
                            price_original: item.importPrice,
                            costPrice: item.importPrice,
                            price_promo: pricePromo,
                            stock: oldStock + Number(item.quantity),
                            held: oldHeld + ticketQty,
                            quality: item.quality || 'Zin',
                            supplier: item.supplier || info?.supplier || '',
                            category: isRetailReceipt ? 'product' : 'component',
                            categoryIds: isRetailReceipt ? (info?.categoryIds || ['san-pham']) : ['component'],
                            status: 'active',
                            isProposed: false,
                            updatedAt: serverTimestamp()
                        };
                        if (!isRetailReceipt) {
                            updateData.partType = info?.partType || (existingData?.partType as string) || '';
                            updateData.description = info?.model || (existingData?.description as string) || '';
                        }

                        if (existingExists) {
                            transaction.update(pDoc!.ref, updateData);
                        } else {
                            updateData.sold = 0;
                            updateData.createdAt = serverTimestamp();
                            transaction.set(pDoc!.ref, updateData);
                        }

                        // Audit Trail
                        const logRef = doc(collection(db, 'inventory_logs'));
                        transaction.set(logRef, {
                            productId: currentProductId,
                            productName: item.productName,
                            quantity: Number(item.quantity),
                            costPriceAtLog: item.importPrice,
                            type: 'IMPORT',
                            referenceId: receipt.id,
                            referenceType: 'import_receipt',
                            createdBy: user?.uid || '',
                            createdByName: user?.displayName || 'Admin',
                            createdAt: serverTimestamp(),
                        });

                        estimateByProductId.set(item.productId, { 
                            estimatedUnitCost: item.importPrice, 
                            estimatedUnitPrice: pricePromo 
                        });
                    } else if (existingExists && existingData) {
                        // 2. Update existing product with weighted average (from FRESH data)
                        const oldStock = Math.max(0, Number(existingData.stock) || 0);
                        const oldHeld = Number(existingData.held) || 0;
                        const oldCost = Number(existingData.costPrice) || Number(existingData.price_original) || 0;
                        const newQty = Number(item.quantity);
                        const newCost = Number(item.importPrice);
                        
                        const totalQty = oldStock + newQty;
                        const avgCost = totalQty > 0 
                            ? Math.round(((oldStock * oldCost) + (newQty * newCost)) / totalQty)
                            : newCost;

                        transaction.update(pDoc!.ref, {
                            stock: totalQty,
                            held: oldHeld + ticketQty,
                            price_original: avgCost,
                            costPrice: avgCost,
                            oldCostPrice: oldCost,
                            isProposed: false,
                            supplier: item.supplier || (existingData.supplier as string) || '',
                            updatedAt: serverTimestamp()
                        });

                        pricePromo = Number(existingData.price_promo || existingData.price_original || 0);

                        // Audit Trail
                        const logRef = doc(collection(db, 'inventory_logs'));
                        transaction.set(logRef, {
                            productId: item.productId,
                            productName: item.productName,
                            quantity: newQty,
                            costPriceAtLog: newCost,
                            type: 'IMPORT',
                            referenceId: receipt.id,
                            referenceType: 'import_receipt',
                            createdBy: user?.uid || '',
                            createdByName: user?.displayName || 'Admin',
                            createdAt: serverTimestamp(),
                        });

                        estimateByProductId.set(item.productId, { 
                            estimatedUnitCost: item.importPrice, 
                            estimatedUnitPrice: pricePromo 
                        });
                    }

                    itemUpdatesByName.set(item.productName, {
                        newProductId: currentProductId,
                        unitCost: item.importPrice,
                        unitPrice: pricePromo > 0 ? pricePromo : item.importPrice
                    });
                }

                // 3. Mark receipt completed
                transaction.update(doc(db, 'import_receipts', receipt.id), {
                    status: 'completed',
                    paymentMethod,
                    completedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });

                // 3b. Create SupplierTransaction + increment supplier debt (grouped by supplierId)
                for (const [sId, info] of supplierSubtotals) {
                    const sDoc = supplierDocs.get(sId);
                    if (!sDoc || !sDoc.snap.exists()) continue;

                    const txnType = paymentMethod === 'debt' ? 'IMPORT' : 'IMPORT_PAID';

                    // Only increment debt when paymentMethod is 'debt'
                    if (paymentMethod === 'debt') {
                        transaction.update(sDoc.ref, {
                            totalDebt: increment(info.amount),
                            updatedAt: serverTimestamp()
                        });
                    }

                    // Always log transaction for audit trail
                    const txnRef = doc(collection(db, 'supplier_transactions'));
                    transaction.set(txnRef, {
                        supplierId: sId,
                        supplierName: info.name,
                        type: txnType,
                        amount: info.amount,
                        importReceiptId: receipt.id,
                        note: `${paymentMethod === 'debt' ? 'Ghi nợ' : 'Thanh toán ngay'} — Phiếu #${receipt.id.slice(-6)}`,
                        createdBy: user?.uid || '',
                        createdByName: user?.displayName || 'Admin',
                        createdAt: serverTimestamp()
                    });
                }

                // 4. Sync status back to repair ticket if applicable
                if (receipt.repairTicketId && ticketData && ticketRef) {
                    let totalPartsCost = 0;
                    const updatedParts = ticketParts.map((p) => {
                        const match = receipt.items.find(ri => ri.productName === p.name || ri.productName === p.productName || ri.productName === p.partName);
                        if (match) {
                            const updateInfo = itemUpdatesByName.get(match.productName);
                            const qty = Number(p.quantity) || 1;
                            const unitCostAtUse = updateInfo?.unitCost || p.unitCostAtUse || 0;
                            const unitPriceAtUse = updateInfo?.unitPrice || p.unitPriceAtUse || p.price || 0;
                            
                            if (!p.isWarrantyCovered) {
                                totalPartsCost += unitPriceAtUse * qty;
                            }
                            
                            return { 
                                ...p, 
                                availability: 'selected', 
                                status: 'selected',
                                productId: updateInfo?.newProductId || p.productId,
                                unitCostAtUse: unitCostAtUse,
                                unitPriceAtUse: unitPriceAtUse
                            };
                        } else if (p.status === 'selected' && !p.isWarrantyCovered) {
                            const qty = Number(p.quantity) || 1;
                            totalPartsCost += (Number(p.unitPriceAtUse) || p.price || 0) * qty;
                        }
                        return p;
                    });
                    
                    const ticketPayment = ticketData as { payment?: { laborCost?: number; additionalFees?: number; discountAmount?: number } };
                    const newPayment = {
                        ...(ticketPayment.payment || {}),
                        partsCost: totalPartsCost,
                        amount: (ticketPayment.payment?.laborCost || 0) + totalPartsCost + (ticketPayment.payment?.additionalFees || 0) - (ticketPayment.payment?.discountAmount || 0)
                    };
                    
                    transaction.update(ticketRef, { parts: updatedParts, payment: newPayment });
                }
            });

            toastSuccess('Nhập kho thành công!');
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

    const handleMarkAvailability = async (receipt: ImportReceipt, item: ImportReceiptItem, isAvailable: boolean) => {
        setIsProcessing(true);
        try {
            const receiptRef = doc(db, 'import_receipts', receipt.id);

            await runTransaction(db, async (transaction) => {
                // 1. Read receipt fresh
                const receiptSnap = await transaction.get(receiptRef);
                if (!receiptSnap.exists()) throw new Error('Phiếu nhập không tồn tại.');
                const receiptData = receiptSnap.data();
                const currentItems = receiptData.items || [];

                // 2. Update item availability
                const newItems = currentItems.map((i: ImportReceiptItem) => {
                    if (i.productId === item.productId && i.productName === item.productName) {
                        return { ...i, availability: isAvailable ? 'in_stock' : 'unavailable' };
                    }
                    return i;
                });
                transaction.update(receiptRef, { 
                    items: newItems,
                    updatedAt: serverTimestamp()
                });

                // 3. Sync with Repair Ticket (inside same transaction)
                if (receipt.repairTicketId) {
                    const ticketRef = doc(db, 'repairs', receipt.repairTicketId);
                    const ticketSnap = await transaction.get(ticketRef);
                    if (ticketSnap.exists()) {
                        const ticketData = ticketSnap.data();
                        const tParts = Array.isArray(ticketData.parts) ? [...ticketData.parts] : (Array.isArray(ticketData.selectedParts) ? [...ticketData.selectedParts] : []);
                        const updatedParts = tParts.map((p: NonNullable<RepairTicket['parts']>[number]) => {
                            if (p.name === item.productName || p.productName === item.productName || p.partName === item.productName) {
                                return { ...p, availability: isAvailable ? 'in_stock' : 'unavailable', status: isAvailable ? 'in_stock' : 'unavailable' };
                            }
                            return p;
                        });
                        transaction.update(ticketRef, { parts: updatedParts });
                    }
                }
            });

            toastSuccess('Đã cập nhật tình trạng hàng');
            await fetchDrafts();
        } catch (error) {
            console.error(error);
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
                        onClick={() => setIsCreateReceiptOpen(true)}
                        className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-sm"
                    >
                        <Plus size={20} />
                        Thêm đề xuất
                    </button>
                </div>
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
                <button
                    onClick={() => setActiveTab('ordered')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
                        activeTab === 'ordered'
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
                                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                                    statusFilter === 'all' ? 'bg-orange-100 text-orange-700' : 'bg-white text-gray-600 border hover:bg-gray-50'
                                }`}
                            >
                                Tất cả
                            </button>
                            <button
                                onClick={() => setStatusFilter('out_of_stock')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                                    statusFilter === 'out_of_stock' ? 'bg-red-100 text-red-700' : 'bg-white text-gray-600 border hover:bg-gray-50'
                                }`}
                            >
                                Hết hàng
                            </button>
                            <button
                                onClick={() => setStatusFilter('bestseller')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                                    statusFilter === 'bestseller' ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-gray-600 border hover:bg-gray-50'
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
                                            <span className={`text-sm font-bold ml-3 ${(part.stock || 0) > 10 ? 'text-green-600' : (part.stock || 0) > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                Tồn: {part.stock || 0}
                                            </span>
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
                                                <button onClick={() => handleDelete(part)} className="p-2 hover:bg-red-100 text-red-600 rounded-lg" title="Xóa"><Trash2 size={18} /></button>
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
                                                        <p className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border ${
                                                            part.price_original > part.oldCostPrice ? 'text-red-500 border-red-100 bg-red-50' : 'text-green-600 border-green-100 bg-green-50'
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
                                                <span className={`text-sm font-bold ${(part.stock || 0) > 10 ? 'text-green-600' : (part.stock || 0) > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                    {part.stock || 0}
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
                                                        {(() => { const s = [...new Set(receipt.items.map(i => i.supplier).filter(Boolean))]; return s.length > 0 ? s.join(', ') : 'Chưa gán NCC'; })()} · {receipt.items.length} sản phẩm · {formatDate(receipt.createdAt)}
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
                                                            return (
                                                                <tr key={idx} className="hover:bg-orange-50/30">
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
                                                                                        onChange={(e) => { setDraftSupplierSearch(e.target.value); setDraftSupplierActiveKey(itemKey); }}
                                                                                        onFocus={() => { setDraftSupplierActiveKey(itemKey); setDraftSupplierSearch(item.supplier || ''); }}
                                                                                        onBlur={() => setTimeout(() => setDraftSupplierActiveKey(null), 200)}
                                                                                        placeholder="Chọn NCC"
                                                                                        className={`w-full max-w-[140px] h-9 px-2 text-xs border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 ${
                                                                                            !item.supplier ? 'border-red-300 bg-red-50/50' : 'border-gray-300'
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
                                                                        {formatPrice(priceVal * (quantities[idx] ?? item.quantity))}
                                                                    </td>
                                                                    <td className="px-6 py-3 text-right text-xs">
                                                                        {receipt.repairTicketId ? (
                                                                            <div className="flex items-center justify-end gap-1.5">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleMarkAvailability(receipt, item, true)}
                                                                                    disabled={isProcessing}
                                                                                    className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                                                                                        item.availability === 'in_stock' 
                                                                                        ? 'bg-emerald-500 text-white border-transparent shadow-sm' 
                                                                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                                                                    }`}
                                                                                >
                                                                                    {item.availability === 'in_stock' ? '✓ Đã báo Có' : 'Có hàng'}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleMarkAvailability(receipt, item, false)}
                                                                                    disabled={isProcessing}
                                                                                    className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                                                                                        item.availability === 'unavailable' 
                                                                                        ? 'bg-red-500 text-white border-transparent shadow-sm' 
                                                                                        : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                                                                                    }`}
                                                                                >
                                                                                    {item.availability === 'unavailable' ? '✓ Đã báo Hết' : 'Không có'}
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-[11px] text-gray-400 italic">Phiếu lẻ</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="bg-gray-50">
                                                            <td colSpan={5} className="px-6 py-3 text-right text-sm font-bold text-gray-700">Tổng cộng:</td>
                                                            <td className="px-6 py-3 text-right text-sm font-bold text-orange-600">
                                                                {formatPrice(prices.reduce((sum, p, idx) => sum + p * (quantities[idx] ?? receipt.items[idx]?.quantity ?? 1), 0))}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>

                                                {/* Warning: missing NCC */}
                                                {receipt.items.some(i => !i.supplier) && (
                                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-t border-amber-200 text-amber-700 text-xs font-medium">
                                                        <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                                                        Còn {receipt.items.filter(i => !i.supplier).length}/{receipt.items.length} sản phẩm chưa gán NCC
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
                                                        disabled={isProcessing || receipt.items.some(i => !i.supplier)}
                                                        className={`flex items-center gap-1.5 px-5 py-2 text-sm font-bold rounded-lg transition-colors disabled:opacity-50 shadow-sm ${
                                                            receipt.items.some(i => !i.supplier)
                                                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                                : 'text-white bg-blue-600 hover:bg-blue-700'
                                                        }`}
                                                        title={receipt.items.some(i => !i.supplier) ? 'Cần gán NCC cho tất cả sản phẩm' : ''}
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
                                                        {(() => { const s = [...new Set(receipt.items.map(i => i.supplier).filter(Boolean))]; return s.length > 0 ? s.join(', ') : 'Chưa gán NCC'; })()} · {receipt.items.length} sản phẩm · {formatDate(receipt.createdAt)}
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
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                        {receipt.items.map((item, idx) => {
                                                            const isCustom = !parts.find(p => p.id === item.productId) || parts.find(p => p.id === item.productId)?.isProposed;
                                                            return (
                                                                <tr key={idx} className="hover:bg-blue-50/30">
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
                                                                        {formatPrice(item.importPrice * item.quantity)}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="bg-gray-50">
                                                            <td colSpan={4} className="px-6 py-3 text-right text-sm font-bold text-gray-700">Tổng cộng:</td>
                                                            <td className="px-6 py-3 text-right text-sm font-bold text-orange-600">
                                                                {formatPrice(receipt.totalAmount)}
                                                            </td>
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
                        className={`px-5 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors shadow-sm ${
                            confirmModal.dangerous ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
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
                    onCreated={() => fetchDrafts()}
                />
            )}
        </div>
    );
}



interface ImportPreviewModalProps {
    importPreviewModal: ImportPreviewState;
    setImportPreviewModal: React.Dispatch<React.SetStateAction<ImportPreviewState>>;
    forecastCostPrices: Map<string, number>;
    partTypeOptions: string[];
    suppliers: SupplierOption[];
    onConfirm: (paymentMethod: 'paid' | 'debt') => Promise<void>;
}

// Import Preview Modal Component
function ImportPreviewModal({
    importPreviewModal,
    setImportPreviewModal,
    forecastCostPrices,
    partTypeOptions,
    suppliers,
    onConfirm
}: ImportPreviewModalProps) {
    const { receipt, newParts } = importPreviewModal;
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'paid' | 'debt'>('debt');

    if (!receipt) return null;

    const newItems = receipt.items.filter((i: ImportReceiptItem) => i.productId in newParts);
    const existingItems = receipt.items.filter((i: ImportReceiptItem) => !(i.productId in newParts));

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

    const isRetail = receipt?.receiptType === 'retail';
    const isReady = newItems.every((item: ImportReceiptItem) => {
        const info = newParts[item.productId];
        if (isRetail) {
            return info && info.categoryIds && info.categoryIds.length > 0 && Number(info.price_promo) > 0;
        }
        return info && info.model && info.partType && Number(info.price_promo) > 0;
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
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                                    paymentMethod === 'debt'
                                        ? 'border-red-500 bg-red-50 text-red-700'
                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                }`}
                            >
                                📋 Ghi công nợ
                            </button>
                            <button
                                type="button"
                                onClick={() => setPaymentMethod('paid')}
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                                    paymentMethod === 'paid'
                                        ? 'border-green-500 bg-green-50 text-green-700'
                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                }`}
                            >
                                💰 Thanh toán ngay
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
                                {existingItems.map((item: ImportReceiptItem) => (
                                    <div key={item.productId} className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                                        <div>
                                            <p className="font-medium text-sm text-gray-800">{item.productName}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">SL: {item.quantity} x {new Intl.NumberFormat('vi-VN').format(item.importPrice)}đ {item.supplier && <span className="text-purple-600 ml-1">· {item.supplier}</span>}</p>
                                        </div>
                                        {forecastCostPrices.has(item.productId) && (
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-500 uppercase font-medium">Giá vốn sẽ thành</p>
                                                <p className={`text-sm font-bold flex items-center justify-end gap-1 ${
                                                    forecastCostPrices.get(item.productId)! > (item.oldCostPrice || 0) ? 'text-red-600' : 'text-green-600'
                                                }`}>
                                                    {new Intl.NumberFormat('vi-VN').format(forecastCostPrices.get(item.productId)!)}đ
                                                    {forecastCostPrices.get(item.productId)! > (item.oldCostPrice || 0) ? <span className="text-xs text-red-500 ml-1">↑ tăng</span> : <span className="text-xs text-green-500 ml-1">↓ giảm</span>}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
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
                                {newItems.map((item: ImportReceiptItem) => {
                                    const info = newParts[item.productId] || {};
                                    return (
                                        <div key={item.productId} className="bg-orange-50/50 border border-orange-100 p-4 rounded-xl space-y-4 shadow-sm">
                                            <div>
                                                <p className="font-medium text-gray-800 text-sm">{item.productName}</p>
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
                                                                onChange={(ids) => handleNewPartChange(item.productId, 'categoryIds', ids)}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-gray-700 mb-1">Nguồn cung cấp *</label>
                                                            <input
                                                                type="text"
                                                                value={info.supplier || ''}
                                                                onChange={(e) => handleNewPartChange(item.productId, 'supplier', e.target.value)}
                                                                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:border-orange-500 outline-none transition-colors"
                                                                placeholder="Vd: Apple Store VN"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-gray-700 mb-1">Giá bán lẻ *</label>
                                                            <CurrencyInput
                                                                value={info.price_promo || ''}
                                                                onChange={(v) => handleNewPartChange(item.productId, 'price_promo', v)}
                                                                className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:border-orange-500 outline-none transition-colors"
                                                                placeholder="Vd: 25.000.000"
                                                            />
                                                        </div>
                                                    </>
                                                ) : (
                                                    /* Component: model + partType fields */
                                                    <>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Dòng máy tương thích *</label>
                                                    <input
                                                        type="text"
                                                        value={info.model || ''}
                                                        onChange={(e) => handleNewPartChange(item.productId, 'model', e.target.value)}
                                                        className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:border-orange-500 outline-none transition-colors"
                                                        placeholder="Vd: iPhone 13 Pro Max"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Loại linh kiện *</label>
                                                    <div className="relative">
                                                        <select
                                                            value={info.partType || ''}
                                                            onChange={(e) => handleNewPartChange(item.productId, 'partType', e.target.value)}
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
                                                        onChange={(e) => handleNewPartChange(item.productId, 'supplier', e.target.value)}
                                                        className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg focus:border-orange-500 outline-none transition-colors"
                                                        placeholder="Vd: Zin LK Sài Gòn"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Giá bán sửa chữa *</label>
                                                    <CurrencyInput
                                                        value={info.price_promo || ''}
                                                        onChange={(v) => handleNewPartChange(item.productId, 'price_promo', v)}
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
                        {newItems.length > 0 && !isReady ? 'Vui lòng điền đủ thông tin cho linh kiện mới' : 'Xác nhận nhập kho sẽ cập nhật giá vốn và tồn kho'}
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
                            className={`px-6 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-sm flex items-center gap-2 ${
                                isReady && !loading ? 'bg-orange-600 hover:bg-orange-700' : 'bg-gray-300 cursor-not-allowed hidden md:flex'
                            }`}
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Chốt Nhập Kho
                        </button>
                        
                        {/* Mobile view text for disabled button */}
                        <button
                            disabled={true}
                            className={`px-4 py-2 text-sm font-semibold text-white bg-gray-300 rounded-xl md:hidden ${
                                isReady && !loading ? 'hidden' : 'block flex gap-1 items-center'
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
}

// Create Receipt Modal
function CreateReceiptModal({ isOpen, onClose, parts, retailProducts, onCreated, currentUser, suppliers }: CreateReceiptModalProps) {
    const [search, setSearch] = useState('');
    const [items, setItems] = useState<ImportReceiptItem[]>([]);
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [receiptType, setReceiptType] = useState<'component' | 'retail'>('component');
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
                const proposedCat = receiptType === 'retail' ? 'product' : 'component';
                const proposedCatIds = receiptType === 'retail' ? ['san-pham'] : ['component'];
                const newRef = await addDoc(collection(db, 'products'), {
                    name: exactName,
                    category: proposedCat,
                    categoryIds: proposedCatIds,
                    status: 'active',
                    isProposed: true,
                    stock: 0,
                    held: 0,
                    sold: 0,
                    price_original: 0,
                    costPrice: 0,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                newId = newRef.id;
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
            await addDoc(collection(db, 'import_receipts'), {
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
                    {/* Receipt Type Toggle */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Loại phiếu nhập</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => { setReceiptType('component'); setItems([]); setSearch(''); }}
                                className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all ${
                                    receiptType === 'component'
                                        ? 'bg-orange-50 border-orange-300 text-orange-700 shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                🔧 Linh kiện
                            </button>
                            <button
                                type="button"
                                onClick={() => { setReceiptType('retail'); setItems([]); setSearch(''); }}
                                className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all ${
                                    receiptType === 'retail'
                                        ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                📦 Sản phẩm bán lẻ
                            </button>
                        </div>
                    </div>

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
                                                        className="w-full h-8 text-center border rounded" min={1}
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <CurrencyInput 
                                                        value={item.importPrice} onChange={(v) => updateItem(idx, 'importPrice', v)}
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
                                                                .filter(s => s.name.toLowerCase().includes((itemSupplierSearch || '').toLowerCase()))
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
                                                                            const ref = await addDoc(collection(db, 'suppliers'), { name: nm, totalDebt: 0, isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
                                                                            const newItems = [...items];
                                                                            newItems[idx] = { ...newItems[idx], supplier: nm, supplierId: ref.id };
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
                                                    <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 pt-1"><Trash2 size={16} /></button>
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
