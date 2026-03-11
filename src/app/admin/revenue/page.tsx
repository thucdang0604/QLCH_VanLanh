'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    TrendingUp, TrendingDown, DollarSign, Loader2, Plus, X, Save,
    ArrowUpRight, ArrowDownLeft, BarChart3, Wallet, ShoppingCart,
    Wrench, Package, Award, FileText, Calendar
} from 'lucide-react';
import {
    collection, getDocs, addDoc, serverTimestamp, query, orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import type { Expense } from '@/lib/types';

// ── Expense categories ──
const expenseCategories = [
    { key: 'rent', label: 'Thuê mặt bằng', icon: '🏠' },
    { key: 'utilities', label: 'Điện/Nước/Internet', icon: '💡' },
    { key: 'supplies', label: 'Vật tư', icon: '📦' },
    { key: 'salary', label: 'Lương NV (thêm)', icon: '👤' },
    { key: 'other', label: 'Khác', icon: '📝' },
];

export default function RevenuePage() {
    const { user } = useAuth();

    // Data
    const [orders, setOrders] = useState<any[]>([]);
    const [repairs, setRepairs] = useState<any[]>([]);
    const [importReceipts, setImportReceipts] = useState<any[]>([]);
    const [commissions, setCommissions] = useState<any[]>([]);
    const [expenses, setExpenses] = useState<(Expense & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('month');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    // Expense modal
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [expCategory, setExpCategory] = useState('other');
    const [expDescription, setExpDescription] = useState('');
    const [expAmount, setExpAmount] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);

    // ── Load all data ──
    useEffect(() => {
        const load = async () => {
            try {
                const [oSnap, rSnap, iSnap, cSnap, eSnap] = await Promise.all([
                    getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'))),
                    getDocs(query(collection(db, 'repairs'), orderBy('createdAt', 'desc'))),
                    getDocs(collection(db, 'import_receipts')),
                    getDocs(collection(db, 'commissions')),
                    getDocs(query(collection(db, 'expenses'), orderBy('createdAt', 'desc'))),
                ]);
                setOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                setRepairs(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                setImportReceipts(iSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                setCommissions(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                setExpenses(eSnap.docs.map(d => ({ id: d.id, ...d.data() } as Expense & { id: string })));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';
    const toDate = (ts: any) => {
        if (!ts) return null;
        return ts.toDate ? ts.toDate() : new Date(ts);
    };

    // ── Date filter ──
    const getDateRange = () => {
        const now = new Date();
        let from: Date, to: Date;

        switch (period) {
            case 'today':
                from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                break;
            case 'week':
                const dayOfWeek = now.getDay();
                from = new Date(now);
                from.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                from.setHours(0, 0, 0, 0);
                to = new Date(now);
                to.setHours(23, 59, 59);
                break;
            case 'month':
                from = new Date(now.getFullYear(), now.getMonth(), 1);
                to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                break;
            case 'custom':
                from = customFrom ? new Date(customFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
                to = customTo ? new Date(customTo + 'T23:59:59') : now;
                break;
            default:
                from = new Date(now.getFullYear(), now.getMonth(), 1);
                to = now;
        }
        return { from, to };
    };

    const inRange = (ts: any) => {
        const d = toDate(ts);
        if (!d) return false;
        const { from, to } = getDateRange();
        return d >= from && d <= to;
    };

    // ── Revenue calculations ──
    const calculations = useMemo(() => {
        // REVENUE (THU)
        const orderRevenue = orders
            .filter(o => (o.status === 'Completed' || o.status === 'Shipping') && inRange(o.createdAt))
            .reduce((s, o) => s + (o.total_amount || 0), 0);

        const repairRevenue = repairs
            .filter(r => r.status === 'da_tra_may' && inRange(r.createdAt))
            .reduce((s, r) => s + (r.payment?.amount || 0), 0);

        const totalRevenue = orderRevenue + repairRevenue;

        // EXPENSES (CHI)
        const importCost = importReceipts
            .filter(i => i.status === 'completed' && inRange(i.completedAt || i.createdAt))
            .reduce((s, i) => s + (i.totalAmount || 0), 0);

        const commissionCost = commissions
            .filter(c => inRange(c.createdAt))
            .reduce((s, c) => s + (c.amount || 0), 0);

        const manualExpenses = expenses
            .filter(e => inRange(e.createdAt))
            .reduce((s, e) => s + (e.amount || 0), 0);

        const totalExpenses = importCost + commissionCost + manualExpenses;

        // NET PROFIT
        const netProfit = totalRevenue - totalExpenses;

        // Orders breakdown
        const webOrders = orders.filter(o => (o.source !== 'pos') && (o.status === 'Completed' || o.status === 'Shipping') && inRange(o.createdAt));
        const posOrders = orders.filter(o => o.source === 'pos' && (o.status === 'Completed' || o.status === 'Shipping') && inRange(o.createdAt));

        return {
            orderRevenue, repairRevenue, totalRevenue,
            importCost, commissionCost, manualExpenses, totalExpenses,
            netProfit,
            webOrderCount: webOrders.length,
            posOrderCount: posOrders.length,
            webOrderRevenue: webOrders.reduce((s, o) => s + (o.total_amount || 0), 0),
            posOrderRevenue: posOrders.reduce((s, o) => s + (o.total_amount || 0), 0),
            repairCount: repairs.filter(r => r.status === 'da_tra_may' && inRange(r.createdAt)).length,
        };
    }, [orders, repairs, importReceipts, commissions, expenses, period, customFrom, customTo]);

    // ── Daily chart data ──
    const chartData = useMemo(() => {
        const { from, to } = getDateRange();
        const days: { date: string; revenue: number; expense: number }[] = [];
        const d = new Date(from);

        while (d <= to) {
            const dayStr = d.toISOString().slice(0, 10);
            const dayStart = new Date(d);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(d);
            dayEnd.setHours(23, 59, 59, 999);

            const isInDay = (ts: any) => {
                const t = toDate(ts);
                return t && t >= dayStart && t <= dayEnd;
            };

            const rev = orders.filter(o => (o.status === 'Completed' || o.status === 'Shipping') && isInDay(o.createdAt)).reduce((s, o) => s + (o.total_amount || 0), 0)
                + repairs.filter(r => r.status === 'da_tra_may' && isInDay(r.createdAt)).reduce((s, r) => s + (r.payment?.amount || 0), 0);

            const exp = importReceipts.filter(i => i.status === 'completed' && isInDay(i.completedAt || i.createdAt)).reduce((s, i) => s + (i.totalAmount || 0), 0)
                + commissions.filter(c => isInDay(c.createdAt)).reduce((s, c) => s + (c.amount || 0), 0)
                + expenses.filter(e => isInDay(e.createdAt)).reduce((s, e) => s + (e.amount || 0), 0);

            days.push({ date: dayStr, revenue: rev, expense: exp });
            d.setDate(d.getDate() + 1);
        }
        return days;
    }, [orders, repairs, importReceipts, commissions, expenses, period, customFrom, customTo]);

    // Chart max value for scaling
    const chartMax = Math.max(1, ...chartData.map(d => Math.max(d.revenue, d.expense)));

    // ── Save expense ──
    const handleSaveExpense = async () => {
        if (expAmount <= 0) return;
        setIsProcessing(true);
        try {
            const data = {
                category: expCategory,
                description: expDescription,
                amount: expAmount,
                date: serverTimestamp(),
                createdBy: user?.uid || '',
                createdByName: user?.displayName || 'Admin',
                createdAt: serverTimestamp(),
            };
            const ref = await addDoc(collection(db, 'expenses'), data);
            setExpenses(prev => [{ id: ref.id, ...data, createdAt: new Date() } as any, ...prev]);
            setShowExpenseModal(false);
            setExpDescription('');
            setExpAmount(0);
        } catch (err) {
            console.error(err);
        } finally {
            setIsProcessing(false);
        }
    };

    const periodLabel = { today: 'Hôm nay', week: 'Tuần này', month: 'Tháng này', custom: 'Tùy chọn' };

    if (loading) return (
        <div className="flex items-center justify-center h-[60vh]">
            <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
    );

    return (
        <div className="p-4 md:p-6 space-y-5">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="text-orange-500" /> Bảng điều khiển Tài chính
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Tổng hợp THU — CHI — LỢI NHUẬN</p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Period filter */}
                    {(['today', 'week', 'month', 'custom'] as const).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p
                                ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {periodLabel[p]}
                        </button>
                    ))}
                    <button onClick={() => setShowExpenseModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-xs font-semibold">
                        <Plus size={14} /> Tạo phiếu chi
                    </button>
                </div>
            </div>

            {/* Custom date range */}
            {period === 'custom' && (
                <div className="flex gap-3 items-center bg-gray-50 rounded-xl px-4 py-2">
                    <Calendar size={16} className="text-gray-400" />
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                        className="px-3 py-1.5 border rounded-lg text-sm" />
                    <span className="text-gray-400">→</span>
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                        className="px-3 py-1.5 border rounded-lg text-sm" />
                </div>
            )}

            {/* ═══ Main KPI Cards ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* TỔNG THU */}
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-green-200/50">
                    <div className="flex items-center gap-2 text-green-100 text-sm mb-1">
                        <ArrowUpRight size={18} /> TỔNG THU
                    </div>
                    <p className="text-3xl font-bold">{formatPrice(calculations.totalRevenue)}</p>
                    <div className="mt-3 space-y-1 text-xs text-green-100">
                        <div className="flex justify-between"><span>🌐 Web ({calculations.webOrderCount})</span><span>{formatPrice(calculations.webOrderRevenue)}</span></div>
                        <div className="flex justify-between"><span>🏪 POS ({calculations.posOrderCount})</span><span>{formatPrice(calculations.posOrderRevenue)}</span></div>
                        <div className="flex justify-between"><span>🔧 Sửa chữa ({calculations.repairCount})</span><span>{formatPrice(calculations.repairRevenue)}</span></div>
                    </div>
                </div>

                {/* TỔNG CHI */}
                <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg shadow-red-200/50">
                    <div className="flex items-center gap-2 text-red-100 text-sm mb-1">
                        <ArrowDownLeft size={18} /> TỔNG CHI
                    </div>
                    <p className="text-3xl font-bold">{formatPrice(calculations.totalExpenses)}</p>
                    <div className="mt-3 space-y-1 text-xs text-red-100">
                        <div className="flex justify-between"><span>📦 Nhập hàng</span><span>{formatPrice(calculations.importCost)}</span></div>
                        <div className="flex justify-between"><span>🏆 Hoa hồng</span><span>{formatPrice(calculations.commissionCost)}</span></div>
                        <div className="flex justify-between"><span>📝 Chi phí khác</span><span>{formatPrice(calculations.manualExpenses)}</span></div>
                    </div>
                </div>

                {/* LỢI NHUẬN */}
                <div className={`bg-gradient-to-br ${calculations.netProfit >= 0 ? 'from-blue-500 to-indigo-600 shadow-blue-200/50' : 'from-gray-500 to-gray-700 shadow-gray-200/50'} rounded-2xl p-5 text-white shadow-lg`}>
                    <div className="flex items-center gap-2 text-blue-100 text-sm mb-1">
                        <Wallet size={18} /> LỢI NHUẬN RÒNG
                    </div>
                    <p className="text-3xl font-bold">{formatPrice(calculations.netProfit)}</p>
                    <div className="mt-3">
                        <div className="bg-white/20 rounded-lg px-3 py-2 text-xs">
                            <p>Biên lợi nhuận: <b>{calculations.totalRevenue > 0 ? ((calculations.netProfit / calculations.totalRevenue) * 100).toFixed(1) : 0}%</b></p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ Chart ═══ */}
            <div className="bg-white rounded-2xl border shadow-sm p-5">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <TrendingUp size={18} className="text-orange-500" /> Biểu đồ Thu — Chi theo ngày
                </h3>
                {chartData.length > 0 ? (
                    <div className="relative">
                        {/* Chart bars */}
                        <div className="flex items-end gap-1 h-48 overflow-x-auto pb-6">
                            {chartData.map((d, i) => (
                                <div key={i} className="flex-1 min-w-[24px] flex flex-col items-center gap-0.5 group relative">
                                    {/* Revenue bar */}
                                    <div
                                        className="w-full bg-green-400 rounded-t-sm hover:bg-green-500 transition-colors"
                                        style={{ height: `${(d.revenue / chartMax) * 160}px`, minHeight: d.revenue > 0 ? '4px' : '0px' }}
                                        title={`Thu: ${formatPrice(d.revenue)}`}
                                    />
                                    {/* Expense bar */}
                                    <div
                                        className="w-full bg-red-400 rounded-b-sm hover:bg-red-500 transition-colors"
                                        style={{ height: `${(d.expense / chartMax) * 160}px`, minHeight: d.expense > 0 ? '4px' : '0px' }}
                                        title={`Chi: ${formatPrice(d.expense)}`}
                                    />
                                    {/* Date label */}
                                    <span className="absolute -bottom-5 text-[8px] text-gray-400 whitespace-nowrap">
                                        {d.date.slice(8)}
                                    </span>
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                                        T: {formatPrice(d.revenue)} | C: {formatPrice(d.expense)}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Legend */}
                        <div className="flex gap-4 mt-4 text-xs text-gray-500 justify-center">
                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded-sm" /> Thu</span>
                            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 rounded-sm" /> Chi</span>
                        </div>
                    </div>
                ) : (
                    <p className="text-center text-gray-400 py-12">Không có dữ liệu</p>
                )}
            </div>

            {/* ═══ Recent expenses table ═══ */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <FileText size={18} className="text-red-500" /> Phiếu chi gần đây
                    </h3>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-500 text-xs border-b bg-gray-50">
                            <th className="text-left px-5 py-3">Ngày</th>
                            <th className="text-left">Danh mục</th>
                            <th className="text-left">Mô tả</th>
                            <th className="text-left">Người tạo</th>
                            <th className="text-right px-5">Số tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        {expenses.slice(0, 10).map(e => {
                            const cat = expenseCategories.find(c => c.key === e.category);
                            return (
                                <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="px-5 py-3 text-xs text-gray-500">
                                        {toDate(e.createdAt)?.toLocaleDateString('vi-VN') || '—'}
                                    </td>
                                    <td><span className="text-xs">{cat?.icon} {cat?.label || e.category}</span></td>
                                    <td className="text-gray-600">{e.description || '—'}</td>
                                    <td className="text-xs text-gray-400">{e.createdByName}</td>
                                    <td className="text-right px-5 font-bold text-red-600">{formatPrice(e.amount)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {expenses.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-sm">Chưa có phiếu chi</div>
                )}
            </div>

            {/* ═══ Expense Modal ═══ */}
            {showExpenseModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="text-lg font-bold text-gray-900">Tạo phiếu chi</h2>
                            <button onClick={() => setShowExpenseModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Danh mục</label>
                                <select value={expCategory} onChange={e => setExpCategory(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg bg-white">
                                    {expenseCategories.map(c => (
                                        <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                                <input type="text" value={expDescription} onChange={e => setExpDescription(e.target.value)}
                                    placeholder="VD: Tiền điện tháng 2"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VNĐ)</label>
                                <input type="number" value={expAmount || ''} onChange={e => setExpAmount(Number(e.target.value))}
                                    placeholder="0"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 text-lg font-bold" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <button onClick={() => setShowExpenseModal(false)}
                                className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                            <button onClick={handleSaveExpense} disabled={isProcessing || expAmount <= 0}
                                className="px-5 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center gap-2">
                                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                Lưu phiếu chi
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
