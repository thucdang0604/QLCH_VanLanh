'use client';

import { useEffect, useMemo, useState } from 'react';
import { orderBy, doc, serverTimestamp, type QueryConstraint, where } from 'firebase/firestore';
import { onSnapshot } from '@/lib/firestoreLogger';
import {
    Archive,
    ChevronLeft,
    ChevronRight,
    Edit,
    Loader2,
    Plus,
    QrCode,
    RefreshCw,
    Search,
    Wrench,
} from 'lucide-react';

import LotTrackingModal from '@/components/admin/LotTrackingModal';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import Modal from '@/components/admin/Modal';
import ProductQrLabelModal from '@/components/admin/ProductQrLabelModal';
import UniversalProductModal, { type WarrantyPolicyOption } from '@/components/admin/UniversalProductModal';
import ExportImportReportButton from '@/components/admin/ExportImportReportButton';
import { PART_CATEGORY_LABEL, PART_CATEGORY_VALUES } from '@/lib/constants';
import { generateSlug, getSearchKeywordQuery } from '@/lib/utils';
import { db } from '@/lib/firebase';
import type { Product } from '@/lib/types';
import { updateDocument } from '@/lib/useFirestore';
import { useFirestorePaginated } from '@/lib/firestoreQueryHelper';
import { PAGE_SIZE_OPTIONS, type PageSize } from '@/lib/useClientPagination';
import { buildArchiveUpdate, getArchiveBlockReason, isProductArchived } from '@/lib/productLifecycle';
import { formatReceiptPrice } from '@/features/parts/importReceiptUtils';
import { toastError } from '@/lib/toast';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { buildPartCatalogQueryPlan } from '@/lib/partCatalogQuery';
import { normalizeWarrantyRuleKey } from '@/lib/repairWarrantyRules';

const getPartHeld = (part: Product) => Math.max(0, Number(part.held) || 0);
const getPartAvailable = (part: Product) => Math.max(0, (Number(part.stock) || 0) - getPartHeld(part));

export default function PartsPage() {
    const { user } = useAuth();
    const { config, loading: configLoading } = useConfig();
    const isAdmin = user?.role === 'admin';
    const [searchInput, setSearchInput] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPart, setEditingPart] = useState<Product | null>(null);
    const [qrPart, setQrPart] = useState<(Product & { id: string }) | null>(null);
    const [isLotTrackingOpen, setIsLotTrackingOpen] = useState(false);
    const [partTypeOptions, setPartTypeOptions] = useState<string[]>([]);
    const [warrantyPolicies, setWarrantyPolicies] = useState<WarrantyPolicyOption[]>([]);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        dangerous?: boolean;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const componentRootIds = useMemo(
        () => (config.taxonomy?.component || []).map(node => node.id),
        [config.taxonomy?.component],
    );

    const queryPlan = useMemo(
        () => buildPartCatalogQueryPlan({
            componentRootIds,
            selectedCategoryIds: filterCategoryIds,
            searchQuery: appliedSearch,
        }),
        [appliedSearch, componentRootIds, filterCategoryIds],
    );

    const whereConstraints = useMemo<QueryConstraint[]>(() => {
        const constraints: QueryConstraint[] = [];
        constraints.push(where('category', 'in', PART_CATEGORY_VALUES));

        const categoryId = filterCategoryIds.at(-1) || '';
        const trimmedSearch = appliedSearch.trim();
        const searchToken = trimmedSearch.length >= 2 ? getSearchKeywordQuery(trimmedSearch) : '';

        if (searchToken) {
            constraints.push(where('searchKeywords', 'array-contains', searchToken));
        } else if (categoryId) {
            constraints.push(where('categoryIds', 'array-contains', categoryId));
        }

        return constraints;
    }, [appliedSearch, filterCategoryIds]);

    const orderByConstraints = useMemo(() => [orderBy('createdAt', 'desc')], []);
    const queryKey = JSON.stringify({
        categoryId: filterCategoryIds.at(-1) || '',
        searchToken: appliedSearch.trim().length >= 2 ? getSearchKeywordQuery(appliedSearch) : '',
    });

    const {
        data: parts,
        loading,
        loadingMore,
        hasMore,
        currentPage,
        pageSize,
        nextPage,
        prevPage,
        setPageSize,
        refresh,
    } = useFirestorePaginated<Product>('products', {
        enabled: !configLoading,
        queryKey,
        whereConstraints,
        orderByConstraints,
        pageSize: 20,
        includeTotalCount: false,
    });

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'system_config', 'repairs'), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const rules = Array.isArray(data.warrantyRules) ? data.warrantyRules : [];
            setPartTypeOptions(rules.map((rule: { partType?: string }) => rule.partType).filter((value): value is string => Boolean(value)));
            setWarrantyPolicies(rules.flatMap((rule: { id?: unknown; partType?: unknown; warrantyMonths?: unknown }) => {
                const label = typeof rule.partType === 'string' ? rule.partType.trim() : '';
                if (!label) return [];
                const id = typeof rule.id === 'string' && rule.id.trim()
                    ? rule.id.trim()
                    : normalizeWarrantyRuleKey(label);
                return [{ id, label, months: Math.max(0, Number(rule.warrantyMonths) || 0) }];
            }));
        });
        return () => unsub();
    }, []);

    const getPartModel = (part: Product & { id: string }) => (part as Product & { model?: string }).model || '';
    const visibleParts = useMemo(
        () => parts.filter(part => {
            if (isProductArchived(part) || part.isProposed) return false;
            const categoryId = filterCategoryIds.at(-1) || '';
            if (categoryId && (!part.categoryIds || !part.categoryIds.includes(categoryId))) {
                return false;
            }
            const trimmedSearch = appliedSearch.trim();
            if (trimmedSearch.length > 0) {
                const tokens = generateSlug(trimmedSearch).split('-').filter(Boolean);
                if (tokens.length > 0) {
                    const searchTxt = generateSlug(
                        `${part.name || ''} ${part.id || ''} ${part.productCode || ''} ${part.sku || ''} ${part.barcode || ''} ${(part as Product & { partType?: string; model?: string }).partType || ''} ${(part as Product & { partType?: string; model?: string }).model || ''} ${Array.isArray((part as Product & { compatibleModels?: string[] }).compatibleModels) ? (part as Product & { compatibleModels?: string[] }).compatibleModels?.join(' ') : ''}`
                    );
                    if (!tokens.every(t => searchTxt.includes(t))) return false;
                }
            }
            return true;
        }),
        [appliedSearch, filterCategoryIds, parts],
    );

    const queryPlanMessage = queryPlan.state === 'blocked'
        ? queryPlan.reason === 'too_many_component_roots'
            ? 'Taxonomy linh kiện có quá 30 danh mục gốc; cần chuẩn hoá phạm vi truy vấn trước khi tải danh sách.'
            : queryPlan.reason === 'invalid_component_selection'
                ? 'Danh mục đã chọn không thuộc taxonomy linh kiện hiện tại.'
                : 'Chưa có taxonomy linh kiện để tải danh sách.'
        : '';

    const handleArchive = (part: Product) => {
        if (!isAdmin) return;
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

    if (loading || configLoading) {
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
                    <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Wrench className="text-orange-500" /> Kho linh kiện
                    </h1>
                    <p className="text-gray-500">Danh sách linh kiện theo taxonomy</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <ExportImportReportButton />
                    <button
                        onClick={() => setIsLotTrackingOpen(true)}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 text-xs rounded-lg font-medium hover:bg-indigo-100 transition-colors shadow-sm"
                    >
                        <Search size={14} />
                        Tra ma lo
                    </button>
                    <button
                        onClick={refresh}
                        disabled={loadingMore || queryPlan.state !== 'ready'}
                        className="flex items-center gap-2 border border-gray-200 bg-white text-gray-700 px-3 py-1.5 text-xs rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                        <RefreshCw size={14} className={loadingMore ? 'animate-spin' : ''} />
                        Làm mới
                    </button>
                    {isAdmin && (
                        <>
                            <button
                                onClick={() => {
                                    setEditingPart(null);
                                    setIsModalOpen(true);
                                }}
                                className="flex items-center gap-2 bg-orange-500 text-white px-3 py-1.5 text-xs rounded-lg font-medium hover:bg-orange-600 transition-colors shadow-sm"
                            >
                                <Plus size={18} />
                                Thêm linh kiện
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <form
                    className="flex flex-1 max-w-md gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setAppliedSearch(searchInput.trim());
                    }}
                >
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm tên hoặc mã linh kiện (từ 2 ký tự)..."
                            value={searchInput}
                            onChange={(event) => setSearchInput(event.target.value)}
                            className="w-full h-8 text-sm pl-8 pr-3 border rounded-lg focus:border-orange-500 focus:outline-none"
                        />
                    </div>
                    <button
                        type="submit"
                        className="h-8 rounded-lg bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-600"
                    >
                        Tìm
                    </button>
                </form>
                <CategoryTaxonomySelector
                    type="component"
                    value={filterCategoryIds}
                    onChange={(ids) => setFilterCategoryIds(ids)}
                    compact
                    disabled={configLoading}
                />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {queryPlanMessage ? (
                    <div className="py-16 px-6 text-center text-amber-700 bg-amber-50">
                        <p>{queryPlanMessage}</p>
                    </div>
                ) : parts.length === 0 ? (
                    <div className="py-16 text-center text-gray-400">
                        <Wrench size={48} className="mx-auto mb-3 opacity-40" />
                        <p>Không có linh kiện phù hợp.</p>
                    </div>
                ) : (
                    <>
                        {visibleParts.length === 0 && (
                            <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                Trang này chỉ có linh kiện đã lưu trữ hoặc đang đề xuất; chúng không hiển thị trong kho đang hoạt động. Bạn vẫn có thể chuyển trang để tiếp tục tìm kiếm.
                            </div>
                        )}
                        <div className="lg:hidden divide-y divide-gray-100">
                            {visibleParts.map(part => {
                                const held = getPartHeld(part);
                                const available = getPartAvailable(part);
                                return (
                                    <div key={part.id} className="p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold text-gray-900">{part.name}</p>
                                                <p className="text-xs text-gray-500">{getPartModel(part) || PART_CATEGORY_LABEL} {part.partType ? `- ${part.partType}` : ''}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 text-[11px] font-semibold">
                                                <span className={available > 0 ? 'text-emerald-700' : 'text-red-600'}>Khả dụng: {available}</span>
                                                <span className="text-gray-500">Tồn: {Number(part.stock) || 0} · Giữ: <span className="text-violet-700">{held}</span></span>
                                            </div>
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
                                            <button onClick={() => setQrPart(part as Product & { id: string })} className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium text-gray-700 active:scale-95 transition-all">
                                                QR
                                            </button>
                                            <button onClick={() => { setEditingPart(part); setIsModalOpen(true); }} className="flex-1 rounded-lg bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 active:scale-95 transition-all">
                                                Sửa
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="hidden lg:block overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3">Linh kiện</th>
                                        <th className="px-4 py-3">Phân loại</th>
                                        <th className="px-4 py-3 text-center">Tồn</th>
                                        <th className="px-4 py-3 text-center">Tạm giữ</th>
                                        <th className="px-4 py-3 text-center">Khả dụng</th>
                                        <th className="px-4 py-3 text-right">Giá vốn</th>
                                        <th className="px-4 py-3 text-right">Giá bán</th>
                                        <th className="px-4 py-3 text-center">Đã dùng</th>
                                        <th className="px-4 py-3 text-right">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {visibleParts.map(part => {
                                        const held = getPartHeld(part);
                                        const available = getPartAvailable(part);
                                        return (
                                            <tr key={part.id} className="hover:bg-gray-50 transition-colors duration-200">
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
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-violet-700">{held}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`text-sm font-bold ${available > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{available}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm">{formatReceiptPrice(part.costPrice || 0)}</td>
                                                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{formatReceiptPrice(part.price_promo || part.price_original || 0)}</td>
                                                <td className="px-4 py-3 text-center text-sm">{Number(part.sold) || 0}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button onClick={() => setQrPart(part as Product & { id: string })} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all active:scale-95" title="In QR">
                                                            <QrCode size={16} />
                                                        </button>
                                                        <button onClick={() => { setEditingPart(part); setIsModalOpen(true); }} className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all active:scale-95" title="Sửa">
                                                            <Edit size={16} />
                                                        </button>
                                                        {isAdmin && (
                                                            <button onClick={() => handleArchive(part)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all active:scale-95" title="Lưu trữ">
                                                                <Archive size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-gray-50 rounded-b-xl">
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                                <span>Trang {currentPage} · {visibleParts.length} linh kiện đang hiển thị</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-400">Hiện:</span>
                                    <select
                                        title="Số linh kiện mỗi trang"
                                        value={pageSize}
                                        onChange={event => setPageSize(Number(event.target.value) as PageSize)}
                                        className="h-8 px-2 border rounded-lg text-sm focus:border-orange-500 focus:outline-none bg-white"
                                        aria-label="Số linh kiện mỗi trang"
                                    >
                                        {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    title="Trang trước"
                                    onClick={prevPage}
                                    disabled={currentPage === 1 || loading || loadingMore}
                                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <ChevronLeft size={16} /> Trước
                                </button>
                                <button
                                    title="Trang tiếp"
                                    onClick={nextPage}
                                    disabled={!hasMore || loading || loadingMore}
                                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    Tiếp <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <UniversalProductModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingPart(null); }}
                mode="component"
                initialData={editingPart as unknown as (Product & { id: string }) | null}
                onCreated={() => { setIsModalOpen(false); refresh(); }}
                onUpdated={() => { setIsModalOpen(false); refresh(); }}
                partTypeOptions={partTypeOptions}
                warrantyPolicies={warrantyPolicies}
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
                            className="px-3 py-1.5 text-xs text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                        >
                            Huy
                        </button>
                        <button
                            onClick={async () => {
                                await confirmModal.onConfirm();
                                setConfirmModal(prev => ({ ...prev, isOpen: false }));
                            }}
                            className={`px-3 py-1.5 text-xs text-sm font-semibold text-white rounded-lg ${confirmModal.dangerous ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                        >
                            {confirmModal.confirmText || 'Xac nhan'}
                        </button>
                    </div>
                </div>
            </Modal>

            {qrPart && <ProductQrLabelModal product={qrPart} onClose={() => setQrPart(null)} />}
            <LotTrackingModal isOpen={isLotTrackingOpen} onClose={() => setIsLotTrackingOpen(false)} />
        </div>
    );
}
