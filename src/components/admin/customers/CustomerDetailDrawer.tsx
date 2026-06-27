'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, ShoppingBag, Wrench, X, Calendar } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useCustomerActivity } from '@/lib/useCustomerActivity';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { onSnapshot } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { getAuthInstance } from '@/lib/firebase';
import { toast } from 'sonner';
import type { CustomerTransaction } from '@/lib/types';

export interface CustomerDetailRecord {
    id: string;
    phone: string;
    name: string;
    type?: 'retail' | 'wholesale';
    totalSpent?: number;
    totalOrders?: number;
    totalRepairs?: number;
    totalDebt?: number;
}

interface Props {
    customer: CustomerDetailRecord | null;
    isOpen: boolean;
    onClose: () => void;
}

const orderStatusLabel: Record<string, string> = {
    Pending: 'Chờ xử lý',
    Confirmed: 'Đã xác nhận',
    Shipping: 'Đang giao',
    Completed: 'Hoàn thành',
    Cancelled: 'Đã hủy',
};

function formatPrice(value: number): string {
    return `${new Intl.NumberFormat('vi-VN').format(value)}đ`;
}

function formatDate(value: unknown): string {
    if (!value) return '—';
    const timestamp = value as { toDate?: () => Date };
    const date = typeof timestamp.toDate === 'function'
        ? timestamp.toDate()
        : new Date(value as string | number | Date);
    return date.toLocaleDateString('vi-VN');
}

export default function CustomerDetailDrawer({ customer, isOpen, onClose }: Props) {
    const router = useRouter();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'orders' | 'repairs' | 'appointments' | 'debt'>('orders');
    const [appointments, setAppointments] = useState<Array<{
        id: string;
        serviceName?: string;
        fullName?: string;
        status?: string;
        date?: string;
        timeSlot?: string;
        store?: string;
        createdAt?: Date | string | number | { _seconds: number; _nanoseconds: number };
    }>>([]);
    const [loadingAppointments, setLoadingAppointments] = useState(false);

    // Debt states
    const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [collectAmount, setCollectAmount] = useState<string>('');
    const [collectMethod, setCollectMethod] = useState<string>('CASH');
    const [isCollecting, setIsCollecting] = useState(false);

    const canViewOrders = user?.role === 'admin' || !!user?.permissions?.includes('manage_orders');
    const canViewRepairs = user?.role === 'admin' || !!user?.permissions?.includes('manage_repairs');
    const activity = useCustomerActivity({
        phone: customer?.phone || customer?.id,
        enabled: isOpen,
        includeOrders: canViewOrders,
        includeRepairs: canViewRepairs,
    });

    useEffect(() => {
        if (isOpen) {
            setActiveTab('orders');
            setAppointments([]);
        }
    }, [customer?.id, isOpen]);

    useEffect(() => {
        if (isOpen && activeTab === 'appointments' && customer?.phone) {
            setLoadingAppointments(true);
            const q = query(collection(db, 'appointments'), where('phone', '==', customer.phone), orderBy('createdAt', 'desc'));
            const unsub = onSnapshot(q, (snap) => {
                setAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoadingAppointments(false);
            }, () => {
                setLoadingAppointments(false);
            });
            return () => unsub();
        }
    }, [isOpen, activeTab, customer?.phone]);

    useEffect(() => {
        if (isOpen && activeTab === 'debt' && customer?.phone) {
            setLoadingTransactions(true);
            const q = query(
                collection(db, 'customer_transactions'),
                where('customerId', '==', customer.phone),
                orderBy('createdAt', 'desc'),
                limit(20)
            );
            const unsub = onSnapshot(q, (snap) => {
                setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerTransaction)));
                setLoadingTransactions(false);
            }, () => {
                setLoadingTransactions(false);
            });
            return () => unsub();
        }
    }, [isOpen, activeTab, customer?.phone]);

    const handleCollectDebt = async () => {
        if (!customer || !collectAmount) return;
        const amount = Number(collectAmount.replace(/[^0-9]/g, ''));
        if (amount <= 0) {
            toast.error('Số tiền không hợp lệ');
            return;
        }

        setIsCollecting(true);
        try {
            const auth = await getAuthInstance();
            const idToken = await auth.currentUser?.getIdToken();
            const res = await fetch('/api/admin/customers/collect-debt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    customerId: customer.phone,
                    amount,
                    paymentMethod: collectMethod,
                    note: `Thu nợ khách hàng ${customer.name || customer.phone}`
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to collect debt');

            toast.success('Đã thu nợ thành công');
            setCollectAmount('');
            // Optional: The UI should automatically reflect the new totalDebt if the customers list updates real-time
            // but we might need to locally patch it if we want immediate drawer update:
            customer.totalDebt = Math.max(0, (customer.totalDebt || 0) - amount);
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : 'Không thể thu nợ khách hàng');
        } finally {
            setIsCollecting(false);
        }
    };

    if (!isOpen || !customer) return null;

    const openDestination = (path: string) => {
        onClose();
        router.push(path);
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onClick={onClose}>
            <aside
                className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl"
                role="dialog"
                aria-modal="true"
                aria-label="Chi tiết khách hàng"
                onClick={event => event.stopPropagation()}
            >
                <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white p-5">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-gray-900">{customer.name || 'Khách lẻ'}</h2>
                        <p className="mt-1 font-mono text-sm text-gray-500">{customer.phone}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Đóng">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-5 p-5">
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-gray-500">Đã chi</p>
                            <p className="mt-1 text-sm font-semibold text-gray-900">{formatPrice(customer.totalSpent || 0)}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-gray-500">Đơn hàng</p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">{customer.totalOrders || 0}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-gray-500">Sửa chữa</p>
                            <p className="mt-1 text-lg font-semibold text-gray-900">{customer.totalRepairs || 0}</p>
                        </div>
                    </div>

                    <div className="flex border-b" role="tablist">
                        <button
                            title="Đơn hàng"
                            type="button"
                            role="tab"
                            onClick={() => setActiveTab('orders')}
                            className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${activeTab === 'orders' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500'}`}
                        >
                            <ShoppingBag size={16} />
                            Đơn hàng
                        </button>
                        <button
                            title="Sửa chữa"
                            type="button"
                            role="tab"
                            onClick={() => setActiveTab('repairs')}
                            className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${activeTab === 'repairs' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <Wrench size={16} />
                            Sửa chữa
                        </button>
                        <button
                            title="Lịch hẹn"
                            type="button"
                            role="tab"
                            onClick={() => setActiveTab('appointments')}
                            className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${activeTab === 'appointments' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <Calendar size={16} />
                            Lịch hẹn
                        </button>
                        <button
                            title="Công nợ"
                            type="button"
                            role="tab"
                            onClick={() => setActiveTab('debt')}
                            className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${activeTab === 'debt' ? 'border-orange-500 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <span className="font-bold">đ</span>
                            Công nợ
                        </button>
                    </div>

                    {activeTab === 'orders' && (
                        <section className="space-y-2">
                            {!canViewOrders ? (
                                <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">Bạn chưa được cấp quyền xem đơn hàng.</p>
                            ) : activity.loadingOrders ? (
                                <div className="flex justify-center py-8 text-gray-500"><Loader2 className="animate-spin" size={20} /></div>
                            ) : activity.orderError ? (
                                <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{activity.orderError}</p>
                            ) : activity.orders.length === 0 ? (
                                <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Khách hàng chưa có đơn mua hàng.</p>
                            ) : activity.orders.map(order => (
                                <button
                                    title="Xem chi tiết"
                                    key={order.id}
                                    type="button"
                                    onClick={() => openDestination(`/admin/orders?orderId=${encodeURIComponent(order.id)}`)}
                                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:border-orange-200 hover:bg-orange-50"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-900">
                                            #{order.id.slice(-6).toUpperCase()} · {orderStatusLabel[order.status] || order.status}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">{formatDate(order.createdAt)} · {order.source === 'pos' ? 'POS' : 'Web'}</p>
                                    </div>
                                    <div className="flex items-center gap-2 pl-3">
                                        <span className="whitespace-nowrap text-sm font-semibold text-gray-900">{formatPrice(order.totalAmount)}</span>
                                        <ExternalLink size={15} className="text-gray-400" />
                                    </div>
                                </button>
                            ))}
                        </section>
                    )}

                    {activeTab === 'repairs' && (
                        <section className="space-y-2">
                            {!canViewRepairs ? (
                                <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                                    Bạn chưa được cấp quyền sửa chữa. Dữ liệu phiếu không được tải.
                                </p>
                            ) : activity.loadingRepairs ? (
                                <div className="flex justify-center py-8 text-gray-500"><Loader2 className="animate-spin" size={20} /></div>
                            ) : activity.repairError ? (
                                <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{activity.repairError}</p>
                            ) : activity.repairs.length === 0 ? (
                                <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Khách hàng chưa có phiếu sửa chữa.</p>
                            ) : activity.repairs.map(repair => (
                                <button
                                    title="Xem chi tiết"
                                    key={repair.id}
                                    type="button"
                                    onClick={() => openDestination(`/admin/repairs?ticketId=${encodeURIComponent(repair.id)}`)}
                                    className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:border-orange-200 hover:bg-orange-50"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-gray-900">{repair.deviceModel}</p>
                                        <p className="mt-1 text-xs text-gray-500">
                                            #{repair.id.slice(-6).toUpperCase()} · {repair.statusLabel} · {formatDate(repair.createdAt)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 pl-3">
                                        <span className="whitespace-nowrap text-sm font-semibold text-gray-900">{formatPrice(repair.amount)}</span>
                                        <ExternalLink size={15} className="text-gray-400" />
                                    </div>
                                </button>
                            ))}
                        </section>
                    )}

                    {activeTab === 'appointments' && (
                        <section className="space-y-2">
                            {loadingAppointments ? (
                                <div className="flex justify-center py-8 text-gray-500"><Loader2 className="animate-spin" size={20} /></div>
                            ) : appointments.length === 0 ? (
                                <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">Khách hàng chưa có lịch hẹn nào.</p>
                            ) : appointments.map(apt => (
                                <div
                                    title="Xem chi tiết"
                                    key={apt.id}
                                    className="flex w-full flex-col justify-between rounded-lg border p-3 text-left bg-white"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-gray-900">{apt.serviceName || 'Dịch vụ'}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">Mã KH: {apt.fullName}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${apt.status === 'pending' ? 'bg-orange-100 text-orange-700' : apt.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                            {apt.status === 'pending' ? 'Chờ xác nhận' : apt.status === 'completed' ? 'Hoàn thành' : apt.status}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1 text-xs text-gray-600 bg-gray-50 p-2 rounded-md">
                                        <div className="flex items-center gap-2"><Calendar size={12}/> {apt.date} ({apt.timeSlot === 'morning' ? 'Sáng' : apt.timeSlot === 'afternoon' ? 'Chiều' : 'Tối'})</div>
                                        <div className="flex items-center gap-2"><span className="font-semibold">Chi nhánh:</span> {apt.store}</div>
                                    </div>
                                    <p className="mt-2 text-[10px] text-gray-400 text-right">Tạo lúc: {formatDate(apt.createdAt)}</p>
                                </div>
                            ))}
                        </section>
                    )}

                    {activeTab === 'debt' && (
                        <section className="space-y-4">
                            <div className={`p-4 rounded-xl border flex flex-col items-center justify-center ${
                                (customer.totalDebt || 0) > 0 ? 'bg-red-50 border-red-100' : (customer.totalDebt || 0) < 0 ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'
                            }`}>
                                <p className="text-gray-600 text-sm mb-1">Dư nợ hiện tại</p>
                                <p className={`text-2xl font-bold ${
                                    (customer.totalDebt || 0) > 0 ? 'text-red-600' : (customer.totalDebt || 0) < 0 ? 'text-green-600' : 'text-gray-500'
                                }`}>
                                    {(customer.totalDebt || 0) > 0
                                        ? formatPrice(customer.totalDebt || 0)
                                        : (customer.totalDebt || 0) < 0
                                            ? `Dư: ${formatPrice(Math.abs(customer.totalDebt || 0))}`
                                            : 'Không có nợ'
                                    }
                                </p>
                            </div>

                            {(customer.totalDebt || 0) > 0 && (
                                <div className="bg-white p-4 rounded-xl border border-gray-200">
                                    <h3 className="text-sm font-bold text-gray-800 mb-3">Thu nợ</h3>
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            type="text"
                                            value={collectAmount}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9]/g, '');
                                                setCollectAmount(val ? new Intl.NumberFormat('vi-VN').format(Number(val)) : '');
                                            }}
                                            placeholder="Nhập số tiền..."
                                            className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                        />
                                        <select
                                            title="Phương thức thanh toán"
                                            value={collectMethod}
                                            onChange={(e) => setCollectMethod(e.target.value)}
                                            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                                        >
                                            <option value="CASH">Tiền mặt</option>
                                            <option value="BANK">Chuyển khoản</option>
                                            <option value="MOMO">MoMo</option>
                                        </select>
                                    </div>
                                    <button
                                        onClick={handleCollectDebt}
                                        disabled={isCollecting || !collectAmount}
                                        className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold py-2 rounded-lg transition-colors flex justify-center items-center gap-2"
                                    >
                                        {isCollecting ? <Loader2 className="animate-spin" size={18} /> : null}
                                        Xác nhận thu nợ
                                    </button>
                                </div>
                            )}

                            <div className="mt-4">
                                <h3 className="text-sm font-bold text-gray-800 mb-2">Lịch sử giao dịch công nợ</h3>
                                {loadingTransactions ? (
                                    <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
                                ) : transactions.length === 0 ? (
                                    <p className="text-sm text-gray-500 text-center py-4">Chưa có giao dịch nào.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {transactions.map(tx => (
                                            <div key={tx.id} className="flex justify-between items-center p-3 border rounded-lg bg-white">
                                                <div>
                                                    <p className="text-sm font-semibold text-gray-800">
                                                        {tx.type === 'DEBT' ? 'Ghi nợ' : 'Trả nợ'}
                                                    </p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5">{formatDate(tx.createdAt)}</p>
                                                    {tx.note && <p className="text-xs text-gray-500 mt-1 max-w-[200px] truncate">{tx.note}</p>}
                                                </div>
                                                <div className="text-right">
                                                    <p className={`text-sm font-bold ${tx.type === 'DEBT' ? 'text-red-600' : 'text-green-600'}`}>
                                                        {tx.type === 'DEBT' ? '+' : '-'}{formatPrice(tx.amount)}
                                                    </p>
                                                    {tx.createdByName && <p className="text-[10px] text-gray-400 mt-0.5">Bởi: {tx.createdByName}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    )}
                </div>
            </aside>
        </div>
    );
}
