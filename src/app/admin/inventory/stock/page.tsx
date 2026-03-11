'use client';

import { useState, useEffect } from 'react';
import { Package, Search, Loader2, ArrowUpDown, TrendingDown, TrendingUp } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Product } from '@/lib/types';

const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';

export default function StockPage() {
    const [products, setProducts] = useState<(Product & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'stock' | 'costPrice'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDocs(collection(db, 'products'));
                setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product & { id: string })).filter(p => p.category !== 'Linh kiện'));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const filtered = products
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

    const totalItems = products.reduce((s, p) => s + (p.stock || 0), 0);
    const totalValue = products.reduce((s, p) => s + (p.stock || 0) * (p.costPrice || 0), 0);
    const lowStock = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 3).length;
    const outOfStock = products.filter(p => (p.stock || 0) <= 0).length;

    const toggleSort = (col: typeof sortBy) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('asc'); }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-[60vh]">
            <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
    );

    return (
        <div className="p-4 md:p-6 space-y-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Package className="text-orange-500" /> Tổng Tồn Kho
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">{products.length} mặt hàng trong hệ thống</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Tổng tồn kho</p>
                    <p className="text-2xl font-bold text-gray-800">{totalItems}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Giá trị tồn kho</p>
                    <p className="text-lg font-bold text-orange-600">{formatPrice(totalValue)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Sắp hết hàng (≤3)</p>
                    <p className="text-2xl font-bold text-amber-600">{lowStock}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Hết hàng</p>
                    <p className="text-2xl font-bold text-red-600">{outOfStock}</p>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Tìm sản phẩm, linh kiện..."
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-orange-500/30 bg-white shadow-sm" />
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
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
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Giá bán</th>
                                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Giá trị tồn</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.length === 0 ? (
                                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Không có sản phẩm nào</td></tr>
                            ) : filtered.map(p => {
                                const stock = p.stock || 0;
                                const costPrice = p.costPrice || 0;
                                const stockValue = stock * costPrice;
                                return (
                                    <tr key={p.id} className={`hover:bg-gray-50 ${stock <= 0 ? 'bg-red-50/50' : stock <= 3 ? 'bg-amber-50/50' : ''}`}>
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
                                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatPrice(p.price_promo || p.price_original)}</td>
                                        <td className="px-4 py-3 text-right text-sm font-medium text-orange-600">{stockValue > 0 ? formatPrice(stockValue) : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
