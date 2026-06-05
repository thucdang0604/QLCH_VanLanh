'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Plus, Search, Edit, Trash2, Package, Loader2, FileSpreadsheet, QrCode, AlertTriangle } from 'lucide-react';
import { useFirestoreCollection, updateDocument } from '@/lib/useFirestore';

import { orderBy } from 'firebase/firestore';
import { toastError } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { triggerRevalidate } from '@/lib/revalidate';
import UniversalProductModal from '@/components/admin/UniversalProductModal';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import ExcelImportModal from '@/components/admin/ExcelImportModal';
import ProductSeriesManager from '@/components/admin/ProductSeriesManager';
import ProductQrLabelModal from '@/components/admin/ProductQrLabelModal';
import FixHiddenProductsModal from '@/components/admin/FixHiddenProductsModal';
import type { Product } from '@/lib/types';
import { useConfig } from '@/lib/ConfigContext';
import { getCategoryPath, collectAllNodeIds } from '@/lib/utils';
import { isPartCategory } from '@/lib/constants';
import { productCodeSearchText } from '@/lib/productCodes';

// Product is now imported from @/lib/types

const CONDITIONS: { value: Product['condition'] | ''; label: string; color: string }[] = [
    { value: '', label: 'Tất cả tình trạng', color: '' },
    { value: 'new', label: 'Mới 100%', color: 'bg-green-100 text-green-700' },
    { value: 'like-new', label: 'Cũ 99%', color: 'bg-blue-100 text-blue-700' },
    { value: 'used', label: 'Hàng cũ | TBH', color: 'bg-yellow-100 text-yellow-700' },
];

export default function ProductsPage() {
    const { config } = useConfig();
    const { data: products, loading } = useFirestoreCollection<Product>('products', [orderBy('createdAt', 'desc')]);
    const [mainTab, setMainTab] = useState<'list' | 'series'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
    const [filterCondition, setFilterCondition] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [qrProduct, setQrProduct] = useState<(Product & { id: string }) | null>(null);
    const [showExcelImport, setShowExcelImport] = useState(false);
    const [showFixHidden, setShowFixHidden] = useState(false);

    const handleDelete = async (product: Product) => {
        if (Number(product.stock) > 0) {
            toastError('Không thể xóa sản phẩm đang còn tồn kho!');
            return;
        }
        if (confirm(`Bạn có chắc muốn xóa "${product.name}"?`)) {
            try {
                // Soft delete by setting status to inactive
                await updateDocument('products', product.id, { status: 'inactive' });
                // Trigger revalidation
                await triggerRevalidate(['/', `/product/${product.id}`, '/flash-sale', '/search', '/sitemap.xml'], ['products']);
            } catch {
                toastError('Lỗi khi xóa sản phẩm!');
            }
        }
    };

    const filteredProducts = products.filter((p) => {
        if (p.status === 'inactive') return false; // Hide soft-deleted products
        if (isPartCategory(p.category, p.categoryIds)) return false; // Linh kiện managed separately in /admin/parts
        const normalizedQuery = searchQuery.toLowerCase();
        const matchSearch = p.name.toLowerCase().includes(normalizedQuery) || productCodeSearchText(p as Product & { id: string }).includes(normalizedQuery);
        
        let matchCategory = true;
        if (filterCategory) {
            matchCategory = p.category === filterCategory;
        } else if (filterCategoryIds.length > 0) {
            const targetId = filterCategoryIds[filterCategoryIds.length - 1];
            matchCategory = p.categoryIds?.includes(targetId) || false;
        }

        const matchCondition = !filterCondition || p.condition === filterCondition;
        return matchSearch && matchCategory && matchCondition;
    });

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
    useEffect(() => { resetPage(); }, [searchQuery, filterCategory, filterCategoryIds, filterCondition]);

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý sản phẩm</h1>
                    <p className="text-gray-500">{products.length} sản phẩm</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowFixHidden(true)}
                        className="flex items-center gap-2 border-2 border-amber-300 text-amber-700 px-4 py-2.5 rounded-lg font-medium hover:bg-amber-50 transition-colors text-sm"
                    >
                        <AlertTriangle size={18} />
                        Khắc phục SP bị ẩn
                    </button>
                    <button
                        onClick={() => setShowExcelImport(true)}
                        className="flex items-center gap-2 border-2 border-green-300 text-green-700 px-4 py-2.5 rounded-lg font-medium hover:bg-green-50 transition-colors text-sm"
                    >
                        <FileSpreadsheet size={18} />
                        Import Excel
                    </button>
                    <button
                        onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
                        className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-orange-600 transition-colors"
                    >
                        <Plus size={20} />
                        Thêm sản phẩm
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setMainTab('list')}
                    className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${mainTab === 'list' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Danh sách Sản phẩm
                </button>
                <button
                    onClick={() => setMainTab('series')}
                    className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${mainTab === 'series' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    Nhóm Biến thể (Series)
                </button>
            </div>

            {mainTab === 'series' ? (
                <ProductSeriesManager />

            ) : (
                <>
            {/* Filters */}
            <div className="flex flex-col gap-3">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm sản phẩm..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                        />
                    </div>
                    <select
                        value={filterCategory}
                        onChange={(e) => {
                            setFilterCategory(e.target.value);
                            if (e.target.value) setFilterCategoryIds([]);
                        }}
                        title="Lọc theo danh mục"
                        aria-label="Lọc theo danh mục"
                        className="h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                    >
                        <option value="">Tất cả danh mục cũ</option>
                        {[...new Set(products.map(p => p.category).filter(Boolean))].map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                    <select
                        value={filterCondition}
                        onChange={(e) => setFilterCondition(e.target.value)}
                        title="Lọc theo tình trạng"
                        aria-label="Lọc theo tình trạng"
                        className="h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                    >
                        {CONDITIONS.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                    </select>
                </div>
                {/* Modern Taxonomy Filter */}
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-2">Lọc theo danh mục mới:</p>
                    <CategoryTaxonomySelector
                        type="retail"
                        value={filterCategoryIds}
                        onChange={(ids) => {
                            setFilterCategoryIds(ids);
                            if (ids.length > 0) setFilterCategory('');
                        }}
                    />
                </div>
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
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full min-w-[800px]">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Sản phẩm</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Danh mục</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Tình trạng</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Giá</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Tồn kho</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Trạng thái</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Hành động</th>
                                </tr>
                            </thead>
                        <tbody className="divide-y divide-gray-100">
                            {paginatedProducts.map((product) => (
                                <tr key={product.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                                                {product.imageUrl ? (
                                                    <Image
                                                        src={product.imageUrl}
                                                        alt={product.name}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <Package size={24} className="absolute inset-0 m-auto text-gray-400" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 line-clamp-1">{product.name}</p>
                                                <p className="text-xs text-gray-500">{product.brand}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        {(() => {
                                            const status = getOrphanStatus(product);
                                            const deepestId = product.categoryIds?.[product.categoryIds.length - 1];
                                            const path = deepestId ? getCategoryPath(deepestId, retailTaxonomy) : null;
                                            if (status === 'orphan') return <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">⚠ {deepestId || product.category}</span>;
                                            if (status === 'unassigned') return <span className="text-xs text-yellow-600">Chưa gán</span>;
                                            return <span className="text-gray-600">{path || product.category}</span>;
                                        })()}
                                    </td>
                                    <td className="px-6 py-4">
                                        {(() => {
                                            const cond = CONDITIONS.find(c => c.value === product.condition);
                                            return cond?.value ? (
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${cond.color}`}>
                                                    {cond.label}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-400">—</span>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-6 py-4">
                                        {product.price_promo ? (
                                            <div>
                                                <p className="text-sm font-bold text-red-600">{formatPrice(product.price_promo)}</p>
                                                <p className="text-xs text-gray-400 line-through">{formatPrice(product.price_original)}</p>
                                            </div>
                                        ) : (
                                            <p className="text-sm font-medium">{formatPrice(product.price_original)}</p>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {(() => {
                                            const available = (product.stock || 0) - ((product as { held?: number }).held || 0);
                                            return (
                                                <span className={`text-sm font-medium ${available > 10 ? 'text-green-600' : available > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                    {available}
                                                    {((product as { held?: number }).held || 0) > 0 && <span className="text-xs text-gray-400 ml-1">(giữ: {(product as { held?: number }).held})</span>}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                            {product.status === 'active' ? 'Đang bán' : 'Tạm ẩn'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setQrProduct(product)}
                                                className="p-2 hover:bg-orange-100 text-orange-600 rounded-lg"
                                                title="In tem QR / barcode"
                                            >
                                                <QrCode size={18} />
                                            </button>
                                            <button
                                                onClick={() => { setEditingProduct(product); setIsModalOpen(true); }}
                                                className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg"
                                            >
                                                <Edit size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(product)}
                                                className="p-2 hover:bg-red-100 text-red-600 rounded-lg"
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

                    {/* Mobile Card List */}
                    <div className="md:hidden divide-y divide-gray-100">
                        {paginatedProducts.map((product) => (
                            <div key={product.id} className="p-4 flex gap-3">
                                <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                                    {product.imageUrl ? (
                                        <Image
                                            src={product.imageUrl}
                                            alt={product.name}
                                            fill
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
                                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {product.status === 'active' ? 'Đang bán' : 'Ẩn'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <button
                                            onClick={() => { setEditingProduct(product); setIsModalOpen(true); }}
                                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                        >
                                            <Edit size={14} />
                                            Sửa
                                        </button>
                                        <button
                                            onClick={() => handleDelete(product)}
                                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                                        >
                                            <Trash2 size={14} />
                                            Xóa
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
                </>
            )}

            {/* Modal */}
            <UniversalProductModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingProduct(null); }}
                mode="retail"
                initialData={editingProduct}
                onCreated={() => setIsModalOpen(false)}
                onUpdated={() => setIsModalOpen(false)}
            />

            {showExcelImport && <ExcelImportModal mode="product" onClose={() => setShowExcelImport(false)} />}
            <ProductQrLabelModal product={qrProduct} onClose={() => setQrProduct(null)} />
            <FixHiddenProductsModal isOpen={showFixHidden} onClose={() => setShowFixHidden(false)} products={products} />
        </div>
    );
}

