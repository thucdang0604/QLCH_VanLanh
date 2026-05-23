'use client';

import { useState, useEffect } from 'react';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { Search, Users, Loader2, Star, TrendingUp } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, limit, startAfter, getDocs, DocumentSnapshot, where, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Customer {
    id: string; // phone
    phone: string;
    name: string;
    type?: 'retail' | 'wholesale';
    totalSpent?: number;
    totalOrders?: number;
    lastOrderDate?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
}

const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN').format(price) + 'đ';
const formatDate = (ts: unknown) => {
    if (!ts) return '—';
    const obj = ts as { toDate?: () => Date };
    const d = typeof obj.toDate === 'function' ? obj.toDate() : new Date(ts as string | number | Date);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [isSearchingDB, setIsSearchingDB] = useState(false);

    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(true);

    // Fetch real-time recent customers
    useEffect(() => {
        const q = query(collection(db, 'customers'), orderBy('updatedAt', 'desc'), limit(50));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[];
            setCustomers(data);
            setLastDoc(snap.docs[snap.docs.length - 1] || null);
            setHasMore(snap.docs.length === 50);
            setLoading(false);
        }, (err) => {
            console.error('Customers fetch error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const loadMoreData = async () => {
        if (!lastDoc || !hasMore) return;
        setLoading(true);
        const q = query(collection(db, 'customers'), orderBy('updatedAt', 'desc'), startAfter(lastDoc), limit(50));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[];
            setCustomers(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const newItems = data.filter(d => !existingIds.has(d.id));
                return [...prev, ...newItems];
            });
            setLastDoc(snap.docs[snap.docs.length - 1]);
            setHasMore(snap.docs.length === 50);
        } else {
            setHasMore(false);
        }
        setLoading(false);
    };

    const searchInDatabase = async () => {
        if (!searchQuery.trim()) {
            alert('Vui lòng nhập SĐT để tìm kiếm trên Server');
            return;
        }
        setIsSearchingDB(true);
        try {
            // Because phone is the document ID, we can look up directly by ID
            const phone = searchQuery.trim();
            const docRef = doc(db, 'customers', phone);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const foundCustomer = { id: docSnap.id, ...docSnap.data() } as Customer;
                setCustomers(prev => {
                    const exists = prev.find(p => p.id === foundCustomer.id);
                    if (exists) return prev;
                    return [foundCustomer, ...prev];
                });
            } else {
                alert('Không tìm thấy dữ liệu trên máy chủ cho SĐT này.');
            }
        } catch (error) {
            console.error("Lỗi khi tìm kiếm trên database", error);
            alert('Có lỗi khi tìm kiếm.');
        } finally {
            setIsSearchingDB(false);
        }
    };

    const filteredCustomers = customers.filter((c) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch = !q ||
            c.id.includes(q) ||
            (c.name || '').toLowerCase().includes(q);
        const matchesType = !typeFilter || c.type === typeFilter;
        return matchesSearch && matchesType;
    });

    const { paginatedData, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredCustomers, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery, typeFilter]);

    // Stats based on currently loaded customers (good for quick view, but remember it's partial data)
    const stats = {
        totalLoaded: customers.length,
        retail: customers.filter(c => c.type === 'retail' || !c.type).length,
        wholesale: customers.filter(c => c.type === 'wholesale').length,
    };

    if (loading && customers.length === 0) return (
        <div className="flex items-center justify-center h-[60vh]">
            <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Users className="text-orange-500" /> Quản lý khách hàng
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">Danh sách khách hàng (CRM)</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <Users size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Khách hàng hiển thị</p>
                        <p className="text-xl font-bold text-gray-800">{stats.totalLoaded}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Khách lẻ</p>
                        <p className="text-xl font-bold text-gray-800">{stats.retail}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                        <Star size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Khách sỉ / VIP</p>
                        <p className="text-xl font-bold text-gray-800">{stats.wholesale}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Tìm theo Số điện thoại hoặc Tên..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                    />
                </div>
                {searchQuery.trim().length > 0 && filteredCustomers.length === 0 && (
                    <button 
                        onClick={searchInDatabase}
                        disabled={isSearchingDB}
                        className="h-11 px-4 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors whitespace-nowrap flex items-center gap-2 font-medium"
                    >
                        {isSearchingDB ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                        Tìm trên Server
                    </button>
                )}
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full md:w-48 h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none bg-white"
                >
                    <option value="">Loại khách hàng</option>
                    <option value="retail">Khách lẻ</option>
                    <option value="wholesale">Khách sỉ</option>
                </select>
            </div>

            {/* Customers Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Khách hàng</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Loại</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tổng chi tiêu</th>
                                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Số đơn hàng</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Lần mua cuối</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredCustomers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-16 text-gray-400">
                                        <Users size={48} className="mx-auto mb-3 opacity-50" />
                                        <p>Không có dữ liệu khách hàng</p>
                                    </td>
                                </tr>
                            ) : paginatedData.map((customer) => (
                                <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-gray-900">{customer.name || 'Khách lẻ'}</p>
                                        <p className="text-xs text-gray-500 font-mono mt-0.5">{customer.phone}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                            customer.type === 'wholesale' 
                                                ? 'bg-purple-100 text-purple-700' 
                                                : 'bg-green-100 text-green-700'
                                        }`}>
                                            {customer.type === 'wholesale' ? 'Sỉ' : 'Lẻ'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-orange-600">
                                        {formatPrice(customer.totalSpent || 0)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700 font-medium text-center">
                                        {customer.totalOrders || 0}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {formatDate(customer.lastOrderDate)}
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
                    totalAll={customers.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    entityLabel="khách hàng"
                />
                
                {hasMore && !searchQuery && (
                    <div className="p-4 border-t border-gray-100 flex justify-center">
                        <button 
                            onClick={loadMoreData}
                            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            Tải thêm danh sách cũ
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
