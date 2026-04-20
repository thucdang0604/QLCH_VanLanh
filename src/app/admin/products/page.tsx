'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Plus, Search, Edit, Trash2, Package, Loader2 } from 'lucide-react';
import { useFirestoreCollection, deleteDocument } from '@/lib/useFirestore';
import { deleteImage } from '@/lib/storage';
import { orderBy } from 'firebase/firestore';
import type { FirestoreDateValue } from '@/lib/types';
import { toastError } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { triggerRevalidate } from '@/lib/revalidate';
import UniversalProductModal from '@/components/admin/UniversalProductModal';
import { RETAIL_CATEGORIES } from '@/lib/constants';
import type { Product } from '@/lib/types';


// Product is now imported from @/lib/types

const CONDITIONS: { value: Product['condition'] | ''; label: string; color: string }[] = [
    { value: '', label: 'Tất cả tình trạng', color: '' },
    { value: 'new', label: 'Mới 100%', color: 'bg-green-100 text-green-700' },
    { value: 'like-new', label: 'Cũ 99%', color: 'bg-blue-100 text-blue-700' },
    { value: 'used', label: 'Hàng cũ | TBH', color: 'bg-yellow-100 text-yellow-700' },
];

const categories = [...RETAIL_CATEGORIES];
export default function ProductsPage() {
    const { data: products, loading } = useFirestoreCollection<Product>('products', [orderBy('createdAt', 'desc')]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterCondition, setFilterCondition] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const handleDelete = async (product: Product) => {
        if (confirm(`Bạn có chắc muốn xóa "${product.name}"?`)) {
            try {
                // Delete image from storage
                if (product.imageUrl) {
                    await deleteImage(product.imageUrl);
                }
                // Delete document
                await deleteDocument('products', product.id);
                // Trigger revalidation
                await triggerRevalidate(['/', `/product/${product.id}`, '/flash-sale', '/search', '/sitemap.xml'], ['products']);
            } catch (error) {
                toastError('Lỗi khi xóa sản phẩm!');
            }
        }
    };

    const filteredProducts = products.filter((p) => {
        if (p.category === 'Linh kiện') return false; // Linh kiện managed separately in /admin/parts
        const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchCategory = !filterCategory || p.category === filterCategory;
        const matchCondition = !filterCondition || p.condition === filterCondition;
        return matchSearch && matchCategory && matchCondition;
    });

    const { paginatedData: paginatedProducts, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredProducts, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery, filterCategory, filterCondition]);

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
                <button
                    onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
                    className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-orange-600 transition-colors"
                >
                    <Plus size={20} />
                    Thêm sản phẩm
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
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
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                >
                    <option value="">Tất cả danh mục</option>
                    {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
                <select
                    value={filterCondition}
                    onChange={(e) => setFilterCondition(e.target.value)}
                    className="h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                >
                    {CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                </select>
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
                                    <td className="px-6 py-4 text-sm text-gray-600">{product.category}</td>
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
                                        <span className={`text-sm font-medium ${(product.stock || 0) > 10 ? 'text-green-600' : (product.stock || 0) > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                            {product.stock || 0}
                                        </span>
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
                                        <span className="text-xs text-gray-500">{product.category}</span>
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
                                            <span className={`text-xs font-bold ${(product.stock || 0) > 10 ? 'text-green-600' : (product.stock || 0) > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                Kho: {product.stock || 0}
                                            </span>
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

            {/* Modal */}
            <UniversalProductModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingProduct(null); }}
                mode="retail"
                initialData={editingProduct}
                onCreated={() => setIsModalOpen(false)}
                onUpdated={() => setIsModalOpen(false)}
            />
        </div>
    );
}

