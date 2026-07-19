'use client';

import { useState, useEffect } from 'react';
import {
    Award, Plus, Percent, Save, Loader2, FileText, Trash2
} from 'lucide-react';
import Modal from '@/components/admin/Modal';
import CurrencyInput from '@/components/admin/CurrencyInput';
import { collection, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, where, limit, Timestamp, setDoc } from 'firebase/firestore';
import { getDocs, getDoc } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { appConfirm } from '@/lib/appDialog';
import type { CommissionRule, Commission, CommissionPriceRange, FirestoreWriteTimestamp } from '@/lib/types';
import { toastError } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { generateSlug } from '@/lib/utils';

const COMMISSION_HISTORY_LIMIT = 300;
const COMMISSION_RULE_LIMIT = 100;

function buildCommissionRuleBaseId(input: {
    name: string;
    type: string;
    targetType: string;
    targetValue: string;
}) {
    const slug = generateSlug([
        input.name,
        input.type,
        input.targetType !== 'general' ? input.targetValue : '',
    ].filter(Boolean).join('-')).slice(0, 90) || 'rule';
    return `COMR-${slug}`;
}

async function getAvailableCommissionRuleId(baseId: string) {
    for (let i = 0; i < 50; i += 1) {
        const candidate = i === 0 ? baseId : `${baseId}-${i + 1}`;
        const snap = await getDoc(doc(db, 'commission_rules', candidate));
        if (!snap.exists()) return candidate;
    }
    throw new Error('Không thể tạo mã quy tắc hoa hồng không trùng.');
}

function getMonthRange(monthValue: string): { start: Timestamp; end: Timestamp } {
    const [yearRaw, monthRaw] = monthValue.split('-').map(Number);
    const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
    const monthIndex = Number.isFinite(monthRaw) ? monthRaw - 1 : new Date().getMonth();
    return {
        start: Timestamp.fromDate(new Date(year, monthIndex, 1)),
        end: Timestamp.fromDate(new Date(year, monthIndex + 1, 1)),
    };
}

function normalizePriceRanges(ranges: CommissionPriceRange[]) {
    return ranges
        .map((range) => ({
            min: Math.max(0, Math.round(Number(range.min) || 0)),
            max: range.max ? Math.max(0, Math.round(Number(range.max) || 0)) : undefined,
            amount: Math.max(0, Math.round(Number(range.amount) || 0)),
        }))
        .filter((range) => range.amount > 0)
        .sort((a, b) => a.min - b.min);
}

function getRuleDisplayValue(rule: CommissionRule) {
    if (rule.calculationMode === 'fixed_by_price_range') return 'Bậc giá';
    if (rule.calculationMode === 'fixed' || rule.fixedAmount) return `${(rule.fixedAmount || 0).toLocaleString('vi-VN')}đ`;
    return `${rule.percentage}%`;
}

export default function CommissionsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [rules, setRules] = useState<(CommissionRule & { id: string })[]>([]);
    const [commissions, setCommissions] = useState<(Commission & { id: string })[]>([]);
    const [staffList, setStaffList] = useState<Array<{ uid: string; displayName?: string; role?: string }>>([]);
    const [loading, setLoading] = useState(true);
    const isAdmin = user?.role === 'admin';
    const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules');

    useEffect(() => {
        if (user && !isAdmin) {
            router.replace('/admin/dashboard');
        }
    }, [user, isAdmin, router]);

    // Rule modal
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRule, setEditingRule] = useState<(CommissionRule & { id: string }) | null>(null);
    const [ruleName, setRuleName] = useState('');
    const [ruleType, setRuleType] = useState<'repair' | 'order' | 'all'>('all');
    const [ruleCalculationMode, setRuleCalculationMode] = useState<'percentage' | 'fixed' | 'fixed_by_price_range'>('percentage');
    const [rulePercentage, setRulePercentage] = useState(5);
    const [ruleFixedAmount, setRuleFixedAmount] = useState(0);
    const [rulePriceRanges, setRulePriceRanges] = useState<CommissionPriceRange[]>([
        { min: 0, max: 5000000, amount: 50000 },
        { min: 5000001, max: 10000000, amount: 100000 },
        { min: 10000001, amount: 150000 },
    ]);
    const [ruleActive, setRuleActive] = useState(true);
    const [ruleHierarchy, setRuleHierarchy] = useState<1 | 2 | 3>(1);
    const [ruleTargetType, setRuleTargetType] = useState<'general' | 'category' | 'specific'>('general');
    const [ruleTargetValue, setRuleTargetValue] = useState('');
    const [ruleApplyAfterDiscount, setRuleApplyAfterDiscount] = useState(false);

    // Manual commission modal
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualStaffId, setManualStaffId] = useState('');
    const [manualAmount, setManualAmount] = useState(0);
    const [manualBaseAmount, setManualBaseAmount] = useState(0);
    const [manualSourceType, setManualSourceType] = useState<'repair' | 'order'>('repair');
    const [manualSourceId, setManualSourceId] = useState('');

    const [isProcessing, setIsProcessing] = useState(false);
    const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

    // ── Load data ──
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const { start, end } = getMonthRange(filterMonth);
                const [rulesSnap, commSnap, staffSnap] = await Promise.all([
                    getDocs(query(collection(db, 'commission_rules'), orderBy('createdAt', 'desc'), limit(COMMISSION_RULE_LIMIT))),
                    getDocs(query(
                        collection(db, 'commissions'),
                        where('createdAt', '>=', start),
                        where('createdAt', '<', end),
                        orderBy('createdAt', 'desc'),
                        limit(COMMISSION_HISTORY_LIMIT),
                    )),
                    getDocs(query(collection(db, 'users'), where('role', 'in', ['staff', 'admin']))),
                ]);
                setRules(rulesSnap.docs.map(d => ({ id: d.id, ...d.data() } as CommissionRule & { id: string })));
                setCommissions(commSnap.docs.map(d => ({ id: d.id, ...d.data() } as Commission & { id: string })));
                setStaffList(staffSnap.docs.map(d => ({ uid: d.id, ...(d.data() as Partial<{ displayName: string; role: string }>) })));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [filterMonth]);

    const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';
    const formatDate = (ts: unknown) => {
        if (!ts) return '—';
        const maybe = ts as { toDate?: () => Date };
        const d = typeof maybe?.toDate === 'function' ? maybe.toDate() : new Date(ts as string | number | Date);
        return d.toLocaleDateString('vi-VN');
    };

    const filteredCommissions = commissions.filter(c => {
        // Staff: only show their own commissions
        if (!isAdmin && user?.uid && c.staffId !== user.uid) return false;
        if (!c.createdAt) return true;
        const d = (typeof c.createdAt === 'object'
            && c.createdAt !== null
            && 'toDate' in c.createdAt
            && typeof (c.createdAt as { toDate?: unknown }).toDate === 'function')
            ? (c.createdAt as { toDate: () => Date }).toDate()
            : new Date(c.createdAt as never);
        return d.toISOString().slice(0, 7) === filterMonth;
    });

    // ── Aggregate by staff ──
    const staffStats = filteredCommissions.reduce((acc, c) => {
        if (!acc[c.staffId]) acc[c.staffId] = { name: c.staffName, total: 0, count: 0 };
        acc[c.staffId].total += c.amount;
        acc[c.staffId].count += 1;
        return acc;
    }, {} as Record<string, { name: string; total: number; count: number }>);

    const totalCommission = Math.round(filteredCommissions.reduce((s, c) => s + c.amount, 0));

    // ── Save rule ──
    const handleSaveRule = async () => {
        if (!ruleName) return;
        setIsProcessing(true);
        try {
            const data = {
                name: ruleName,
                type: ruleType,
                calculationMode: ruleCalculationMode,
                percentage: rulePercentage,
                fixedAmount: ruleCalculationMode === 'fixed' ? ruleFixedAmount : 0,
                priceRanges: ruleCalculationMode === 'fixed_by_price_range' ? normalizePriceRanges(rulePriceRanges) : [],
                isActive: ruleActive,
                hierarchyLevel: ruleHierarchy,
                targetType: ruleTargetType,
                targetValue: ruleTargetType !== 'general' ? ruleTargetValue : '',
                applyAfterDiscount: ruleApplyAfterDiscount,
                updatedAt: serverTimestamp(),
            };
            if (editingRule) {
                await updateDoc(doc(db, 'commission_rules', editingRule.id), data);
                setRules(prev => prev.map(r => r.id === editingRule.id ? { ...r, ...data } : r));
            } else {
                const ruleId = await getAvailableCommissionRuleId(buildCommissionRuleBaseId(data));
                await setDoc(doc(db, 'commission_rules', ruleId), { ...data, createdAt: serverTimestamp() });
                setRules(prev => [{ id: ruleId, ...data, createdAt: serverTimestamp() as FirestoreWriteTimestamp } as CommissionRule & { id: string }, ...prev]);
            }
            setShowRuleModal(false);
        } catch (err) {
            console.error(err);
            toastError('Lỗi!');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Delete rule ──
    const handleDeleteRule = async (id: string) => {
        if (!await appConfirm('Xóa quy tắc này?', { title: 'Xóa quy tắc', confirmText: 'Xóa', destructive: true })) return;
        await deleteDoc(doc(db, 'commission_rules', id));
        setRules(prev => prev.filter(r => r.id !== id));
    };

    // ── Open rule modal ──
    const openRuleModal = (rule?: CommissionRule & { id: string }) => {
        if (rule) {
            setEditingRule(rule);
            setRuleName(rule.name);
            setRuleType(rule.type);
            setRuleCalculationMode(rule.calculationMode || (rule.fixedAmount ? 'fixed' : 'percentage'));
            setRulePercentage(rule.percentage);
            setRuleFixedAmount(rule.fixedAmount || 0);
            setRulePriceRanges(rule.priceRanges?.length ? rule.priceRanges : [{ min: 0, max: 0, amount: 0 }]);
            setRuleActive(rule.isActive);
            setRuleHierarchy(rule.hierarchyLevel || 1);
            setRuleTargetType(rule.targetType || 'general');
            setRuleTargetValue(rule.targetValue || '');
            setRuleApplyAfterDiscount(rule.applyAfterDiscount || false);
        } else {
            setEditingRule(null);
            setRuleName('');
            setRuleType('all');
            setRuleCalculationMode('percentage');
            setRulePercentage(5);
            setRuleFixedAmount(0);
            setRulePriceRanges([
                { min: 0, max: 5000000, amount: 50000 },
                { min: 5000001, max: 10000000, amount: 100000 },
                { min: 10000001, amount: 150000 },
            ]);
            setRuleActive(true);
            setRuleHierarchy(1);
            setRuleTargetType('general');
            setRuleTargetValue('');
            setRuleApplyAfterDiscount(false);
        }
        setShowRuleModal(true);
    };

    // ── Manual commission entry ──
    const handleManualCommission = async () => {
        if (!manualStaffId || manualAmount <= 0) return;
        setIsProcessing(true);
        try {
            const { getAuthInstance } = await import('@/lib/firebase');
            const auth = await getAuthInstance();
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('Missing admin auth token');

            const res = await fetch('/api/admin/commissions/manual', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    staffId: manualStaffId,
                    sourceType: manualSourceType,
                    sourceId: manualSourceId || 'manual-entry',
                    amount: manualAmount,
                    baseAmount: manualBaseAmount,
                    idempotencyKey: crypto.randomUUID(),
                }),
            });
            const response = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(response.error || 'Failed to create manual commission');
            }

            const commission = response.commission as Commission & { id: string };
            const data = {
                staffId: manualStaffId,
                staffName: commission.staffName || 'N/A',
                ruleId: 'manual',
                sourceType: manualSourceType,
                sourceId: manualSourceId || 'manual-entry',
                amount: manualAmount,
                baseAmount: manualBaseAmount,
                createdAt: new Date(String(commission.createdAt)),
            };
            setCommissions(prev => [{ id: commission.id, ...data } as Commission & { id: string }, ...prev]);
            setShowManualModal(false);
            setManualStaffId('');
            setManualAmount(0);
            setManualBaseAmount(0);
            setManualSourceId('');
        } catch (err) {
            console.error(err);
        } finally {
            setIsProcessing(false);
        }
    };

    const typeLabel = { repair: 'Sửa chữa', order: 'Đơn hàng', all: 'Tất cả' };

    const { paginatedData: paginatedCommissions, currentPage: commPage, totalPages: commTotalPages, pageSize: commPageSize, totalFiltered: commTotalFiltered, setPage: commSetPage, setPageSize: commSetPageSize, resetPage: commResetPage } = useClientPagination(filteredCommissions, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { commResetPage(); }, [filterMonth, activeTab]);

    if (loading) return (
        <div className="flex items-center justify-center h-[60vh]">
            <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
    );

    return (
        <div className="p-4 md:p-6 space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Award className="text-orange-500" /> Hoa hồng nhân viên
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Quản lý quy tắc & theo dõi hoa hồng</p>
                </div>
            </div>

            {/* Stats */}
            <div className={`grid grid-cols-2 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-2'} gap-3`}>
                {isAdmin && (
                    <div className="bg-white rounded-xl border p-3">
                        <p className="text-xs text-gray-500">Quy tắc đang hoạt động</p>
                        <p className="text-lg font-bold text-green-600">{rules.filter(r => r.isActive).length}</p>
                    </div>
                )}
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Tổng HH tháng {filterMonth.split('-')[1]}</p>
                    <p className="text-lg font-bold text-orange-600">{formatPrice(totalCommission)}</p>
                </div>
                <div className="bg-white rounded-xl border p-3">
                    <p className="text-xs text-gray-500">Số lượt tính HH</p>
                    <p className="text-lg font-bold text-blue-600">{filteredCommissions.length}</p>
                </div>
                {isAdmin && (
                    <div className="bg-white rounded-xl border p-3">
                        <p className="text-xs text-gray-500">Nhân viên có HH</p>
                        <p className="text-lg font-bold text-purple-600">{Object.keys(staffStats).length}</p>
                    </div>
                )}
            </div>

            {/* Tabs - only show for admin */}
            {isAdmin && (
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                    {[
                        { key: 'rules' as const, label: 'Quy tắc hoa hồng', icon: Percent },
                        { key: 'history' as const, label: 'Lịch sử hoa hồng', icon: FileText },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key
                                ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <tab.icon size={16} /> {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {/* ═══ Tab: Rules ═══ */}
            {activeTab === 'rules' && (
                <div className="space-y-3">
                    <div className="flex justify-end">
                        <button onClick={() => openRuleModal()}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-orange-500 text-white rounded-xl hover:bg-orange-600 text-sm font-semibold shadow-md shadow-orange-200/50">
                            <Plus size={16} /> Thêm quy tắc
                        </button>
                    </div>

                    {rules.map(rule => (
                        <div key={rule.id} className={`bg-white rounded-xl border p-3 flex items-center gap-4 ${!rule.isActive ? 'opacity-50' : ''}`}>
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${rule.isActive ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>
                                {getRuleDisplayValue(rule)}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-800">{rule.name}</p>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${(rule.hierarchyLevel || 1) === 3 ? 'bg-red-100 text-red-700' :
                                            (rule.hierarchyLevel || 1) === 2 ? 'bg-blue-100 text-blue-700' :
                                                'bg-gray-100 text-gray-700'
                                        }`}>
                                        Cấp {rule.hierarchyLevel || 1}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500">
                                    Áp dụng: {typeLabel[rule.type]} • {rule.isActive ? '✅ Đang hoạt động' : '⏸️ Tạm dừng'}
                                    {rule.targetType === 'category' && rule.targetValue && ` • DM: ${rule.targetValue}`}
                                    {rule.targetType === 'specific' && rule.targetValue && ` • SP: ${rule.targetValue}`}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => openRuleModal(rule)}
                                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Sửa</button>
                                <button onClick={() => handleDeleteRule(rule.id)}
                                    className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg">Xóa</button>
                            </div>
                        </div>
                    ))}

                    {rules.length === 0 && (
                        <div className="text-center py-16 text-gray-400">
                            <Award size={48} className="mx-auto mb-3 opacity-50" />
                            <p>Chưa có quy tắc hoa hồng</p>
                        </div>
                    )}
                </div>
            )}

            {/* ═══ Tab: History ═══ */}
            {activeTab === 'history' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <input type="month" title="Chọn tháng" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                            className="px-3 py-1.5 text-xs border rounded-xl text-sm bg-white" />
                        {isAdmin && (
                            <button onClick={() => setShowManualModal(true)}
                                className="flex items-center gap-2 px-3 py-1.5 text-xs bg-blue-500 text-white rounded-xl hover:bg-blue-600 text-sm font-semibold">
                                <Plus size={16} /> Thêm thủ công
                            </button>
                        )}
                    </div>

                    {/* Staff summary */}
                    {Object.keys(staffStats).length > 0 && (
                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border border-orange-200 p-4">
                            <h3 className="text-sm font-bold text-orange-800 mb-2">Tổng kết theo nhân viên</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {Object.entries(staffStats).map(([id, s]) => (
                                    <div key={id} className="bg-white rounded-lg p-2.5 border border-orange-100">
                                        <p className="text-xs font-semibold text-gray-800 truncate">{s.name}</p>
                                        <p className="text-sm font-bold text-orange-600">{formatPrice(s.total)}</p>
                                        <p className="text-[10px] text-gray-400">{s.count} lượt</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Commission list */}
                    <div className="bg-white rounded-xl border overflow-hidden">
                        {/* Mobile Card View */}
                        <div className="block lg:hidden divide-y divide-gray-100">
                            {paginatedCommissions.map(c => (
                                <div key={c.id} className="p-4 hover:bg-gray-50 transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-gray-900 text-sm">{c.staffName}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.sourceType === 'repair' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                                    {c.sourceType === 'repair' ? 'Sửa chữa' : 'Đơn hàng'}
                                                </span>
                                                <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>
                                            </div>
                                        </div>
                                        <div className="text-right ml-3 shrink-0">
                                            <p className="font-bold text-orange-600 text-sm">{formatPrice(c.amount)}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">Gốc: {formatPrice(c.baseAmount)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Desktop Table View */}
                        <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500 text-xs border-b border-gray-100 bg-gray-50">
                                    <th className="text-left px-4 py-3">Ngày</th>
                                    <th className="text-left">Nhân viên</th>
                                    <th className="text-left">Loại</th>
                                    <th className="text-right">Doanh thu gốc</th>
                                    <th className="text-right px-4">Hoa hồng</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedCommissions.map(c => (
                                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.createdAt)}</td>
                                        <td className="font-medium">{c.staffName}</td>
                                        <td>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.sourceType === 'repair' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                                {c.sourceType === 'repair' ? 'Sửa chữa' : 'Đơn hàng'}
                                            </span>
                                        </td>
                                        <td className="text-right text-gray-500">{formatPrice(c.baseAmount)}</td>
                                        <td className="text-right px-4 font-bold text-orange-600">{formatPrice(c.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                        {filteredCommissions.length === 0 && (
                            <div className="text-center py-12 text-gray-400 text-sm">Chưa có hoa hồng trong tháng này</div>
                        )}
                    </div>
                    <PaginationBar
                        currentPage={commPage}
                        totalPages={commTotalPages}
                        pageSize={commPageSize}
                        totalFiltered={commTotalFiltered}
                        totalAll={commissions.length}
                        onPageChange={commSetPage}
                        onPageSizeChange={commSetPageSize}
                        entityLabel="hoa hồng"
                    />
                </div>
            )}

            {/* ═══ Rule Modal ═══ */}
            <Modal isOpen={showRuleModal} onClose={() => setShowRuleModal(false)} title={editingRule ? 'Sửa quy tắc' : 'Thêm quy tắc mới'} size="md">
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tên quy tắc</label>
                                <input type="text" value={ruleName} onChange={e => setRuleName(e.target.value)}
                                    placeholder="VD: Hoa hồng sửa chữa cơ bản"
                                    className="w-full px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
                                    <select
                                        title="Chọn loại"
                                        value={ruleType}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === 'all' || v === 'repair' || v === 'order') {
                                                setRuleType(v);
                                                if (!editingRule && v === 'repair') {
                                                    setRuleCalculationMode('percentage');
                                                    setRulePercentage(2);
                                                }
                                                if (!editingRule && v === 'order' && ruleCalculationMode === 'percentage') {
                                                    setRuleCalculationMode('fixed_by_price_range');
                                                }
                                            }
                                        }}
                                        className="w-full px-3 py-1.5 text-xs border rounded-lg bg-white">
                                        <option value="all">Tất cả</option>
                                        <option value="repair">Sửa chữa</option>
                                        <option value="order">Đơn hàng</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">% Hoa hồng</label>
                                    <input type="number" title="Nhập % hoa hồng" placeholder="Nhập % hoa hồng" value={rulePercentage} onChange={e => setRulePercentage(Number(e.target.value))}
                                        min={0} max={100}
                                        className="w-full px-3 py-1.5 text-xs border rounded-lg" />
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-xl p-3 space-y-3 border border-gray-200">
                                <label className="block text-xs font-semibold text-gray-700">Cách tính hoa hồng</label>
                                <select
                                    title="Chọn cách tính hoa hồng"
                                    value={ruleCalculationMode}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === 'percentage' || value === 'fixed' || value === 'fixed_by_price_range') {
                                            setRuleCalculationMode(value);
                                        }
                                    }}
                                    className="w-full px-3 py-2 text-sm border rounded-lg bg-white"
                                >
                                    <option value="percentage">Phần trăm theo doanh thu</option>
                                    <option value="fixed">Số tiền cố định</option>
                                    <option value="fixed_by_price_range">Số tiền cố định theo khoảng giá bán máy</option>
                                </select>

                                {ruleCalculationMode === 'fixed' && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Tiền hoa hồng cố định</label>
                                        <CurrencyInput
                                            value={ruleFixedAmount || ''}
                                            onChange={setRuleFixedAmount}
                                            placeholder="0"
                                            className="w-full px-3 py-2 text-sm border rounded-lg bg-white"
                                        />
                                    </div>
                                )}

                                {ruleCalculationMode === 'fixed_by_price_range' && (
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[11px] font-semibold text-gray-500">
                                            <span>Từ giá</span>
                                            <span>Đến giá</span>
                                            <span>HH cố định</span>
                                            <span />
                                        </div>
                                        {rulePriceRanges.map((range, index) => (
                                            <div key={index} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                                                <CurrencyInput
                                                    value={range.min || ''}
                                                    onChange={(value) => setRulePriceRanges(prev => prev.map((item, i) => i === index ? { ...item, min: value } : item))}
                                                    placeholder="0"
                                                    className="w-full px-2 py-1.5 text-sm border rounded bg-white"
                                                />
                                                <CurrencyInput
                                                    value={range.max || ''}
                                                    onChange={(value) => setRulePriceRanges(prev => prev.map((item, i) => i === index ? { ...item, max: value || undefined } : item))}
                                                    placeholder="Không giới hạn"
                                                    className="w-full px-2 py-1.5 text-sm border rounded bg-white"
                                                />
                                                <CurrencyInput
                                                    value={range.amount || ''}
                                                    onChange={(value) => setRulePriceRanges(prev => prev.map((item, i) => i === index ? { ...item, amount: value } : item))}
                                                    placeholder="0"
                                                    className="w-full px-2 py-1.5 text-sm border rounded bg-white"
                                                />
                                                <button
                                                    type="button"
                                                    title="Xóa khoảng giá"
                                                    onClick={() => setRulePriceRanges(prev => prev.filter((_, i) => i !== index))}
                                                    className="px-2 text-red-500 hover:bg-red-50 rounded"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setRulePriceRanges(prev => [...prev, { min: 0, amount: 0 }])}
                                            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                        >
                                            + Thêm khoảng giá
                                        </button>
                                        <p className="text-[10px] text-gray-500">Dùng cho hoa hồng bán máy: hệ thống so khớp theo giá bán từng dòng sản phẩm.</p>
                                    </div>
                                )}
                            </div>

                            {/* Hierarchy Level */}
                            <div className="bg-blue-50 rounded-xl p-3 space-y-3 border border-blue-200">
                                <p className="text-xs font-semibold text-blue-800">Cấu trúc 3 cấp</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {([1, 2, 3] as const).map(level => (
                                        <button key={level}
                                            onClick={() => {
                                                setRuleHierarchy(level);
                                                setRuleTargetType(level === 1 ? 'general' : level === 2 ? 'category' : 'specific');
                                                setRuleTargetValue('');
                                            }}
                                            className={`py-2 rounded-lg text-xs font-medium border transition-all ${ruleHierarchy === level
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                                                }`}>
                                            Cấp {level}: {level === 1 ? 'Chung' : level === 2 ? 'Danh mục' : 'SP cụ thể'}
                                        </button>
                                    ))}
                                </div>
                                {ruleHierarchy === 2 && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Danh mục áp dụng</label>
                                        <select title="Chọn danh mục" value={ruleTargetValue} onChange={e => setRuleTargetValue(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border rounded-lg bg-white">
                                            <option value="">— Chọn danh mục —</option>
                                            <option value="Phone">Điện thoại</option>
                                            <option value="Laptop">Laptop</option>
                                            <option value="Tablet">Tablet</option>
                                            <option value="Audio">Âm thanh</option>
                                            <option value="Watch">Đồng hồ</option>
                                            <option value="Accessory">Phụ kiện</option>
                                        </select>
                                    </div>
                                )}
                                {ruleHierarchy === 3 && (
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Product ID</label>
                                        <input type="text" title="Nhập Product ID" value={ruleTargetValue}
                                            onChange={e => setRuleTargetValue(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border rounded-lg" />
                                    </div>
                                )}
                                <p className="text-[10px] text-blue-600">
                                    Ưu tiên: Cấp 3 (SP cụ thể) → Cấp 2 (Danh mục) → Cấp 1 (Chung)
                                </p>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" title="Đang hoạt động" checked={ruleActive} onChange={e => setRuleActive(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                                    <span className="text-sm font-medium text-gray-700">Đang hoạt động</span>
                                </label>
                                
                                <label className="flex items-center gap-2 cursor-pointer bg-orange-50 p-2 rounded border border-orange-100">
                                    <input type="checkbox" title="Trừ khuyến mãi phụ kiện trước khi tính HH" checked={ruleApplyAfterDiscount} onChange={e => setRuleApplyAfterDiscount(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                                    <span className="text-[11px] font-medium text-orange-800">Trừ khuyến mãi phụ kiện trước khi tính HH (Dành cho máy ghép phụ kiện)</span>
                                </label>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <button onClick={() => setShowRuleModal(false)}
                                className="px-3 py-1.5 text-xs text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                            <button onClick={handleSaveRule} disabled={isProcessing || !ruleName}
                                className="px-5 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2">
                                <Save size={16} /> Lưu
                            </button>
                        </div>
            </Modal>

            {/* ═══ Manual Commission Modal ═══ */}
            <Modal isOpen={showManualModal} onClose={() => setShowManualModal(false)} title="Thêm hoa hồng thủ công" size="md">
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên</label>
                                <select title="Chọn nhân viên" value={manualStaffId} onChange={e => setManualStaffId(e.target.value)}
                                    className="w-full px-3 py-1.5 text-xs border rounded-lg bg-white">
                                    <option value="">— Chọn nhân viên —</option>
                                    {staffList.map(s => <option key={s.uid} value={s.uid}>{s.displayName}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Doanh thu gốc</label>
                                    <CurrencyInput value={manualBaseAmount || ''} onChange={v => setManualBaseAmount(v)}
                                        placeholder="0" className="w-full px-3 py-1.5 text-xs border rounded-lg" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tiền hoa hồng</label>
                                    <CurrencyInput value={manualAmount || ''} onChange={v => setManualAmount(v)}
                                        placeholder="0" className="w-full px-3 py-1.5 text-xs border rounded-lg" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
                                    <select
                                        title="Chọn loại"
                                        value={manualSourceType}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (v === 'repair' || v === 'order') setManualSourceType(v);
                                        }}
                                        className="w-full px-3 py-1.5 text-xs border rounded-lg bg-white">
                                        <option value="repair">Sửa chữa</option>
                                        <option value="order">Đơn hàng</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã nguồn (tùy chọn)</label>
                                    <input type="text" title="Nhập mã nguồn" placeholder="Nhập mã nguồn" value={manualSourceId} onChange={e => setManualSourceId(e.target.value)}
                                        className="w-full px-3 py-1.5 text-xs border rounded-lg" />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <button onClick={() => setShowManualModal(false)}
                                className="px-3 py-1.5 text-xs text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                            <button onClick={handleManualCommission} disabled={isProcessing || !manualStaffId || manualAmount <= 0}
                                className="px-5 py-2 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
                                <Save size={16} /> Lưu
                            </button>
                        </div>
            </Modal>
        </div>
    );
}
