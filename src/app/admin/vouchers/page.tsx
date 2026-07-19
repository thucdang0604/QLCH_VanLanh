'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { getDocs } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { Ticket, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, X, Copy, Check, Settings, Target } from 'lucide-react';
import { toast } from 'sonner';
import { appConfirm } from '@/lib/appDialog';
import type { Voucher } from '@/lib/types';
import DiscountRulesTab from './DiscountRulesTab';
import { useConfig } from '@/lib/ConfigContext';
import { DEFAULT_CONFIG, type BountyMission } from '@/lib/config-defaults';

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';


// ── Voucher Modal ──
function VoucherModal({ voucher, onClose, onSave }: {
    voucher: (Voucher & { id: string }) | null;
    onClose: () => void;
    onSave: (data: Partial<Voucher>) => Promise<void>;
}) {
    const [form, setForm] = useState({
        code: voucher?.code || '',
        type: voucher?.type || 'fixed' as 'fixed' | 'percentage',
        value: voucher?.value?.toString() || '',
        maxDiscount: voucher?.maxDiscount?.toString() || '',
        minOrderValue: voucher?.minOrderValue?.toString() || '',
        expiryDate: voucher?.expiryDate
            ? (() => {
                const raw = voucher.expiryDate;
                const d = typeof raw === 'number' ? new Date(raw) : (raw as { toDate?: () => Date }).toDate?.() ?? new Date(raw as unknown as string);
                return d.toISOString().slice(0, 10);
              })()
            : '',
        usageLimit: voucher?.usageLimit?.toString() || '0',
        stackWithPromo: voucher?.stackingRules?.stackWithPromo ?? true,
        stackWithTier: voucher?.stackingRules?.stackWithTier ?? false,
        isExclusive: voucher?.stackingRules?.isExclusive ?? false,
    });
    const [saving, setSaving] = useState(false);
    const [validationError, setValidationError] = useState('');

    const handleSave = async () => {
        const code = form.code.trim().toUpperCase();
        if (!code) {
            setValidationError('Vui lòng nhập mã Voucher.');
            toast.error('Nhập mã Voucher');
            return;
        }
        if (!form.value || Number(form.value) <= 0) {
            setValidationError('Giá trị giảm phải lớn hơn 0.');
            toast.error('Giá trị giảm không hợp lệ');
            return;
        }
        setValidationError('');
        setSaving(true);
        try {
            await onSave({
                code,
                type: form.type as 'fixed' | 'percentage',
                value: Number(form.value),
                maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : undefined,
                minOrderValue: form.minOrderValue ? Number(form.minOrderValue) : undefined,
                expiryDate: form.expiryDate ? new Date(form.expiryDate) : undefined,
                usageLimit: Number(form.usageLimit) || 0,
                usedCount: voucher?.usedCount ?? 0,
                isActive: true,
                stackingRules: {
                    isExclusive: form.isExclusive,
                    stackWithPromo: form.isExclusive ? false : form.stackWithPromo,
                    stackWithTier: form.isExclusive ? false : form.stackWithTier,
                },
            });
            onClose();
        } catch { toast.error('Lỗi khi lưu'); }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b">
                    <h2 className="text-lg font-bold">{voucher ? 'Sửa Voucher' : 'Tạo Voucher mới'}</h2>
                    <button title="Đóng" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-4">
                    {/* Mã Voucher */}
                    <div>
                        <label className="text-sm text-gray-600 mb-1 block">Mã Voucher *</label>
                        <input title="Mã Voucher" value={form.code} onChange={e => {
                            setForm(p => ({ ...p, code: e.target.value.toUpperCase() }));
                            if (validationError) setValidationError('');
                        }}
                            placeholder="VD: MUAHE50K" maxLength={20}
                            required
                            className="w-full border rounded-lg px-3 py-2 text-sm font-mono uppercase focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                    </div>

                    {/* Loại + Giá trị */}
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Loại giảm</label>
                            <select title="Loại giảm giá" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as 'fixed' | 'percentage' }))}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none">
                                <option value="fixed">Số tiền cố định (VNĐ)</option>
                                <option value="percentage">Phần trăm (%)</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Giá trị *</label>
                            <input type="number" title="Giá trị giảm" value={form.value} onChange={e => {
                                setForm(p => ({ ...p, value: e.target.value }));
                                if (validationError) setValidationError('');
                            }}
                                placeholder={form.type === 'percentage' ? '10' : '50000'} min="0"
                                required
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                        </div>
                    </div>

                    {/* Max Discount + Min Order */}
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Giảm tối đa (VNĐ)</label>
                            <input type="number" title="Giảm tối đa" value={form.maxDiscount} onChange={e => setForm(p => ({ ...p, maxDiscount: e.target.value }))}
                                placeholder="Để trống = không giới hạn" min="0"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                        </div>
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Đơn tối thiểu (VNĐ)</label>
                            <input type="number" title="Đơn tối thiểu" value={form.minOrderValue} onChange={e => setForm(p => ({ ...p, minOrderValue: e.target.value }))}
                                placeholder="0" min="0"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                        </div>
                    </div>

                    {/* Hạn sử dụng + Giới hạn lượt */}
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Ngày hết hạn</label>
                            <input type="date" title="Ngày hết hạn" value={form.expiryDate} onChange={e => setForm(p => ({ ...p, expiryDate: e.target.value }))}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                        </div>
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Giới hạn lượt dùng</label>
                            <input type="number" title="Giới hạn lượt dùng" value={form.usageLimit} onChange={e => setForm(p => ({ ...p, usageLimit: e.target.value }))}
                                placeholder="0 = Không giới hạn" min="0"
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                        </div>
                    </div>

                    {/* Stacking Rules */}
                    <div className="bg-blue-50 rounded-lg p-4 space-y-3">
                        <p className="text-xs font-bold text-blue-700">⚙️ Quy tắc cộng dồn (Stacking Rules)</p>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.isExclusive}
                                onChange={e => setForm(p => ({ ...p, isExclusive: e.target.checked, ...(e.target.checked ? { stackWithPromo: false, stackWithTier: false } : {}) }))}
                                className="w-4 h-4 accent-orange-500" />
                            <span className="text-sm text-gray-700">Độc quyền — Không dùng chung với bất kỳ ưu đãi nào</span>
                        </label>
                        <label className={`flex items-center gap-2 cursor-pointer ${form.isExclusive ? 'opacity-40 pointer-events-none' : ''}`}>
                            <input type="checkbox" checked={form.stackWithPromo} disabled={form.isExclusive}
                                onChange={e => setForm(p => ({ ...p, stackWithPromo: e.target.checked }))}
                                className="w-4 h-4 accent-orange-500" />
                            <span className="text-sm text-gray-700">Cho phép dùng chung với Giá khuyến mãi (price_promo)</span>
                        </label>
                        <label className={`flex items-center gap-2 cursor-pointer ${form.isExclusive ? 'opacity-40 pointer-events-none' : ''}`}>
                            <input type="checkbox" checked={form.stackWithTier} disabled={form.isExclusive}
                                onChange={e => setForm(p => ({ ...p, stackWithTier: e.target.checked }))}
                                className="w-4 h-4 accent-orange-500" />
                            <span className="text-sm text-gray-700">Cho phép dùng chung với Hạng thành viên VIP</span>
                        </label>
                    </div>
                    {validationError && (
                        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                            {validationError}
                        </p>
                    )}
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

// ── Bounty Missions Tab ──
function BountyMissionsTab() {
    const { config, updateConfig } = useConfig();
    const [missions, setMissions] = useState<BountyMission[]>(config.bountyMissions || DEFAULT_CONFIG.bountyMissions);
    const [rewardType, setRewardType] = useState<'fixed' | 'percentage'>(config.bountyRewardType || 'fixed');
    const [rewardValue, setRewardValue] = useState(config.bountyRewardValue || 50000);
    const [maxDiscount, setMaxDiscount] = useState(config.bountyRewardMaxDiscount || 0);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (config.bountyMissions) setMissions(config.bountyMissions);
        if (config.bountyRewardType) setRewardType(config.bountyRewardType);
        if (config.bountyRewardValue) setRewardValue(config.bountyRewardValue);
        if (config.bountyRewardMaxDiscount) setMaxDiscount(config.bountyRewardMaxDiscount);
    }, [config]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateConfig({
                bountyMissions: missions,
                bountyRewardType: rewardType,
                bountyRewardValue: rewardValue,
                ...(rewardType === 'percentage' && maxDiscount > 0 ? { bountyRewardMaxDiscount: maxDiscount } : { bountyRewardMaxDiscount: 0 }),
            });
            toast.success('Đã lưu cấu hình nhiệm vụ');
        } catch {
            toast.error('Lỗi khi lưu');
        }
        setSaving(false);
    };

    const fmtCurrency = (n: number) => n.toLocaleString('vi-VN');

    return (
        <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-bold mb-1">Cấu hình Nhiệm vụ nhận Voucher</p>
                <p>Khách hàng hoàn thành các nhiệm vụ (theo dõi MXH) sẽ nhận được Voucher giảm giá. Cấu hình mức giảm và bật/tắt từng nhiệm vụ bên dưới.</p>
            </div>

            {/* Reward Config */}
            <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
                <h4 className="font-bold text-gray-800 text-sm">Mức giảm giá Voucher thưởng</h4>
                <div className="flex flex-wrap items-center gap-4">
                    <select
                        title="Loại giảm giá"
                        value={rewardType}
                        onChange={e => setRewardType(e.target.value as 'fixed' | 'percentage')}
                        className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    >
                        <option value="fixed">Cố định (VNĐ)</option>
                        <option value="percentage">Phần trăm (%)</option>
                    </select>

                    {rewardType === 'fixed' ? (
                        <div className="flex items-center gap-2">
                            <input
                                title="Giá trị giảm"
                                type="text"
                                value={fmtCurrency(rewardValue)}
                                onChange={e => setRewardValue(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                                className="w-36 border rounded-lg px-3 py-2 text-sm text-right font-bold focus:ring-2 focus:ring-orange-500 focus:outline-none"
                            />
                            <span className="text-sm text-gray-500">VNĐ</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                <input
                                    title="Phần trăm giảm"
                                    type="number"
                                    min={1}
                                    max={100}
                                    value={rewardValue}
                                    onChange={e => setRewardValue(Number(e.target.value) || 0)}
                                    className="w-20 border rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-orange-500 focus:outline-none"
                                />
                                <span className="text-sm text-gray-500">%</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">Tối đa:</span>
                                <input
                                    title="Giới hạn tối đa"
                                    type="text"
                                    value={maxDiscount > 0 ? fmtCurrency(maxDiscount) : ''}
                                    onChange={e => setMaxDiscount(Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                                    placeholder="Không giới hạn"
                                    className="w-36 border rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-orange-500 focus:outline-none"
                                />
                                <span className="text-sm text-gray-500">VNĐ</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Mission List */}
            <div className="space-y-3">
                {missions.map((mission, idx) => (
                    <div key={mission.id} className="flex items-center gap-4 p-4 bg-white border rounded-xl shadow-sm">
                        <div className="flex-1 space-y-1">
                            <span className="font-medium text-sm capitalize">{mission.id}</span>
                            <input
                                type="url"
                                value={mission.url}
                                onChange={e => {
                                    const m = [...missions];
                                    m[idx] = { ...m[idx], url: e.target.value };
                                    setMissions(m);
                                }}
                                placeholder={`Link ${mission.id}...`}
                                className="w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-1 focus:ring-orange-500 outline-none"
                            />
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-xs text-gray-500 mb-1">{mission.isActive ? 'Bật' : 'Tắt'}</span>
                            <button
                                type="button"
                                title="Bật/tắt nhiệm vụ"
                                onClick={() => {
                                    const m = [...missions];
                                    m[idx] = { ...m[idx], isActive: !m[idx].isActive };
                                    setMissions(m);
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${mission.isActive ? 'bg-orange-500' : 'bg-gray-300'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${mission.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-orange-500 text-white px-5 py-2 rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50"
                >
                    {saving ? 'Đang lưu...' : 'Lưu cấu hình nhiệm vụ'}
                </button>
            </div>
        </div>
    );
}

// ── Main Page ──
export default function VouchersPage() {
    const [vouchers, setVouchers] = useState<(Voucher & { id: string })[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editVoucher, setEditVoucher] = useState<(Voucher & { id: string }) | null>(null);
    const [copiedCode, setCopiedCode] = useState('');
    const [activeTab, setActiveTab] = useState<'vouchers' | 'discount-rules' | 'missions'>('vouchers');

    const loadVouchers = useCallback(async () => {
        const q = query(collection(db, 'vouchers'), orderBy('createdAt', 'desc'), limit(200));
        const snap = await getDocs(q);
        setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Voucher & { id: string })));
    }, []);

    useEffect(() => {
        loadVouchers().catch(error => console.error('Failed to load vouchers:', error));
    }, [loadVouchers]);

    const getIdToken = async () => {
        const { getAuthInstance } = await import('@/lib/firebase');
        const auth = await getAuthInstance();
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Missing admin session.');
        return token;
    };

    const callVoucherApi = async (method: 'POST' | 'PATCH' | 'DELETE', body?: Record<string, unknown>, id?: string) => {
        const token = await getIdToken();
        const url = method === 'DELETE' && id
            ? `/api/admin/vouchers?id=${encodeURIComponent(id)}`
            : '/api/admin/vouchers';
        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Voucher API failed.');
        return payload;
    };

    const handleSave = async (data: Partial<Voucher>) => {
        if (editVoucher) {
            await callVoucherApi('PATCH', { ...data, id: editVoucher.id });
            toast.success('Đã cập nhật Voucher');
        } else {
            await callVoucherApi('POST', data as Record<string, unknown>);
            toast.success('Đã tạo Voucher mới');
        }
        await loadVouchers();
    };

    const toggleActive = async (v: Voucher & { id: string }) => {
        await callVoucherApi('PATCH', { ...v, id: v.id, isActive: !v.isActive });
        toast.success(v.isActive ? 'Đã tắt Voucher' : 'Đã bật Voucher');
        await loadVouchers();
    };

    const handleDelete = async (id: string) => {
        if (!await appConfirm('Xóa Voucher này?', { title: 'Xóa voucher', confirmText: 'Xóa', destructive: true })) return;
        await callVoucherApi('DELETE', undefined, id);
        toast.success('Đã xóa Voucher');
        await loadVouchers();
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(''), 2000);
    };

    const isExpired = (v: Voucher) => {
        if (!v.expiryDate) return false;
        const exp = typeof v.expiryDate === 'number' ? v.expiryDate : (v.expiryDate as { toMillis?: () => number }).toMillis?.() || new Date(v.expiryDate as unknown as string).getTime();
        return exp < Date.now();
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Ticket className="text-orange-500" size={28} /> Giảm giá & Voucher
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Quản lý mã giảm giá, hạng thành viên và chương trình khuyến mãi</p>
                </div>
                {activeTab === 'vouchers' && (
                    <button title="Tạo Voucher" onClick={() => { setEditVoucher(null); setShowModal(true); }}
                        className="flex items-center gap-2 bg-orange-500 text-white px-3 py-1.5 text-xs rounded-xl hover:bg-orange-600 font-medium">
                        <Plus size={18} /> Tạo Voucher
                    </button>
                )}
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('vouchers')}
                    className={`pb-3 pt-1 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'vouchers' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    <Ticket size={18} /> Mã Voucher
                </button>
                <button
                    onClick={() => setActiveTab('discount-rules')}
                    className={`pb-3 pt-1 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'discount-rules' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    <Settings size={18} /> Giảm giá & Thành viên
                </button>
                <button
                    onClick={() => setActiveTab('missions')}
                    className={`pb-3 pt-1 px-4 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'missions' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                    <Target size={18} /> Nhiệm vụ
                </button>
            </div>

            {/* Tab: Discount Rules */}
            {activeTab === 'discount-rules' && <DiscountRulesTab />}

            {/* Tab: Missions */}
            {activeTab === 'missions' && <BountyMissionsTab />}

            {/* Tab: Vouchers */}
            {activeTab === 'vouchers' && (<>
            <div className="space-y-3">
                {vouchers.map(v => {
                    const expired = isExpired(v);
                    const usedUp = v.usageLimit > 0 && v.usedCount >= v.usageLimit;
                    return (
                        <div key={v.id} className={`bg-white rounded-xl shadow-sm border p-4 ${!v.isActive || expired || usedUp ? 'opacity-60' : ''}`}>
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                                    <Ticket size={20} className="text-orange-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <code className="text-sm font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">{v.code}</code>
                                        <button title="Sao chép mã" onClick={() => copyCode(v.code)} className="p-1 hover:bg-gray-100 rounded">
                                            {copiedCode === v.code ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-gray-400" />}
                                        </button>
                                        {expired && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Hết hạn</span>}
                                        {usedUp && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Hết lượt</span>}
                                        {v.ownerId && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">Cá nhân</span>}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                        <span className="bg-green-50 text-green-700 px-2 py-1 rounded-lg font-bold">
                                            {v.type === 'percentage' ? `-${v.value}%` : `-${fmt(v.value)}`}
                                            {v.maxDiscount ? ` (max ${fmt(v.maxDiscount)})` : ''}
                                        </span>
                                        {v.minOrderValue ? <span className="bg-gray-50 text-gray-600 px-2 py-1 rounded-lg">Đơn tối thiểu: {fmt(v.minOrderValue)}</span> : null}
                                        <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-lg">
                                            Đã dùng: {v.usedCount}{v.usageLimit > 0 ? `/${v.usageLimit}` : ''}
                                        </span>
                                        {v.stackingRules?.isExclusive && <span className="bg-red-50 text-red-600 px-2 py-1 rounded-lg">Độc quyền</span>}
                                        {!v.stackingRules?.isExclusive && v.stackingRules?.stackWithTier && <span className="bg-purple-50 text-purple-600 px-2 py-1 rounded-lg">+ VIP</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button title={v.isActive ? 'Tắt' : 'Bật'} onClick={() => toggleActive(v)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                                        {v.isActive ? <ToggleRight size={20} className="text-green-500" /> : <ToggleLeft size={20} className="text-gray-400" />}
                                    </button>
                                    <button title="Sửa Voucher" onClick={() => { setEditVoucher(v); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><Edit2 size={14} /></button>
                                    <button title="Xóa Voucher" onClick={() => handleDelete(v.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {vouchers.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-xl">
                        <Ticket size={48} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500">Chưa có Voucher nào</p>
                        <p className="text-xs text-gray-400 mt-1">Tạo mã giảm giá để tặng khách hàng</p>
                    </div>
                )}
            </div>

            {showModal && <VoucherModal voucher={editVoucher} onClose={() => setShowModal(false)} onSave={handleSave} />}
            </>)}
        </div>
    );
}
