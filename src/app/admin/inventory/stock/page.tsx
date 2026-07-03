'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Archive, Package, Search, Loader2, ArrowUpDown, TrendingDown, TrendingUp } from 'lucide-react';
import { collection, limit, orderBy, query, startAfter, where, type DocumentSnapshot, type QueryConstraint } from 'firebase/firestore';
import { getDocs } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import type { Product } from '@/lib/types';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { isProductArchived } from '@/lib/productLifecycle';
import { generateSearchKeywords } from '@/lib/utils';

const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';

const STOCK_BATCH_SIZE = 100;

const isComponent = (p: Product) => {
    const cat = p.category?.toLowerCase() || '';
    const firstCatId = p.categoryIds?.[0] || '';
    return cat === 'linh kiện' || cat === 'component' || firstCatId.startsWith('linh-kien') || firstCatId === 'component';
};

const getStockGroupKey = (p: Product & { id: string }) => {
    const code = [p.sku, p.productCode, p.barcode]
        .find(value => typeof value === 'string' && value.trim().length > 0);
    return (code || p.id).trim().toLowerCase();
};

const mergeStockProduct = (
    current: Product & { id: string },
    next: Product & { id: string },
): Product & { id: string } => {
    const currentStock = Number(current.stock) || 0;
    const nextStock = Number(next.stock) || 0;
    const totalStock = currentStock + nextStock;
    const currentValue = currentStock * (Number(current.costPrice) || 0);
    const nextValue = nextStock * (Number(next.costPrice) || 0);
    return {
        ...current,
        stock: totalStock,
        held: (Number(current.held) || 0) + (Number(next.held) || 0),
        costPrice: totalStock > 0
            ? Math.round((currentValue + nextValue) / totalStock)
            : Number(current.costPrice) || Number(next.costPrice) || 0,
    };
};

export default function StockPage() {
    const [products, setProducts] = useState<(Product & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'stock' | 'costPrice'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [stockTab, setStockTab] = useState<'all' | 'retail' | 'component'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');

    const buildStockQueryConstraints = useCallback((cursor?: DocumentSnapshot | null): QueryConstraint[] => {
        const trimmedSearch = debouncedSearchQuery.trim();
        const constraints: QueryConstraint[] = [];

        if (trimmedSearch) {
            const keyword = generateSearchKeywords(trimmedSearch)[0] || trimmedSearch.toLowerCase();
            constraints.push(where('searchKeywords', 'array-contains', keyword));
        } else {
            constraints.push(orderBy('name', 'asc'));
        }

        if (cursor) constraints.push(startAfter(cursor));
        constraints.push(limit(STOCK_BATCH_SIZE));
        return constraints;
    }, [debouncedSearchQuery]);

    const loadProducts = useCallback(async (mode: 'reset' | 'more', cursor?: DocumentSnapshot | null) => {
        const isReset = mode === 'reset';
        if (isReset) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const snap = await getDocs(query(
                collection(db, 'products'),
                ...buildStockQueryConstraints(isReset ? null : cursor),
            ));
            const nextProducts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product & { id: string }));
            setProducts(current => isReset ? nextProducts : [...current, ...nextProducts]);
            setLastDoc(snap.docs[snap.docs.length - 1] || null);
            setHasMore(snap.docs.length === STOCK_BATCH_SIZE);
        } catch (err) {
            console.error(err);
            if (isReset) {
                setProducts([]);
                setLastDoc(null);
                setHasMore(false);
            }
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [buildStockQueryConstraints]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearchQuery(searchQuery.trim());
        }, 250);
        return () => window.clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        loadProducts('reset');
    }, [loadProducts]);

    const stockProducts = useMemo(() => {
        const grouped = new Map<string, Product & { id: string }>();
        for (const product of products) {
            const key = getStockGroupKey(product);
            const existing = grouped.get(key);
            grouped.set(key, existing ? mergeStockProduct(existing, product) : product);
        }
        return [...grouped.values()];
    }, [products]);

    const tabFiltered = stockProducts.filter(p => {
        if (p.isProposed) return false;
        if (stockTab === 'component') return isComponent(p);
        if (stockTab === 'retail') return !isComponent(p);
        return true;
    });
    const statusFiltered = tabFiltered.filter(p => {
        if (statusFilter === 'archived') return isProductArchived(p);
        if (statusFilter === 'active') return !isProductArchived(p);
        return true;
    });

    const filtered = statusFiltered
        .filter(p => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) ||
                p.brand?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q);
        })
        .sort((a, b) => {
            let cmp = 0;
            if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
            else if (sortBy === 'stock') cmp = (a.stock || 0) - (b.stock || 0);
            else if (sortBy === 'costPrice') cmp = (a.costPrice || 0) - (b.costPrice || 0);
            return sortDir === 'asc' ? cmp : -cmp;
        });

    const totalItems = statusFiltered.reduce((s, p) => s + (p.stock || 0), 0);
    const totalValue = statusFiltered.reduce((s, p) => s + (p.stock || 0) * (p.costPrice || 0), 0);
    const lowStock = statusFiltered.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 3).length;
    const outOfStock = statusFiltered.filter(p => (p.stock || 0) <= 0).length;
    const archivedCount = tabFiltered.filter(isProductArchived).length;

    const toggleSort = (col: typeof sortBy) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('asc'); }
    };

    const { paginatedData: paginatedFiltered, currentPage, totalPages, pageSize, totalFiltered: totalFilteredCount, setPage, setPageSize, resetPage } = useClientPagination(filtered, 20);

    useEffect(() => { resetPage(); }, [searchQuery, stockTab, statusFilter, resetPage]);

    if (loading) return (
        <div className="flex items-center justify-center h-[60vh]">
            <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
    );

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div>
                <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Package className="text-orange-500" /> Tổng Tồn Kho
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">{statusFiltered.length} mặt hàng đã tải{stockTab !== 'all' ? ` (${stockTab === 'retail' ? 'bán lẻ' : 'linh kiện'})` : ''}</p>
            </div>

            {/* Stock Tab Filter */}
            <div className="flex gap-2">
                {([['all', '📋 Tất cả'], ['retail', '📦 Bán lẻ & Phụ kiện'], ['component', '🔧 Linh kiện']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setStockTab(key)}
                        className={`px-3 py-1.5 text-xs rounded-xl text-sm font-medium transition-all border ${stockTab === key
                                ? key === 'component' ? 'bg-orange-50 border-orange-300 text-orange-700 shadow-sm'
                                    : key === 'retail' ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                                        : 'bg-gray-800 border-gray-800 text-white shadow-sm'
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}>
                        {label}
                    </button>
                ))}
            </div>
            <div className="flex gap-2">
                {([
                    ['all', 'Tất cả trạng thái'],
                    ['active', 'Đang hoạt động'],
                    ['archived', `Đã lưu trữ (${archivedCount})`],
                ] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setStatusFilter(key)}
                        className={`px-3 py-1.5 text-xs rounded-xl text-sm font-medium transition-all border ${statusFilter === key
                                ? 'bg-orange-50 border-orange-300 text-orange-700 shadow-sm'
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Tổng tồn kho</p>
                    <p className="text-lg font-bold text-gray-800">{totalItems}</p>
                </div>
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Giá trị tồn kho</p>
                    <p className="text-lg font-bold text-orange-600">{formatPrice(totalValue)}</p>
                </div>
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Sắp hết hàng (≤3)</p>
                    <p className="text-lg font-bold text-amber-600">{lowStock}</p>
                </div>
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Hết hàng</p>
                    <p className="text-lg font-bold text-red-600">{outOfStock}</p>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Tìm sản phẩm, linh kiện..."
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 border rounded-xl focus:ring-2 focus:ring-orange-500/30 bg-white shadow-sm" />
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mã SP</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-orange-600"
                                    onClick={() => toggleSort('name')}>
                                    <span className="flex items-center gap-1">Tên sản phẩm <ArrowUpDown size={12} /></span>
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Danh mục</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-orange-600"
                                    onClick={() => toggleSort('stock')}>
                                    <span className="flex items-center justify-center gap-1">Tồn kho <ArrowUpDown size={12} /></span>
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase cursor-pointer hover:text-orange-600"
                                    onClick={() => toggleSort('costPrice')}>
                                    <span className="flex items-center justify-end gap-1">Giá vốn BQ <ArrowUpDown size={12} /></span>
                                </th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Giá bán</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Giá trị tồn</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Không có sản phẩm nào</td></tr>
                            ) : paginatedFiltered.map(p => {
                                const stock = p.stock || 0;
                                const costPrice = p.costPrice || 0;
                                const stockValue = stock * costPrice;
                                return (
                                    <tr key={p.id} className={`transition-colors duration-200 hover:bg-gray-50 ${stock <= 0 ? 'bg-red-50/50' : stock <= 3 ? 'bg-amber-50/50' : ''}`}>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">#{p.id.slice(-6).toUpperCase()}</td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                                            <p className="text-[10px] text-gray-400">{p.brand}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-gray-600">{p.category}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center gap-1 font-bold text-sm ${stock <= 0 ? 'text-red-600' : stock <= 3 ? 'text-amber-600' : 'text-green-600'
                                                }`}>
                                                {stock <= 0 ? <TrendingDown size={12} /> : stock <= 3 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                                                {stock}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm text-gray-600">{costPrice > 0 ? formatPrice(costPrice) : '—'}</td>
                                        <td className="px-4 py-3 text-center">
                                            {isProductArchived(p) ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-50 text-red-600">
                                                    <Archive size={12} /> Đã lưu trữ
                                                </span>
                                            ) : (
                                                <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-50 text-green-700">Hoạt động</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatPrice(p.price_promo || p.price_original)}</td>
                                        <td className="px-4 py-3 text-right text-sm font-medium text-orange-600">{stockValue > 0 ? formatPrice(stockValue) : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card List */}
                <div className="lg:hidden">
                    {/* Mobile sort controls */}
                    <div className="flex items-center gap-2 p-3 bg-gray-50 border-b overflow-x-auto">
                        <span className="text-xs text-gray-500 shrink-0">Sắp xếp:</span>
                        {[
                            { key: 'name' as const, label: 'Tên' },
                            { key: 'stock' as const, label: 'Tồn kho' },
                            { key: 'costPrice' as const, label: 'Giá vốn' },
                        ].map(s => (
                            <button
                                key={s.key}
                                onClick={() => toggleSort(s.key)}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors shrink-0 ${sortBy === s.key ? 'bg-orange-100 text-orange-700' : 'bg-white text-gray-600 border'}`}
                            >
                                {s.label}
                                {sortBy === s.key && <ArrowUpDown size={10} />}
                            </button>
                        ))}
                    </div>
                    <div className="divide-y divide-gray-100">
                        {filtered.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">Không có sản phẩm nào</div>
                        ) : paginatedFiltered.map(p => {
                            const stock = p.stock || 0;
                            const costPrice = p.costPrice || 0;
                            const stockValue = stock * costPrice;
                            return (
                                <div key={p.id} className={`p-4 ${stock <= 0 ? 'bg-red-50/30' : stock <= 3 ? 'bg-amber-50/30' : ''}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-gray-900 text-sm line-clamp-1">{p.name}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[10px] text-gray-400">{p.brand}</span>
                                                <span className="text-gray-300">·</span>
                                                <span className="text-[10px] text-gray-400">{p.category}</span>
                                                <span className="text-gray-300">·</span>
                                                <span className="font-mono text-[10px] text-gray-400">#{p.id.slice(-6).toUpperCase()}</span>
                                                {isProductArchived(p) && (
                                                    <>
                                                        <span className="text-gray-300">·</span>
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600">
                                                            <Archive size={10} /> Đã lưu trữ
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <span className={`inline-flex items-center gap-1 font-bold text-sm shrink-0 ${stock <= 0 ? 'text-red-600' : stock <= 3 ? 'text-amber-600' : 'text-green-600'}`}>
                                            {stock <= 0 ? <TrendingDown size={12} /> : stock <= 3 ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                                            {stock}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-2 text-xs">
                                        <span className="text-gray-500">Vốn: <span className="font-medium text-gray-700">{costPrice > 0 ? formatPrice(costPrice) : '—'}</span></span>
                                        <span className="text-gray-500">Bán: <span className="font-medium text-gray-900">{formatPrice(p.price_promo || p.price_original)}</span></span>
                                        <span className="text-gray-500">Giá trị: <span className="font-bold text-orange-600">{stockValue > 0 ? formatPrice(stockValue) : '—'}</span></span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <PaginationBar
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalFiltered={totalFilteredCount}
                    totalAll={products.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    entityLabel="sản phẩm"
                />
                {hasMore && (
                    <div className="flex justify-center border-t bg-gray-50 px-4 py-3">
                        <button
                            type="button"
                            onClick={() => loadProducts('more', lastDoc)}
                            disabled={loadingMore}
                            className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {loadingMore && <Loader2 size={16} className="animate-spin" />}
                            Tải thêm {STOCK_BATCH_SIZE} mặt hàng
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
