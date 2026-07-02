'use client';

import { useState, useEffect, useMemo } from 'react';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { Search, Users, Loader2, Star, TrendingUp, Plus, Download, Filter } from 'lucide-react';
import { collection, query, orderBy, limit, startAfter, DocumentSnapshot, doc, setDoc, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { onSnapshot, getDocs, getDoc } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import CustomerDetailDrawer from '@/components/admin/customers/CustomerDetailDrawer';
import CustomerFormModal, { CustomerFormData } from '@/components/admin/customers/CustomerFormModal';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { TierConfig } from '@/lib/customerTiers';
import type { Customer } from '@/lib/types';
import { buildContactMethods, buildContactSearchKeywords, getPrimaryContact } from '@/lib/contactIdentity';
import { reserveCustomerDocumentId } from '@/lib/customerDocumentIds';
import { normalizeVietnamPhone } from '@/lib/phone';
import { generateSearchKeywords } from '@/lib/utils';
import type { ContactMethod } from '@/lib/types/contact';

const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN').format(price) + 'đ';
const formatDate = (ts: unknown) => {
    if (!ts) return '—';
    const obj = ts as { toDate?: () => Date };
    const d = typeof obj.toDate === 'function' ? obj.toDate() : new Date(ts as string | number | Date);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function firstContactValue(methods: ContactMethod[] | undefined, type: ContactMethod['type']): string {
    return methods?.find(method => method.type === type)?.value || '';
}

function customerContactLabel(customer: Customer): string {
    const primary = customer.contactMethods?.find(method => method.isPrimary) || customer.contactMethods?.[0];
    return customer.phone || customer.primaryContactValue || primary?.value || customer.id;
}

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [hasDebtFilter, setHasDebtFilter] = useState(false);
    const [isSearchingDB, setIsSearchingDB] = useState(false);
    
    // Drawers & Modals
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [tiers, setTiers] = useState<TierConfig[]>([]);

    // Load dynamic tiers
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'system_config', 'tier_settings'), snap => {
            if (snap.exists() && snap.data().tiers) {
                setTiers(snap.data().tiers as TierConfig[]);
            }
        });
        return () => unsub();
    }, []);

    const calculateTier = (spent: number) => {
        if (!tiers || tiers.length === 0) return null;
        const sorted = [...tiers].sort((a, b) => b.minSpent - a.minSpent);
        return sorted.find(t => spent >= t.minSpent) || null;
    };

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
            toast.error('Vui lòng nhập từ khóa để tìm kiếm trên Server');
            return;
        }
        setIsSearchingDB(true);
        try {
            const keyword = searchQuery.trim();
            const phone = keyword.replace(/[^0-9]/g, '').trim();
            const docCandidates = Array.from(new Set([keyword, phone].filter(Boolean)));
            let docSnap: Awaited<ReturnType<typeof getDoc>> | null = null;

            for (const candidate of docCandidates) {
                const candidateSnap = await getDoc(doc(db, 'customers', candidate));
                if (candidateSnap.exists()) {
                    docSnap = candidateSnap;
                    break;
                }
            }

            if (docSnap?.exists()) {
                const foundCustomer = { id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) } as Customer;
                setCustomers(prev => {
                    const exists = prev.find(p => p.id === foundCustomer.id);
                    if (exists) return prev;
                    return [foundCustomer, ...prev];
                });
                toast.success('Đã tìm thấy KH từ Server!');
            } else {
                const searchKeyword = generateSearchKeywords(keyword)[0] || keyword.toLowerCase();
                const q = query(collection(db, 'customers'), where('searchKeywords', 'array-contains', searchKeyword), limit(10));
                const snap = await getDocs(q);
                if (snap.empty) {
                    toast.error('Không tìm thấy dữ liệu trên máy chủ cho từ khóa này.');
                    return;
                }
                const foundCustomers = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Customer[];
                setCustomers(prev => {
                    const existingIds = new Set(prev.map(p => p.id));
                    return [...foundCustomers.filter(customer => !existingIds.has(customer.id)), ...prev];
                });
                toast.success(`Đã tìm thấy ${foundCustomers.length} khách hàng từ Server`);
            }
        } catch (error) {
            console.error("Lỗi khi tìm kiếm trên database", error);
            toast.error('Có lỗi khi tìm kiếm.');
        } finally {
            setIsSearchingDB(false);
        }
    };

    const filteredCustomers = customers.filter((c) => {
        const q = searchQuery.toLowerCase();
        const contactValues = [
            c.phone,
            c.primaryContactValue,
            ...(c.contactMethods || []).flatMap(method => [method.value, method.normalizedValue]),
            ...(c.searchKeywords || []),
        ].filter(Boolean).join(' ').toLowerCase();
        const matchesSearch = !q ||
            c.id.includes(q) ||
            contactValues.includes(q) ||
            (c.name || '').toLowerCase().includes(q) ||
            (c.tags || []).some(t => t.toLowerCase().includes(q));
        const matchesType = !typeFilter || c.type === typeFilter;
        const matchesDebt = !hasDebtFilter || (c.totalDebt && c.totalDebt !== 0);
        return matchesSearch && matchesType && matchesDebt;
    });

    const { paginatedData, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredCustomers, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery, typeFilter]);

    // Unique tags for combobox
    const availableTags = useMemo(() => {
        const tagSet = new Set<string>();
        customers.forEach(c => c.tags?.forEach(t => tagSet.add(t)));
        return Array.from(tagSet);
    }, [customers]);

    // Stats
    const stats = {
        totalLoaded: customers.length,
        retail: customers.filter(c => c.type === 'retail' || !c.type).length,
        wholesale: customers.filter(c => c.type === 'wholesale').length,
    };

    // Save Customer
    const handleSaveCustomer = async (data: CustomerFormData) => {
        const contactInput = {
            name: data.name,
            phone: data.phone,
            zalo: data.zalo,
            facebook: data.facebook,
            email: data.email,
            address: data.address,
            note: data.note,
            other: data.otherContact,
            primaryType: data.primaryContactType,
            source: 'manual' as const,
        };
        const contactMethods = buildContactMethods(contactInput);
        const primaryContact = getPrimaryContact(contactMethods);
        const normalizedPhone = data.phone ? normalizeVietnamPhone(data.phone) : null;
        const customerId = editingCustomer?.id || await reserveCustomerDocumentId({
            name: data.name,
            phone: data.phone,
            zalo: data.zalo,
            facebook: data.facebook,
            email: data.email,
            address: data.address,
            note: data.note,
            other: data.otherContact,
            primaryType: data.primaryContactType,
            source: 'manual',
        });
        const ref = doc(db, 'customers', customerId);
        
        if (editingCustomer) {
            // Update
            await updateDoc(ref, {
                name: data.name,
                type: data.type,
                phone: normalizedPhone?.local || data.phone || '',
                primaryPhone: normalizedPhone?.local || '',
                primaryContactType: primaryContact?.type || null,
                primaryContactValue: primaryContact?.value || '',
                contactMethods,
                searchKeywords: buildContactSearchKeywords(contactInput, contactMethods),
                tags: data.tags || [],
                note: data.note || '',
                address: data.address || '',
                email: data.email || '',
                updatedAt: serverTimestamp()
            });
            toast.success('Đã cập nhật thông tin khách hàng');
        } else {
            // Check existence
            const snap = await getDoc(ref);
            if (snap.exists()) {
                throw new Error('Khách hàng này đã tồn tại trong hệ thống!');
            }
            // Create
            await setDoc(ref, {
                code: customerId,
                legacyPhoneId: normalizedPhone?.local || '',
                phone: normalizedPhone?.local || data.phone || '',
                primaryPhone: normalizedPhone?.local || '',
                name: data.name,
                type: data.type,
                primaryContactType: primaryContact?.type || null,
                primaryContactValue: primaryContact?.value || '',
                contactMethods,
                searchKeywords: buildContactSearchKeywords(contactInput, contactMethods),
                tags: data.tags || [],
                note: data.note || '',
                address: data.address || '',
                email: data.email || '',
                totalSpent: 0,
                totalOrders: 0,
                totalRepairs: 0,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastVisit: serverTimestamp(),
            });
            toast.success('Đã thêm khách hàng mới');
        }
    };

    const openAddModal = () => {
        setEditingCustomer(null);
        setIsFormOpen(true);
    };

    const openEditModal = (c: Customer, e: React.MouseEvent) => {
        e.stopPropagation(); // prevent opening drawer
        setEditingCustomer(c);
        setIsFormOpen(true);
    };

    // Export Excel
    const handleExportExcel = () => {
        if (filteredCustomers.length === 0) {
            toast.error('Không có dữ liệu để xuất');
            return;
        }
        
        const data = filteredCustomers.map(c => ({
            'Mã KH': c.id,
            'SĐT': c.phone,
            'Liên hệ chính': customerContactLabel(c),
            'Zalo': firstContactValue(c.contactMethods, 'zalo'),
            'Facebook': firstContactValue(c.contactMethods, 'facebook'),
            'Tên KH': c.name,
            'Loại KH': c.type === 'wholesale' ? 'Khách sỉ' : 'Khách lẻ',
            'Tags': c.tags?.join(', ') || '',
            'Tổng chi tiêu': c.totalSpent || 0,
            'Số đơn hàng': c.totalOrders || 0,
            'Số lần sửa chữa': c.totalRepairs || 0,
            'Lần mua/đến cuối': formatDate(c.lastOrderDate || c.lastVisit),
            'Email': c.email || '',
            'Địa chỉ': c.address || '',
            'Ghi chú': c.note || '',
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Khách hàng");
        XLSX.writeFile(wb, `Danh_sach_KH_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    if (loading && customers.length === 0) return (
        <div className="flex items-center justify-center h-[60vh]">
            <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Users className="text-orange-500" /> Quản lý khách hàng (CRM)
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">Danh sách, phân loại, tags và lịch sử giao dịch</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleExportExcel} className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-xl hover:bg-green-100 font-medium text-sm transition-colors border border-green-200">
                        <Download size={18} /> Xuất Excel
                    </button>
                    <button onClick={openAddModal} className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl hover:bg-orange-600 font-medium text-sm transition-colors">
                        <Plus size={18} /> Thêm khách hàng
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                        <Users size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Hiển thị</p>
                        <p className="text-xl font-bold text-gray-800">{stats.totalLoaded}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Khách lẻ</p>
                        <p className="text-xl font-bold text-gray-800">{stats.retail}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
                        <Star size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Khách sỉ / VIP</p>
                        <p className="text-xl font-bold text-gray-800">{stats.wholesale}</p>
                    </div>
                </div>
                <div className="bg-white rounded-xl border p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                        <Filter size={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-500">Thẻ (Tags)</p>
                        <p className="text-xl font-bold text-gray-800">{availableTags.length}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Tìm SĐT, tên, Zalo, Facebook hoặc Tag..."
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
                    title="Chọn loại khách hàng"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full md:w-48 h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none bg-white"
                >
                    <option value="">Tất cả loại KH</option>
                    <option value="retail">Khách lẻ</option>
                    <option value="wholesale">Khách sỉ</option>
                </select>
                <button
                    onClick={() => setHasDebtFilter(!hasDebtFilter)}
                    className={`h-11 px-4 rounded-lg font-medium transition-colors border whitespace-nowrap flex items-center justify-center ${hasDebtFilter ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                    Khách có nợ {hasDebtFilter ? '✅' : ''}
                </button>
            </div>

            {/* Customers Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Khách hàng</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Loại & Hạng</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Thông tin mở rộng</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Giao dịch</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Công nợ</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Hành động</th>
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
                            ) : paginatedData.map((customer) => {
                                const tier = calculateTier(customer.totalSpent || 0);
                                return (
                                <tr key={customer.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedCustomer(customer)}>
                                    <td className="px-6 py-4 align-top">
                                        <p className="text-sm font-bold text-gray-900 group-hover:text-orange-600">
                                            {customer.name || 'Khách lẻ'}
                                        </p>
                                        <p className="text-xs text-gray-500 font-mono mt-0.5">{customerContactLabel(customer)}</p>
                                        {customer.tags && customer.tags.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {customer.tags.map(tag => (
                                                    <span key={tag} className="px-1.5 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 text-[10px] rounded-md font-semibold">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        <div className="flex flex-col gap-1.5 items-start">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                                customer.type === 'wholesale' ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-green-100 text-green-700 border border-green-200'
                                            }`}>
                                                {customer.type === 'wholesale' ? 'SỈ / THỢ' : 'LẺ'}
                                            </span>
                                            {tier && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                                                    HẠNG: {tier.name.toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        <div className="text-xs text-gray-600 space-y-1">
                                            {customer.email && <p><span className="font-medium text-gray-500">Email:</span> {customer.email}</p>}
                                            {customer.address && <p><span className="font-medium text-gray-500">Địa chỉ:</span> <span className="line-clamp-1">{customer.address}</span></p>}
                                            {customer.note && <p className="text-orange-600 bg-orange-50 p-1 rounded inline-block max-w-xs truncate"><span className="font-medium">Lưu ý:</span> {customer.note}</p>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        <p className="text-sm font-bold text-orange-600">
                                            {formatPrice(customer.totalSpent || 0)}
                                        </p>
                                        <div className="flex gap-2 text-[11px] text-gray-500 mt-1 font-medium">
                                            <span>{customer.totalOrders || 0} ĐH</span>
                                            <span>•</span>
                                            <span>{customer.totalRepairs || 0} Sửa chữa</span>
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1">Gần nhất: {formatDate(customer.lastOrderDate || customer.lastVisit)}</p>
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        {customer.totalDebt && customer.totalDebt > 0 ? (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-bold text-red-600">{formatPrice(customer.totalDebt)}</span>
                                            </div>
                                        ) : customer.totalDebt && customer.totalDebt < 0 ? (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-bold text-green-600">Dư: {formatPrice(Math.abs(customer.totalDebt))}</span>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-gray-400 font-medium">Không có nợ</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 align-top">
                                        <button 
                                            onClick={(e) => openEditModal(customer, e)}
                                            className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                                        >
                                            Sửa
                                        </button>
                                    </td>
                                </tr>
                            )})}
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

            {/* Modals & Drawers */}
            <CustomerDetailDrawer
                customer={selectedCustomer}
                isOpen={!!selectedCustomer}
                onClose={() => setSelectedCustomer(null)}
            />

            <CustomerFormModal 
                isOpen={isFormOpen} 
                onClose={() => setIsFormOpen(false)} 
                onSave={handleSaveCustomer}
                initialData={editingCustomer as unknown as CustomerFormData}
                isEditMode={!!editingCustomer}
                availableTags={availableTags}
            />
        </div>
    );
}
