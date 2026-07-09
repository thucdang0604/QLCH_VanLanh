'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    TrendingUp, Loader2, Plus, Save,
    ArrowUpRight, ArrowDownLeft, BarChart3, Wallet,
    FileText, Calendar
} from 'lucide-react';
import Modal from '@/components/admin/Modal';
import CurrencyInput from '@/components/admin/CurrencyInput';
import { collection, limit, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { getDocs } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import type { Commission, Expense, ImportReceipt, Order, RepairTicket } from '@/lib/types';
import {
    applyRevenueAggregateDelta,
    isAggregateRangeAvailable,
    mergeRevenueAggregateDocs,
    toRevenueDateId,
    type RevenueAggregateDoc,
} from '@/lib/revenueAggregate';
import { useAuth } from '@/lib/AuthContext';

// ── Expense categories ──
const expenseCategories = [
    { key: 'rent', label: 'Thuê mặt bằng', icon: '🏠' },
    { key: 'utilities', label: 'Điện/Nước/Internet', icon: '💡' },
    { key: 'supplies', label: 'Vật tư', icon: '📦' },
    { key: 'salary', label: 'Lương NV (thêm)', icon: '👤' },
    { key: 'supplier_payment', label: 'Trả nợ NCC', icon: '💸' },
    { key: 'other', label: 'Khác', icon: '📝' },
];

// Get Firestore Timestamp for N months ago (used to limit query scope)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _getMonthsAgoTimestamp(months: number): Timestamp {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return Timestamp.fromDate(d);
}

type RevenueOrderItem = Order['items'][number] & {
    isRepairTicket?: boolean;
    repairTicketId?: string;
    isOrderPayment?: boolean;
    orderPaymentId?: string;
};

function isRepairOrderItem(item: RevenueOrderItem) {
    return item.isRepairTicket === true || Boolean(item.repairTicketId);
}

function isOrderPaymentItem(item: RevenueOrderItem) {
    return item.isOrderPayment === true || Boolean(item.orderPaymentId);
}

function getRevenuePaymentTotal(order: Order) {
    return (order.paymentHistory || []).reduce((sum, payment) => {
        return payment.type === 'refund' ? sum - (payment.amount || 0) : sum + (payment.amount || 0);
    }, 0);
}

function getRetailOrderTotal(order: Order) {
    const items = (order.items || []) as RevenueOrderItem[];
    if (items.length === 0) return Number(order.total_amount) || 0;

    const hasNonRetailItems = items.some(item => isRepairOrderItem(item) || isOrderPaymentItem(item));
    if (!hasNonRetailItems) return Number(order.total_amount) || 0;

    const retailSubtotal = items
        .filter(item => !isRepairOrderItem(item) && !isOrderPaymentItem(item))
        .reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0);
    const retailDiscount = Math.min(Number(order.discount_amount) || 0, retailSubtotal);
    return Math.max(0, retailSubtotal - retailDiscount);
}

function getPaymentChannel(value: unknown): 'cash' | 'bank' | 'other' | 'debt' {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'CASH' || raw === 'TIEN_MAT') return 'cash';
    if (raw === 'BANK' || raw === 'QR' || raw === 'CARD' || raw.includes('CHUYEN')) return 'bank';
    if (raw === 'DEBT') return 'debt';
    return 'other';
}

function isImportDebt(receipt: ImportReceipt) {
    const method = String(receipt.paymentMethod || '').trim().toLowerCase();
    return method === 'debt' || receipt.paymentStatus === 'unpaid';
}

function isFirestorePermissionError(error: unknown) {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && (error as { code?: unknown }).code === 'permission-denied';
}

function capBreakdownToTotal(total: number, values: number[]) {
    let remaining = Math.max(0, total);
    return values.map((value) => {
        const capped = Math.min(Math.max(0, value), remaining);
        remaining -= capped;
        return capped;
    });
}

export default function RevenuePage() {
    const { user } = useAuth();
    // Data
    const [orders, setOrders] = useState<Order[]>([]);
    const [repairs, setRepairs] = useState<RepairTicket[]>([]);
    const [importReceipts, setImportReceipts] = useState<ImportReceipt[]>([]);
    const [commissions, setCommissions] = useState<Commission[]>([]);
    const [expenses, setExpenses] = useState<(Expense & { id: string })[]>([]);
    const [aggregateDays, setAggregateDays] = useState<RevenueAggregateDoc[]>([]);
    const [useAggregateData, setUseAggregateData] = useState(false);
    const [loading, setLoading] = useState(true);

    // Filters
    const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'custom'>('today');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    // Expense modal
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [expCategory, setExpCategory] = useState('other');
    const [expDescription, setExpDescription] = useState('');
    const [expAmount, setExpAmount] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showAllExpenses, setShowAllExpenses] = useState(false);
    const canCreateExpense = user?.role === 'admin';

    const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';
    const toDate = (ts: unknown) => {
        if (!ts) return null;
        const maybe = ts as { toDate?: () => Date };
        return typeof maybe?.toDate === 'function' ? maybe.toDate() : new Date(ts as string | number | Date);
    };

    // ── Date filter ──
    const getDateRange = useCallback(() => {
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
    }, [period, customFrom, customTo]);

    const inRange = useCallback((ts: unknown) => {
        const d = toDate(ts);
        if (!d) return false;
        const { from, to } = getDateRange();
        return d >= from && d <= to;
    }, [getDateRange]);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            const { from, to } = getDateRange();
            const canUseAggregates = isAggregateRangeAvailable(from);

            const loadSourceCollections = async () => {
                const diffTime = to.getTime() - from.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays > 32) {
                    setUseAggregateData(false);
                    setAggregateDays([]);
                    setOrders([]);
                    setRepairs([]);
                    setImportReceipts([]);
                    setCommissions([]);
                    setExpenses([]);
                    return;
                }

                const fromTs = Timestamp.fromDate(from);
                const toTs = Timestamp.fromDate(to);

                const [oSnap, rSnap, iSnap, cSnap, eSnap] = await Promise.all([
                    getDocs(query(collection(db, 'orders'), where('createdAt', '>=', fromTs), where('createdAt', '<=', toTs), orderBy('createdAt', 'desc'), limit(200))),
                    getDocs(query(collection(db, 'repairs'), where('createdAt', '>=', fromTs), where('createdAt', '<=', toTs), orderBy('createdAt', 'desc'), limit(200))),
                    getDocs(query(collection(db, 'import_receipts'), where('createdAt', '>=', fromTs), where('createdAt', '<=', toTs), orderBy('createdAt', 'desc'), limit(200))),
                    getDocs(query(collection(db, 'commissions'), where('createdAt', '>=', fromTs), where('createdAt', '<=', toTs), orderBy('createdAt', 'desc'), limit(200))),
                    getDocs(query(collection(db, 'expenses'), where('createdAt', '>=', fromTs), where('createdAt', '<=', toTs), orderBy('createdAt', 'desc'), limit(200))),
                ]);
                if (cancelled) return;
                setUseAggregateData(false);
                setAggregateDays([]);
                setOrders(oSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
                setRepairs(rSnap.docs.map(d => ({ id: d.id, ...d.data() } as RepairTicket)));
                setImportReceipts(iSnap.docs.map(d => ({ id: d.id, ...d.data() } as ImportReceipt)));
                setCommissions(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Commission)));
                setExpenses(eSnap.docs.map(d => ({ id: d.id, ...d.data() } as Expense & { id: string })));
            };

            try {
                if (canUseAggregates) {
                    try {
                        const [aggregateSnap, recentExpensesSnap] = await Promise.all([
                            getDocs(query(
                                collection(db, 'revenue_daily_aggregates'),
                                where('date', '>=', toRevenueDateId(from)),
                                where('date', '<=', toRevenueDateId(to)),
                                orderBy('date', 'asc'),
                            )),
                            getDocs(query(collection(db, 'expenses'), orderBy('createdAt', 'desc'), limit(50))),
                        ]);
                        if (cancelled) return;
                        setAggregateDays(aggregateSnap.docs.map(d => ({ id: d.id, ...d.data() } as RevenueAggregateDoc)));
                        setUseAggregateData(true);
                        setOrders([]);
                        setRepairs([]);
                        setImportReceipts([]);
                        setCommissions([]);
                        setExpenses(recentExpensesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Expense & { id: string })));
                        return;
                    } catch (aggregateError) {
                        if (!isFirestorePermissionError(aggregateError)) {
                            console.warn('Failed to load revenue aggregates:', aggregateError);
                        }
                        if (cancelled) return;
                        setUseAggregateData(true);
                        setAggregateDays([]);
                        setOrders([]);
                        setRepairs([]);
                        setImportReceipts([]);
                        setCommissions([]);
                        setExpenses([]);
                        return;
                    }
                }

                await loadSourceCollections();
            } catch (err) {
                if (!isFirestorePermissionError(err)) {
                    console.warn('Failed to load revenue data:', err);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [getDateRange]);

    // ── Revenue calculations ──
    const calculations = useMemo(() => {
        if (useAggregateData) {
            const totals = mergeRevenueAggregateDocs(aggregateDays);
            return {
                orderRevenue: totals.orderRevenue,
                repairRevenue: totals.repairRevenue,
                cashRevenue: totals.cashRevenue,
                bankRevenue: totals.bankRevenue,
                otherRevenue: totals.otherRevenue,
                debtRevenue: totals.debtRevenue,
                totalRevenue: totals.totalRevenue,
                totalGiftDiscount: totals.totalGiftDiscount,
                importCost: totals.importCost,
                importDebt: totals.importDebt,
                commissionCost: totals.commissionCost,
                manualExpenses: totals.manualExpenses,
                supplierPaymentCost: totals.supplierPaymentCost ?? 0,
                cashExpenses: totals.cashExpenses,
                bankExpenses: totals.bankExpenses,
                debtExpenses: totals.debtExpenses,
                totalExpenses: totals.totalExpenses,
                netProfit: totals.netProfit,
                webOrderCount: totals.webOrderCount,
                posOrderCount: totals.posOrderCount,
                webOrderRevenue: totals.webOrderRevenue,
                posOrderRevenue: totals.posOrderRevenue,
                repairCount: totals.repairCount,
                warrantyCount: totals.warrantyCount,
            };
        }

        // REVENUE (THU THỰC TẾ)
        let orderRevenue = 0;
        let debtRevenue = 0; // TỔNG GHI NỢ
        let cashRevenue = 0;
        let bankRevenue = 0;
        let otherRevenue = 0;

        orders.forEach(o => {
            if (inRange(o.completedAt || o.updatedAt || o.createdAt)) {
                if (o.paymentHistory && o.paymentHistory.length > 0) {
                    // Có lịch sử thanh toán (từ POS hoặc Thu nợ)
                    const paidSoFar = getRevenuePaymentTotal(o);
                    const retailTotal = getRetailOrderTotal(o);
                    const paidRetail = Math.min(paidSoFar, retailTotal);
                    orderRevenue += paidRetail;
                    (o.paymentHistory || []).forEach((payment) => {
                        if (payment.type === 'refund') return;
                        const amount = Math.max(0, payment.amount || 0);
                        const channel = getPaymentChannel(payment.method || o.payment_method);
                        if (channel === 'cash') cashRevenue += amount;
                        else if (channel === 'bank') bankRevenue += amount;
                        else if (channel !== 'debt') otherRevenue += amount;
                    });

                    if (o.paymentStatus === 'debt') {
                        debtRevenue += Math.max(0, retailTotal - paidRetail);
                    }
                } else if (o.status === 'Completed' || o.status === 'Shipping') {
                    // Đơn web cũ hoặc không có POS history, nhưng đã hoàn thành
                    if (o.paymentStatus === 'debt' || o.payment_method === 'Debt') {
                        debtRevenue += getRetailOrderTotal(o);
                    } else {
                        const retailTotal = getRetailOrderTotal(o);
                        orderRevenue += retailTotal;
                        const channel = getPaymentChannel(o.payment_method);
                        if (channel === 'cash') cashRevenue += retailTotal;
                        else if (channel === 'bank') bankRevenue += retailTotal;
                        else otherRevenue += retailTotal;
                    }
                }
            }
        });

        const repairRevenue = repairs
            .filter(r => r.ticketType !== 'warranty')
            .reduce((total, r) => {
                if (r.paymentHistory && r.paymentHistory.length > 0) {
                    const historySum = r.paymentHistory.reduce((sum, ph) => {
                        // ph.timestamp is usually a number (ms) or a date string
                        if (inRange(ph.timestamp || r.createdAt)) {
                            return ph.type === 'refund' ? sum - (ph.amount || 0) : sum + (ph.amount || 0);
                        }
                        return sum;
                    }, 0);
                    return total + historySum;
                } else {
                    // Legacy fallback
                    let rev = 0;
                    if (inRange(r.createdAt)) rev += (r.payment?.depositAmount || 0);
                    if (r.status === 'done' && inRange(r.timing?.completedAt)) {
                        rev += ((r.payment?.amount || 0) - (r.payment?.depositAmount || 0));
                    }
                    return total + rev;
                }
            }, 0);

        repairs
            .filter(r => r.ticketType !== 'warranty')
            .forEach((r) => {
                if (r.paymentHistory && r.paymentHistory.length > 0) {
                    r.paymentHistory.forEach((payment) => {
                        if (!inRange(payment.timestamp || r.createdAt) || payment.type === 'refund') return;
                        const amount = Math.max(0, payment.amount || 0);
                        const channel = getPaymentChannel(payment.method);
                        if (channel === 'cash') cashRevenue += amount;
                        else if (channel === 'bank') bankRevenue += amount;
                        else if (channel !== 'debt') otherRevenue += amount;
                    });
                }
            });

        // Khấu trừ quà tặng khỏi doanh thu ròng (Plan §3 + §5.4b)
        const totalGiftDiscount = repairs
            .filter(r => r.ticketType !== 'warranty' && r.status === 'done' && inRange(r.timing?.completedAt || r.createdAt))
            .reduce((sum, r) => sum + (r.payment?.giftDiscount || 0), 0);

        const totalRevenue = orderRevenue + repairRevenue;

        // EXPENSES (CHI)
        const importCost = importReceipts
            .filter(i => i.status === 'completed' && !isImportDebt(i) && inRange(i.completedAt || i.createdAt))
            .reduce((s, i) => s + (i.totalAmount || 0), 0);
        const importDebt = importReceipts
            .filter(i => i.status === 'completed' && isImportDebt(i) && inRange(i.completedAt || i.createdAt))
            .reduce((s, i) => s + (i.totalAmount || 0), 0);

        const commissionCost = commissions
            .filter(c => inRange(c.createdAt))
            .reduce((s, c) => s + (c.amount || 0), 0);

        const filteredExpenses = expenses.filter(e => inRange(e.createdAt));
        const supplierPaymentCost = filteredExpenses
            .filter(e => (e as { category?: string }).category === 'supplier_payment')
            .reduce((s, e) => s + (e.amount || 0), 0);
        const manualExpenses = filteredExpenses
            .filter(e => (e as { category?: string }).category !== 'supplier_payment')
            .reduce((s, e) => s + (e.amount || 0), 0);
        const cashExpenses = importReceipts
            .filter(i => i.status === 'completed' && !isImportDebt(i) && getPaymentChannel(i.paymentMethod) === 'cash' && inRange(i.completedAt || i.createdAt))
            .reduce((s, i) => s + (i.totalAmount || 0), 0) + manualExpenses;
        const bankExpenses = importReceipts
            .filter(i => i.status === 'completed' && !isImportDebt(i) && getPaymentChannel(i.paymentMethod) === 'bank' && inRange(i.completedAt || i.createdAt))
            .reduce((s, i) => s + (i.totalAmount || 0), 0);
        const debtExpenses = importDebt;

        const totalExpenses = importCost + commissionCost + manualExpenses + supplierPaymentCost;

        // NET PROFIT (trừ quà tặng)
        const netProfit = totalRevenue - totalExpenses - totalGiftDiscount;

        // Orders breakdown
        const completedRetailOrders = orders.filter(o => (o.status === 'Completed' || o.status === 'Shipping') && inRange(o.completedAt || o.updatedAt || o.createdAt) && getRetailOrderTotal(o) > 0);
        const webOrders = completedRetailOrders.filter(o => o.source !== 'pos');
        const posOrders = completedRetailOrders.filter(o => o.source === 'pos');
        const getActualRetailRevenue = (order: Order) => {
            const retailTotal = getRetailOrderTotal(order);
            if (order.paymentHistory && order.paymentHistory.length > 0) {
                return Math.min(getRevenuePaymentTotal(order), retailTotal);
            }
            if (order.paymentStatus === 'debt' || order.payment_method === 'Debt') return 0;
            return retailTotal;
        };

        return {
            orderRevenue, repairRevenue, cashRevenue, bankRevenue, otherRevenue, debtRevenue, totalRevenue, totalGiftDiscount,
            importCost, importDebt, commissionCost, manualExpenses, supplierPaymentCost, cashExpenses, bankExpenses, debtExpenses, totalExpenses,
            netProfit,
            webOrderCount: webOrders.length,
            posOrderCount: posOrders.length,
            webOrderRevenue: webOrders.reduce((s, o) => s + getActualRetailRevenue(o), 0),
            posOrderRevenue: posOrders.reduce((s, o) => s + getActualRetailRevenue(o), 0),
            repairCount: repairs.filter(r => r.status === 'done' && r.ticketType !== 'warranty' && inRange(r.timing?.completedAt || r.createdAt)).length,
            warrantyCount: repairs.filter(r => r.ticketType === 'warranty' && inRange(r.timing?.completedAt || r.createdAt)).length,
        };
    }, [useAggregateData, aggregateDays, orders, repairs, importReceipts, commissions, expenses, inRange]);

    const revenueDisplay = useMemo(() => {
        const channelTotal = calculations.cashRevenue + calculations.bankRevenue + calculations.otherRevenue;
        const unclassifiedRevenue = Math.max(0, calculations.totalRevenue - channelTotal);
        const [webOrderRevenue, posOrderRevenue, repairRevenue] = capBreakdownToTotal(
            calculations.totalRevenue,
            [calculations.webOrderRevenue, calculations.posOrderRevenue, calculations.repairRevenue],
        );

        return {
            unclassifiedRevenue,
            webOrderRevenue,
            posOrderRevenue,
            repairRevenue,
        };
    }, [calculations]);

    // ── Daily chart data ──
    const chartData = useMemo(() => {
        const { from, to } = getDateRange();
        if (useAggregateData) {
            const docsByDate = new Map(aggregateDays.map(day => [day.date, day]));
            const days: { date: string; revenue: number; expense: number }[] = [];
            const d = new Date(from);

            while (d <= to) {
                const dayStr = toRevenueDateId(d);
                const day = docsByDate.get(dayStr);
                days.push({
                    date: dayStr,
                    revenue: Number(day?.totalRevenue) || 0,
                    expense: Number(day?.totalExpenses) || 0,
                });
                d.setDate(d.getDate() + 1);
            }

            return days;
        }

        const days: { date: string; revenue: number; expense: number }[] = [];
        const d = new Date(from);

        while (d <= to) {
            const dayStr = d.toISOString().slice(0, 10);
            const dayStart = new Date(d);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(d);
            dayEnd.setHours(23, 59, 59, 999);

            const isInDay = (ts: unknown) => {
                const t = toDate(ts);
                return t && t >= dayStart && t <= dayEnd;
            };

            const repairRev = repairs
                .filter(r => r.ticketType !== 'warranty')
                .reduce((total, r) => {
                    if (r.paymentHistory && r.paymentHistory.length > 0) {
                        const historySum = r.paymentHistory.reduce((sum, ph) => {
                            if (isInDay(ph.timestamp || r.createdAt)) {
                                return ph.type === 'refund' ? sum - (ph.amount || 0) : sum + (ph.amount || 0);
                            }
                            return sum;
                        }, 0);
                        return total + historySum;
                    } else {
                        // Legacy fallback
                        let rev = 0;
                        if (isInDay(r.createdAt)) rev += (r.payment?.depositAmount || 0);
                        if (r.status === 'done' && isInDay(r.timing?.completedAt)) {
                            rev += ((r.payment?.amount || 0) - (r.payment?.depositAmount || 0));
                        }
                        return total + rev;
                    }
                }, 0);

            let rev = 0;
            orders.forEach(o => {
                if (isInDay(o.completedAt || o.updatedAt || o.createdAt)) {
                    if (o.paymentHistory && o.paymentHistory.length > 0) {
                        const paidSoFar = getRevenuePaymentTotal(o);
                        rev += Math.min(paidSoFar, getRetailOrderTotal(o));
                    } else if ((o.status === 'Completed' || o.status === 'Shipping') && o.paymentStatus !== 'debt' && o.payment_method !== 'Debt') {
                        rev += getRetailOrderTotal(o);
                    }
                }
            });
            rev += repairRev;

            const exp = importReceipts.filter(i => i.status === 'completed' && !isImportDebt(i) && isInDay(i.completedAt || i.createdAt)).reduce((s, i) => s + (i.totalAmount || 0), 0)
                + commissions.filter(c => isInDay(c.createdAt)).reduce((s, c) => s + (c.amount || 0), 0)
                + expenses.filter(e => isInDay(e.createdAt)).reduce((s, e) => s + (e.amount || 0), 0);

            days.push({ date: dayStr, revenue: rev, expense: exp });
            d.setDate(d.getDate() + 1);
        }
        return days;
    }, [useAggregateData, aggregateDays, orders, repairs, importReceipts, commissions, expenses, getDateRange]);

    // Chart max value for scaling
    const chartMax = Math.max(1, ...chartData.map(d => Math.max(d.revenue, d.expense)));

    // ── Save expense ──
    const handleSaveExpense = async () => {
        if (expAmount <= 0) return;
        setIsProcessing(true);
        try {
            const { getAuthInstance } = await import('@/lib/firebase');
            const auth = await getAuthInstance();
            const token = await auth.currentUser?.getIdToken();
            const res = await fetch('/api/revenue/expenses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    category: expCategory,
                    description: expDescription,
                    amount: expAmount,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Không thể tạo phiếu chi');
            }

            const expense = data.expense as Expense & { id: string };
            const expenseForState = {
                id: expense.id,
                category: expCategory,
                description: expDescription,
                amount: expAmount,
                date: new Date(String(expense.date)),
                createdBy: expense.createdBy,
                createdByName: expense.createdByName,
                createdAt: new Date(String(expense.createdAt)),
            } as Expense & { id: string };

            setExpenses(prev => [expenseForState, ...prev]);
            if (useAggregateData) {
                setAggregateDays(prev => applyRevenueAggregateDelta(prev, new Date(String(expense.createdAt)), { manualExpenses: expAmount }));
            }
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
                    <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="text-orange-500" /> Bảng điều khiển Tài chính
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Tổng hợp THU — CHI — LỢI NHUẬN</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Period filter */}
                    {(['today', 'week', 'month', 'custom'] as const).map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p
                                ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {periodLabel[p]}
                        </button>
                    ))}
                    {canCreateExpense && (
                        <button onClick={() => setShowExpenseModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-xs font-semibold">
                        <Plus size={14} /> Tạo phiếu chi
                        </button>
                    )}
                </div>
            </div>

            {/* Custom date range */}
            {period === 'custom' && (
                <div className="flex flex-wrap gap-3 items-center bg-gray-50 rounded-xl px-3 py-1.5 text-xs">
                    <Calendar size={16} className="text-gray-400" />
                    <input type="date" title="Ngày bắt đầu" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                        className="px-3 py-1.5 border rounded-lg text-sm" />
                    <span className="text-gray-400">→</span>
                    <input type="date" title="Ngày kết thúc" value={customTo} onChange={e => setCustomTo(e.target.value)}
                        className="px-3 py-1.5 border rounded-lg text-sm" />
                </div>
            )}

            {/* ═══ Main KPI Cards ═══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* TỔNG THU */}
                <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-green-200/50 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-green-100 text-sm mb-1">
                            <ArrowUpRight size={18} /> THỰC THU
                        </div>
                        <p className="text-3xl font-bold">{formatPrice(calculations.totalRevenue)}</p>
                        {calculations.debtRevenue > 0 && (
                            <p className="text-sm text-orange-200 mt-1 font-medium border-t border-white/20 pt-1">
                                + Ghi nợ: {formatPrice(calculations.debtRevenue)}
                            </p>
                        )}
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-green-100">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-green-50/80">Theo kênh thu</div>
                        <div className="flex justify-between"><span>Tiền mặt</span><span>{formatPrice(calculations.cashRevenue)}</span></div>
                        <div className="flex justify-between"><span>Chuyển khoản/QR</span><span>{formatPrice(calculations.bankRevenue)}</span></div>
                        {calculations.otherRevenue > 0 && (
                            <div className="flex justify-between"><span>Khác</span><span>{formatPrice(calculations.otherRevenue)}</span></div>
                        )}
                        {revenueDisplay.unclassifiedRevenue > 0 && (
                            <div className="flex justify-between text-amber-100"><span>Chưa phân loại kênh</span><span>{formatPrice(revenueDisplay.unclassifiedRevenue)}</span></div>
                        )}
                        <div className="pt-2 text-[11px] font-bold uppercase tracking-wide text-green-50/80">Theo nguồn thu</div>
                        <div className="flex justify-between"><span>🌐 Web ({calculations.webOrderCount})</span><span>{formatPrice(revenueDisplay.webOrderRevenue)}</span></div>
                        <div className="flex justify-between"><span>🏪 POS ({calculations.posOrderCount})</span><span>{formatPrice(revenueDisplay.posOrderRevenue)}</span></div>
                        <div className="flex justify-between"><span>🔧 Sửa chữa ({calculations.repairCount})</span><span>{formatPrice(revenueDisplay.repairRevenue)}</span></div>
                    </div>
                </div>

                {/* TỔNG CHI */}
                <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-5 text-white shadow-lg shadow-red-200/50">
                    <div className="flex items-center gap-2 text-red-100 text-sm mb-1">
                        <ArrowDownLeft size={18} /> TỔNG CHI
                    </div>
                    <p className="text-3xl font-bold">{formatPrice(calculations.totalExpenses)}</p>
                    <div className="mt-3 space-y-1 text-xs text-red-100">
                        <div className="flex justify-between"><span>Tien mat</span><span>{formatPrice(calculations.cashExpenses)}</span></div>
                        <div className="flex justify-between"><span>Chuyen khoan</span><span>{formatPrice(calculations.bankExpenses)}</span></div>
                        {calculations.debtExpenses > 0 && (
                            <div className="flex justify-between text-orange-100"><span>Ghi no</span><span>{formatPrice(calculations.debtExpenses)}</span></div>
                        )}
                        <div className="flex justify-between"><span>📦 Nhập hàng đã trả</span><span>{formatPrice(calculations.importCost)}</span></div>
                        {calculations.importDebt > 0 && (
                            <div className="flex justify-between text-orange-100"><span>Công nợ NCC</span><span>{formatPrice(calculations.importDebt)}</span></div>
                        )}
                        <div className="flex justify-between"><span>🏆 Hoa hồng</span><span>{formatPrice(calculations.commissionCost)}</span></div>
                        {calculations.supplierPaymentCost > 0 && (
                            <div className="flex justify-between"><span>💸 Trả nợ NCC</span><span>{formatPrice(calculations.supplierPaymentCost)}</span></div>
                        )}
                        <div className="flex justify-between"><span>📝 Chi phí khác</span><span>{formatPrice(calculations.manualExpenses)}</span></div>
                        {calculations.totalGiftDiscount > 0 && (
                            <div className="flex justify-between"><span>🎁 Quà tặng</span><span>{formatPrice(calculations.totalGiftDiscount)}</span></div>
                        )}
                    </div>
                </div>

                {/* LỢI NHUẬN */}
                <div className={`md:col-span-2 lg:col-span-1 bg-gradient-to-br ${calculations.netProfit >= 0 ? 'from-blue-500 to-indigo-600 shadow-blue-200/50' : 'from-gray-500 to-gray-700 shadow-gray-200/50'} rounded-2xl p-5 text-white shadow-lg flex flex-col justify-between`}>
                    <div>
                        <div className="flex items-center gap-2 text-blue-100 text-sm mb-1">
                            <Wallet size={18} /> LỢI NHUẬN RÒNG
                        </div>
                        <p className="text-3xl font-bold">{formatPrice(calculations.netProfit)}</p>
                    </div>
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
                                        title={`Thu: ${formatPrice(d.revenue)}`}
                                        className="w-full bg-green-400 rounded-t-sm hover:bg-green-500 transition-colors"
                                        style={{ height: `${(d.revenue / chartMax) * 160}px`, minHeight: d.revenue > 0 ? '4px' : '0px' }}
                                    />
                                    {/* Expense bar */}
                                    <div
                                        title={`Chi: ${formatPrice(d.expense)}`}
                                        className="w-full bg-red-400 rounded-b-sm hover:bg-red-500 transition-colors"
                                        style={{ height: `${(d.expense / chartMax) * 160}px`, minHeight: d.expense > 0 ? '4px' : '0px' }}
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
                {/* Mobile Card View */}
                <div className="block lg:hidden divide-y divide-gray-100">
                    {(showAllExpenses ? expenses : expenses.slice(0, 10)).map(e => {
                        const cat = expenseCategories.find(c => c.key === e.category);
                        return (
                            <div key={e.id} className="p-4 hover:bg-gray-50 transition-colors">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900">{cat?.icon} {cat?.label || e.category}</p>
                                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{e.description || '—'}</p>
                                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                                            <span>{toDate(e.createdAt)?.toLocaleDateString('vi-VN') || '—'}</span>
                                            <span>·</span>
                                            <span>{e.createdByName}</span>
                                        </div>
                                    </div>
                                    <p className="font-bold text-red-600 text-sm ml-3 shrink-0">{formatPrice(e.amount)}</p>
                                </div>
                            </div>
                        );
                    })}
                    {expenses.length === 0 && (
                        <div className="text-center py-8 text-gray-400 text-sm">Chưa có phiếu chi</div>
                    )}
                </div>
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-500 text-xs border-b bg-gray-50">
                                <th className="text-left px-4 py-3">Ngày</th>
                                <th className="text-left px-4 py-3">Danh mục</th>
                                <th className="text-left px-4 py-3">Mô tả</th>
                                <th className="text-left px-4 py-3">Người tạo</th>
                                <th className="text-right px-4 py-3">Số tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(showAllExpenses ? expenses : expenses.slice(0, 10)).map(e => {
                                const cat = expenseCategories.find(c => c.key === e.category);
                                return (
                                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors duration-200">
                                        <td className="px-4 py-3 text-xs text-gray-500">
                                            {toDate(e.createdAt)?.toLocaleDateString('vi-VN') || '—'}
                                        </td>
                                        <td className="px-4 py-3"><span className="text-xs">{cat?.icon} {cat?.label || e.category}</span></td>
                                        <td className="px-4 py-3 text-gray-600">{e.description || '—'}</td>
                                        <td className="px-4 py-3 text-xs text-gray-400">{e.createdByName}</td>
                                        <td className="px-4 py-3 text-right font-bold text-red-600">{formatPrice(e.amount)}</td>
                                    </tr>
                                );
                            })}
                            {expenses.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 text-gray-400 text-sm">Chưa có phiếu chi</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {expenses.length > 10 && (
                    <div className="flex justify-center py-3 border-t">
                        <button
                            onClick={() => setShowAllExpenses(prev => !prev)}
                            className="text-sm text-orange-500 hover:text-orange-600 font-medium px-4 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                        >
                            {showAllExpenses ? 'Thu gọn' : `Xem tất cả (${expenses.length})`}
                        </button>
                    </div>
                )}
            </div>

            {/* ═══ Expense Modal ═══ */}
            <Modal isOpen={showExpenseModal} onClose={() => setShowExpenseModal(false)} title="Tạo phiếu chi" size="md">
                <div className="px-6 py-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Danh mục</label>
                        <select title="Chọn danh mục" value={expCategory} onChange={e => setExpCategory(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs border rounded-lg bg-white">
                            {expenseCategories.filter(c => c.key !== 'supplier_payment').map(c => (
                                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                        <input type="text" value={expDescription} onChange={e => setExpDescription(e.target.value)}
                            placeholder="VD: Tiền điện tháng 2"
                            className="w-full px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VNĐ)</label>
                        <CurrencyInput value={expAmount || ''} onChange={v => setExpAmount(v)}
                            placeholder="0"
                            className="w-full px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-orange-500/20 text-lg font-bold" />
                    </div>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t">
                    <button onClick={() => setShowExpenseModal(false)}
                        className="px-3 py-1.5 text-xs text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                    <button onClick={handleSaveExpense} disabled={isProcessing || expAmount <= 0}
                        className="px-5 py-2 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center gap-2">
                        {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                        Lưu phiếu chi
                    </button>
                </div>
            </Modal>
        </div>
    );
}
