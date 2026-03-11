'use client';

import { useState, useEffect } from 'react';
import {
    Search, Eye, FileText, X, Package, Truck, CheckCircle,
    XCircle, Clock, Loader2, ShoppingBag
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Order interface ──
interface OrderItem {
    name: string;
    quantity: number;
    price: number;
    image?: string;
}

interface Order {
    id: string;
    customer: { name: string; phone: string; email?: string };
    items: OrderItem[];
    total_amount: number;
    subtotal_amount?: number;
    discount_amount?: number;
    status: string;
    payment_method: string;
    is_vat_exported: boolean;
    source?: string;
    createdBy?: string;
    createdByName?: string;
    createdAt: any;
    updatedAt?: any;
}

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
    Pending: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Chờ xử lý' },
    Confirmed: { color: 'bg-blue-100 text-blue-700', icon: Package, label: 'Đã xác nhận' },
    Shipping: { color: 'bg-purple-100 text-purple-700', icon: Truck, label: 'Đang giao' },
    Completed: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Hoàn thành' },
    Cancelled: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Đã hủy' },
};

const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN').format(price) + 'đ';
const formatDate = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

    // Fetch orders realtime from Firestore
    useEffect(() => {
        const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Order[];
            setOrders(data);
            setLoading(false);
        }, (err) => {
            console.error('Orders fetch error:', err);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const updateStatus = async (orderId: string, newStatus: string) => {
        try {
            await updateDoc(doc(db, 'orders', orderId), {
                status: newStatus,
                updatedAt: serverTimestamp(),
            });
            if (selectedOrder?.id === orderId) {
                setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
            }
        } catch (err) {
            console.error('Update status error:', err);
        }
    };

    const filteredOrders = orders.filter((o) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch = !q ||
            o.id.toLowerCase().includes(q) ||
            o.customer?.name?.toLowerCase().includes(q) ||
            o.customer?.phone?.includes(searchQuery);
        const matchesStatus = !statusFilter || o.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

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

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Tìm theo mã đơn, tên, SĐT..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none bg-white"
                >
                    <option value="">Tất cả trạng thái</option>
                    {Object.entries(statusConfig).map(([key, value]) => (
                        <option key={key} value={key}>{value.label}</option>
                    ))}
                </select>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mã đơn</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Khách hàng</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tổng tiền</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Thanh toán</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ngày tạo</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Hành động</th>
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
                            ) : filteredOrders.map((order) => {
                                const status = statusConfig[order.status] || statusConfig.Pending;
                                const StIcon = status.icon;
                                return (
                                    <tr key={order.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <span className="font-mono text-sm text-gray-700">#{order.id.slice(-6).toUpperCase()}</span>
                                            {order.is_vat_exported && (
                                                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded">VAT</span>
                                            )}
                                            {order.source === 'pos' && (
                                                <span className="ml-1 px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded">POS</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-medium text-gray-900">{order.customer?.name || 'Khách lẻ'}</p>
                                            <p className="text-xs text-gray-500">{order.customer?.phone || '—'}</p>
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
            </div>

            {/* Order Detail Modal */}
            {selectedOrder && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedOrder(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-6 border-b">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Chi tiết đơn hàng</h2>
                                <p className="text-gray-500 text-sm">#{selectedOrder.id.slice(-6).toUpperCase()}</p>
                            </div>
                            <button onClick={() => setSelectedOrder(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
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
                                    className="h-10 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                >
                                    {Object.entries(statusConfig).map(([key, value]) => (
                                        <option key={key} value={key}>{value.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Customer Info */}
                            <div className="bg-gray-50 rounded-xl p-4">
                                <h3 className="font-semibold text-gray-900 mb-3">Thông tin khách hàng</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">Họ tên:</span>
                                        <span className="ml-2 font-medium">{selectedOrder.customer?.name || 'Khách lẻ'}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">SĐT:</span>
                                        <span className="ml-2 font-medium">{selectedOrder.customer?.phone || '—'}</span>
                                    </div>
                                    {selectedOrder.customer?.email && (
                                        <div className="col-span-2">
                                            <span className="text-gray-500">Email:</span>
                                            <span className="ml-2 font-medium">{selectedOrder.customer.email}</span>
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
                                <h3 className="font-semibold text-gray-900 mb-3">Sản phẩm</h3>
                                <div className="space-y-3">
                                    {selectedOrder.items?.map((item, index) => (
                                        <div key={index} className="flex justify-between items-center py-3 border-b">
                                            <div>
                                                <p className="font-medium text-gray-900">{item.name}</p>
                                                <p className="text-sm text-gray-500">SL: {item.quantity} × {formatPrice(item.price)}</p>
                                            </div>
                                            <p className="font-medium text-gray-900">{formatPrice(item.price * item.quantity)}</p>
                                        </div>
                                    ))}
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
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4 border-t">
                                <button className="flex-1 py-3 border rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                                    <FileText size={16} /> In hóa đơn
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
