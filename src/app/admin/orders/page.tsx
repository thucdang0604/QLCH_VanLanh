'use client';

import { useState, useEffect } from 'react';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import {
    Search, Eye, X, Package, Truck, CheckCircle,
    XCircle, Clock, Loader2, ShoppingBag
} from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { collection, query, orderBy, onSnapshot, limit, startAfter, getDocs, DocumentSnapshot, where, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import PrintableWarranty, { WarrantyPrintPayload } from '@/components/admin/PrintableWarranty';
import type { ReceiptConfig } from '@/components/admin/PrintableReceipt';
import type { WarrantyTemplateConfig } from '@/app/admin/settings/receipt/WarrantyComponents';

import { Order } from '@/lib/types';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { Receipt } from 'lucide-react';
import { toastError, toastSuccess } from '@/lib/toast';


const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN').format(price) + 'đ';
const formatDate = (ts: unknown) => {
    if (!ts) return '—';
    const maybe = ts as { toDate?: () => Date };
    const d = typeof maybe?.toDate === 'function' ? maybe.toDate() : new Date(ts as string | number | Date);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

type OrderPaymentHistoryEntry = NonNullable<Order['paymentHistory']>[number];

function getPaymentMethodLabel(method?: string) {
    const normalized = String(method || '').toUpperCase();
    if (normalized === 'CASH' || normalized === 'COD') return 'Tiền mặt';
    if (normalized === 'BANK' || normalized === 'BANK_TRANSFER') return 'Chuyển khoản';
    if (normalized === 'MOMO') return 'MoMo';
    if (normalized === 'INSTALLMENT') return 'Trả góp';
    if (normalized === 'DEBT') return 'Ghi nợ';
    return method || 'Không rõ';
}

function getPaymentTypeLabel(entry: OrderPaymentHistoryEntry) {
    if (entry.type === 'debt_payment') return `Thu nợ lần ${entry.paymentIndex || ''}`.trim();
    if (entry.type === 'deposit') return 'Đặt cọc';
    if (entry.type === 'full') return 'Thanh toán đủ';
    if (entry.type === 'refund') return 'Hoàn tiền';
    return 'Thanh toán';
}

const statusConfig: Record<string, { color: string; icon: React.ComponentType<{ size?: number }>; label: string }> = {
    Pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Chờ xử lý' },
    Confirmed: { color: 'bg-blue-100 text-blue-700', icon: Package, label: 'Đã xác nhận' },
    Shipping: { color: 'bg-purple-100 text-purple-700', icon: Truck, label: 'Đang giao' },
    Completed: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Hoàn thành' },
    Cancelled: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Đã hủy' },
};

type OrderItemWithRepair = Order['items'][number] & {
    name?: string;
    product_name?: string;
    isRepairTicket?: boolean;
    repairTicketId?: string;
};

type OrderWithRepairPayment = Order & {
    containsRepairPayment?: boolean;
    repairTicketIds?: string[];
};

function isRepairPaymentOrder(order: Order) {
    const orderWithRepair = order as OrderWithRepairPayment;
    return orderWithRepair.containsRepairPayment === true
        || (order.items || []).some(item => {
            const line = item as OrderItemWithRepair;
            return line.isRepairTicket === true || Boolean(line.repairTicketId);
        });
}

export default function OrdersPage() {
    const { config } = useConfig();
    useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState<'all' | 'web' | 'pos'>('all');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [printTemplate, setPrintTemplate] = useState<'thermal' | 'a5'>('thermal');
    const [printWarrantyPayloads, setPrintWarrantyPayloads] = useState<{ payload: WarrantyPrintPayload, config: WarrantyTemplateConfig, type: 'device'|'accessory' }[] | null>(null);
    const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig | null>(null);

    const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [isSearchingDB, setIsSearchingDB] = useState(false);

    // Fetch orders realtime from Firestore with limit
    useEffect(() => {
        const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[];
            setOrders(data);
            setLastDoc(snap.docs[snap.docs.length - 1] || null);
            setHasMore(snap.docs.length === 50);
            setLoading(false);
        }, (err) => {
            console.error('Orders fetch error:', err);
            setLoading(false);
        });

        getDoc(doc(db, 'system_config', 'receipt')).then(snap => {
            if (snap.exists()) setReceiptConfig(snap.data() as ReceiptConfig);
        }).catch(console.error);

        return () => unsub();
    }, []);

    const loadMoreData = async () => {
        if (!lastDoc || !hasMore) return;
        setLoading(true);
        const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(50));
        const snap = await getDocs(q);

        if (!snap.empty) {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[];
            setOrders(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const newOrders = data.filter(d => !existingIds.has(d.id));
                return [...prev, ...newOrders];
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
            const qPhoneNew = query(collection(db, 'orders'), where('customer_info.phone', '==', searchQuery.trim()));

            const snap1 = await getDocs(qPhoneNew);
            const dataMap = new Map<string, Order>();
            snap1.docs.forEach(d => {
                dataMap.set(d.id, { id: d.id, ...d.data() } as Order);
            });

            const results = Array.from(dataMap.values());
            if(results.length > 0) {
                 setOrders(prev => {
                     const existingIds = new Set(prev.map(p => p.id));
                     const newOrders = results.filter(d => !existingIds.has(d.id));
                     return [...prev, ...newOrders];
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

    const updateStatus = async (orderId: string, newStatus: string) => {
        try {
            const order = orders.find(o => o.id === orderId)
                || (selectedOrder?.id === orderId ? selectedOrder : null);
            if (!order) return;
            if (order.status === newStatus) return;

            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch('/api/orders/transition', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    orderId,
                    targetStatus: newStatus,
                    idempotencyKey: crypto.randomUUID()
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Lỗi khi cập nhật trạng thái');
            }

            toastSuccess('Cập nhật trạng thái thành công');

            if (selectedOrder?.id === orderId) {
                setSelectedOrder(prev => {
                    if (!prev) return null;
                    const remaining = Math.max(0, (prev.total_amount || 0) - (prev.deposit_amount || 0));
                    const updatedHistory = [...(prev.paymentHistory || [])];
                    if (newStatus === 'Completed' && remaining > 0) {
                        updatedHistory.push({
                            type: 'full',
                            amount: remaining,
                            timestamp: Date.now(),
                            note: `Thanh toán phần còn lại khi hoàn tất đơn hàng`
                        });
                        return {
                            ...prev,
                            status: newStatus as Order['status'],
                            deposit_amount: prev.total_amount,
                            paymentHistory: updatedHistory
                        };
                    }
                    return { ...prev, status: newStatus as Order['status'] };
                });
            }
        } catch (err: unknown) {
            console.error('Update status error:', err);
            toastError((err as Error).message || 'Lỗi khi cập nhật');
        }
    };


    const handleUpdateImeis = async (orderId: string, itemIndex: number, imeis: string[]) => {
        try {
            const idToken = await (await import('@/lib/firebase')).getAuthInstance().then(a => a.currentUser?.getIdToken());
            const res = await fetch(`/api/orders/${orderId}/imei`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ itemIndex, imeis })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật IMEI');

            toastSuccess('Cập nhật IMEI thành công');

            if (selectedOrder?.id === orderId) {
                setSelectedOrder(prev => {
                    if (!prev) return null;
                    return { ...prev, items: data.items };
                });
            }
        } catch (err: unknown) {
            console.error(err);
            toastError((err as Error).message);
        }
    };

    const handlePrintWarranty = () => {
        if (!selectedOrder || !receiptConfig) return;
        const items = selectedOrder.items || [];
        const payloads: { payload: WarrantyPrintPayload, config: WarrantyTemplateConfig, type: 'device'|'accessory' }[] = [];

        let hasIncompleteImei = false;

        for (const item of items) {
            const it = item as { warrantyType?: string; quantity?: number; imeis?: string[]; name?: string; product_name?: string; price?: number };
            if (it.warrantyType === 'warrantyDevice' || it.warrantyType === 'warrantyAccessory') {
                const qty = it.quantity || 1;
                if (it.warrantyType === 'warrantyDevice' && (!it.imeis || it.imeis.length < qty || it.imeis.some((i: string) => !i.trim()))) {
                    hasIncompleteImei = true;
                    continue; // Skip or we can just stop
                }

                const wConfig = it.warrantyType === 'warrantyDevice'
                    ? receiptConfig.warrantyDevice
                    : receiptConfig.warrantyAccessory;
                if (!wConfig) continue;

                for(let i = 0; i < qty; i++) {
                    payloads.push({
                        config: wConfig,
                        type: it.warrantyType === 'warrantyDevice' ? 'device' : 'accessory',
                        payload: {
                            customerName: selectedOrder.customer?.name || selectedOrder.customer_info?.name || 'Khách lẻ',
                            customerPhone: selectedOrder.customer?.phone || selectedOrder.customer_info?.phone || '—',
                            deviceModel: it.name || it.product_name || '',
                            deviceImei: it.imeis?.[i] || '—',
                            totalCost: it.price || 0,
                            createdAt: selectedOrder.createdAt
                        }
                    });
                }
            }
        }

        if (hasIncompleteImei) {
            toastError('Vui lòng cập nhật đầy đủ số IMEI/Serial cho các thiết bị cần bảo hành!');
            return;
        }

        if (payloads.length === 0) {
            toastError('Đơn hàng không có sản phẩm bảo hành');
            return;
        }

        setPrintWarrantyPayloads(payloads);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    window.print();
                    setTimeout(() => setPrintWarrantyPayloads(null), 1000);
                }, 300);
            });
        });
    };

    const filteredOrders = orders.filter((o) => {
        const q = searchQuery.toLowerCase();
        // Look for customer (old format) or customer_info (new format)
        const cName = o.customer?.name || o.customer_info?.name || '';
        const cPhone = o.customer?.phone || o.customer_info?.phone || '';

        const matchesSearch = !q ||
            o.id.toLowerCase().includes(q) ||
            cName.toLowerCase().includes(q) ||
            cPhone.includes(searchQuery);
        const matchesStatus = !statusFilter || o.status === statusFilter;
        const matchesSource = sourceFilter === 'all' ||
            (sourceFilter === 'web' && o.source === 'web') ||
            (sourceFilter === 'pos' && o.source === 'pos');
        return matchesSearch && matchesStatus && matchesSource;
    });

    const { paginatedData: paginatedOrders, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredOrders, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery, statusFilter, sourceFilter]);

    // Stats
    const stats = {
        total: orders.length,
        pending: orders.filter(o => o.status === 'Pending').length,
        completed: orders.filter(o => o.status === 'Completed').length,
        revenue: orders.filter(o => o.status === 'Completed').reduce((s, o) => s + (o.total_amount || 0), 0),
    };

    if (loading) return (
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
                        <ShoppingBag className="text-orange-500" /> Quản lý đơn hàng
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">Tổng cộng {stats.total} đơn hàng</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Tổng đơn</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Chờ xử lý</p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Hoàn thành</p>
                    <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Doanh thu</p>
                    <p className="text-lg font-bold text-orange-600">{formatPrice(stats.revenue)}</p>
                </div>
            </div>

            {/* Source Tabs */}
            {(() => {
                const webCount = orders.filter(o => o.source === 'web').length;
                const posCount = orders.filter(o => o.source === 'pos').length;
                const webPending = orders.filter(o => o.source === 'web' && o.status === 'Pending').length;
                return (
                    <div className="flex gap-2 flex-wrap">
                        {[
                            { key: 'all' as const, label: 'Tất cả', count: orders.length, icon: '🔍' },
                            { key: 'web' as const, label: 'Website', count: webCount, icon: '🌐', pending: webPending },
                            { key: 'pos' as const, label: 'POS', count: posCount, icon: '🔑' },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setSourceFilter(tab.key)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                                    sourceFilter === tab.key
                                        ? 'bg-orange-500 text-white shadow-sm'
                                        : 'bg-white border text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <span>{tab.icon}</span>
                                <span>{tab.label}</span>
                                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                                    sourceFilter === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                                }`}>{tab.count}</span>
                                {tab.pending && tab.pending > 0 && sourceFilter !== tab.key && (
                                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white animate-pulse">
                                        {tab.pending} mới
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                );
            })()}

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Tìm theo mã đơn, SĐT..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                    />
                </div>
                {searchQuery.trim().length > 0 && filteredOrders.length === 0 && (
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
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    title="Lọc theo trạng thái"
                    aria-label="Lọc theo trạng thái"
                    className="w-full md:w-48 h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none bg-white"
                >
                    <option value="">Tất cả trạng thái</option>
                    {Object.entries(statusConfig).map(([key, value]) => (
                        <option key={key} value={key}>{value.label}</option>
                    ))}
                </select>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                {/* Mobile View */}
                <div className="block md:hidden divide-y divide-gray-100">
                    {filteredOrders.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <ShoppingBag size={48} className="mx-auto mb-3 opacity-50" />
                            <p>Không có đơn hàng nào</p>
                        </div>
                    ) : paginatedOrders.map((order) => {
                        const status = statusConfig[order.status] || statusConfig.Pending;
                        const StIcon = status.icon;
                        const cName = order.customer?.name || order.customer_info?.name || 'Khách lẻ';
                        const cPhone = order.customer?.phone || order.customer_info?.phone || '—';
                        return (
                            <div key={order.id} className="p-4 space-y-3 bg-white hover:bg-gray-50 transition-colors">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-sm font-bold text-gray-900">#{order.id.slice(-6).toUpperCase()}</span>
                                            {order.is_vat_exported && (
                                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-[10px] uppercase font-bold rounded">VAT</span>
                                            )}
                                            {order.source === 'pos' && (
                                                <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 text-[10px] uppercase font-bold rounded">POS</span>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-gray-900">{cName}</p>
                                        <p className="text-xs text-gray-500">{cPhone}</p>
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap ${status.color}`}>
                                        <StIcon size={12} />
                                        {status.label}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm bg-gray-50/50 p-2.5 rounded-lg border border-gray-50">
                                    <div>
                                        <p className="text-[11px] text-gray-500 uppercase font-medium">Tổng tiền</p>
                                        <p className="font-bold text-orange-600">{formatPrice(order.total_amount || 0)}</p>
                                    </div>
                                    <div className="text-right">
                                            <p className="text-[11px] text-gray-500 uppercase font-medium">Ngày tạo</p>
                                        <p className="text-gray-700 font-medium text-xs">{formatDate(order.createdAt)}</p>
                                    </div>
                                </div>
                                <div className="pt-1">
                                    <button
                                        onClick={() => setSelectedOrder(order)}
                                        className="w-full py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors border border-gray-200 active:bg-gray-50"
                                    >
                                        <Eye size={16} /> Xem chi tiết đơn hàng
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mã đơn</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Khách hàng</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tổng tiền</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Thanh toán</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ngày tạo</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Hình động</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-16 text-gray-400">
                                        <ShoppingBag size={48} className="mx-auto mb-3 opacity-50" />
                                        <p>Không có đơn hàng nào</p>
                                    </td>
                                </tr>
                            ) : paginatedOrders.map((order) => {
                                const status = statusConfig[order.status] || statusConfig.Pending;
                                const StIcon = status.icon;
                                const cName = order.customer?.name || order.customer_info?.name || 'Khách lẻ';
                                const cPhone = order.customer?.phone || order.customer_info?.phone || '—';
                                return (
                                    <tr key={order.id} className="hover:bg-gray-50">
                                        <td className="padding-6 py-4">
                                            <span className="font-mono text-sm text-gray-700">#{order.id.slice(-6).toUpperCase()}</span>
                                            {order.is_vat_exported && (
                                                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded">VAT</span>
                                            )}
                                            {order.source === 'pos' && (
                                                <span className="ml-1 px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded">POS</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-medium text-gray-900">{cName}</p>
                                            <p className="text-xs text-gray-500">{cPhone}</p>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{formatPrice(order.total_amount || 0)}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{order.payment_method || '—'}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-full ${status.color}`}>
                                                <StIcon size={14} />
                                                {status.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{formatDate(order.createdAt)}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => setSelectedOrder(order)}
                                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                                    title="Xem chi tiết"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <PaginationBar
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalFiltered={totalFiltered}
                    totalAll={orders.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    entityLabel="đơn hàng"
                />

                {hasMore && !searchQuery && (
                    <div className="p-4 border-t border-gray-100 flex justify-center">
                        <button
                            onClick={loadMoreData}
                            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            Tải thêm lịch sử cũ
                        </button>
                    </div>
                )}
            </div>

            {/* Order Detail Modal */}
            {selectedOrder && (
                <Modal isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} size="2xl" priority="high">

                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-4 md:p-6 border-b shrink-0 bg-white sticky top-0 rounded-t-2xl z-10">
                            <div>
                                <h2 className="text-lg md:text-xl font-bold text-gray-900">Chi tiết đơn hàng</h2>
                                <p className="text-gray-500 text-sm font-mono mt-0.5">#{selectedOrder.id.slice(-6).toUpperCase()}</p>
                            </div>
                            <button title="Đóng" aria-label="Đóng" onClick={() => setSelectedOrder(null)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                                <X size={20} className="text-gray-600" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-5">
                            {/* Status */}
                            <div className="flex items-center justify-between">
                                {(() => {
                                    const st = statusConfig[selectedOrder.status] || statusConfig.Pending;
                                    const StI = st.icon;
                                    return (
                                        <span className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full ${st.color}`}>
                                            <StI size={18} />
                                            {st.label}
                                        </span>
                                    );
                                })()}
                                <select
                                    disabled
                                    value={selectedOrder.status}
                                    onChange={(e) => updateStatus(selectedOrder.id, e.target.value)}
                                    title="Cập nhật trạng thái"
                                    aria-label="Cập nhật trạng thái"
                                    className="hidden"
                                >
                                    {Object.entries(statusConfig).map(([key, value]) => (
                                        <option key={key} value={key}>{value.label}</option>
                                    ))}
                                </select>
                                <div className="flex flex-col items-end gap-2 text-right">
                                    <span className="text-xs font-medium text-gray-500">
                                        Trạng thái do hệ thống cập nhật
                                    </span>
                                    {isRepairPaymentOrder(selectedOrder) && (
                                        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                            Receipt thanh toán sửa chữa
                                        </span>
                                    )}
                                    {(selectedOrder.paymentStatus === 'debt' || selectedOrder.payment_method === 'Debt') && (
                                        <span className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                                            Ghi nợ - chờ thu
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Customer Info */}
                            <div className="bg-gray-50 rounded-xl p-4">
                                <h3 className="font-semibold text-gray-900 mb-3">Thông tin khách hàng</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">Họ tên:</span>
                                        <span className="ml-2 font-medium">{selectedOrder.customer?.name || selectedOrder.customer_info?.name || 'KhĂ¡ch láº»'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">SĐT:</span>
                                        <span className="ml-2 font-medium">{selectedOrder.customer?.phone || selectedOrder.customer_info?.phone || '—'}</span>
                                    </div>
                                    {(selectedOrder.customer?.email || selectedOrder.customer_info?.email) && (
                                        <div className="col-span-2">
                                            <span className="text-gray-500">Email:</span>
                                            <span className="ml-2 font-medium">{selectedOrder.customer?.email || selectedOrder.customer_info?.email}</span>
                                        </div>
                                    )}
                                    {selectedOrder.createdByName && (
                                        <div className="col-span-2">
                                            <span className="text-gray-500">Người tạo:</span>
                                            <span className="ml-2 font-medium">{selectedOrder.createdByName}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Order Items */}
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-3">Chi tiết sản phẩm</h3>
                                <div className="space-y-3">
                                    {selectedOrder.items?.map((item, index: number) => {
                                        const it = item as Partial<OrderItemWithRepair & { productName: string; quantity: number; price: number; warrantyType: string; imeis: string[]; productId: string }>;
                                        const qty = it.quantity || 0;
                                        const price = it.price || 0;
                                        const itemName = it.name || it.productName || it.product_name || it.productId || 'Sản phẩm';
                                        return (
                                        <div key={index} className="flex flex-col py-3 border-b">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium text-gray-900">{itemName}</p>
                                                    <p className="text-sm text-gray-500">SL: {qty} x {formatPrice(price)}</p>
                                                    {(it.isRepairTicket || it.repairTicketId) && (
                                                        <p className="mt-1 text-xs font-medium text-blue-700">
                                                            Phiếu sửa chữa{it.repairTicketId ? ` #${it.repairTicketId.slice(-6).toUpperCase()}` : ''}
                                                        </p>
                                                    )}
                                                </div>
                                                <p className="font-medium text-gray-900">{formatPrice(price * qty)}</p>
                                            </div>
                                            {it.warrantyType === 'warrantyDevice' && (
                                                <div className="mt-3 pt-3 border-t border-dashed">
                                                    <p className="text-xs font-semibold text-gray-700 mb-2">Thông tin IMEI/Serial ({qty})</p>
                                                    <div className="space-y-2">
                                                        {Array.from({ length: qty }).map((_, i) => (
                                                            <div key={i} className="flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder={`Nhập IMEI/Serial #${i + 1}`}
                                                                    defaultValue={it.imeis?.[i] || ''}
                                                                    onBlur={(e) => {
                                                                        const newImeis = [...(it.imeis || [])];
                                                                        const val = e.target.value.trim();
                                                                        if (newImeis[i] !== val) {
                                                                            newImeis[i] = val;
                                                                            handleUpdateImeis(selectedOrder.id, index, newImeis);
                                                                        }
                                                                    }}
                                                                    className="flex-1 text-sm py-1.5 px-3 border rounded uppercase focus:border-orange-500 outline-none"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        );
                                    })}
                                </div>
                                {(selectedOrder.discount_amount || 0) > 0 && (
                                    <div className="flex justify-between items-center pt-2 text-sm text-green-600">
                                        <span>Giảm giá</span>
                                        <span>-{formatPrice(selectedOrder.discount_amount || 0)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-4 text-lg font-bold">
                                    <span>Tổng cộng:</span>
                                    <span className="text-red-600">{formatPrice(selectedOrder.total_amount || 0)}</span>
                                </div>
                                {(selectedOrder.deposit_amount || 0) > 0 && (
                                    selectedOrder.paymentStatus === 'paid' ? (
                                        <div className="flex justify-between items-center pt-2 text-base font-semibold text-gray-700">
                                            <span>Đã thanh toán:</span>
                                            <span>{formatPrice(selectedOrder.total_amount || 0)}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-center pt-2 text-base font-semibold text-gray-700">
                                                <span>Đã cọc:</span>
                                                <span>{formatPrice(selectedOrder.deposit_amount || 0)}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 text-lg font-bold text-orange-600">
                                                <span>Còn lại:</span>
                                                <span>{formatPrice(Math.max(0, (selectedOrder.total_amount || 0) - (selectedOrder.deposit_amount || 0)))}</span>
                                            </div>
                                        </>
                                    )
                                )}
                            </div>

                            {(selectedOrder.paymentHistory || []).length > 0 && (
                                <div className="bg-white rounded-xl border p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                            <Clock size={17} className="text-blue-500" /> Lịch sử thanh toán
                                        </h3>
                                        <span className="text-xs font-semibold text-gray-500">
                                            {(selectedOrder.paymentHistory || []).length} lần ghi nhận
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {(selectedOrder.paymentHistory || []).map((entry, index) => {
                                            const amount = Number(entry.amount) || 0;
                                            const paidAfter = Number(entry.paidAfter);
                                            const remainingAfter = Number(entry.remainingAfter);
                                            return (
                                                <div key={`${entry.timestamp || index}-${amount}`} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="font-semibold text-gray-800">{getPaymentTypeLabel(entry)}</span>
                                                        <span className={`font-bold ${entry.type === 'refund' ? 'text-red-600' : 'text-green-600'}`}>
                                                            {entry.type === 'refund' ? '-' : '+'}{formatPrice(amount)}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 grid grid-cols-1 md:grid-cols-3 gap-1 text-xs text-gray-500">
                                                        <span>{formatDate(entry.timestamp || entry.date)}</span>
                                                        <span>{getPaymentMethodLabel(entry.method)}</span>
                                                        {Number.isFinite(remainingAfter) && (
                                                            <span className="md:text-right">Còn lại: {formatPrice(remainingAfter)}</span>
                                                        )}
                                                    </div>
                                                    {Number.isFinite(paidAfter) && (
                                                        <div className="mt-1 text-xs text-gray-500">
                                                            Đã thanh toán lũy kế: {formatPrice(paidAfter)}
                                                        </div>
                                                    )}
                                                    {entry.note && (
                                                        <div className="mt-1 text-xs text-gray-500">{entry.note}</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-col md:flex-row items-center gap-3 pt-4 border-t sticky bottom-0 bg-white mt-auto">
                                <select
                                    className="w-full md:w-auto p-3 md:p-2.5 border rounded-xl md:rounded-lg bg-gray-50 font-medium outline-none cursor-pointer text-center text-sm"
                                    value={printTemplate}
                                    onChange={e => setPrintTemplate(e.target.value as 'thermal' | 'a5')}
                                    title="Chọn khổ in"
                                    aria-label="Chọn khổ in"
                                >
                                    <option value="thermal">Khổ 80mm</option>
                                    <option value="a5">Khá»• A5</option>
                                </select>
                                <button
                                    onClick={() => {
                                        if (!selectedOrder) return;
                                        const cName = selectedOrder.customer?.name || selectedOrder.customer_info?.name || 'KhĂ¡ch láº»';
                                        const cPhone = selectedOrder.customer?.phone || selectedOrder.customer_info?.phone || '';
                                        const dateStr = formatDate(selectedOrder.createdAt);

                                        if (printTemplate === 'thermal') {
                                            const itemsHtml = selectedOrder.items?.map((item) => {
                                                const it = item as Partial<{ name: string; product_name: string; quantity: number; price: number }>;
                                                const qty = it.quantity || 0;
                                                const price = it.price || 0;
                                                return `
                                                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                                    <div>${it.name || it.product_name}<br/><span style="color: #666;">SL: ${qty} x ${price.toLocaleString('vi-VN')}</span></div>
                                                    <div>${(price * qty).toLocaleString('vi-VN')}</div>
                                                </div>
                                            `;
                                            }).join('') || '';

                                            const receiptHtml = `
                                                <html>
                                                <head>
                                                    <title>Hóa đơn bán hàng #${selectedOrder.id.slice(-6).toUpperCase()}</title>
                                                    <style>
                                                        @page { size: 80mm auto; margin: 0; }
                                                        body { font-family: monospace; font-size: 11px; width: 302px; margin: 0 auto; padding: 12px; box-sizing: border-box; }
                                                        .text-center { text-align: center; }
                                                        .text-right { text-align: right; }
                                                        .font-bold { font-weight: bold; }
                                                        hr { border-top: 1px dashed #000; border-bottom: none; margin: 8px 0; }
                                                    </style>
                                                </head>
                                                <body>
                                                    <div class="text-center font-bold" style="font-size: 14px; text-transform: uppercase;">${config.siteName || 'VÄƒn LĂ nh Service'}</div>
                                                    <div class="text-center">Hotline: ${config.contact_info?.main_phone || '0932.242.026'}</div>
                                                    <div class="text-center font-bold" style="margin-top: 8px;">HÓA ĐƠN BÁN HÀNG</div>
                                                    <div class="text-center">${dateStr} | #${selectedOrder.id.slice(-6).toUpperCase()}</div>
                                                    <hr/>
                                                    <div>KH: ${cName}</div>
                                                    ${cPhone ? `<div>SĐT: ${cPhone}</div>` : ''}
                                                    <hr/>
                                                    ${itemsHtml}
                                                    <hr/>
                                                    <div style="display: flex; justify-content: space-between;">
                                                        <span>Tổng cộng:</span>
                                                        <span class="font-bold">${(selectedOrder.total_amount || 0).toLocaleString('vi-VN')}đ</span>
                                                    </div>
                                                    ${(selectedOrder.deposit_amount || 0) > 0 ? (
                                                        selectedOrder.status === 'Completed' ? `
                                                        <div style="display: flex; justify-content: space-between;">
                                                            <span>Đã thanh toán:</span>
                                                            <span class="font-bold">${(selectedOrder.total_amount || 0).toLocaleString('vi-VN')}đ</span>
                                                        </div>` : `
                                                        <div style="display: flex; justify-content: space-between;">
                                                            <span>Đã cọc:</span>
                                                            <span>${(selectedOrder.deposit_amount || 0).toLocaleString('vi-VN')}đ</span>
                                                        </div>
                                                        <div style="display: flex; justify-content: space-between;" class="font-bold">
                                                            <span>Còn lại:</span>
                                                            <span>${Math.max(0, (selectedOrder.total_amount || 0) - (selectedOrder.deposit_amount || 0)).toLocaleString('vi-VN')}đ</span>
                                                        </div>`
                                                    ) : ''}
                                                    <hr/>
                                                    <div class="text-center" style="margin-top: 16px;"><i>Cảm ơn quý khách!</i></div>
                                                </body>
                                                </html>
                                            `;
                                            const w = window.open('', '_blank');
                                            w?.document.write(receiptHtml);
                                            w?.document.close();
                                            w?.focus();
                                            setTimeout(() => w?.print(), 300);
                                        } else {
                                            const receiptHtml = `
                                                <html>
                                                <head>
                                                    <title>Hóa đơn bán hàng #${selectedOrder.id.slice(-6).toUpperCase()}</title>
                                                    <style>
                                                        body { font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.4; padding: 20px; color: #000; }
                                                        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                                                        .store-info h2 { margin: 0 0 5px 0; font-size: 18px; text-transform: uppercase; }
                                                        .store-info p { margin: 2px 0; }
                                                        .title { text-align: center; margin: 20px 0; }
                                                        .title h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
                                                        .info-row { display: flex; margin-bottom: 5px; }
                                                        .info-row .label { width: 120px; font-weight: bold; }
                                                        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                                                        table, th, td { border: 1px solid #000; }
                                                        th, td { padding: 8px; text-align: left; }
                                                        th { text-align: center; font-weight: bold; }
                                                        .text-right { text-align: right; }
                                                        .text-center { text-align: center; }
                                                        .summary { width: 300px; margin-left: auto; }
                                                        .summary-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
                                                        .summary-row.bold { font-weight: bold; }
                                                        .signatures { display: flex; justify-content: space-around; margin-top: 50px; text-align: center; }
                                                        .signatures p.title { margin: 0 0 70px 0; font-weight: bold; }
                                                        @media print {
                                                            @page { size: A5; margin: 15mm; }
                                                            body { width: 100%; margin: 0; padding: 0; }
                                                        }
                                                    </style>
                                                </head>
                                                <body>
                                                    <div class="header">
                                                        <div class="store-info">
                                                            <h2>${config.siteName || 'VÄ‚N LĂ€NH SERVICE'}</h2>
                                                            <p><b>Địa chỉ:</b> ${config.contact_info?.address || '11 Nguyên Hồng, Bình Lợi Trung (P11 cũ), Bình Thạnh, HCM'}</p>
                                                            <p><b>Điện thoại:</b> ${config.contact_info?.main_phone || '0932.242.026'}</p>
                                                        </div>
                                                        <div style="text-align: right;">
                                                            <p><b>Số:</b> #${selectedOrder.id.slice(-6).toUpperCase()}</p>
                                                            <p><b>Ngày:</b> ${dateStr}</p>
                                                            <p><b>Nhân viên:</b> ${selectedOrder.createdByName || 'Admin'}</p>
                                                        </div>
                                                    </div>

                                                    <div class="title">
                                                        <h1>HÓA ĐƠN BÁN HÀNG</h1>
                                                    </div>

                                                    <div>
                                                            <div class="info-row"><div class="label">Khách hàng:</div><div><b>${cName}</b></div></div>
                                                        <div class="info-row"><div class="label">Điện thoại:</div><div>${cPhone}</div></div>
                                                        <div class="info-row"><div class="label">Hình thức TT:</div><div>${selectedOrder.payment_method === 'COD' ? 'Tiền mặt' : selectedOrder.payment_method === 'Installment' ? 'Trả góp' : 'Chuyển khoản / Momo'}</div></div>
                                                    </div>

                                                    <table>
                                                        <thead>
                                                            <tr>
                                                                <th style="width: 40px;">STT</th>
                                                                <th>Tên Hàng Hóa / Dịch Vụ</th>
                                                                <th style="width: 60px;">SL</th>
                                                                <th style="width: 100px;">Đơn Giá</th>
                                                                <th style="width: 120px;">Thành Tiền</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            ${selectedOrder.items?.map((item, i: number) => {
                                                                const it = item as Partial<{ name: string; product_name: string; quantity: number; price: number }>;
                                                                const qty = it.quantity || 0;
                                                                const price = it.price || 0;
                                                                return `
                                                            <tr>
                                                                <td class="text-center">${i + 1}</td>
                                                                <td>${it.name || it.product_name}</td>
                                                                <td class="text-center">${qty}</td>
                                                                <td class="text-right">${price.toLocaleString('vi-VN')}</td>
                                                                <td class="text-right">${(price * qty).toLocaleString('vi-VN')}</td>
                                                            </tr>
                                                            `;
                                                            }).join('') || ''}
                                                        </tbody>
                                                    </table>

                                                    <div class="summary">
                                                        <div class="summary-row"><span>Tổng tiền hàng:</span><span>${(selectedOrder.total_amount || 0).toLocaleString('vi-VN')} đ</span></div>
                                                        ${(selectedOrder.discount_amount || 0) > 0 ? `<div class="summary-row"><span>Chiết khấu:</span><span>- ${(selectedOrder.discount_amount || 0).toLocaleString('vi-VN')} đ</span></div>` : ''}
                                                        <div class="summary-row bold" style="font-size: 16px; margin-top: 5px; border-top: 1px dotted #ccc; padding-top: 5px;">
                                                            <span>Tổng thanh toán:</span><span>${(selectedOrder.total_amount || 0).toLocaleString('vi-VN')} đ</span>
                                                        </div>
                                                        ${(selectedOrder.deposit_amount || 0) > 0 ? (
                                                            selectedOrder.status === 'Completed' ? `
                                                            <div class="summary-row" style="margin-top: 5px;"><span>Đã thanh toán:</span><span>${(selectedOrder.total_amount || 0).toLocaleString('vi-VN')} đ</span></div>` : `
                                                            <div class="summary-row" style="margin-top: 5px;"><span>Đã cọc:</span><span>${(selectedOrder.deposit_amount || 0).toLocaleString('vi-VN')} đ</span></div>
                                                            <div class="summary-row bold" style="color: red; font-size: 16px;"><span>Còn lại:</span><span>${Math.max(0, (selectedOrder.total_amount || 0) - (selectedOrder.deposit_amount || 0)).toLocaleString('vi-VN')} đ</span></div>`
                                                        ) : ''}
                                                    </div>

                                                    <div class="signatures">
                                                        <div>
                                                            <p class="title">Khách hàng</p>
                                                            <p style="color: #666; font-style: italic;">(Ký, ghi rõ họ tên)</p>
                                                        </div>
                                                        <div>
                                                            <p class="title">Người lập phiếu</p>
                                                            <p style="color: #666; font-style: italic;">(Ký, ghi rõ họ tên)</p>
                                                        </div>
                                                    </div>
                                                </body>
                                                </html>
                                            `;
                                            const w = window.open('', '_blank');
                                            w?.document.write(receiptHtml);
                                            w?.document.close();
                                            w?.focus();
                                            setTimeout(() => w?.print(), 500);
                                        }
                                    }}
                                    className="px-4 md:px-5 py-2.5 md:py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl md:rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 flex-1 md:flex-none"
                                >
                                    <Receipt size={18} /> In hóa đơn
                                </button>
                                <button
                                    onClick={handlePrintWarranty}
                                    className="px-4 md:px-5 py-2.5 md:py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl md:rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 flex-1 md:flex-none"
                                >
                                    In bảo hành
                                </button>
                            </div>
                        </div>
                    </Modal>
            )}

            {/* Print Warranty Template */}
            {printWarrantyPayloads && receiptConfig && (
                <div className="hidden print:block">
                    {printWarrantyPayloads.map((pw, i) => (
                        <div key={i} className={i < printWarrantyPayloads.length - 1 ? 'break-after-page' : 'break-after-auto'}>
                            <PrintableWarranty
                                payload={pw.payload}
                                globalConfig={receiptConfig}
                                warrantyConfig={pw.config}
                                type={pw.type}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

