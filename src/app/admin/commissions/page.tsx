'use client';

import { useState, useEffect } from 'react';
import {
    Award, Plus, Search, Percent, Trash2, X, Save, Loader2,
    CheckCircle2, Clock, User, DollarSign, TrendingUp, FileText
} from 'lucide-react';
import {
    collection, getDocs, addDoc, updateDoc, deleteDoc,
    doc, serverTimestamp, query, orderBy, where
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import type { CommissionRule, Commission } from '@/lib/types';

export default function CommissionsPage() {
    const { user } = useAuth();
    const [rules, setRules] = useState<(CommissionRule & { id: string })[]>([]);
    const [commissions, setCommissions] = useState<(Commission & { id: string })[]>([]);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const isAdmin = user?.role === 'admin';
    const [activeTab, setActiveTab] = useState<'rules' | 'history'>(isAdmin ? 'rules' : 'history');

    // Rule modal
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRule, setEditingRule] = useState<(CommissionRule & { id: string }) | null>(null);
    const [ruleName, setRuleName] = useState('');
    const [ruleType, setRuleType] = useState<'repair' | 'order' | 'all'>('all');
    const [rulePercentage, setRulePercentage] = useState(5);
    const [ruleActive, setRuleActive] = useState(true);
    const [ruleHierarchy, setRuleHierarchy] = useState<1 | 2 | 3>(1);
    const [ruleTargetType, setRuleTargetType] = useState<'general' | 'category' | 'specific'>('general');
    const [ruleTargetValue, setRuleTargetValue] = useState('');

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
            try {
                const [rulesSnap, commSnap, staffSnap] = await Promise.all([
                    getDocs(query(collection(db, 'commission_rules'), orderBy('createdAt', 'desc'))),
                    getDocs(query(collection(db, 'commissions'), orderBy('createdAt', 'desc'))),
                    getDocs(collection(db, 'users')),
                ]);
                setRules(rulesSnap.docs.map(d => ({ id: d.id, ...d.data() } as CommissionRule & { id: string })));
                setCommissions(commSnap.docs.map(d => ({ id: d.id, ...d.data() } as Commission & { id: string })));
                setStaffList(staffSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';
    const formatDate = (ts: any) => {
        if (!ts) return '—';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('vi-VN');
    };

    const filteredCommissions = commissions.filter(c => {
        // Staff: only show their own commissions
        if (!isAdmin && user?.uid && c.staffId !== user.uid) return false;
        if (!c.createdAt) return true;
        const d = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
        return d.toISOString().slice(0, 7) === filterMonth;
    });

    // ── Aggregate by staff ──
    const staffStats = filteredCommissions.reduce((acc, c) => {
        if (!acc[c.staffId]) acc[c.staffId] = { name: c.staffName, total: 0, count: 0 };
        acc[c.staffId].total += c.amount;
        acc[c.staffId].count += 1;
        return acc;
    }, {} as Record<string, { name: string; total: number; count: number }>);

    const totalCommission = filteredCommissions.reduce((s, c) => s + c.amount, 0);

    // ── Save rule ──
    const handleSaveRule = async () => {
        if (!ruleName) return;
        setIsProcessing(true);
        try {
            const data = {
                name: ruleName,
                type: ruleType,
                percentage: rulePercentage,
                isActive: ruleActive,
                hierarchyLevel: ruleHierarchy,
                targetType: ruleTargetType,
                targetValue: ruleTargetType !== 'general' ? ruleTargetValue : '',
                updatedAt: serverTimestamp(),
            };
            if (editingRule) {
                await updateDoc(doc(db, 'commission_rules', editingRule.id), data);
                setRules(prev => prev.map(r => r.id === editingRule.id ? { ...r, ...data } : r));
            } else {
                const ref = await addDoc(collection(db, 'commission_rules'), { ...data, createdAt: serverTimestamp() });
                setRules(prev => [{ id: ref.id, ...data, createdAt: new Date() } as any, ...prev]);
            }
            setShowRuleModal(false);
        } catch (err) {
            console.error(err);
            alert('Lỗi!');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Delete rule ──
    const handleDeleteRule = async (id: string) => {
        if (!confirm('Xóa quy tắc này?')) return;
        await deleteDoc(doc(db, 'commission_rules', id));
        setRules(prev => prev.filter(r => r.id !== id));
    };

    // ── Open rule modal ──
    const openRuleModal = (rule?: CommissionRule & { id: string }) => {
        if (rule) {
            setEditingRule(rule);
            setRuleName(rule.name);
            setRuleType(rule.type);
            setRulePercentage(rule.percentage);
            setRuleActive(rule.isActive);
            setRuleHierarchy(rule.hierarchyLevel || 1);
            setRuleTargetType(rule.targetType || 'general');
            setRuleTargetValue(rule.targetValue || '');
        } else {
            setEditingRule(null);
            setRuleName('');
            setRuleType('all');
            setRulePercentage(5);
            setRuleActive(true);
            setRuleHierarchy(1);
            setRuleTargetType('general');
            setRuleTargetValue('');
        }
        setShowRuleModal(true);
    };

    // ── Manual commission entry ──
    const handleManualCommission = async () => {
        if (!manualStaffId || manualAmount <= 0) return;
        setIsProcessing(true);
        try {
            const staff = staffList.find(s => s.uid === manualStaffId);
            const data = {
                staffId: manualStaffId,
                staffName: staff?.displayName || 'N/A',
                ruleId: 'manual',
                sourceType: manualSourceType,
                sourceId: manualSourceId || 'manual-entry',
                amount: manualAmount,
                baseAmount: manualBaseAmount,
                createdAt: serverTimestamp(),
            };
            const ref = await addDoc(collection(db, 'commissions'), data);
            setCommissions(prev => [{ id: ref.id, ...data, createdAt: new Date() } as any, ...prev]);
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
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Award className="text-orange-500" /> Hoa hồng nhân viên
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Quản lý quy tắc & theo dõi hoa hồng</p>
                </div>
            </div>

            {/* Stats */}
            <div className={`grid grid-cols-2 ${isAdmin ? 'md:grid-cols-4' : 'md:grid-cols-2'} gap-3`}>
                {isAdmin && (
                    <div className="bg-white rounded-xl border p-4">
                        <p className="text-xs text-gray-500">Quy tắc đang hoạt động</p>
                        <p className="text-2xl font-bold text-green-600">{rules.filter(r => r.isActive).length}</p>
                    </div>
                )}
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Tổng HH tháng {filterMonth.split('-')[1]}</p>
                    <p className="text-lg font-bold text-orange-600">{formatPrice(totalCommission)}</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs text-gray-500">Số lượt tính HH</p>
                    <p className="text-2xl font-bold text-blue-600">{filteredCommissions.length}</p>
                </div>
                {isAdmin && (
                    <div className="bg-white rounded-xl border p-4">
                        <p className="text-xs text-gray-500">Nhân viên có HH</p>
                        <p className="text-2xl font-bold text-purple-600">{Object.keys(staffStats).length}</p>
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
                            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 text-sm font-semibold shadow-md shadow-orange-200/50">
                            <Plus size={16} /> Thêm quy tắc
                        </button>
                    </div>

                    {rules.map(rule => (
                        <div key={rule.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${!rule.isActive ? 'opacity-50' : ''}`}>
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold ${rule.isActive ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'}`}>
                                {rule.percentage}%
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
                        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                            className="px-4 py-2 border rounded-xl text-sm bg-white" />
                        {isAdmin && (
                            <button onClick={() => setShowManualModal(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 text-sm font-semibold">
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
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-gray-500 text-xs border-b bg-gray-50">
                                    <th className="text-left px-4 py-3">Ngày</th>
                                    <th className="text-left">Nhân viên</th>
                                    <th className="text-left">Loại</th>
                                    <th className="text-right">Doanh thu gốc</th>
                                    <th className="text-right px-4">Hoa hồng</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCommissions.map(c => (
                                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
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
                        {filteredCommissions.length === 0 && (
                            <div className="text-center py-12 text-gray-400 text-sm">Chưa có hoa hồng trong tháng này</div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ Rule Modal ═══ */}
            {showRuleModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="text-lg font-bold">{editingRule ? 'Sửa quy tắc' : 'Thêm quy tắc mới'}</h2>
                            <button onClick={() => setShowRuleModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tên quy tắc</label>
                                <input type="text" value={ruleName} onChange={e => setRuleName(e.target.value)}
                                    placeholder="VD: Hoa hồng sửa chữa cơ bản"
                                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
                                    <select value={ruleType} onChange={e => setRuleType(e.target.value as any)}
                                        className="w-full px-4 py-2 border rounded-lg bg-white">
                                        <option value="all">Tất cả</option>
                                        <option value="repair">Sửa chữa</option>
                                        <option value="order">Đơn hàng</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">% Hoa hồng</label>
                                    <input type="number" value={rulePercentage} onChange={e => setRulePercentage(Number(e.target.value))}
                                        min={0} max={100}
                                        className="w-full px-4 py-2 border rounded-lg" />
                                </div>
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
                                        <select value={ruleTargetValue} onChange={e => setRuleTargetValue(e.target.value)}
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
                                        <input type="text" value={ruleTargetValue}
                                            onChange={e => setRuleTargetValue(e.target.value)}
                                            placeholder="Nhập ID sản phẩm cụ thể"
                                            className="w-full px-3 py-2 text-sm border rounded-lg" />
                                    </div>
                                )}
                                <p className="text-[10px] text-blue-600">
                                    Ưu tiên: Cấp 3 (SP cụ thể) → Cấp 2 (Danh mục) → Cấp 1 (Chung)
                                </p>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={ruleActive} onChange={e => setRuleActive(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                                <span className="text-sm font-medium text-gray-700">Đang hoạt động</span>
                            </label>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <button onClick={() => setShowRuleModal(false)}
                                className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                            <button onClick={handleSaveRule} disabled={isProcessing || !ruleName}
                                className="px-5 py-2 text-sm font-semibold text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2">
                                <Save size={16} /> Lưu
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ Manual Commission Modal ═══ */}
            {showManualModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="text-lg font-bold">Thêm hoa hồng thủ công</h2>
                            <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nhân viên</label>
                                <select value={manualStaffId} onChange={e => setManualStaffId(e.target.value)}
                                    className="w-full px-4 py-2 border rounded-lg bg-white">
                                    <option value="">— Chọn nhân viên —</option>
                                    {staffList.map(s => <option key={s.uid} value={s.uid}>{s.displayName}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Doanh thu gốc</label>
                                    <input type="number" value={manualBaseAmount || ''} onChange={e => setManualBaseAmount(Number(e.target.value))}
                                        placeholder="0" className="w-full px-4 py-2 border rounded-lg" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tiền hoa hồng</label>
                                    <input type="number" value={manualAmount || ''} onChange={e => setManualAmount(Number(e.target.value))}
                                        placeholder="0" className="w-full px-4 py-2 border rounded-lg" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
                                    <select value={manualSourceType} onChange={e => setManualSourceType(e.target.value as any)}
                                        className="w-full px-4 py-2 border rounded-lg bg-white">
                                        <option value="repair">Sửa chữa</option>
                                        <option value="order">Đơn hàng</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã nguồn (tùy chọn)</label>
                                    <input type="text" value={manualSourceId} onChange={e => setManualSourceId(e.target.value)}
                                        placeholder="Mã phiếu / đơn" className="w-full px-4 py-2 border rounded-lg" />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <button onClick={() => setShowManualModal(false)}
                                className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Hủy</button>
                            <button onClick={handleManualCommission} disabled={isProcessing || !manualStaffId || manualAmount <= 0}
                                className="px-5 py-2 text-sm font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
                                <Save size={16} /> Lưu
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
