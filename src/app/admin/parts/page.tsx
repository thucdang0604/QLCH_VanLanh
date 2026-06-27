'use client';

import { useEffect, useMemo, useState } from 'react';
import { orderBy, doc, serverTimestamp } from 'firebase/firestore';
import { onSnapshot } from '@/lib/firestoreLogger';
import {
    AlertTriangle,
    Archive,
    Edit,
    Loader2,
    Plus,
    QrCode,
    Search,
    Wrench,
} from 'lucide-react';

import FixHiddenProductsModal from '@/components/admin/FixHiddenProductsModal';
import LotTrackingModal from '@/components/admin/LotTrackingModal';
import Modal from '@/components/admin/Modal';
import PaginationBar from '@/components/admin/PaginationBar';
import ProductQrLabelModal from '@/components/admin/ProductQrLabelModal';
import UniversalProductModal from '@/components/admin/UniversalProductModal';
import ExportImportReportButton from '@/components/admin/ExportImportReportButton';
import { PART_CATEGORY_LABEL, isPartCategory } from '@/lib/constants';
import { db } from '@/lib/firebase';
import type { Product } from '@/lib/types';
import { useClientPagination } from '@/lib/useClientPagination';
import { useFirestoreCollection, updateDocument } from '@/lib/useFirestore';
import { buildArchiveUpdate, getArchiveBlockReason, isProductArchived } from '@/lib/productLifecycle';
import { formatReceiptPrice } from '@/features/parts/importReceiptUtils';
import { toastError } from '@/lib/toast';

type StatusFilter = 'all' | 'out_of_stock' | 'bestseller';

export default function PartsPage() {
    const { data: products, loading } = useFirestoreCollection<Product>('products', [orderBy('createdAt', 'desc')]);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPart, setEditingPart] = useState<Product | null>(null);
    const [qrPart, setQrPart] = useState<(Product & { id: string }) | null>(null);
    const [showFixHidden, setShowFixHidden] = useState(false);
    const [isLotTrackingOpen, setIsLotTrackingOpen] = useState(false);
    const [partTypeOptions, setPartTypeOptions] = useState<string[]>([]);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        dangerous?: boolean;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'system_config', 'repairs'), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const rules = Array.isArray(data.warrantyRules) ? data.warrantyRules : [];
            setPartTypeOptions(rules.map((rule: { partType?: string }) => rule.partType).filter((value): value is string => Boolean(value)));
        });
        return () => unsub();
    }, []);

    const parts = useMemo(() => products.filter(product => isPartCategory(product.category, product.categoryIds)), [products]);
    const getPartModel = (part: Product & { id: string }) => (part as Product & { model?: string }).model || '';

    const filteredParts = useMemo(() => {
        const queryText = searchQuery.trim().toLowerCase();
        return parts
            .filter(part => {
                if (isProductArchived(part) || part.isProposed) return false;
                const matchesSearch = !queryText
                    || part.name.toLowerCase().includes(queryText)
                    || part.description?.toLowerCase().includes(queryText)
                    || getPartModel(part).toLowerCase().includes(queryText)
                    || part.partType?.toLowerCase().includes(queryText);

                if (!matchesSearch) return false;
                if (statusFilter === 'out_of_stock') return Number(part.stock) <= 0;
                if (statusFilter === 'bestseller') return Number(part.sold || 0) > 0;
                return true;
            })
            .sort((a, b) => {
                if (statusFilter === 'bestseller') return Number(b.sold || 0) - Number(a.sold || 0);
                return 0;
            });
    }, [parts, searchQuery, statusFilter]);

    const {
        paginatedData: paginatedParts,
        currentPage,
        totalPages,
        pageSize,
        totalFiltered,
        setPage,
        setPageSize,
        resetPage,
    } = useClientPagination(filteredParts, 20);

    useEffect(() => {
        resetPage();
    }, [resetPage, searchQuery, statusFilter]);

    const handleArchive = (part: Product) => {
        const blockReason = getArchiveBlockReason(part);
        if (blockReason) {
            toastError(`Khong the luu tru "${part.name}" vi ${blockReason}.`);
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
                    toastError('Lỗi khi lưu trữ linh kiện.');
                }
            },
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={32} className="animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Wrench className="text-orange-500" /> Kho linh kiện
                    </h1>
                    <p className="text-gray-500">{parts.length} linh kiện trong hệ thống</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <ExportImportReportButton />
                    <button
                        onClick={() => setIsLotTrackingOpen(true)}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-lg font-medium hover:bg-indigo-100 transition-colors shadow-sm"
                    >
                        <Search size={18} />
                        Tra ma lo
                    </button>
                    <button
                        onClick={() => setShowFixHidden(true)}
                        className="flex items-center gap-2 border-2 border-amber-300 text-amber-700 px-4 py-2.5 rounded-lg font-medium hover:bg-amber-50 transition-colors text-sm"
                    >
                        <AlertTriangle size={18} />
                        Khoi phuc an
                    </button>
                    <button
                        onClick={() => {
                            setEditingPart(null);
                            setIsModalOpen(true);
                        }}
                        className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        <Plus size={18} />
                        Thêm linh kiện
                    </button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Tìm tên, dòng máy, loại linh kiện..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
                    {([
                        ['all', 'Tat ca'],
                        ['out_of_stock', 'Het hang'],
                        ['bestseller', 'Dung nhieu'],
                    ] as const).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setStatusFilter(key)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${statusFilter === key
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-white text-gray-600 border hover:bg-gray-50'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {paginatedParts.length === 0 ? (
                    <div className="py-16 text-center text-gray-400">
                        <Wrench size={48} className="mx-auto mb-3 opacity-40" />
                        <p>Không có linh kiện phù hợp.</p>
                    </div>
                ) : (
                    <>
                        <div className="md:hidden divide-y divide-gray-100">
                            {paginatedParts.map(part => (
                                <div key={part.id} className="p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-gray-900">{part.name}</p>
                                            <p className="text-xs text-gray-500">{getPartModel(part) || PART_CATEGORY_LABEL} {part.partType ? `- ${part.partType}` : ''}</p>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${Number(part.stock) > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                            Tồn: {Number(part.stock) || 0}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                                        <div>
                                            <p className="text-gray-400">Giá bán</p>
                                            <p className="font-semibold text-gray-900">{formatReceiptPrice(part.price_promo || part.price_original || 0)}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-400">Giá vốn</p>
                                            <p className="font-semibold text-gray-900">{formatReceiptPrice(part.costPrice || 0)}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setQrPart(part as Product & { id: string })} className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium text-gray-700">
                                            QR
                                        </button>
                                        <button onClick={() => { setEditingPart(part); setIsModalOpen(true); }} className="flex-1 rounded-lg bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700">
                                            Sửa
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full min-w-[900px]">
                                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">Linh kiện</th>
                                        <th className="px-4 py-3">Phân loại</th>
                                        <th className="px-4 py-3 text-center">Tồn</th>
                                        <th className="px-4 py-3 text-right">Giá vốn</th>
                                        <th className="px-4 py-3 text-right">Giá bán</th>
                                        <th className="px-4 py-3 text-center">Đã dùng</th>
                                        <th className="px-4 py-3 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paginatedParts.map(part => (
                                        <tr key={part.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-gray-900">{part.name}</p>
                                                <p className="text-xs text-gray-500">{part.description || part.sku || part.id}</p>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                <p>{getPartModel(part) || '-'}</p>
                                                <p className="text-xs text-gray-400">{part.partType || PART_CATEGORY_LABEL}</p>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${Number(part.stock) > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                                                    {Number(part.stock) || 0}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-sm">{formatReceiptPrice(part.costPrice || 0)}</td>
                                            <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatReceiptPrice(part.price_promo || part.price_original || 0)}</td>
                                            <td className="px-4 py-3 text-center text-sm">{Number(part.sold) || 0}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => setQrPart(part as Product & { id: string })} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="In QR">
                                                        <QrCode size={16} />
                                                    </button>
                                                    <button onClick={() => { setEditingPart(part); setIsModalOpen(true); }} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg" title="Sửa">
                                                        <Edit size={16} />
                                                    </button>
                                                    <button onClick={() => handleArchive(part)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Lưu trữ">
                                                        <Archive size={16} />
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
                            totalAll={filteredParts.length}
                            onPageChange={setPage}
                            onPageSizeChange={setPageSize}
                            entityLabel="linh kiện"
                        />
                    </>
                )}
            </div>

            <UniversalProductModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingPart(null); }}
                mode="component"
                initialData={editingPart as unknown as (Product & { id: string }) | null}
                onCreated={() => setIsModalOpen(false)}
                onUpdated={() => setIsModalOpen(false)}
                partTypeOptions={partTypeOptions}
            />

            <Modal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                title={confirmModal.title}
                size="sm"
            >
                <div className="p-6 space-y-5">
                    <p className="text-sm text-gray-600 leading-relaxed">{confirmModal.message}</p>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                        >
                            Huy
                        </button>
                        <button
                            onClick={async () => {
                                await confirmModal.onConfirm();
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                            }}
                            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg ${confirmModal.dangerous ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                        >
                            {confirmModal.confirmText || 'Xac nhan'}
                        </button>
                    </div>
                </div>
            </Modal>

            {qrPart && <ProductQrLabelModal product={qrPart} onClose={() => setQrPart(null)} />}
            <FixHiddenProductsModal isOpen={showFixHidden} onClose={() => setShowFixHidden(false)} products={products} />
            <LotTrackingModal isOpen={isLotTrackingOpen} onClose={() => setIsLotTrackingOpen(false)} />
        </div>
    );
}
