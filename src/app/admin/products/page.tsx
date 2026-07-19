'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import firebaseImageLoader from '@/lib/imageLoader';
import { useRouter } from 'next/navigation';
import { Archive, Plus, Search, Edit, Package, Loader2, QrCode, PackagePlus } from 'lucide-react';
import { updateDocument } from '@/lib/useFirestore';
import { useFirestorePaginated } from '@/lib/firestoreQueryHelper';
import { buildCategorySearchKeywords, generateSearchKeywords, getSearchKeywordQuery, getCategoryPath, collectAllNodeIds } from '@/lib/utils';
import { getCatalogCategoryKey, getCatalogCategoryStatus } from '@/lib/catalogCategory';

import { collection, limit, orderBy, serverTimestamp, query, QuerySnapshot, QueryDocumentSnapshot, DocumentData, where, QueryConstraint } from 'firebase/firestore';
import { getDocs } from '@/lib/firestoreLogger';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import PaginationBar from '@/components/admin/PaginationBar';
import UniversalProductModal from '@/components/admin/UniversalProductModal';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import ProductQrLabelModal from '@/components/admin/ProductQrLabelModal';
import Modal from '@/components/admin/Modal';

import { CreateReceiptModal } from '@/features/parts/ImportReceiptModals';
import type { SupplierOption } from '@/features/parts/importReceiptTypes';
import type { Product } from '@/lib/types';
import { useConfig } from '@/lib/ConfigContext';
import { isPartCategory } from '@/lib/constants';
import { productCodeSearchText } from '@/lib/productCodes';
import { buildArchiveUpdate, getArchiveBlockReason } from '@/lib/productLifecycle';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { triggerRevalidate } from '@/lib/revalidate';
import { appConfirm } from '@/lib/appDialog';

// Product is now imported from @/lib/types

const CONDITIONS: { value: Product['condition'] | ''; label: string; color: string }[] = [
    { value: '', label: 'Tất cả tình trạng', color: '' },
    { value: 'new', label: 'Mới 100%', color: 'bg-green-100 text-green-700' },
    { value: 'like-new', label: 'Cũ 99%', color: 'bg-blue-100 text-blue-700' },
    { value: 'used', label: 'Hàng cũ | TBH', color: 'bg-yellow-100 text-yellow-700' },
];

export default function ProductsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const router = useRouter();
    const { config, loading: configLoading } = useConfig();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
    const [filterCondition, setFilterCondition] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [qrProduct, setQrProduct] = useState<(Product & { id: string }) | null>(null);
    const [showReassign, setShowReassign] = useState(false);
    const [reassignFrom, setReassignFrom] = useState('');
    const [reassignTo, setReassignTo] = useState('');
    const [reassignToIds, setReassignToIds] = useState<string[]>([]);
    const [isReassigning, setIsReassigning] = useState(false);
    const [reassignProgress, setReassignProgress] = useState<{ current: number; total: number } | null>(null);
    const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
    const [categoryAuditLoading, setCategoryAuditLoading] = useState(false);
    const [categoryAuditLoaded, setCategoryAuditLoaded] = useState(false);

    const [isCreateReceiptOpen, setIsCreateReceiptOpen] = useState(false);
    const [supplierList, setSupplierList] = useState<SupplierOption[]>([]);
    const [retailProducts, setRetailProducts] = useState<(Product & { id: string })[]>([]);

    const whereConstraints = useMemo(() => {
        const constraints: QueryConstraint[] = [];
        constraints.push(where('status', '==', 'active'));
        const categoryId = filterCategoryIds.at(-1) || '';
        const trimmedSearch = searchQuery.trim();
        const searchToken = trimmedSearch.length >= 2 ? getSearchKeywordQuery(trimmedSearch) : '';

        if (filterCondition) {
            constraints.push(where('condition', '==', filterCondition));
        }

        if (categoryId && searchToken) {
            constraints.push(where('searchCategoryKeywords', 'array-contains', `${categoryId}::${searchToken}`));
        } else if (categoryId) {
            constraints.push(where('categoryIds', 'array-contains', categoryId));
        } else if (searchToken) {
            constraints.push(where('searchKeywords', 'array-contains', searchToken));
        }

        return constraints;
    }, [filterCategoryIds, filterCondition, searchQuery]);

    const orderByConstraints = useMemo(() => {
        const hasSearch = getSearchKeywordQuery(searchQuery).length >= 2;
        const hasCategory = filterCategoryIds.length > 0;
        if (hasSearch || hasCategory || filterCondition) return [];
        return [orderBy('createdAt', 'desc')];
    }, [searchQuery, filterCategoryIds, filterCondition]);

    const {
        data: products,
        loading,
        totalCount,
        currentPage,
        totalPages,
        pageSize,
        goToPage,
        setPageSize,
        refresh
    } = useFirestorePaginated<Product>('products', {
        queryKey: JSON.stringify({
            categoryId: filterCategoryIds.at(-1) || '',
            condition: filterCondition,
            search: searchQuery.trim().length >= 2 ? getSearchKeywordQuery(searchQuery) : '',
            sort: orderByConstraints.length ? 'createdAt-desc' : 'none',
        }),
        whereConstraints,
        orderByConstraints,
        pageSize: 20
    });

    const setPage = goToPage;

    const refreshCategoryAudit = useCallback(async () => {
        setCategoryAuditLoading(true);
        try {
            const snapshot = await getDocs(query(collection(db, 'products'), where('status', '==', 'active')));
            setCatalogProducts(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Product)));
            setCategoryAuditLoaded(true);
        } catch (err) {
            console.error('Failed to audit product categories', err);
            toastError('Không thể kiểm tra danh mục sản phẩm. Vui lòng thử lại.');
        } finally {
            setCategoryAuditLoading(false);
        }
    }, []);

    useEffect(() => {
        getDocs(query(collection(db, 'suppliers'), limit(100))).then((snapshot: QuerySnapshot<DocumentData>) => {
            setSupplierList(snapshot.docs.map((docSnap: QueryDocumentSnapshot<DocumentData>) => ({ id: docSnap.id, ...docSnap.data() } as SupplierOption)));
        }).catch((err: Error) => console.error('Failed to load suppliers', err));
    }, []);

    useEffect(() => {
        if (!isCreateReceiptOpen) return;
        const q = query(
            collection(db, 'products'),
            where('status', '==', 'active'),
            limit(200)
        );
        getDocs(q).then((snapshot: QuerySnapshot<DocumentData>) => {
            const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Product & { id: string }));
            const filtered = list.filter(p => !isPartCategory(p.category, p.categoryIds));
            setRetailProducts(filtered);
        }).catch((err: Error) => console.error('Failed to load retail products for receipt', err));
    }, [isCreateReceiptOpen]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (new URLSearchParams(window.location.search).get('createImportProposal') === '1') {
            setIsCreateReceiptOpen(true);
        }
    }, []);

    const handleArchive = async (product: Product) => {
        if (!isAdmin) return;
        const blockReason = getArchiveBlockReason(product);
        if (blockReason) {
            toastError(`Không thể lưu trữ "${product.name}" vì ${blockReason}.`);
            return;
        }
        if (!await appConfirm(`Lưu trữ "${product.name}"? Sản phẩm sẽ ẩn khỏi bán lẻ/POS nhưng vẫn giữ lịch sử và mã hàng.`, { title: 'Lưu trữ sản phẩm', confirmText: 'Lưu trữ', destructive: true })) return;
        try {
            await updateDocument('products', product.id, buildArchiveUpdate(serverTimestamp()));
            refresh();
        } catch {
            toastError('Lỗi khi lưu trữ sản phẩm!');
        }
    };

    const filteredProducts = useMemo(() => {
        return products.filter((p) => {
            if (isPartCategory(p.category, p.categoryIds)) return false;
            const normalizedQuery = searchQuery.toLowerCase().trim();
            if (normalizedQuery.length > 0 && normalizedQuery.length < 2) {
                return p.name.toLowerCase().includes(normalizedQuery) || productCodeSearchText(p as Product & { id: string }).includes(normalizedQuery);
            }
            return true;
        });
    }, [products, searchQuery]);

    const retailTaxonomy = config?.taxonomy?.retail || [];
    const paginatedProducts = filteredProducts;
    const totalFiltered = totalCount;

    const validNodeIds = collectAllNodeIds(retailTaxonomy);

    const getOrphanStatus = (product: Product) => getCatalogCategoryStatus(product, validNodeIds);
    const orphanRetailProducts = catalogProducts.filter(product => (
        !isPartCategory(product.category, product.categoryIds) && getOrphanStatus(product) === 'orphan'
    ));
    const missingCategoryCount = orphanRetailProducts.length;
    const missingCategories = Array.from(new Set(
        orphanRetailProducts.map(getCatalogCategoryKey).filter(Boolean)
    ));
    const reassignTargets = reassignFrom
        ? orphanRetailProducts.filter(product => getCatalogCategoryKey(product) === reassignFrom)
        : [];

    const resetReassignState = () => {
        setReassignFrom('');
        setReassignTo('');
        setReassignToIds([]);
        setReassignProgress(null);
    };

    const openReassignModal = (categoryKey: string) => {
        if (!isAdmin) return;
        resetReassignState();
        setReassignFrom(categoryKey);
        setShowReassign(true);
    };

    const closeReassignModal = () => {
        if (isReassigning) return;
        setShowReassign(false);
        resetReassignState();
    };

    const handleBatchReassign = async () => {
        if (!isAdmin) return;
        if (!reassignFrom || !reassignTo || reassignToIds.length === 0) return;
        if (reassignTargets.length === 0) {
            toastWarning('Không còn sản phẩm thuộc danh mục bị mất này. Danh sách có thể vừa được cập nhật.');
            closeReassignModal();
            return;
        }

        setIsReassigning(true);
        try {
            setReassignProgress({ current: 0, total: reassignTargets.length });

            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < reassignTargets.length; i++) {
                const product = reassignTargets[i];
                const searchKeywords = product.searchKeywords?.length
                    ? product.searchKeywords
                    : generateSearchKeywords(product.name);

                try {
                    await updateDocument('products', product.id, {
                        category: reassignTo,
                        categoryIds: reassignToIds,
                        searchCategoryKeywords: buildCategorySearchKeywords(reassignToIds, searchKeywords),
                    });
                    successCount++;
                } catch (err) {
                    console.error(`Error updating product ${product.id}:`, err);
                    errorCount++;
                }
                setReassignProgress({ current: i + 1, total: reassignTargets.length });
            }

            if (successCount > 0) {
                await triggerRevalidate(['/', '/flash-sale', '/search', '/sitemap.xml'], ['products']);
                refresh();
                await refreshCategoryAudit();
            }

            if (errorCount > 0) {
                toastWarning(`Hoàn tất gán lại ${successCount}/${reassignTargets.length} sản phẩm (${errorCount} lỗi)`);
            } else {
                toastSuccess(`Đã gán lại thành công ${successCount} sản phẩm từ "${reassignFrom}" sang "${reassignTo}"`);
            }

            setShowReassign(false);
            resetReassignState();
        } catch {
            toastError('Lỗi khi gán lại danh mục!');
        } finally {
            setIsReassigning(false);
        }
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-lg font-bold text-gray-900">Quản lý sản phẩm</h1>
                    <p className="text-gray-500">{totalCount} sản phẩm</p>
                </div>
                <div className="flex gap-2">
                    {isAdmin && (
                        <button
                            onClick={() => { void refreshCategoryAudit(); }}
                            disabled={categoryAuditLoading}
                            className="flex items-center gap-1.5 border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-60"
                        >
                            {categoryAuditLoading && <Loader2 size={15} className="animate-spin" />}
                            Kiểm tra danh mục
                        </button>
                    )}
                    <button
                        onClick={() => setIsCreateReceiptOpen(true)}
                        className="flex items-center gap-1.5 bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-600 active:scale-95 transition-all text-xs"
                    >
                        <PackagePlus size={15} />
                        Tạo đề xuất nhập
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
                            className="flex items-center gap-1.5 bg-orange-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-orange-600 active:scale-95 transition-all text-xs"
                        >
                            <Plus size={15} />
                            Thêm sản phẩm
                        </button>
                    )}
                </div>
            </div>

            {isAdmin && categoryAuditLoaded && !categoryAuditLoading && !configLoading && missingCategories.length > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex flex-col sm:flex-row items-start justify-between gap-3">
                    <div>
                        <p className="font-medium flex items-center gap-2">
                            Có {missingCategoryCount} sản phẩm đang bị mất danh mục!
                        </p>
                        <p className="text-sm mt-1 text-red-600">
                            Các danh mục không tồn tại: {missingCategories.join(', ')}.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {missingCategories.map(categoryKey => (
                            <button
                                key={categoryKey}
                                onClick={() => openReassignModal(categoryKey)}
                                className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-md transition-colors"
                            >
                                Gán lại &quot;{categoryKey}&quot;
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col gap-2">
                <div className="flex flex-col md:flex-row gap-2">
                    <div className="relative flex-1">
                        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm sản phẩm..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-8 text-sm pl-6 pr-2 text-sm border rounded-lg focus:border-orange-500 focus:outline-none"
                        />
                    </div>

                    <select
                        value={filterCondition}
                        onChange={(e) => setFilterCondition(e.target.value)}
                        title="Lọc theo tình trạng"
                        aria-label="Lọc theo tình trạng"
                        className="h-8 px-2 text-sm border rounded-lg focus:border-orange-500 focus:outline-none"
                    >
                        {CONDITIONS.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                    </select>
                </div>
                {/* Modern Taxonomy Filter */}
                <CategoryTaxonomySelector
                    type="retail"
                    value={filterCategoryIds}
                    onChange={(ids) => setFilterCategoryIds(ids)}
                    compact
                />
            </div>

            {/* Products Table (Desktop) + Card List (Mobile) */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 size={32} className="animate-spin text-orange-500" />
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-20">
                        <Package size={48} className="mx-auto text-gray-300 mb-4" />
                        <p className="text-gray-500">Chưa có sản phẩm nào</p>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table */}
                        <div className="hidden lg:block overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Sản phẩm</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Danh mục</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Phân loại</th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Giá & Tồn</th>
                                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Hành động</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {paginatedProducts.map((product) => (
                                        <tr key={product.id} className="hover:bg-gray-50 transition-colors duration-200">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                                                        {product.imageUrl ? (
                                                            <Image
                                                                src={product.imageUrl}
                                                                alt={product.name}
                                                                fill
                                                                loader={firebaseImageLoader}
                                                                sizes="40px"
                                                                className="object-cover"
                                                            />
                                                        ) : (
                                                            <Package size={20} className="absolute inset-0 m-auto text-gray-400" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 max-w-[200px] xl:max-w-[300px]">
                                                        <p className="font-medium text-gray-900 line-clamp-1">{product.name}</p>
                                                        <p className="text-xs text-gray-500 truncate">{product.brand}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm truncate max-w-[150px]">
                                                {(() => {
                                                    const status = getOrphanStatus(product);
                                                    const deepestId = product.categoryIds?.[product.categoryIds.length - 1];
                                                    const path = deepestId ? getCategoryPath(deepestId, retailTaxonomy) : null;
                                                    if (status === 'orphan') return <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">⚠ {deepestId || product.category}</span>;
                                                    if (status === 'unassigned') return <span className="text-xs text-yellow-600">Chưa gán</span>;
                                                    return <span className="text-gray-600" title={path || product.category}>{path || product.category}</span>;
                                                })()}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1.5 items-start">
                                                    {/* Status */}
                                                    <span className={`px-2 py-0.5 text-[11px] font-medium rounded-md whitespace-nowrap ${product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                                        }`}>
                                                        {product.status === 'active' ? 'Đang bán' : 'Tạm ẩn'}
                                                    </span>
                                                    {/* Condition */}
                                                    {(() => {
                                                        const cond = CONDITIONS.find(c => c.value === product.condition);
                                                        return cond?.value ? (
                                                            <span className={`px-2 py-0.5 text-[11px] font-medium rounded-md ${cond.color}`}>
                                                                {cond.label}
                                                            </span>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1">
                                                    {product.price_promo ? (
                                                        <div>
                                                            <p className="text-sm font-bold text-red-600">{formatPrice(product.price_promo)}</p>
                                                            <p className="text-xs text-gray-400 line-through">{formatPrice(product.price_original)}</p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm font-medium text-gray-900">{formatPrice(product.price_original)}</p>
                                                    )}
                                                    {/* Stock */}
                                                    {(() => {
                                                        const available = (product.stock || 0) - ((product as { held?: number }).held || 0);
                                                        return (
                                                            <span className={`text-xs font-medium ${available > 10 ? 'text-green-600' : available > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                                Kho: {available}
                                                                {((product as { held?: number }).held || 0) > 0 && <span className="text-gray-400 ml-1">(giữ: {(product as { held?: number }).held})</span>}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => setQrProduct(product)}
                                                        className="p-2 hover:bg-orange-100 text-orange-600 rounded-lg transition-colors active:scale-90"
                                                        title="In tem QR / barcode"
                                                    >
                                                        <QrCode size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => { setEditingProduct(product); setIsModalOpen(true); }}
                                                        className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors active:scale-90"
                                                        title="Sửa sản phẩm"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => handleArchive(product)}
                                                            className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors active:scale-90"
                                                            title="Lưu trữ sản phẩm"
                                                        >
                                                            <Archive size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Card List */}
                        <div className="lg:hidden divide-y divide-gray-100 p-2 space-y-3">
                            {paginatedProducts.map((product) => (
                                <div key={product.id} className="p-3 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 flex gap-3">
                                    <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                                        {product.imageUrl ? (
                                            <Image
                                                src={product.imageUrl}
                                                alt={product.name}
                                                fill
                                                loader={firebaseImageLoader}
                                                sizes="64px"
                                                className="object-cover"
                                            />
                                        ) : (
                                            <Package size={24} className="absolute inset-0 m-auto text-gray-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 text-sm line-clamp-1">{product.name}</p>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                            <span className="text-xs text-gray-500">{product.brand}</span>
                                            <span className="text-gray-300">·</span>
                                            <span className="text-xs text-gray-500">
                                                {(() => {
                                                    const deepestId = product.categoryIds?.[product.categoryIds.length - 1];
                                                    const path = deepestId ? getCategoryPath(deepestId, retailTaxonomy) : null;
                                                    return path || product.category;
                                                })()}
                                            </span>
                                            {(() => {
                                                const cond = CONDITIONS.find(c => c.value === product.condition);
                                                return cond?.value ? (
                                                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${cond.color}`}>
                                                        {cond.label}
                                                    </span>
                                                ) : null;
                                            })()}
                                        </div>
                                        <div className="flex items-center justify-between mt-2">
                                            <div>
                                                {product.price_promo ? (
                                                    <div className="flex items-baseline gap-1.5">
                                                        <span className="text-sm font-bold text-red-600">{formatPrice(product.price_promo)}</span>
                                                        <span className="text-[10px] text-gray-400 line-through">{formatPrice(product.price_original)}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm font-bold text-gray-900">{formatPrice(product.price_original)}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {(() => {
                                                    const available = (product.stock || 0) - ((product as { held?: number }).held || 0);
                                                    return (
                                                        <span className={`text-xs font-bold ${available > 10 ? 'text-green-600' : available > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                            Kho: {available}{((product as { held?: number }).held || 0) > 0 ? ` (giữ: ${(product as { held?: number }).held})` : ''}
                                                        </span>
                                                    );
                                                })()}
                                                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap ${product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                    {product.status === 'active' ? 'Đang bán' : 'Ẩn'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-3">
                                            <button
                                                onClick={() => { setEditingProduct(product); setIsModalOpen(true); }}
                                                className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all active:scale-95"
                                            >
                                                <Edit size={14} />
                                                Sửa
                                            </button>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => handleArchive(product)}
                                                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all active:scale-95"
                                                >
                                                    <Archive size={14} />
                                                    Lưu trữ
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <PaginationBar
                            currentPage={currentPage}
                            totalPages={totalPages}
                            pageSize={pageSize as 20 | 50 | 100}
                            totalFiltered={totalFiltered}
                            onPageChange={setPage}
                            onPageSizeChange={setPageSize}
                            entityLabel="sản phẩm"
                        />
                    </>
                )}
            </div>

            {/* Modal */}
            <UniversalProductModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingProduct(null); }}
                mode="retail"
                initialData={editingProduct}
                onCreated={() => setIsModalOpen(false)}
                onUpdated={() => setIsModalOpen(false)}
            />
            <ProductQrLabelModal product={qrProduct} onClose={() => setQrProduct(null)} />

            <Modal isOpen={showReassign} onClose={closeReassignModal} title="Gán lại danh mục hàng loạt" size="md">
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-600">
                        Chọn danh mục mới cho <strong className="text-gray-900">{reassignTargets.length} sản phẩm</strong> đang thuộc danh mục <strong className="text-gray-900">&quot;{reassignFrom}&quot;</strong>.
                    </p>
                    <div>
                        <label className="block text-sm font-medium mb-1">Danh mục mới *</label>
                        <CategoryTaxonomySelector
                            type="retail"
                            value={reassignToIds}
                            onChange={(ids, categoryName) => {
                                setReassignTo(categoryName || '');
                                setReassignToIds(ids);
                            }}
                        />
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button onClick={closeReassignModal} disabled={isReassigning} className="flex-1 py-2.5 border rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50">Hủy</button>
                        <button
                            onClick={handleBatchReassign}
                            disabled={!reassignTo || reassignToIds.length === 0 || reassignTargets.length === 0 || isReassigning}
                            className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium disabled:opacity-50 flex justify-center items-center gap-2"
                        >
                            {isReassigning && <Loader2 size={16} className="animate-spin" />}
                            {isReassigning
                                ? (reassignProgress ? `Đang xử lý ${reassignProgress.current}/${reassignProgress.total}...` : 'Đang xử lý...')
                                : 'Xác nhận gán lại'}
                        </button>
                    </div>
                </div>
            </Modal>

            {isCreateReceiptOpen && (
                <CreateReceiptModal
                    isOpen={isCreateReceiptOpen}
                    onClose={() => setIsCreateReceiptOpen(false)}
                    parts={[]}
                    retailProducts={retailProducts}
                    currentUser={user}
                    suppliers={supplierList}
                    initialReceiptType="retail"
                    lockReceiptType
                    onCreated={() => {
                        setIsCreateReceiptOpen(false);
                        router.push('/admin/inventory?tab=draft');
                    }}
                />
            )}
        </div>
    );
}
