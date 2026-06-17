'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, setDoc, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Percent, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, X, Tag, Medal, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { AccessoryDiscountRule } from '@/lib/types';
import { TIER_CONFIGS, TierConfig } from '@/lib/customerTiers';

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

// ── Accessory Rule Modal ──
function AccessoryRuleModal({ rule, onClose, onSave }: {
    rule: AccessoryDiscountRule | null;
    onClose: () => void;
    onSave: (data: Partial<AccessoryDiscountRule>) => Promise<void>;
}) {
    const [form, setForm] = useState({
        name: rule?.name || '',
        triggerServiceCategory: rule?.triggerServiceCategory || '',
        triggerKeywords: rule?.triggerKeywords?.join(', ') || '',
        discountType: rule?.discountType || 'percentage' as 'percentage' | 'fixed',
        discountValue: rule?.discountValue?.toString() || '',
        targetProductCategory: rule?.targetProductCategory || '',
        targetKeywords: rule?.targetKeywords?.join(', ') || '',
        maxDiscountAmount: rule?.maxDiscountAmount?.toString() || '',
    });
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!form.name.trim()) { toast.error('Nhập tên rule'); return; }
        if (!form.discountValue || Number(form.discountValue) <= 0) { toast.error('Giá trị giảm không hợp lệ'); return; }
        setSaving(true);
        try {
            await onSave({
                name: form.name.trim(),
                triggerServiceCategory: form.triggerServiceCategory.trim(),
                triggerKeywords: form.triggerKeywords.split(',').map(s => s.trim()).filter(Boolean),
                discountType: form.discountType as 'percentage' | 'fixed',
                discountValue: Number(form.discountValue),
                targetProductCategory: form.targetProductCategory.trim(),
                targetKeywords: form.targetKeywords.split(',').map(s => s.trim()).filter(Boolean),
                maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : undefined,
                isActive: true,
            });
            onClose();
        } catch { toast.error('Lỗi khi lưu'); }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b">
                    <h2 className="text-lg font-bold">{rule ? 'Sửa rule' : 'Thêm rule giảm giá'}</h2>
                    <button title="Hủy" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-sm text-gray-600 mb-1 block">Tên rule *</label>
                        <input title="Tên rule" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="VD: Giảm 40% cường lực khi thay màn"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                    </div>

                    <div className="bg-blue-50 rounded-lg p-3 space-y-3">
                        <p className="text-xs font-bold text-blue-700">🔧 Điều kiện kích hoạt (dịch vụ sửa chữa)</p>
                        <input value={form.triggerServiceCategory} onChange={e => setForm(p => ({ ...p, triggerServiceCategory: e.target.value }))}
                            placeholder="Danh mục DV (VD: thay-man-hinh)"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                        <input value={form.triggerKeywords} onChange={e => setForm(p => ({ ...p, triggerKeywords: e.target.value }))}
                            placeholder="Keywords (phân cách bằng dấu phẩy): thay màn, màn hình"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                    </div>

                    <div className="bg-green-50 rounded-lg p-3 space-y-3">
                        <p className="text-xs font-bold text-green-700">🏷️ Sản phẩm được giảm giá</p>
                        <input value={form.targetProductCategory} onChange={e => setForm(p => ({ ...p, targetProductCategory: e.target.value }))}
                            placeholder="Danh mục SP (VD: cuong-luc)"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 focus:outline-none" />
                        <input value={form.targetKeywords} onChange={e => setForm(p => ({ ...p, targetKeywords: e.target.value }))}
                            placeholder="Keywords: cường lực, dán màn, kính cường lực"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 focus:outline-none" />
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Loại giảm</label>
                            <select title="Chọn loại giảm" value={form.discountType} onChange={e => setForm(p => ({ ...p, discountType: e.target.value as 'percentage' | 'fixed' }))}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none">
                                <option value="percentage">Phần trăm (%)</option>
                                <option value="fixed">Số tiền cố định</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Giá trị *</label>
                            <input type="number" value={form.discountValue} onChange={e => setForm(p => ({ ...p, discountValue: e.target.value }))}
                                placeholder={form.discountType === 'percentage' ? '40' : '50000'}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm text-gray-600 mb-1 block">Giảm tối đa (VNĐ, tùy chọn)</label>
                        <input type="number" value={form.maxDiscountAmount} onChange={e => setForm(p => ({ ...p, maxDiscountAmount: e.target.value }))}
                            placeholder="Để trống = không giới hạn"
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 p-5 border-t">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
                    <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium">
                        {saving ? 'Đang lưu...' : 'Lưu'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Content ──
export default function DiscountRulesTab() {
    const [activeTab, setActiveTab] = useState<'tiers' | 'accessories'>('tiers');

    // Accessories State
    const [rules, setRules] = useState<(AccessoryDiscountRule & { id: string })[]>([]);
    const [showAccessoryModal, setShowAccessoryModal] = useState(false);
    const [editRule, setEditRule] = useState<AccessoryDiscountRule | null>(null);

    // Tiers State
    const [tiers, setTiers] = useState<TierConfig[]>(TIER_CONFIGS);
    const [savingTiers, setSavingTiers] = useState(false);
    const [expandedTier, setExpandedTier] = useState<string | null>(null);

    // Customers per tier
    const [tierCustomers, setTierCustomers] = useState<Record<string, { name: string; phone: string; totalSpent: number }[]>>({});

    // Format currency with commas
    const fmtCurrency = (n: number) => n.toLocaleString('vi-VN');

    const loadTierCustomers = useCallback(async () => {
        const customerPreviewQuery = query(collection(db, 'customers'), orderBy('totalSpent', 'desc'), limit(500));
        const snap = await getDocs(customerPreviewQuery);
        const grouped: Record<string, { name: string; phone: string; totalSpent: number }[]> = {};
        for (const tier of tiers) grouped[tier.name] = [];

        snap.docs.forEach(d => {
            const data = d.data();
            const spent = Number(data.totalSpent || 0);
            let matched = 'Bronze';
            for (const tier of tiers) {
                if (tier.minSpent > 0 && spent >= tier.minSpent) { matched = tier.name; break; }
            }
            if (!grouped[matched]) grouped[matched] = [];
            grouped[matched].push({ name: data.name || data.phone || d.id, phone: d.id, totalSpent: spent });
        });
        for (const key of Object.keys(grouped)) {
            grouped[key].sort((a, b) => b.totalSpent - a.totalSpent);
        }
        setTierCustomers(grouped);
    }, [tiers]);

    useEffect(() => {
        loadTierCustomers().catch(error => console.error('Failed to load tier customers:', error));
    }, [loadTierCustomers]);

    const loadAccessoryRules = useCallback(async () => {
        const qRules = query(collection(db, 'accessory_discount_rules'), orderBy('createdAt', 'desc'), limit(100));
        const snap = await getDocs(qRules);
        setRules(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccessoryDiscountRule & { id: string })));
    }, []);

    useEffect(() => {
        loadAccessoryRules().catch(error => console.error('Failed to load accessory discount rules:', error));

        // Fetch Tier Settings
        const unsubTiers = onSnapshot(doc(db, 'system_config', 'tier_settings'), snap => {
            if (snap.exists() && snap.data().tiers) {
                setTiers(snap.data().tiers);
            }
        });

        return () => { unsubTiers(); };
    }, [loadAccessoryRules]);

    // Handlers for Accessories
    const handleSaveAccessoryRule = async (data: Partial<AccessoryDiscountRule>) => {
        if (editRule) {
            await updateDoc(doc(db, 'accessory_discount_rules', editRule.id), { ...data, updatedAt: serverTimestamp() });
            toast.success('Đã cập nhật rule phụ kiện');
        } else {
            await addDoc(collection(db, 'accessory_discount_rules'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            toast.success('Đã thêm rule phụ kiện mới');
        }
        await loadAccessoryRules();
    };

    const toggleAccessoryActive = async (rule: AccessoryDiscountRule & { id: string }) => {
        await updateDoc(doc(db, 'accessory_discount_rules', rule.id), { isActive: !rule.isActive, updatedAt: serverTimestamp() });
        toast.success(rule.isActive ? 'Đã tắt rule' : 'Đã bật rule');
        await loadAccessoryRules();
    };

    const handleDeleteAccessoryRule = async (id: string) => {
        if (!confirm('Xóa rule này?')) return;
        await deleteDoc(doc(db, 'accessory_discount_rules', id));
        toast.success('Đã xóa rule');
        await loadAccessoryRules();
    };

    // Handlers for Tiers
    const handleTierChange = (index: number, field: keyof TierConfig, value: string | number) => {
        const newTiers = [...tiers];
        newTiers[index] = { ...newTiers[index], [field]: value };
        setTiers(newTiers);
    };

    const handleSaveTiers = async () => {
        setSavingTiers(true);
        try {
            await setDoc(doc(db, 'system_config', 'tier_settings'), {
                tiers,
                updatedAt: serverTimestamp()
            }, { merge: true });
            toast.success('Đã lưu cấu hình hạng thành viên');
        } catch (error) {
            console.error(error);
            toast.error('Có lỗi xảy ra khi lưu hạng thành viên');
        }
        setSavingTiers(false);
    };

    return (
        <div className="space-y-6">

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('tiers')}
                    className={`pb-3 pt-1 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'tiers' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    <Medal size={18} /> Hạng thành viên
                </button>
                <button
                    onClick={() => setActiveTab('accessories')}
                    className={`pb-3 pt-1 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'accessories' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    <Percent size={18} /> Rule Phụ kiện & Dịch vụ
                </button>
            </div>

            {/* Tier Config Tab */}
            {activeTab === 'tiers' && (
                <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-sm text-blue-800">
                        <Users className="shrink-0 text-blue-500" size={20} />
                        <div>
                            <p className="font-bold mb-1">Cấu hình Hạng khách hàng (Tiers)</p>
                            <p>Khách hàng sẽ tự động được thăng hạng dựa trên tổng chi tiêu. Mức giảm giá này áp dụng cho toàn bộ hóa đơn dịch vụ & mua sắm.</p>
                        </div>
                    </div>

                    <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 font-semibold text-gray-600">Tên Hạng</th>
                                    <th className="px-4 py-3 font-semibold text-gray-600">Mức chi tiêu tối thiểu (VNĐ)</th>
                                    <th className="px-4 py-3 font-semibold text-gray-600">Giảm giá (%)</th>
                                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Khách hàng</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {tiers.map((tier, idx) => {
                                    const customers = tierCustomers[tier.name] || [];
                                    const isExpanded = expandedTier === tier.name;
                                    return (
                                        <tr key={tier.name} className="hover:bg-gray-50 transition-colors align-top">
                                            <td className="px-4 py-3 font-bold text-gray-900">
                                                {tier.name}
                                            </td>
                                            <td className="px-4 py-3">
                                                <input
                                                    title="Mức chi tiêu tối thiểu"
                                                    type="text"
                                                    value={fmtCurrency(tier.minSpent)}
                                                    onChange={e => {
                                                        const raw = e.target.value.replace(/[^0-9]/g, '');
                                                        handleTierChange(idx, 'minSpent', Number(raw) || 0);
                                                    }}
                                                    className="w-full max-w-[200px] border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-orange-500 focus:outline-none text-right"
                                                />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        title="Mức giảm giá"
                                                        type="number"
                                                        value={tier.discountPercent}
                                                        onChange={e => handleTierChange(idx, 'discountPercent', Number(e.target.value))}
                                                        className="w-20 border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-orange-500 focus:outline-none"
                                                    />
                                                    <span className="text-gray-500">%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                {customers.length > 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedTier(isExpanded ? null : tier.name)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-600 rounded-lg text-xs font-bold hover:bg-orange-100 transition-colors"
                                                    >
                                                        <Users size={14} /> {customers.length}
                                                        <span className="text-[10px]">{isExpanded ? '▲' : '▼'}</span>
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-gray-400">0</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Expanded customer list */}
                        {expandedTier && (tierCustomers[expandedTier] || []).length > 0 && (
                            <div className="border-t bg-gray-50 p-4">
                                <h4 className="text-sm font-bold text-gray-700 mb-3">
                                    Khách hàng hạng {expandedTier} ({tierCustomers[expandedTier].length})
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto">
                                    {tierCustomers[expandedTier].map(c => (
                                        <div key={c.phone} className="bg-white rounded-lg border px-3 py-2 flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                                                <p className="text-xs text-gray-500">{c.phone}</p>
                                            </div>
                                            <span className="text-xs font-bold text-orange-600 whitespace-nowrap">{fmtCurrency(c.totalSpent)}đ</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="p-4 bg-gray-50 border-t flex justify-end">
                            <button
                                title="Lưu cấu hình hạng"
                                onClick={handleSaveTiers}
                                disabled={savingTiers}
                                className="bg-orange-500 text-white px-5 py-2 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50"
                            >
                                {savingTiers ? 'Đang lưu...' : 'Lưu cấu hình hạng'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Accessories Tab */}
            {activeTab === 'accessories' && (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button title="Thêm rule phụ kiện" onClick={() => { setEditRule(null); setShowAccessoryModal(true); }}
                            className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl hover:bg-orange-600 font-medium text-sm">
                            <Plus size={18} /> Thêm rule phụ kiện
                        </button>
                    </div>
                    <div className="space-y-3">
                        {rules.map(rule => (
                            <div key={rule.id} className={`bg-white rounded-xl shadow-sm border p-4 ${!rule.isActive ? 'opacity-60' : ''}`}>
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                                        <Tag size={20} className="text-orange-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-gray-900">{rule.name}</h3>
                                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg">
                                                🔧 Khi: {rule.triggerKeywords?.join(', ') || rule.triggerServiceCategory}
                                            </span>
                                            <span className="bg-green-50 text-green-700 px-2 py-1 rounded-lg">
                                                🏷️ Giảm: {rule.targetKeywords?.join(', ') || rule.targetProductCategory}
                                            </span>
                                            <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded-lg font-bold">
                                                {rule.discountType === 'percentage' ? `-${rule.discountValue}%` : `-${fmt(rule.discountValue)}`}
                                                {rule.maxDiscountAmount ? ` (max ${fmt(rule.maxDiscountAmount)})` : ''}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button title={rule.isActive ? 'Tắt' : 'Bật'} onClick={() => toggleAccessoryActive(rule)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                                            {rule.isActive ? <ToggleRight size={20} className="text-green-500" /> : <ToggleLeft size={20} className="text-gray-400" />}
                                        </button>
                                        <button title="Sửa rule phụ kiện" onClick={() => { setEditRule(rule); setShowAccessoryModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><Edit2 size={14} /></button>
                                        <button title="Xóa rule phụ kiện" onClick={() => handleDeleteAccessoryRule(rule.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {rules.length === 0 && (
                            <div className="text-center py-16 bg-white rounded-xl">
                                <Percent size={48} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">Chưa có rule giảm giá nào</p>
                                <p className="text-xs text-gray-400 mt-1">VD: Thay màn hình → Giảm 40% cường lực</p>
                            </div>
                        )}
                    </div>

                    {showAccessoryModal && <AccessoryRuleModal rule={editRule} onClose={() => setShowAccessoryModal(false)} onSave={handleSaveAccessoryRule} />}
                </div>
            )}
        </div>
    );
}
