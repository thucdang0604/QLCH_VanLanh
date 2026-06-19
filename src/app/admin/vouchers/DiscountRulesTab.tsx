'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, setDoc, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Percent, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, X, Tag, Medal, Users, ChevronDown, Search, ArrowDown, Zap, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import type { AccessoryDiscountRule } from '@/lib/types';
import type { TaxonomyNode } from '@/lib/types/catalog';
import { TIER_CONFIGS, TierConfig } from '@/lib/customerTiers';
import { useConfig } from '@/lib/ConfigContext';

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

// ── Flatten taxonomy tree into searchable list ──
interface FlatNode {
    id: string;
    name: string;
    fullPath: string; // e.g. "Sửa chữa Điện thoại › Sửa iPhone"
    depth: number;
    seoKeywords?: string;
}

interface ServiceLinkSuggestion {
    id: string;
    name: string;
    categoryIds: string[];
    linkedProductCategoryIds: string[];
    tags?: string[];
}

function flattenTaxonomy(nodes: TaxonomyNode[], parentPath = '', depth = 0): FlatNode[] {
    const result: FlatNode[] = [];
    for (const node of nodes) {
        const fullPath = parentPath ? `${parentPath} › ${node.name}` : node.name;
        result.push({ id: node.id, name: node.name, fullPath, depth, seoKeywords: node.seoKeywords });
        if (node.children?.length) {
            result.push(...flattenTaxonomy(node.children, fullPath, depth + 1));
        }
    }
    return result;
}

// ── Searchable Taxonomy Dropdown ──
function TaxonomyDropdown({ nodes, value, onChange, placeholder }: {
    nodes: FlatNode[];
    value: string;
    onChange: (nodeId: string, node: FlatNode | null) => void;
    placeholder: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const btnRef = useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node) &&
                btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Recalculate position when opening
    const toggleOpen = () => {
        if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const dropH = 280; // approximate max dropdown height
            const openAbove = spaceBelow < dropH && rect.top > dropH;
            setPos({
                top: openAbove ? rect.top - dropH : rect.bottom + 4,
                left: rect.left,
                width: rect.width,
            });
        }
        setOpen(!open);
    };

    const filtered = useMemo(() => {
        if (!search.trim()) return nodes;
        const q = search.toLowerCase();
        return nodes.filter(n => n.name.toLowerCase().includes(q) || n.fullPath.toLowerCase().includes(q));
    }, [nodes, search]);

    const selected = nodes.find(n => n.id === value);

    return (
        <div className="relative">
            <button
                ref={btnRef}
                type="button"
                onClick={toggleOpen}
                className={`w-full flex items-center justify-between border rounded-xl px-3.5 py-2.5 text-sm text-left transition-all ${open ? 'ring-2 ring-orange-400 border-orange-300' : 'hover:border-gray-400'} ${selected ? 'text-gray-900' : 'text-gray-400'}`}
            >
                <span className="truncate">{selected ? selected.fullPath : placeholder}</span>
                <ChevronDown size={16} className={`shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div ref={ref} className="fixed z-[9999] bg-white border rounded-xl shadow-lg max-h-[280px] overflow-hidden"
                    style={{ top: pos.top, left: pos.left, width: pos.width }}>
                    <div className="p-2 border-b sticky top-0 bg-white">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                autoFocus
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Tìm kiếm..."
                                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-orange-400 focus:outline-none"
                            />
                        </div>
                    </div>
                    <div className="overflow-y-auto max-h-[220px]">
                        {value && (
                            <button
                                type="button"
                                onClick={() => { onChange('', null); setOpen(false); setSearch(''); }}
                                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-b"
                            >
                                ✕ Bỏ chọn
                            </button>
                        )}
                        {filtered.length === 0 && (
                            <div className="px-3 py-4 text-sm text-gray-400 text-center">Không tìm thấy</div>
                        )}
                        {filtered.map(node => (
                            <button
                                key={node.id}
                                type="button"
                                onClick={() => { onChange(node.id, node); setOpen(false); setSearch(''); }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 transition-colors ${node.id === value ? 'bg-orange-50 text-orange-700 font-medium' : 'text-gray-700'}`}
                                style={{ paddingLeft: `${12 + node.depth * 16}px` }}
                            >
                                {node.depth > 0 && <span className="text-gray-300 mr-1">{'└'} </span>}
                                {node.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Keyword Chips ──
function KeywordChips({ keywords, onChange }: { keywords: string[]; onChange: (kw: string[]) => void }) {
    const [input, setInput] = useState('');

    const addKeyword = () => {
        const kw = input.trim();
        if (kw && !keywords.includes(kw)) {
            onChange([...keywords, kw]);
        }
        setInput('');
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {keywords.map((kw, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-lg">
                        {kw}
                        <button type="button" onClick={() => onChange(keywords.filter((_, j) => j !== i))} className="hover:text-red-500">
                            <X size={12} />
                        </button>
                    </span>
                ))}
            </div>
            <div className="flex gap-1.5">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                    placeholder="Thêm từ khóa..."
                    className="flex-1 border rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-orange-400 focus:outline-none"
                />
                <button type="button" onClick={addKeyword} className="px-2 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-600 transition-colors">
                    <Plus size={14} />
                </button>
            </div>
        </div>
    );
}

// ── Accessory Rule Modal (Visual Builder) ──
function AccessoryRuleModal({ rule, onClose, onSave, serviceNodes, productNodes, serviceLinkSuggestions }: {
    rule: AccessoryDiscountRule | null;
    onClose: () => void;
    onSave: (data: Partial<AccessoryDiscountRule>) => Promise<void>;
    serviceNodes: FlatNode[];
    productNodes: FlatNode[];
    serviceLinkSuggestions: ServiceLinkSuggestion[];
}) {
    const [form, setForm] = useState({
        name: rule?.name || '',
        triggerServiceCategory: rule?.triggerServiceCategory || '',
        triggerKeywords: rule?.triggerKeywords || [] as string[],
        discountType: rule?.discountType || 'percentage' as 'percentage' | 'fixed',
        discountValue: rule?.discountValue?.toString() || '',
        targetProductCategory: rule?.targetProductCategory || '',
        targetKeywords: rule?.targetKeywords || [] as string[],
        maxDiscountAmount: rule?.maxDiscountAmount?.toString() || '',
    });
    const [saving, setSaving] = useState(false);

    // Find selected node names for preview
    const triggerNode = serviceNodes.find(n => n.id === form.triggerServiceCategory);
    const targetNode = productNodes.find(n => n.id === form.targetProductCategory);
    const linkedSuggestions = serviceLinkSuggestions.filter(service =>
        form.triggerServiceCategory &&
        service.linkedProductCategoryIds.length > 0 &&
        service.categoryIds.includes(form.triggerServiceCategory)
    );

    const previewText = (() => {
        const trigger = triggerNode?.name || form.triggerKeywords[0] || '...';
        const target = targetNode?.name || form.targetKeywords[0] || '...';
        const value = form.discountValue || '?';
        const unit = form.discountType === 'percentage' ? '%' : 'đ';
        return `Khi dùng DV "${trigger}" → "${target}" giảm ${value}${unit}`;
    })();

    const handleTriggerSelect = (nodeId: string, node: FlatNode | null) => {
        setForm(p => ({
            ...p,
            triggerServiceCategory: nodeId,
            // Auto-populate keywords from seoKeywords if available and current keywords are empty/from previous auto-populate
            triggerKeywords: node?.seoKeywords
                ? node.seoKeywords.split(',').map(s => s.trim()).filter(Boolean)
                : nodeId ? p.triggerKeywords : [],
        }));
    };

    const handleTargetSelect = (nodeId: string, node: FlatNode | null) => {
        setForm(p => ({
            ...p,
            targetProductCategory: nodeId,
            targetKeywords: node?.seoKeywords
                ? node.seoKeywords.split(',').map(s => s.trim()).filter(Boolean)
                : nodeId ? p.targetKeywords : [],
        }));
    };

    const applyServiceLinkSuggestion = (suggestion: ServiceLinkSuggestion) => {
        const targetCategory = suggestion.linkedProductCategoryIds[suggestion.linkedProductCategoryIds.length - 1] || '';
        setForm(p => ({
            ...p,
            targetProductCategory: targetCategory,
            targetKeywords: suggestion.tags?.length ? suggestion.tags : p.targetKeywords,
        }));
    };

    const handleSave = async () => {
        if (!form.name.trim()) { toast.error('Nhập tên rule'); return; }
        if (!form.discountValue || Number(form.discountValue) <= 0) { toast.error('Giá trị giảm không hợp lệ'); return; }
        if (!form.triggerServiceCategory && form.triggerKeywords.length === 0) { toast.error('Chọn dịch vụ kích hoạt hoặc thêm từ khóa'); return; }
        if (!form.targetProductCategory && form.targetKeywords.length === 0) { toast.error('Chọn sản phẩm được giảm hoặc thêm từ khóa'); return; }
        setSaving(true);
        try {
            await onSave({
                name: form.name.trim(),
                triggerServiceCategory: form.triggerServiceCategory,
                triggerKeywords: form.triggerKeywords,
                discountType: form.discountType as 'percentage' | 'fixed',
                discountValue: Number(form.discountValue),
                targetProductCategory: form.targetProductCategory,
                targetKeywords: form.targetKeywords,
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
                <div className="p-5 space-y-5">
                    {/* Tên rule */}
                    <div>
                        <label className="text-sm text-gray-600 mb-1.5 block font-medium">Tên rule *</label>
                        <input title="Tên rule" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="VD: Giảm 40% cường lực khi thay màn"
                            className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                    </div>

                    {/* NẾU */}
                    <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-100/60 border-b border-blue-200">
                            <Zap size={16} className="text-blue-600" />
                            <span className="text-sm font-bold text-blue-800">NẾU</span>
                            <span className="text-xs text-blue-600">khách sử dụng dịch vụ</span>
                        </div>
                        <div className="p-4 space-y-3">
                            <TaxonomyDropdown
                                nodes={serviceNodes}
                                value={form.triggerServiceCategory}
                                onChange={handleTriggerSelect}
                                placeholder="Chọn danh mục dịch vụ..."
                            />
                            {linkedSuggestions.length > 0 && (
                                <div className="rounded-lg border border-blue-100 bg-white p-3">
                                    <p className="text-xs font-semibold text-blue-800">Gợi ý bán kèm từ dịch vụ</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {linkedSuggestions.map(suggestion => (
                                            <button
                                                key={suggestion.id}
                                                type="button"
                                                onClick={() => applyServiceLinkSuggestion(suggestion)}
                                                className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-left text-xs font-medium text-blue-700 hover:bg-blue-100"
                                            >
                                                {suggestion.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-gray-500 mb-1.5">Từ khóa kích hoạt (tự động từ taxonomy hoặc thêm thủ công):</p>
                                <KeywordChips keywords={form.triggerKeywords} onChange={kw => setForm(p => ({ ...p, triggerKeywords: kw }))} />
                            </div>
                        </div>
                    </div>

                    {/* Arrow connector */}
                    <div className="flex justify-center">
                        <ArrowDown size={24} className="text-gray-300" />
                    </div>

                    {/* THÌ */}
                    <div className="rounded-xl border-2 border-green-200 bg-green-50/50 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-100/60 border-b border-green-200">
                            <ShoppingBag size={16} className="text-green-600" />
                            <span className="text-sm font-bold text-green-800">THÌ</span>
                            <span className="text-xs text-green-600">sản phẩm được giảm giá</span>
                        </div>
                        <div className="p-4 space-y-3">
                            <TaxonomyDropdown
                                nodes={productNodes}
                                value={form.targetProductCategory}
                                onChange={handleTargetSelect}
                                placeholder="Chọn danh mục sản phẩm..."
                            />
                            <div>
                                <p className="text-xs text-gray-500 mb-1.5">Từ khóa sản phẩm áp dụng:</p>
                                <KeywordChips keywords={form.targetKeywords} onChange={kw => setForm(p => ({ ...p, targetKeywords: kw }))} />
                            </div>
                        </div>
                    </div>

                    {/* Arrow connector */}
                    <div className="flex justify-center">
                        <ArrowDown size={24} className="text-gray-300" />
                    </div>

                    {/* GIẢM */}
                    <div className="rounded-xl border-2 border-orange-200 bg-orange-50/50 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-100/60 border-b border-orange-200">
                            <Percent size={16} className="text-orange-600" />
                            <span className="text-sm font-bold text-orange-800">GIẢM</span>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-xs text-gray-500 mb-1 block">Loại giảm</label>
                                    <select title="Chọn loại giảm" value={form.discountType} onChange={e => setForm(p => ({ ...p, discountType: e.target.value as 'percentage' | 'fixed' }))}
                                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none">
                                        <option value="percentage">Phần trăm (%)</option>
                                        <option value="fixed">Số tiền cố định</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-gray-500 mb-1 block">Giá trị *</label>
                                    <input type="number" value={form.discountValue} onChange={e => setForm(p => ({ ...p, discountValue: e.target.value }))}
                                        placeholder={form.discountType === 'percentage' ? '40' : '50000'}
                                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Giảm tối đa (VNĐ, tùy chọn)</label>
                                <input type="number" value={form.maxDiscountAmount} onChange={e => setForm(p => ({ ...p, maxDiscountAmount: e.target.value }))}
                                    placeholder="Để trống = không giới hạn"
                                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                            </div>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="bg-gray-50 rounded-xl px-4 py-3 border border-dashed border-gray-300">
                        <p className="text-xs text-gray-500 mb-1">📋 Preview</p>
                        <p className="text-sm font-medium text-gray-800">{previewText}</p>
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
    const { config } = useConfig();
    const [activeTab, setActiveTab] = useState<'tiers' | 'accessories'>('tiers');

    // Accessories State
    const [rules, setRules] = useState<(AccessoryDiscountRule & { id: string })[]>([]);
    const [showAccessoryModal, setShowAccessoryModal] = useState(false);
    const [editRule, setEditRule] = useState<AccessoryDiscountRule | null>(null);
    const [serviceLinkSuggestions, setServiceLinkSuggestions] = useState<ServiceLinkSuggestion[]>([]);

    // Tiers State
    const [tiers, setTiers] = useState<TierConfig[]>(TIER_CONFIGS);
    const [savingTiers, setSavingTiers] = useState(false);
    const [expandedTier, setExpandedTier] = useState<string | null>(null);

    // Customers per tier
    const [tierCustomers, setTierCustomers] = useState<Record<string, { name: string; phone: string; totalSpent: number }[]>>({});

    // Format currency with commas
    const fmtCurrency = (n: number) => n.toLocaleString('vi-VN');

    // Flatten taxonomy nodes for dropdowns
    const serviceNodes = useMemo(() => flattenTaxonomy(config.taxonomy?.service || []), [config.taxonomy]);
    const productNodes = useMemo(() => {
        const retail = flattenTaxonomy(config.taxonomy?.retail || []);
        const component = flattenTaxonomy(config.taxonomy?.component || []);
        return [...retail, ...component];
    }, [config.taxonomy]);

    // Build a lookup map for displaying node names in the rule list
    const nodeMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const n of [...serviceNodes, ...productNodes]) map.set(n.id, n.name);
        return map;
    }, [serviceNodes, productNodes]);

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

    const loadServiceLinkSuggestions = useCallback(async () => {
        const snap = await getDocs(collection(db, 'services'));
        setServiceLinkSuggestions(snap.docs
            .map(docSnap => {
                const data = docSnap.data() as Partial<ServiceLinkSuggestion>;
                return {
                    id: docSnap.id,
                    name: String(data.name || docSnap.id),
                    categoryIds: Array.isArray(data.categoryIds) ? data.categoryIds : [],
                    linkedProductCategoryIds: Array.isArray(data.linkedProductCategoryIds) ? data.linkedProductCategoryIds : [],
                    tags: Array.isArray(data.tags) ? data.tags : [],
                };
            })
            .filter(service => service.categoryIds.length > 0 && service.linkedProductCategoryIds.length > 0)
        );
    }, []);

    useEffect(() => {
        loadAccessoryRules().catch(error => console.error('Failed to load accessory discount rules:', error));
        loadServiceLinkSuggestions().catch(error => console.error('Failed to load service link suggestions:', error));

        // Fetch Tier Settings
        const unsubTiers = onSnapshot(doc(db, 'system_config', 'tier_settings'), snap => {
            if (snap.exists() && snap.data().tiers) {
                setTiers(snap.data().tiers);
            }
        });

        return () => { unsubTiers(); };
    }, [loadAccessoryRules, loadServiceLinkSuggestions]);

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

    // Helper to resolve a category ID to a human-readable name
    const resolveNodeName = (id: string, fallbackKeywords?: string[]) => {
        if (!id && fallbackKeywords?.length) return fallbackKeywords.join(', ');
        return nodeMap.get(id) || id || '—';
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
                                                🔧 Khi: {resolveNodeName(rule.triggerServiceCategory, rule.triggerKeywords)}
                                            </span>
                                            <span className="bg-green-50 text-green-700 px-2 py-1 rounded-lg">
                                                🏷️ Giảm: {resolveNodeName(rule.targetProductCategory, rule.targetKeywords)}
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

                    {showAccessoryModal && (
                        <AccessoryRuleModal
                            rule={editRule}
                            onClose={() => setShowAccessoryModal(false)}
                            onSave={handleSaveAccessoryRule}
                            serviceNodes={serviceNodes}
                            productNodes={productNodes}
                            serviceLinkSuggestions={serviceLinkSuggestions}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
