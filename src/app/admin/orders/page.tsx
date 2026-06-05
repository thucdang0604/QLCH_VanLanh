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


const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN').format(price) + 'Ä‘';
const formatDate = (ts: unknown) => {
    if (!ts) return 'â€”';
    const maybe = ts as { toDate?: () => Date };
    const d = typeof maybe?.toDate === 'function' ? maybe.toDate() : new Date(ts as string | number | Date);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusConfig: Record<string, { color: string; icon: React.ComponentType<{ size?: number }>; label: string }> = {
    Pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Chá» xá»­ lĂ½' },
    Confirmed: { color: 'bg-blue-100 text-blue-700', icon: Package, label: 'ÄĂ£ xĂ¡c nháº­n' },
    Shipping: { color: 'bg-purple-100 text-purple-700', icon: Truck, label: 'Äang giao' },
    Completed: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'HoĂ n thĂ nh' },
    Cancelled: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'ÄĂ£ há»§y' },
};

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
            alert('Vui lĂ²ng nháº­p SÄT Ä‘á»ƒ tĂ¬m kiáº¿m trĂªn Server');
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
                alert('KhĂ´ng tĂ¬m tháº¥y dá»¯ liá»‡u trĂªn mĂ¡y chá»§ cho SÄT nĂ y.');
            }
        } catch (error) {
            console.error("Lá»—i khi tĂ¬m kiáº¿m trĂªn database", error);
            alert('CĂ³ lá»—i khi tĂ¬m kiáº¿m.');
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
                throw new Error(data.error || 'LĂ¡Â»â€”i khi cĂ¡ÂºÂ­p nhĂ¡ÂºÂ­t trĂ¡ÂºÂ¡ng thÄ‚Â¡i');
            }

            toastSuccess('CĂ¡ÂºÂ­p nhĂ¡ÂºÂ­t trĂ¡ÂºÂ¡ng thÄ‚Â¡i thÄ‚Â nh cÄ‚Â´ng');

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
                            note: `Thanh toÄ‚Â¡n phĂ¡ÂºÂ§n cÄ‚Â²n lĂ¡ÂºÂ¡i khi hoÄ‚Â n tĂ¡ÂºÂ¥t Ă„â€˜Ă†Â¡n hÄ‚Â ng`
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
            toastError((err as Error).message || 'Lá»—i khi cáº­p nháº­t');
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
            if (!res.ok) throw new Error(data.error || 'Lá»—i cáº­p nháº­t IMEI');

            toastSuccess('Cáº­p nháº­t IMEI thĂ nh cĂ´ng');

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
                            customerName: selectedOrder.customer?.name || selectedOrder.customer_info?.name || 'KhĂ¡ch láº»',
                            customerPhone: selectedOrder.customer?.phone || selectedOrder.customer_info?.phone || 'â€”',
                            deviceModel: it.name || it.product_name || '',
                            deviceImei: it.imeis?.[i] || 'â€”',
                            totalCost: it.price || 0,
                            createdAt: selectedOrder.createdAt
                        }
                    });
                }
            }
        }

        if (hasIncompleteImei) {
            toastError('Vui lĂ²ng cáº­p nháº­t Ä‘áº§y Ä‘á»§ sá»‘ IMEI/Serial cho cĂ¡c thiáº¿t bá»‹ cáº§n báº£o hĂ nh!');
            return;
        }

        if (payloads.length === 0) {
            toastError('ÄÆ¡n hĂ ng khĂ´ng cĂ³ sáº£n pháº©m báº£o hĂ nh');
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
                        <ShoppingBag className="text-orange-500" /> Quáº£n lĂ½ Ä‘Æ¡n hĂ ng
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">Tá»•ng cá»™ng {stats.total} Ä‘Æ¡n hĂ ng</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Tá»•ng Ä‘Æ¡n</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Chá» xá»­ lĂ½</p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">HoĂ n thĂ nh</p>
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
                            { key: 'all' as const, label: 'Táº¥t cáº£', count: orders.length, icon: 'đŸ“‹' },
                            { key: 'web' as const, label: 'Website', count: webCount, icon: 'đŸŒ', pending: webPending },
                            { key: 'pos' as const, label: 'POS', count: posCount, icon: 'đŸª' },
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
                                        {tab.pending} má»›i
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
                        placeholder="TĂ¬m theo mĂ£ Ä‘Æ¡n, SÄT..."
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
                        TĂ¬m trĂªn Server
                    </button>
                )}
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    title="Lá»c theo tráº¡ng thĂ¡i"
                    aria-label="Lá»c theo tráº¡ng thĂ¡i"
                    className="w-full md:w-48 h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none bg-white"
                >
                    <option value="">Táº¥t cáº£ tráº¡ng thĂ¡i</option>
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
                            <p>KhĂ´ng cĂ³ Ä‘Æ¡n hĂ ng nĂ o</p>
                        </div>
                    ) : paginatedOrders.map((order) => {
                        const status = statusConfig[order.status] || statusConfig.Pending;
                        const StIcon = status.icon;
                        const cName = order.customer?.name || order.customer_info?.name || 'KhĂ¡ch láº»';
                        const cPhone = order.customer?.phone || order.customer_info?.phone || 'â€”';
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
                                        <p className="text-[11px] text-gray-500 uppercase font-medium">Tá»•ng tiá»n</p>
                                        <p className="font-bold text-orange-600">{formatPrice(order.total_amount || 0)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[11px] text-gray-500 uppercase font-medium">NgĂ y táº¡o</p>
                                        <p className="text-gray-700 font-medium text-xs">{formatDate(order.createdAt)}</p>
                                    </div>
                                </div>
                                <div className="pt-1">
                                    <button
                                        onClick={() => setSelectedOrder(order)}
                                        className="w-full py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors border border-gray-200 active:bg-gray-50"
                                    >
                                        <Eye size={16} /> Xem chi tiáº¿t Ä‘Æ¡n hĂ ng
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
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">MĂ£ Ä‘Æ¡n</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">KhĂ¡ch hĂ ng</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tá»•ng tiá»n</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Thanh toĂ¡n</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tráº¡ng thĂ¡i</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">NgĂ y táº¡o</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">HĂ nh Ä‘á»™ng</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-16 text-gray-400">
                                        <ShoppingBag size={48} className="mx-auto mb-3 opacity-50" />
                                        <p>KhĂ´ng cĂ³ Ä‘Æ¡n hĂ ng nĂ o</p>
                                    </td>
                                </tr>
                            ) : paginatedOrders.map((order) => {
                                const status = statusConfig[order.status] || statusConfig.Pending;
                                const StIcon = status.icon;
                                const cName = order.customer?.name || order.customer_info?.name || 'KhĂ¡ch láº»';
                                const cPhone = order.customer?.phone || order.customer_info?.phone || 'â€”';
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
                                        <td className="px-6 py-4 text-sm text-gray-600">{order.payment_method || 'â€”'}</td>
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
                                                    title="Xem chi tiáº¿t"
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
                    entityLabel="Ä‘Æ¡n hĂ ng"
                />

                {hasMore && !searchQuery && (
                    <div className="p-4 border-t border-gray-100 flex justify-center">
                        <button
                            onClick={loadMoreData}
                            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            Táº£i thĂªm lá»‹ch sá»­ cÅ©
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
                                <h2 className="text-lg md:text-xl font-bold text-gray-900">Chi tiáº¿t Ä‘Æ¡n hĂ ng</h2>
                                <p className="text-gray-500 text-sm font-mono mt-0.5">#{selectedOrder.id.slice(-6).toUpperCase()}</p>
                            </div>
                            <button title="ÄĂ³ng" aria-label="ÄĂ³ng" onClick={() => setSelectedOrder(null)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
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
                                    value={selectedOrder.status}
                                    onChange={(e) => updateStatus(selectedOrder.id, e.target.value)}
                                    title="Cáº­p nháº­t tráº¡ng thĂ¡i"
                                    aria-label="Cáº­p nháº­t tráº¡ng thĂ¡i"
                                    className="h-10 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                >
                                    {Object.entries(statusConfig).map(([key, value]) => (
                                        <option key={key} value={key}>{value.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Customer Info */}
                            <div className="bg-gray-50 rounded-xl p-4">
                                <h3 className="font-semibold text-gray-900 mb-3">ThĂ´ng tin khĂ¡ch hĂ ng</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">Há» tĂªn:</span>
                                        <span className="ml-2 font-medium">{selectedOrder.customer?.name || selectedOrder.customer_info?.name || 'KhĂ¡ch láº»'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">SÄT:</span>
                                        <span className="ml-2 font-medium">{selectedOrder.customer?.phone || selectedOrder.customer_info?.phone || 'â€”'}</span>
                                    </div>
                                    {(selectedOrder.customer?.email || selectedOrder.customer_info?.email) && (
                                        <div className="col-span-2">
                                            <span className="text-gray-500">Email:</span>
                                            <span className="ml-2 font-medium">{selectedOrder.customer?.email || selectedOrder.customer_info?.email}</span>
                                        </div>
                                    )}
                                    {selectedOrder.createdByName && (
                                        <div className="col-span-2">
                                            <span className="text-gray-500">NgÆ°á»i táº¡o:</span>
                                            <span className="ml-2 font-medium">{selectedOrder.createdByName}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Order Items */}
                            <div>
                                <h3 className="font-semibold text-gray-900 mb-3">Chi tiáº¿t sáº£n pháº©m</h3>
                                <div className="space-y-3">
                                    {selectedOrder.items?.map((item, index: number) => {
                                        const it = item as Partial<{ name: string; product_name: string; quantity: number; price: number; warrantyType: string; imeis: string[] }>;
                                        const qty = it.quantity || 0;
                                        const price = it.price || 0;
                                        return (
                                        <div key={index} className="flex flex-col py-3 border-b">
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <p className="font-medium text-gray-900">{it.name || it.product_name}</p>
                                                    <p className="text-sm text-gray-500">SL: {qty} Ă— {formatPrice(price)}</p>
                                                </div>
                                                <p className="font-medium text-gray-900">{formatPrice(price * qty)}</p>
                                            </div>
                                            {it.warrantyType === 'warrantyDevice' && (
                                                <div className="mt-3 pt-3 border-t border-dashed">
                                                    <p className="text-xs font-semibold text-gray-700 mb-2">ThĂ´ng tin IMEI/Serial ({qty})</p>
                                                    <div className="space-y-2">
                                                        {Array.from({ length: qty }).map((_, i) => (
                                                            <div key={i} className="flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder={`Nháº­p IMEI/Serial #${i + 1}`}
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
                                        <span>Giáº£m giĂ¡</span>
                                        <span>-{formatPrice(selectedOrder.discount_amount || 0)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-4 text-lg font-bold">
                                    <span>Tá»•ng cá»™ng:</span>
                                    <span className="text-red-600">{formatPrice(selectedOrder.total_amount || 0)}</span>
                                </div>
                                {(selectedOrder.deposit_amount || 0) > 0 && (
                                    selectedOrder.status === 'Completed' ? (
                                        <div className="flex justify-between items-center pt-2 text-base font-semibold text-gray-700">
                                            <span>ÄĂ£ thanh toĂ¡n:</span>
                                            <span>{formatPrice(selectedOrder.total_amount || 0)}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-center pt-2 text-base font-semibold text-gray-700">
                                                <span>ÄĂ£ cá»c:</span>
                                                <span>{formatPrice(selectedOrder.deposit_amount || 0)}</span>
                                            </div>
                                            <div className="flex justify-between items-center pt-2 text-lg font-bold text-orange-600">
                                                <span>CĂ²n láº¡i:</span>
                                                <span>{formatPrice(Math.max(0, (selectedOrder.total_amount || 0) - (selectedOrder.deposit_amount || 0)))}</span>
                                            </div>
                                        </>
                                    )
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col md:flex-row items-center gap-3 pt-4 border-t sticky bottom-0 bg-white mt-auto">
                                <select
                                    className="w-full md:w-auto p-3 md:p-2.5 border rounded-xl md:rounded-lg bg-gray-50 font-medium outline-none cursor-pointer text-center text-sm"
                                    value={printTemplate}
                                    onChange={e => setPrintTemplate(e.target.value as 'thermal' | 'a5')}
                                    title="Chá»n khá»• in"
                                    aria-label="Chá»n khá»• in"
                                >
                                    <option value="thermal">Khá»• 80mm</option>
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
                                                    <title>HĂ³a Ä‘Æ¡n bĂ¡n hĂ ng #${selectedOrder.id.slice(-6).toUpperCase()}</title>
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
                                                    <div class="text-center font-bold" style="margin-top: 8px;">HĂ“A ÄÆ N BĂN HĂ€NG</div>
                                                    <div class="text-center">${dateStr} | #${selectedOrder.id.slice(-6).toUpperCase()}</div>
                                                    <hr/>
                                                    <div>KH: ${cName}</div>
                                                    ${cPhone ? `<div>SÄT: ${cPhone}</div>` : ''}
                                                    <hr/>
                                                    ${itemsHtml}
                                                    <hr/>
                                                    <div style="display: flex; justify-content: space-between;">
                                                        <span>Tá»•ng cá»™ng:</span>
                                                        <span class="font-bold">${(selectedOrder.total_amount || 0).toLocaleString('vi-VN')}Ä‘</span>
                                                    </div>
                                                    ${(selectedOrder.deposit_amount || 0) > 0 ? (
                                                        selectedOrder.status === 'Completed' ? `
                                                        <div style="display: flex; justify-content: space-between;">
                                                            <span>ÄĂ£ thanh toĂ¡n:</span>
                                                            <span class="font-bold">${(selectedOrder.total_amount || 0).toLocaleString('vi-VN')}Ä‘</span>
                                                        </div>` : `
                                                        <div style="display: flex; justify-content: space-between;">
                                                            <span>ÄĂ£ cá»c:</span>
                                                            <span>${(selectedOrder.deposit_amount || 0).toLocaleString('vi-VN')}Ä‘</span>
                                                        </div>
                                                        <div style="display: flex; justify-content: space-between;" class="font-bold">
                                                            <span>CĂ’N Láº I:</span>
                                                            <span>${Math.max(0, (selectedOrder.total_amount || 0) - (selectedOrder.deposit_amount || 0)).toLocaleString('vi-VN')}Ä‘</span>
                                                        </div>`
                                                    ) : ''}
                                                    <hr/>
                                                    <div class="text-center" style="margin-top: 16px;"><i>Cáº£m Æ¡n quĂ½ khĂ¡ch!</i></div>
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
                                                    <title>HĂ³a Ä‘Æ¡n bĂ¡n hĂ ng #${selectedOrder.id.slice(-6).toUpperCase()}</title>
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
                                                            <p><b>Äá»‹a chá»‰:</b> ${config.contact_info?.address || 'An PhĂº ÄĂ´ng, Q12, TPHCM'}</p>
                                                            <p><b>Äiá»‡n thoáº¡i:</b> ${config.contact_info?.main_phone || '0932.242.026'}</p>
                                                        </div>
                                                        <div style="text-align: right;">
                                                            <p><b>Sá»‘:</b> #${selectedOrder.id.slice(-6).toUpperCase()}</p>
                                                            <p><b>NgĂ y:</b> ${dateStr}</p>
                                                            <p><b>NhĂ¢n viĂªn:</b> ${selectedOrder.createdByName || 'Admin'}</p>
                                                        </div>
                                                    </div>

                                                    <div class="title">
                                                        <h1>HĂ“A ÄÆ N BĂN HĂ€NG</h1>
                                                    </div>

                                                    <div>
                                                        <div class="info-row"><div class="label">KhĂ¡ch hĂ ng:</div><div><b>${cName}</b></div></div>
                                                        <div class="info-row"><div class="label">Äiá»‡n thoáº¡i:</div><div>${cPhone}</div></div>
                                                        <div class="info-row"><div class="label">HĂ¬nh thá»©c TT:</div><div>${selectedOrder.payment_method === 'COD' ? 'Tiá»n máº·t' : selectedOrder.payment_method === 'Installment' ? 'Tráº£ gĂ³p' : 'Chuyá»ƒn khoáº£n / Momo'}</div></div>
                                                    </div>

                                                    <table>
                                                        <thead>
                                                            <tr>
                                                                <th style="width: 40px;">STT</th>
                                                                <th>TĂªn HĂ ng HĂ³a / Dá»‹ch Vá»¥</th>
                                                                <th style="width: 60px;">SL</th>
                                                                <th style="width: 100px;">ÄÆ¡n GiĂ¡</th>
                                                                <th style="width: 120px;">ThĂ nh Tiá»n</th>
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
                                                        <div class="summary-row"><span>Tá»•ng tiá»n hĂ ng:</span><span>${(selectedOrder.total_amount || 0).toLocaleString('vi-VN')} Ä‘</span></div>
                                                        ${(selectedOrder.discount_amount || 0) > 0 ? `<div class="summary-row"><span>Chiáº¿t kháº¥u:</span><span>- ${(selectedOrder.discount_amount || 0).toLocaleString('vi-VN')} Ä‘</span></div>` : ''}
                                                        <div class="summary-row bold" style="font-size: 16px; margin-top: 5px; border-top: 1px dotted #ccc; padding-top: 5px;">
                                                            <span>Tá»•ng thanh toĂ¡n:</span><span>${(selectedOrder.total_amount || 0).toLocaleString('vi-VN')} Ä‘</span>
                                                        </div>
                                                        ${(selectedOrder.deposit_amount || 0) > 0 ? (
                                                            selectedOrder.status === 'Completed' ? `
                                                            <div class="summary-row" style="margin-top: 5px;"><span>ÄĂ£ thanh toĂ¡n:</span><span>${(selectedOrder.total_amount || 0).toLocaleString('vi-VN')} Ä‘</span></div>` : `
                                                            <div class="summary-row" style="margin-top: 5px;"><span>ÄĂ£ cá»c:</span><span>${(selectedOrder.deposit_amount || 0).toLocaleString('vi-VN')} Ä‘</span></div>
                                                            <div class="summary-row bold" style="color: red; font-size: 16px;"><span>CĂ’N Láº I:</span><span>${Math.max(0, (selectedOrder.total_amount || 0) - (selectedOrder.deposit_amount || 0)).toLocaleString('vi-VN')} Ä‘</span></div>`
                                                        ) : ''}
                                                    </div>

                                                    <div class="signatures">
                                                        <div>
                                                            <p class="title">KhĂ¡ch hĂ ng</p>
                                                            <p style="color: #666; font-style: italic;">(KĂ½, ghi rĂµ há» tĂªn)</p>
                                                        </div>
                                                        <div>
                                                            <p class="title">NgÆ°á»i láº­p phiáº¿u</p>
                                                            <p style="color: #666; font-style: italic;">(KĂ½, ghi rĂµ há» tĂªn)</p>
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
                                    <Receipt size={18} /> In hĂ³a Ä‘Æ¡n
                                </button>
                                <button
                                    onClick={handlePrintWarranty}
                                    className="px-4 md:px-5 py-2.5 md:py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded-xl md:rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 flex-1 md:flex-none"
                                >
                                    In báº£o hĂ nh
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

