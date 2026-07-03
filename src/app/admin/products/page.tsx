'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import firebaseImageLoader from '@/lib/imageLoader';
import { useRouter } from 'next/navigation';
import { Archive, Plus, Search, Edit, Package, Loader2, QrCode, PackagePlus } from 'lucide-react';
import { useFirestoreCollection, updateDocument } from '@/lib/useFirestore';

import { collection, orderBy, serverTimestamp } from 'firebase/firestore';
import { onSnapshot } from '@/lib/firestoreLogger';
import { toastError } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { triggerRevalidate } from '@/lib/revalidate';
import UniversalProductModal from '@/components/admin/UniversalProductModal';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import ProductQrLabelModal from '@/components/admin/ProductQrLabelModal';

import { CreateReceiptModal } from '@/features/parts/ImportReceiptModals';
import type { SupplierOption } from '@/features/parts/importReceiptTypes';
import type { Product } from '@/lib/types';
import { useConfig } from '@/lib/ConfigContext';
import { getCategoryPath, collectAllNodeIds } from '@/lib/utils';
import { isPartCategory } from '@/lib/constants';
import { productCodeSearchText } from '@/lib/productCodes';
import { buildArchiveUpdate, getArchiveBlockReason, isProductArchived } from '@/lib/productLifecycle';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';

// Product is now imported from @/lib/types

const CONDITIONS: { value: Product['condition'] | ''; label: string; color: string }[] = [
    { value: '', label: 'Tất cả tình trạng', color: '' },
    { value: 'new', label: 'Mới 100%', color: 'bg-green-100 text-green-700' },
    { value: 'like-new', label: 'Cũ 99%', color: 'bg-blue-100 text-blue-700' },
    { value: 'used', label: 'Hàng cũ | TBH', color: 'bg-yellow-100 text-yellow-700' },
];

export default function ProductsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { config } = useConfig();
    const { data: products, loading } = useFirestoreCollection<Product>('products', [orderBy('createdAt', 'desc')]);
    const [searchQuery, setSearchQuery] = useState('');

    const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
    const [filterCondition, setFilterCondition] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [qrProduct, setQrProduct] = useState<(Product & { id: string }) | null>(null);

    const [isCreateReceiptOpen, setIsCreateReceiptOpen] = useState(false);
    const [supplierList, setSupplierList] = useState<SupplierOption[]>([]);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
            setSupplierList(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as SupplierOption)));
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (new URLSearchParams(window.location.search).get('createImportProposal') === '1') {
            setIsCreateReceiptOpen(true);
        }
    }, []);

    const handleArchive = async (product: Product) => {
        const blockReason = getArchiveBlockReason(product);
        if (blockReason) {
            toastError(`Không thể lưu trữ "${product.name}" vì ${blockReason}.`);
            return;
        }
        if (confirm(`Lưu trữ "${product.name}"? Sản phẩm sẽ ẩn khỏi bán lẻ/POS nhưng vẫn giữ lịch sử và mã hàng.`)) {
            try {
                await updateDocument('products', product.id, buildArchiveUpdate(serverTimestamp()));
                // Trigger revalidation
                await triggerRevalidate(['/', `/product/${product.id}`, '/flash-sale', '/search', '/sitemap.xml'], ['products']);
            } catch {
                toastError('Lỗi khi lưu trữ sản phẩm!');
            }
        }
    };

    const filteredProducts = products.filter((p) => {
        if (isProductArchived(p)) return false; // Hide archived products
        if (isPartCategory(p.category, p.categoryIds)) return false; // Linh kiện managed separately in /admin/parts
        const normalizedQuery = searchQuery.toLowerCase();
        const matchSearch = p.name.toLowerCase().includes(normalizedQuery) || productCodeSearchText(p as Product & { id: string }).includes(normalizedQuery);
        
        let matchCategory = true;
        if (filterCategoryIds.length > 0) {
            const targetId = filterCategoryIds[filterCategoryIds.length - 1];
            matchCategory = p.categoryIds?.includes(targetId) || false;
        }

        const matchCondition = !filterCondition || p.condition === filterCondition;
        return matchSearch && matchCategory && matchCondition;
    });
    const retailProducts = products.filter((p) => {
        const firstCatId = p.categoryIds?.[0] || '';
        const isService = p.category === 'service' || firstCatId.startsWith('sua-chua');
        return !isProductArchived(p) && !isPartCategory(p.category, p.categoryIds) && !isService;
    }) as (Product & { id: string })[];

    // --- ORPHAN CATEGORY DETECTION (ID-based) ---
    const retailTaxonomy = config?.taxonomy?.retail || [];
    const validNodeIds = collectAllNodeIds(retailTaxonomy);

    const getOrphanStatus = (product: Product): 'valid' | 'orphan' | 'unassigned' => {
        if (!product.categoryIds || product.categoryIds.length === 0) {
            return product.category ? 'orphan' : 'unassigned';
        }
        const deepestId = product.categoryIds[product.categoryIds.length - 1];
        return validNodeIds.has(deepestId) ? 'valid' : 'orphan';
    };
    // ---------------------------------

    const { paginatedData: paginatedProducts, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredProducts, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery, filterCategoryIds, filterCondition]);

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-lg font-bold text-gray-900">Quản lý sản phẩm</h1>
                    <p className="text-gray-500">{products.length} sản phẩm</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsCreateReceiptOpen(true)}
                        className="flex items-center gap-1.5 bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-600 active:scale-95 transition-all text-xs"
                    >
                        <PackagePlus size={15} />
                        Tạo đề xuất nhập
                    </button>
                    <button
                        onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
                        className="flex items-center gap-1.5 bg-orange-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-orange-600 active:scale-95 transition-all text-xs"
                    >
                        <Plus size={15} />
                        Thêm sản phẩm
                    </button>
                </div>
            </div>

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
                                            <button
                                                onClick={() => handleArchive(product)}
                                                className="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors active:scale-90"
                                                title="Lưu trữ sản phẩm"
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
                                        <button
                                            onClick={() => handleArchive(product)}
                                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all active:scale-95"
                                        >
                                            <Archive size={14} />
                                            Lưu trữ
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <PaginationBar
                        currentPage={currentPage}
                        totalPages={totalPages}
                        pageSize={pageSize}
                        totalFiltered={totalFiltered}
                        totalAll={products.length}
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
