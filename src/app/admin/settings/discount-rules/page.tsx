'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Percent, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, X, Tag } from 'lucide-react';
import { toast } from 'sonner';
import type { AccessoryDiscountRule } from '@/lib/types';

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

// ── Rule Form Modal ──
function RuleModal({ rule, onClose, onSave }: {
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
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-sm text-gray-600 mb-1 block">Tên rule *</label>
                        <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
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
                            <select value={form.discountType} onChange={e => setForm(p => ({ ...p, discountType: e.target.value as 'percentage' | 'fixed' }))}
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

// ── Main Page ──
export default function DiscountRulesPage() {
    const [rules, setRules] = useState<(AccessoryDiscountRule & { id: string })[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editRule, setEditRule] = useState<AccessoryDiscountRule | null>(null);

    useEffect(() => {
        const q = query(collection(db, 'accessory_discount_rules'), orderBy('createdAt', 'desc'));
        return onSnapshot(q, snap => {
            setRules(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccessoryDiscountRule & { id: string })));
        });
    }, []);

    const handleSave = async (data: Partial<AccessoryDiscountRule>) => {
        if (editRule) {
            await updateDoc(doc(db, 'accessory_discount_rules', editRule.id), { ...data, updatedAt: serverTimestamp() });
            toast.success('Đã cập nhật rule');
        } else {
            await addDoc(collection(db, 'accessory_discount_rules'), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            toast.success('Đã thêm rule mới');
        }
    };

    const toggleActive = async (rule: AccessoryDiscountRule & { id: string }) => {
        await updateDoc(doc(db, 'accessory_discount_rules', rule.id), { isActive: !rule.isActive, updatedAt: serverTimestamp() });
        toast.success(rule.isActive ? 'Đã tắt rule' : 'Đã bật rule');
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Xóa rule này?')) return;
        await deleteDoc(doc(db, 'accessory_discount_rules', id));
        toast.success('Đã xóa rule');
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Percent className="text-orange-500" size={28} /> Cấu hình giảm giá phụ kiện
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Rule tự động giảm giá phụ kiện khi sửa chữa</p>
                </div>
                <button onClick={() => { setEditRule(null); setShowModal(true); }}
                    className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-xl hover:bg-orange-600 font-medium text-sm">
                    <Plus size={18} /> Thêm rule
                </button>
            </div>

            {/* Rules List */}
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
                                <button onClick={() => toggleActive(rule)} className="p-1.5 hover:bg-gray-100 rounded-lg" title={rule.isActive ? 'Tắt' : 'Bật'}>
                                    {rule.isActive ? <ToggleRight size={20} className="text-green-500" /> : <ToggleLeft size={20} className="text-gray-400" />}
                                </button>
                                <button onClick={() => { setEditRule(rule); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><Edit2 size={14} /></button>
                                <button onClick={() => handleDelete(rule.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
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

            {showModal && <RuleModal rule={editRule} onClose={() => setShowModal(false)} onSave={handleSave} />}
        </div>
    );
}
