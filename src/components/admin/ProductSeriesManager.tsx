'use client';

import React, { useState, useMemo } from 'react';
import { useFirestoreCollection, updateDocument } from '@/lib/useFirestore';
import { Product } from '@/lib/types';
import { limit, orderBy } from 'firebase/firestore';
import { Layers, Box, Link2Off, Link2, CheckSquare, Square, SearchIcon, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { toastSuccess, toastError } from '@/lib/toast';
import { appConfirm } from '@/lib/appDialog';

const formatPrice = (p: number) => p > 0 ? p.toLocaleString('vi-VN') + 'đ' : '—';
const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'Lỗi không xác định';

export default function ProductSeriesManager() {
    const { data: products, loading } = useFirestoreCollection<Product>('products', [orderBy('createdAt', 'desc'), limit(300)]);
    
    const [activeTab, setActiveTab] = useState<'grouped' | 'ungrouped'>('grouped');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
    
    const [isAssigning, setIsAssigning] = useState(false);
    const [newSeriesId, setNewSeriesId] = useState('');
    
    // Process Data
    const { grouped, ungrouped, seriesList } = useMemo(() => {
        const groupedMap: Record<string, Product[]> = {};
        const ungroupedList: Product[] = [];
        
        products.forEach((p: Product) => {
            // Lọc các sản phẩm bán lẻ (thường có brand, không có partType)
            // Hoặc đơn giản là lấy tất cả.
            if (p.seriesId) {
                if (!groupedMap[p.seriesId]) groupedMap[p.seriesId] = [];
                groupedMap[p.seriesId].push(p);
            } else {
                ungroupedList.push(p);
            }
        });
        
        return {
            grouped: groupedMap,
            ungrouped: ungroupedList,
            seriesList: Object.keys(groupedMap).sort()
        };
    }, [products]);

    // Filtering
    const filteredUngrouped = useMemo(() => {
        if (!searchQuery) return ungrouped;
        return ungrouped.filter(p => 
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (p.brand && p.brand.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }, [ungrouped, searchQuery]);

    const filteredGroupedKeys = useMemo(() => {
        if (!searchQuery) return seriesList;
        return seriesList.filter(sId => sId.toLowerCase().includes(searchQuery.toLowerCase()) || grouped[sId].some(p => p.name.toLowerCase().includes(searchQuery.toLowerCase())));
    }, [seriesList, grouped, searchQuery]);

    const toggleSelectAll = () => {
        if (selectedProductIds.length === filteredUngrouped.length) {
            setSelectedProductIds([]);
        } else {
            setSelectedProductIds(filteredUngrouped.map(p => p.id));
        }
    };

    const toggleSelect = (id: string) => {
        if (selectedProductIds.includes(id)) {
            setSelectedProductIds(prev => prev.filter(pid => pid !== id));
        } else {
            setSelectedProductIds(prev => [...prev, id]);
        }
    };

    const handleRemoveFromGroup = async (product: Product) => {
        if (!await appConfirm(`Bạn có chắc muốn gỡ "${product.name}" khỏi nhóm biến thể không?`, { title: 'Gỡ khỏi nhóm biến thể', confirmText: 'Gỡ', destructive: true })) return;
        try {
            await updateDocument('products', product.id, { seriesId: '' });
            toastSuccess('Đã gỡ sản phẩm khỏi nhóm biến thể.');
        } catch (error: unknown) {
            toastError('Lỗi gỡ sản phẩm: ' + getErrorMessage(error));
        }
    };

    const handleAssignToGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSeriesId.trim()) {
            toastError('Vui lòng nhập hoặc chọn Mã Dòng (Series ID).');
            return;
        }
        if (selectedProductIds.length === 0) {
            toastError('Vui lòng chọn ít nhất 1 sản phẩm.');
            return;
        }

        setIsAssigning(true);
        try {
            const updates = selectedProductIds.map(id => updateDocument('products', id, { seriesId: newSeriesId.trim() }));
            await Promise.all(updates);
            toastSuccess(`Đã gom ${selectedProductIds.length} sản phẩm vào nhóm "${newSeriesId.trim()}".`);
            setSelectedProductIds([]);
            setNewSeriesId('');
            setActiveTab('grouped');
        } catch (error: unknown) {
            toastError('Lỗi gom nhóm: ' + getErrorMessage(error));
        } finally {
            setIsAssigning(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="animate-spin text-orange-500 w-8 h-8" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Layers className="text-orange-500" />
                        Quản lý Nhóm Biến Thể
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Gom nhóm các sản phẩm có cùng Model để hiển thị liên kết trên trang khách hàng.</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center border-b border-gray-100 bg-gray-50/50">
                    <button
                        onClick={() => setActiveTab('grouped')}
                        className={`flex-1 py-4 px-6 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                            activeTab === 'grouped' ? 'text-orange-600 bg-white border-b-2 border-orange-500' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        <Layers size={18} />
                        Đã phân nhóm ({seriesList.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('ungrouped')}
                        className={`flex-1 py-4 px-6 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                            activeTab === 'ungrouped' ? 'text-orange-600 bg-white border-b-2 border-orange-500' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        <Box size={18} />
                        Chưa phân nhóm ({ungrouped.length})
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="relative w-full md:max-w-md">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm tên sản phẩm, thương hiệu, hoặc Mã Dòng..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 h-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                    </div>
                </div>

                {/* Tab Content: Grouped */}
                {activeTab === 'grouped' && (
                    <div className="divide-y divide-gray-100">
                        {filteredGroupedKeys.length === 0 ? (
                            <div className="p-12 text-center text-gray-500">
                                Không tìm thấy nhóm biến thể nào.
                            </div>
                        ) : (
                            filteredGroupedKeys.map(seriesId => {
                                const groupProducts = grouped[seriesId];
                                return (
                                    <div key={seriesId} className="p-6 bg-white hover:bg-gray-50/50 transition-colors">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="p-2 bg-orange-100 text-orange-600 rounded-lg">
                                                <Layers size={20} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 text-lg">{seriesId}</h3>
                                                <p className="text-xs text-gray-500">{groupProducts.length} sản phẩm liên kết</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                            {groupProducts.map(p => (
                                                <div key={p.id} className="border border-gray-200 rounded-xl p-3 bg-white flex items-start gap-3 relative group">
                                                    <div className="w-16 h-16 relative bg-gray-50 rounded-lg border border-gray-100 flex-shrink-0">
                                                        {p.images?.[0] ? (
                                                            <Image src={p.images[0]} alt="" fill className="object-contain p-1" />
                                                        ) : (
                                                            <Box className="absolute inset-0 m-auto text-gray-300" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-sm text-gray-900 line-clamp-2" title={p.name}>{p.name}</p>
                                                        <p className="text-red-600 font-bold text-sm mt-1">{formatPrice(p.price_promo || p.price_original)}</p>
                                                        {p.stock !== undefined && (
                                                            <p className={`text-xs mt-0.5 ${p.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                                Kho: {p.stock}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <button 
                                                        onClick={() => handleRemoveFromGroup(p)}
                                                        className="absolute top-2 right-2 p-1.5 bg-white text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg shadow-sm border border-gray-100 opacity-0 group-hover:opacity-100 transition-all"
                                                        title="Gỡ khỏi nhóm"
                                                    >
                                                        <Link2Off size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* Tab Content: Ungrouped */}
                {activeTab === 'ungrouped' && (
                    <div className="p-0">
                        {/* Action Bar for Ungrouped */}
                        {selectedProductIds.length > 0 && (
                            <div className="sticky top-0 z-10 bg-orange-50 border-b border-orange-100 p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div className="text-sm font-semibold text-orange-800">
                                    Đã chọn {selectedProductIds.length} sản phẩm
                                </div>
                                <form onSubmit={handleAssignToGroup} className="flex gap-2 w-full md:w-auto">
                                    <input 
                                        type="text" 
                                        placeholder="Nhập Mã Dòng (seriesId)..." 
                                        value={newSeriesId}
                                        onChange={(e) => setNewSeriesId(e.target.value)}
                                        className="h-10 px-3 border border-orange-200 rounded-lg text-sm w-full md:w-64 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                        list="series-list"
                                        required
                                    />
                                    <datalist id="series-list">
                                        {seriesList.map(s => <option key={s} value={s} />)}
                                    </datalist>
                                    <button 
                                        type="submit"
                                        disabled={isAssigning}
                                        className="h-10 px-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg text-sm flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                                    >
                                        {isAssigning ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                                        Gom vào nhóm
                                    </button>
                                </form>
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                                        <th className="p-4 w-12 text-center">
                                            <button onClick={toggleSelectAll} className="text-gray-400 hover:text-orange-500">
                                                {filteredUngrouped.length > 0 && selectedProductIds.length === filteredUngrouped.length ? (
                                                    <CheckSquare size={18} className="text-orange-500" />
                                                ) : (
                                                    <Square size={18} />
                                                )}
                                            </button>
                                        </th>
                                        <th className="p-4 font-medium">Sản phẩm</th>
                                        <th className="p-4 font-medium">Thương hiệu</th>
                                        <th className="p-4 font-medium">Kho</th>
                                        <th className="p-4 font-medium text-right">Giá bán</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredUngrouped.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-12 text-center text-gray-500">
                                                Không có sản phẩm nào.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUngrouped.map(p => {
                                            const isSelected = selectedProductIds.includes(p.id);
                                            return (
                                                <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-orange-50/30' : ''}`}>
                                                    <td className="p-4 text-center">
                                                        <button onClick={() => toggleSelect(p.id)} className="text-gray-400 hover:text-orange-500">
                                                            {isSelected ? (
                                                                <CheckSquare size={18} className="text-orange-500" />
                                                            ) : (
                                                                <Square size={18} />
                                                            )}
                                                        </button>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-12 h-12 relative bg-gray-50 rounded border border-gray-100">
                                                                {p.images?.[0] && <Image src={p.images[0]} alt="" fill className="object-contain p-1" />}
                                                            </div>
                                                            <span className="font-medium text-sm text-gray-900 line-clamp-2">{p.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-sm text-gray-600">{p.brand || '-'}</td>
                                                    <td className="p-4 text-sm">
                                                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${p.stock && p.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                            {p.stock || 0}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-sm font-bold text-gray-900 text-right">
                                                        {formatPrice(p.price_promo || p.price_original)}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
