'use client';

/* eslint-disable @next/next/no-img-element */
import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useConfig, DEFAULT_CONFIG } from '@/lib/ConfigContext';
import type { NavItem, SidebarMenuItem, FooterServiceLink, HomeServiceCategory } from '@/lib/config-defaults';
import type { TaxonomyNode } from '@/lib/types';
import { ICON_NAMES, getIcon } from '@/lib/icon-map';
import { getCategoryPath } from '@/lib/utils';
import {
    Save, Loader2, Plus, Trash2, ChevronUp, ChevronDown,
    Eye, EyeOff, GripVertical, CheckCircle2, AlertCircle,
    PanelTop, PanelLeft, PanelBottom, ChevronRight, X, FolderTree, ImageIcon,
} from 'lucide-react';

const MediaManager = dynamic(() => import('@/components/admin/MediaManager'), { ssr: false });

// ── Unique ID generator ──
let _idCounter = 0;
function genId(prefix: string) {
    return `${prefix}_${Date.now()}_${++_idCounter}`;
}

// ── Reorder helpers ──
function moveUp<T>(arr: T[], idx: number): T[] {
    if (idx <= 0) return arr;
    const next = [...arr];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    return next;
}
function moveDown<T>(arr: T[], idx: number): T[] {
    if (idx >= arr.length - 1) return arr;
    const next = [...arr];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    return next;
}

// ── Icon Picker Dropdown ──
function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [open, setOpen] = useState(false);
    const CurrentIcon = getIcon(value);
    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 px-2 py-1.5 border rounded-lg hover:bg-gray-50 text-sm"
            >
                <CurrentIcon size={16} />
                <span className="text-xs text-gray-600 max-w-[60px] truncate">{value}</span>
                <ChevronRight size={12} className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
            </button>
            {open && (
                <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-lg shadow-xl p-2 grid grid-cols-5 gap-1 w-[220px] max-h-[200px] overflow-y-auto">
                    {ICON_NAMES.map(name => {
                        const Ic = getIcon(name);
                        return (
                            <button
                                key={name}
                                type="button"
                                onClick={() => { onChange(name); setOpen(false); }}
                                className={`p-1.5 rounded hover:bg-orange-50 flex flex-col items-center gap-0.5 ${value === name ? 'bg-orange-100 ring-1 ring-orange-400' : ''}`}
                                title={name}
                            >
                                <Ic size={16} />
                                <span className="text-[9px] text-gray-500 truncate w-full text-center">{name}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Taxonomy Badge ──
function TaxonomyBadge({ slug, taxonomyRef, allTrees }: { slug: string; taxonomyRef?: string; allTrees: TaxonomyNode[][] }) {
    // Try taxonomyRef first (direct link), then fallback to slug search
    for (const tree of allTrees) {
        if (taxonomyRef) {
            const path = getCategoryPath(taxonomyRef, tree);
            if (path) return <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full truncate max-w-[160px]" title={path}>📂 {path}</span>;
        }
        // Fallback: match by slug (taxonomy node id ends with slug)
        const path = getCategoryPath(slug, tree);
        if (path) return <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full truncate max-w-[160px]" title={path}>📂 {path}</span>;
    }
    return <span className="text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-full">⚠ Chưa liên kết</span>;
}

// ── Taxonomy Suggest Popup ──
function TaxonomySuggestPopup({ trees, onSelect, onClose }: {
    trees: { label: string; nodes: TaxonomyNode[] }[];
    onSelect: (node: TaxonomyNode, parentIcon?: string) => void;
    onClose: () => void;
}) {
    const [expandedL1, setExpandedL1] = useState<string | null>(null);
    const [expandedL2, setExpandedL2] = useState<string | null>(null);
    return (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3 border-b">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                        <FolderTree size={16} className="text-orange-500" />
                        Gợi ý từ Danh mục
                    </h3>
                    <button title="Đóng" aria-label="Đóng" onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
                </div>
                <div className="overflow-y-auto max-h-[55vh] p-4 space-y-3">
                    {trees.map(({ label, nodes }) => (
                        <div key={label}>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                            {nodes.map(l1 => (
                                <div key={l1.id} className="ml-1">
                                    <div className="flex items-center gap-2">
                                        <button
                                            title="Mở rộng"
                                            aria-label="Mở rộng"
                                            onClick={() => setExpandedL1(expandedL1 === l1.id ? null : l1.id)}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            {l1.children?.length ? (expandedL1 === l1.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
                                        </button>
                                        <button
                                            onClick={() => onSelect(l1)}
                                            className="text-sm text-gray-700 hover:text-orange-600 hover:underline"
                                        >
                                            {l1.name}
                                        </button>
                                        <span className="text-[10px] text-gray-400">Tầng 1</span>
                                    </div>
                                    {expandedL1 === l1.id && l1.children?.map(l2 => (
                                        <div key={l2.id} className="ml-6">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    title="Mở rộng"
                                                    aria-label="Mở rộng"
                                                    onClick={() => setExpandedL2(expandedL2 === l2.id ? null : l2.id)}
                                                    className="text-gray-400 hover:text-gray-600"
                                                >
                                                    {l2.children?.length ? (expandedL2 === l2.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
                                                </button>
                                                <button
                                                    onClick={() => onSelect(l2, l1.icon)}
                                                    className="text-sm text-gray-700 hover:text-orange-600 hover:underline"
                                                >
                                                    {l2.name}
                                                </button>
                                                <span className="text-[10px] text-gray-400">Tầng 2</span>
                                            </div>
                                            {expandedL2 === l2.id && l2.children?.map(l3 => (
                                                <div key={l3.id} className="ml-6 flex items-center gap-2">
                                                    <span className="w-3" />
                                                    <button
                                                        onClick={() => onSelect(l3, l1.icon)}
                                                        className="text-sm text-gray-700 hover:text-orange-600 hover:underline"
                                                    >
                                                        {l3.name}
                                                    </button>
                                                    <span className="text-[10px] text-gray-400">Tầng 3</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════
// ║  NavigationTab — Main Component     ║
// ═══════════════════════════════════════
export default function NavigationTab() {
    const { config, loading, updateConfig } = useConfig();
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // ── Header Nav state ──
    const [headerNav, setHeaderNav] = useState<NavItem[]>(
        () => (config.headerNav?.length ? config.headerNav : DEFAULT_CONFIG.headerNav).map((item, i) => ({ ...item, order: i }))
    );

    // ── Sidebar Menu state ──
    const [sidebarMenu, setSidebarMenu] = useState<SidebarMenuItem[]>(
        () => (config.sidebarMenu?.length ? config.sidebarMenu : DEFAULT_CONFIG.sidebarMenu).map((item, i) => ({ ...item, order: i }))
    );

    // ── Footer Services state ──
    const [footerServices, setFooterServices] = useState<FooterServiceLink[]>(
        () => (config.footerServices?.length ? config.footerServices : DEFAULT_CONFIG.footerServices).map((item, i) => ({ ...item, order: i }))
    );

    // ── Home Service Categories state ──
    const [homeServiceCategories, setHomeServiceCategories] = useState<HomeServiceCategory[]>(
        () => (config.homeServiceCategories?.length ? config.homeServiceCategories : DEFAULT_CONFIG.homeServiceCategories).map((item, i) => ({ ...item, order: i }))
    );

    useEffect(() => {
        if (loading) return;

        setHeaderNav((config.headerNav?.length ? config.headerNav : DEFAULT_CONFIG.headerNav).map((item, i) => ({ ...item, order: i })));
        setSidebarMenu((config.sidebarMenu?.length ? config.sidebarMenu : DEFAULT_CONFIG.sidebarMenu).map((item, i) => ({ ...item, order: i })));
        setFooterServices((config.footerServices?.length ? config.footerServices : DEFAULT_CONFIG.footerServices).map((item, i) => ({ ...item, order: i })));
        setHomeServiceCategories((config.homeServiceCategories?.length ? config.homeServiceCategories : DEFAULT_CONFIG.homeServiceCategories).map((item, i) => ({ ...item, order: i })));
    }, [loading, config.headerNav, config.sidebarMenu, config.footerServices, config.homeServiceCategories]);


    // ── Which sidebar item is expanded for sub-group editing ──
    const [expandedSidebar, setExpandedSidebar] = useState<string | null>(null);

    // ── Media picker for home service category icon ──
    const [mediaPickerFor, setMediaPickerFor] = useState<number | null>(null);

    // ── Taxonomy suggest popup ──
    const [showTaxonomySuggest, setShowTaxonomySuggest] = useState<'header' | 'footer' | 'sidebar' | 'home' | null>(null);
    const allTaxonomyTrees: TaxonomyNode[][] = [
        config.taxonomy?.retail || [],
        config.taxonomy?.service || [],
        config.taxonomy?.component || [],
    ];
    const taxonomyTreesForPopup = showTaxonomySuggest === 'footer' || showTaxonomySuggest === 'home'
        ? [{ label: 'Dịch vụ', nodes: config.taxonomy?.service || [] }]
        : [
            { label: 'Sản phẩm', nodes: config.taxonomy?.retail || [] },
            { label: 'Dịch vụ', nodes: config.taxonomy?.service || [] },
            { label: 'Linh kiện', nodes: config.taxonomy?.component || [] },
        ];

    const handleTaxonomySuggest = (node: TaxonomyNode, parentIcon?: string) => {
        if (showTaxonomySuggest === 'header') {
            setHeaderNav(prev => [...prev, {
                id: genId('hn'), label: node.name, slug: node.id,
                iconName: parentIcon || node.icon || 'LayoutGrid',
                order: prev.length, visible: true, taxonomyRef: node.id,
            }]);
        } else if (showTaxonomySuggest === 'footer') {
            setFooterServices(prev => [...prev, {
                id: genId('ft'), name: node.name, slug: node.id,
                order: prev.length, visible: true, taxonomyRef: node.id,
            }]);
        } else if (showTaxonomySuggest === 'sidebar') {
            setSidebarMenu(prev => [...prev, {
                id: genId('sb'), name: node.name, slug: node.id,
                iconName: parentIcon || node.icon || 'LayoutGrid',
                order: prev.length, visible: true, subGroups: [], taxonomyRef: node.id,
            }]);
        } else if (showTaxonomySuggest === 'home') {
            setHomeServiceCategories(prev => [...prev, {
                id: genId('hc'), name: node.name, slug: node.id,
                icon: '🔧', count: '0+ dịch vụ',
                order: prev.length, visible: true, taxonomyRef: node.id,
            }]);
        }
        setShowTaxonomySuggest(null);
    };

    // ── Save all ──
    const handleSave = useCallback(async () => {
        setSaving(true);
        setMessage(null);
        try {
            const normalizedHeader = headerNav.map((item, i) => ({ ...item, order: i }));
            const normalizedSidebar = sidebarMenu.map((item, i) => ({ ...item, order: i }));
            const normalizedFooter = footerServices.map((item, i) => ({ ...item, order: i }));
            const normalizedHomeServiceCategories = homeServiceCategories.map((item, i) => ({ ...item, order: i }));

            await updateConfig({
                headerNav: normalizedHeader,
                sidebarMenu: normalizedSidebar,
                footerServices: normalizedFooter,
                homeServiceCategories: normalizedHomeServiceCategories,
            });

            setMessage({ type: 'success', text: 'Đã lưu menu thành công!' });
        } catch (err) {
            console.error('Save nav error:', err);
            setMessage({ type: 'error', text: 'Lỗi khi lưu. Vui lòng thử lại.' });
        } finally {
            setSaving(false);
        }
    }, [headerNav, sidebarMenu, footerServices, homeServiceCategories, updateConfig]);

    // ═══════════════════════════
    // HEADER NAV HANDLERS
    // ═══════════════════════════
    const addHeaderItem = () => {
        setHeaderNav(prev => [...prev, {
            id: genId('hn'), label: 'Mục mới', slug: 'muc-moi', iconName: 'LayoutGrid', order: prev.length, visible: true,
        }]);
    };

    const updateHeaderItem = (idx: number, patch: Partial<NavItem>) => {
        setHeaderNav(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
    };

    const removeHeaderItem = (idx: number) => {
        setHeaderNav(prev => prev.filter((_, i) => i !== idx));
    };

    // ═══════════════════════════
    // SIDEBAR MENU HANDLERS
    // ═══════════════════════════
    const addSidebarItem = () => {
        setSidebarMenu(prev => [...prev, {
            id: genId('sb'), name: 'Danh mục mới', slug: 'danh-muc-moi', iconName: 'LayoutGrid', order: prev.length, visible: true, subGroups: [],
        }]);
    };

    const updateSidebarItem = (idx: number, patch: Partial<SidebarMenuItem>) => {
        setSidebarMenu(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
    };

    const removeSidebarItem = (idx: number) => {
        setSidebarMenu(prev => prev.filter((_, i) => i !== idx));
    };

    // Sub-group handlers
    const addSubGroup = (sidebarIdx: number) => {
        setSidebarMenu(prev => prev.map((item, i) => {
            if (i !== sidebarIdx) return item;
            return { ...item, subGroups: [...item.subGroups, { group: 'Nhóm mới', items: [] }] };
        }));
    };

    const updateSubGroup = (sidebarIdx: number, groupIdx: number, patch: { group?: string; items?: string[] }) => {
        setSidebarMenu(prev => prev.map((item, i) => {
            if (i !== sidebarIdx) return item;
            const newGroups = [...item.subGroups];
            newGroups[groupIdx] = { ...newGroups[groupIdx], ...patch };
            return { ...item, subGroups: newGroups };
        }));
    };

    const removeSubGroup = (sidebarIdx: number, groupIdx: number) => {
        setSidebarMenu(prev => prev.map((item, i) => {
            if (i !== sidebarIdx) return item;
            return { ...item, subGroups: item.subGroups.filter((_, gi) => gi !== groupIdx) };
        }));
    };

    // ═══════════════════════════
    // FOOTER SERVICES HANDLERS
    // ═══════════════════════════
    const addFooterItem = () => {
        setFooterServices(prev => [...prev, {
            id: genId('fs'), name: 'Dịch vụ mới', slug: 'dich-vu-moi', order: prev.length, visible: true,
        }]);
    };

    const updateFooterItem = (idx: number, patch: Partial<FooterServiceLink>) => {
        setFooterServices(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
    };

    const removeFooterItem = (idx: number) => {
        setFooterServices(prev => prev.filter((_, i) => i !== idx));
    };

    // ═══════════════════════════
    // HOME SERVICE CATEGORIES HANDLERS
    // ═══════════════════════════
    const addHomeServiceCategory = () => {
        setHomeServiceCategories(prev => [...prev, {
            id: genId('hc'), name: 'Danh mục mới', slug: 'danh-muc-moi', icon: '📱', count: '0+ dịch vụ', order: prev.length, visible: true,
        }]);
    };

    const updateHomeServiceCategory = (idx: number, patch: Partial<HomeServiceCategory>) => {
        setHomeServiceCategories(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
    };

    const removeHomeServiceCategory = (idx: number) => {
        setHomeServiceCategories(prev => prev.filter((_, i) => i !== idx));
    };


    // ═══════════════════════════
    // RENDER
    // ═══════════════════════════
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý Menu</h1>
                    <p className="text-gray-500 mt-1">Tùy chỉnh Header, Sidebar và Footer navigation</p>
                </div>
            </div>

            {/* Mobile Sticky Save Button */}
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 md:static md:p-0 md:bg-transparent md:border-t-0 md:z-auto md:flex md:justify-end md:-mt-16">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 font-medium"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Lưu tất cả
                </button>
            </div>

            {/* Status message */}
            {message && (
                <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {message.text}
                </div>
            )}

            {/* ═══════════════════════════════════════ */}
            {/* SECTION 1: Header Navigation           */}
            {/* ═══════════════════════════════════════ */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <PanelTop size={18} className="text-orange-500" />
                        <h2 className="font-semibold text-gray-800">Header Navigation</h2>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{headerNav.length} mục</span>
                    </div>
                    <button onClick={addHeaderItem} className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 font-medium">
                        <Plus size={14} /> Thêm
                    </button>
                    <button onClick={() => setShowTaxonomySuggest('header')} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium ml-2">
                        <FolderTree size={14} /> Gợi ý từ Danh mục
                    </button>
                </div>
                <div className="divide-y divide-gray-50">
                    {headerNav.map((item, idx) => (
                        <div key={item.id} className="px-4 py-4 md:py-3 flex flex-wrap items-center gap-y-3 gap-x-2 hover:bg-gray-50/50 group border-b border-gray-50 last:border-0">
                            <GripVertical size={14} className="text-gray-300" />
                            <IconPicker value={item.iconName} onChange={v => updateHeaderItem(idx, { iconName: v })} />
                            <input
                                value={item.label}
                                onChange={e => updateHeaderItem(idx, { label: e.target.value })}
                                className="flex-1 min-w-[150px] text-sm border rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-orange-300 focus:border-orange-300"
                                placeholder="Tên hiển thị"
                            />
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                                <button
                                    type="button"
                                    onClick={() => updateHeaderItem(idx, { isCustomLink: !item.isCustomLink })}
                                    className={`px-1.5 py-1 rounded border ${item.isCustomLink ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                                    title="Đổi loại link"
                                >
                                    {item.isCustomLink ? 'Link' : 'DMục'}
                                </button>
                                {!item.isCustomLink && <span>/category/</span>}
                                <input
                                    value={item.slug}
                                    onChange={e => updateHeaderItem(idx, { slug: e.target.value })}
                                    className={`text-sm border rounded px-2 py-1 focus:ring-1 focus:ring-orange-300 ${item.isCustomLink ? 'w-40' : 'w-24'}`}
                                    placeholder={item.isCustomLink ? "https://..." : "slug"}
                                />
                            </div>
                            <button
                                onClick={() => updateHeaderItem(idx, { visible: !item.visible })}
                                className={`p-1 rounded ${item.visible ? 'text-green-500' : 'text-gray-300'}`}
                                title={item.visible ? 'Đang hiện' : 'Đang ẩn'}
                            >
                                {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            <div className="flex flex-col">
                                <button title="Lên" onClick={() => setHeaderNav(prev => moveUp(prev, idx))} className="text-gray-400 hover:text-gray-600" disabled={idx === 0}><ChevronUp size={12} /></button>
                                <button title="Xuống" onClick={() => setHeaderNav(prev => moveDown(prev, idx))} className="text-gray-400 hover:text-gray-600" disabled={idx === headerNav.length - 1}><ChevronDown size={12} /></button>
                            </div>
                            <button title="Xóa" onClick={() => removeHeaderItem(idx)} className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <Trash2 size={14} />
                            </button>
                            <TaxonomyBadge slug={item.slug} taxonomyRef={item.taxonomyRef} allTrees={allTaxonomyTrees} />
                            <select
                                value={item.filterType || ''}
                                onChange={e => updateHeaderItem(idx, { filterType: (e.target.value || undefined) as NavItem['filterType'] })}
                                className="text-xs border rounded px-1.5 py-1 focus:ring-1 focus:ring-orange-300 bg-white text-gray-600 max-w-[100px]"
                                title="Bộ lọc sản phẩm"
                            >
                                <option value="">Theo danh mục</option>
                                <option value="repair">Sửa chữa</option>
                                <option value="new">Máy mới</option>
                                <option value="likenew">Máy cũ</option>
                                <option value="accessory">Phụ kiện</option>
                            </select>
                        </div>
                    ))}
                    {headerNav.length === 0 && (
                        <div className="px-5 py-8 text-center text-gray-400 text-sm">Chưa có mục nào. Bấm &quot;Thêm&quot; để bắt đầu.</div>
                    )}
                </div>
            </section>

            {/* ═══════════════════════════════════════ */}
            {/* SECTION 2: Sidebar Menu                */}
            {/* ═══════════════════════════════════════ */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <PanelLeft size={18} className="text-blue-500" />
                        <h2 className="font-semibold text-gray-800">Sidebar Menu (Trang chủ)</h2>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{sidebarMenu.length} mục</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={addSidebarItem} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
                            <Plus size={14} /> Thêm
                        </button>
                        <button onClick={() => setShowTaxonomySuggest('sidebar')} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
                            <FolderTree size={14} /> Gợi ý từ Danh mục
                        </button>
                    </div>
                </div>
                <div className="divide-y divide-gray-50">
                    {sidebarMenu.map((item, idx) => {
                        const isExpanded = expandedSidebar === item.id;
                        return (
                            <div key={item.id} className="hover:bg-gray-50/30">
                                {/* Main row */}
                                <div className="px-4 py-4 md:py-3 flex flex-wrap items-center gap-y-3 gap-x-2 group border-b border-gray-50 last:border-0">
                                    <GripVertical size={14} className="text-gray-300" />
                                    <IconPicker value={item.iconName} onChange={v => updateSidebarItem(idx, { iconName: v })} />
                                    <input
                                        value={item.name}
                                        onChange={e => updateSidebarItem(idx, { name: e.target.value })}
                                        className="flex-1 min-w-[150px] text-sm border rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-blue-300 focus:border-blue-300"
                                        placeholder="Tên danh mục"
                                    />
                                    <div className="flex items-center gap-1 text-xs text-gray-400">
                                        <button
                                            type="button"
                                            onClick={() => updateSidebarItem(idx, { isCustomLink: !item.isCustomLink })}
                                            className={`px-1.5 py-1 rounded border ${item.isCustomLink ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                                            title="Đổi loại link"
                                        >
                                            {item.isCustomLink ? 'Link' : 'DMục'}
                                        </button>
                                        {!item.isCustomLink && <span>/category/</span>}
                                        <input
                                            value={item.slug}
                                            onChange={e => updateSidebarItem(idx, { slug: e.target.value })}
                                            className={`text-sm border rounded px-2 py-1 focus:ring-1 focus:ring-blue-300 ${item.isCustomLink ? 'w-40' : 'w-28'}`}
                                            placeholder={item.isCustomLink ? "https://..." : "slug"}
                                        />
                                    </div>
                                    <button
                                        onClick={() => setExpandedSidebar(isExpanded ? null : item.id)}
                                        className="text-xs text-blue-500 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50"
                                    >
                                        {item.subGroups.length} nhóm con {isExpanded ? '▲' : '▼'}
                                    </button>
                                    <button
                                        onClick={() => updateSidebarItem(idx, { visible: !item.visible })}
                                        className={`p-1 rounded ${item.visible ? 'text-green-500' : 'text-gray-300'}`}
                                    >
                                        {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                                    </button>
                                    <div className="flex flex-col">
                                        <button title="Lên" onClick={() => setSidebarMenu(prev => moveUp(prev, idx))} className="text-gray-400 hover:text-gray-600" disabled={idx === 0}><ChevronUp size={12} /></button>
                                        <button title="Xuống" onClick={() => setSidebarMenu(prev => moveDown(prev, idx))} className="text-gray-400 hover:text-gray-600" disabled={idx === sidebarMenu.length - 1}><ChevronDown size={12} /></button>
                                    </div>
                                    <button title="Xóa" onClick={() => removeSidebarItem(idx)} className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                        <Trash2 size={14} />
                                    </button>
                                    <TaxonomyBadge slug={item.slug} taxonomyRef={item.taxonomyRef} allTrees={allTaxonomyTrees} />
                                </div>

                                {/* Sub-groups panel */}
                                {isExpanded && (
                                    <div className="px-8 pb-4 space-y-3 bg-gray-50/50 border-t border-gray-100">
                                        <div className="pt-3 flex items-center justify-between">
                                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Nhóm con (flyout submenu)</span>
                                            <button
                                                onClick={() => addSubGroup(idx)}
                                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                                            >
                                                <Plus size={12} /> Thêm nhóm
                                            </button>
                                        </div>
                                        {item.subGroups.map((sg, gi) => (
                                            <div key={gi} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        value={sg.group}
                                                        onChange={e => updateSubGroup(idx, gi, { group: e.target.value })}
                                                        className="flex-1 text-sm font-medium border rounded px-2 py-1 focus:ring-1 focus:ring-blue-300"
                                                        placeholder="Tên nhóm (vd: Dòng máy)"
                                                    />
                                                    <button
                                                        title="Xóa nhóm con"
                                                        onClick={() => removeSubGroup(idx, gi)}
                                                        className="text-gray-300 hover:text-red-500 p-1"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                                <textarea
                                                    value={sg.items.join(', ')}
                                                    onChange={e => {
                                                        const items = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                                        updateSubGroup(idx, gi, { items });
                                                    }}
                                                    className="w-full text-xs border rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300 min-h-[40px]"
                                                    placeholder="Các mục cách nhau bằng dấu phẩy (vd: iPhone 16 Pro Max, iPhone 15 Pro)"
                                                />
                                            </div>
                                        ))}
                                        {item.subGroups.length === 0 && (
                                            <p className="text-xs text-gray-400 italic py-2">Chưa có nhóm con. Bấm &quot;Thêm nhóm&quot; để tạo.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {sidebarMenu.length === 0 && (
                        <div className="px-5 py-8 text-center text-gray-400 text-sm">Chưa có mục nào.</div>
                    )}
                </div>
            </section>

            {/* ═══════════════════════════════════════ */}
            {/* SECTION 3: Footer Services              */}
            {/* ═══════════════════════════════════════ */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <PanelBottom size={18} className="text-green-500" />
                        <h2 className="font-semibold text-gray-800">Footer — Dịch vụ sửa chữa</h2>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{footerServices.length} mục</span>
                    </div>
                    <button onClick={addFooterItem} className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium">
                        <Plus size={14} /> Thêm
                    </button>
                    <button onClick={() => setShowTaxonomySuggest('footer')} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium ml-2">
                        <FolderTree size={14} /> Gợi ý
                    </button>
                </div>
                <div className="divide-y divide-gray-50">
                    {footerServices.map((item, idx) => (
                        <div key={item.id} className="px-4 py-4 md:py-3 flex flex-wrap items-center gap-y-3 gap-x-2 hover:bg-gray-50/50 group border-b border-gray-50 last:border-0">
                            <GripVertical size={14} className="text-gray-300" />
                            <input
                                value={item.name}
                                onChange={e => updateFooterItem(idx, { name: e.target.value })}
                                className="flex-1 min-w-[150px] text-sm border rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-green-300 focus:border-green-300"
                                placeholder="Tên dịch vụ"
                            />
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                                <button
                                    type="button"
                                    onClick={() => updateFooterItem(idx, { isCustomLink: !item.isCustomLink })}
                                    className={`px-1.5 py-1 rounded border ${item.isCustomLink ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                                    title="Đổi loại link"
                                >
                                    {item.isCustomLink ? 'Link' : 'DMục'}
                                </button>
                                {!item.isCustomLink && <span>/category/</span>}
                                <input
                                    value={item.slug}
                                    onChange={e => updateFooterItem(idx, { slug: e.target.value })}
                                    className={`text-sm border rounded px-2 py-1 focus:ring-1 focus:ring-green-300 ${item.isCustomLink ? 'w-40' : 'w-24'}`}
                                    placeholder={item.isCustomLink ? "https://..." : "slug"}
                                />
                            </div>
                            <button
                                onClick={() => updateFooterItem(idx, { visible: !item.visible })}
                                className={`p-1 rounded ${item.visible ? 'text-green-500' : 'text-gray-300'}`}
                            >
                                {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            <div className="flex flex-col">
                                <button title="Lên" onClick={() => setFooterServices(prev => moveUp(prev, idx))} className="text-gray-400 hover:text-gray-600" disabled={idx === 0}><ChevronUp size={12} /></button>
                                <button title="Xuống" onClick={() => setFooterServices(prev => moveDown(prev, idx))} className="text-gray-400 hover:text-gray-600" disabled={idx === footerServices.length - 1}><ChevronDown size={12} /></button>
                            </div>
                            <button title="Xóa" onClick={() => removeFooterItem(idx)} className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <Trash2 size={14} />
                            </button>
                            <TaxonomyBadge slug={item.slug} taxonomyRef={item.taxonomyRef} allTrees={allTaxonomyTrees} />
                        </div>
                    ))}
                    {footerServices.length === 0 && (
                        <div className="px-5 py-8 text-center text-gray-400 text-sm">Chưa có mục nào.</div>
                    )}
                </div>
            </section>

            {/* ═══════════════════════════════════════ */}
            {/* SECTION 4: Home Service Categories    */}
            {/* ═══════════════════════════════════════ */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <PanelTop size={18} className="text-purple-500" />
                        <h2 className="font-semibold text-gray-800">Danh mục dịch vụ (Trang chủ)</h2>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{homeServiceCategories.length} mục</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={addHomeServiceCategory} className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 font-medium">
                            <Plus size={14} /> Thêm
                        </button>
                        <button onClick={() => setShowTaxonomySuggest('home')} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium">
                            <FolderTree size={14} /> Gợi ý từ Danh mục
                        </button>
                    </div>
                </div>
                <div className="divide-y divide-gray-50">
                    {homeServiceCategories.map((item, idx) => (
                        <div key={item.id} className="px-4 py-4 md:py-3 flex flex-wrap items-center gap-y-3 gap-x-2 hover:bg-gray-50/50 group border-b border-gray-50 last:border-0">
                            <GripVertical size={14} className="text-gray-300" />
                            <button
                                type="button"
                                onClick={() => setMediaPickerFor(idx)}
                                className="w-12 h-12 flex items-center justify-center border rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors overflow-hidden flex-shrink-0"
                                title="Chọn ảnh icon"
                            >
                                {item.icon && (item.icon.startsWith('http') || item.icon.startsWith('/')) ? (
                                    <img src={item.icon} alt="" className="w-8 h-8 object-contain" />
                                ) : item.icon ? (
                                    <span className="text-xl">{item.icon}</span>
                                ) : (
                                    <ImageIcon size={16} className="text-gray-400" />
                                )}
                            </button>
                            <input
                                value={item.name}
                                onChange={e => updateHomeServiceCategory(idx, { name: e.target.value })}
                                className="flex-1 min-w-[150px] text-sm border rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-purple-300 focus:border-purple-300"
                                placeholder="Tên danh mục"
                            />
                            <input
                                value={item.count}
                                onChange={e => updateHomeServiceCategory(idx, { count: e.target.value })}
                                className="w-32 text-sm border rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-purple-300 focus:border-purple-300"
                                placeholder="Số lượng (vd: 200+)"
                            />
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                                <button
                                    type="button"
                                    onClick={() => updateHomeServiceCategory(idx, { isCustomLink: !item.isCustomLink })}
                                    className={`px-1.5 py-1 rounded border ${item.isCustomLink ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                                    title="Đổi loại link"
                                >
                                    {item.isCustomLink ? 'Link' : 'DMục'}
                                </button>
                                {!item.isCustomLink && <span>/category/</span>}
                                <input
                                    value={item.slug}
                                    onChange={e => updateHomeServiceCategory(idx, { slug: e.target.value })}
                                    className={`text-sm border rounded px-2 py-1 focus:ring-1 focus:ring-purple-300 ${item.isCustomLink ? 'w-40' : 'w-24'}`}
                                    placeholder={item.isCustomLink ? "https://..." : "slug"}
                                />
                            </div>
                            <button
                                onClick={() => updateHomeServiceCategory(idx, { visible: !item.visible })}
                                className={`p-1 rounded ${item.visible ? 'text-green-500' : 'text-gray-300'}`}
                            >
                                {item.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                            <div className="flex flex-col">
                                <button title="Lên" onClick={() => setHomeServiceCategories(prev => moveUp(prev, idx))} className="text-gray-400 hover:text-gray-600" disabled={idx === 0}><ChevronUp size={12} /></button>
                                <button title="Xuống" onClick={() => setHomeServiceCategories(prev => moveDown(prev, idx))} className="text-gray-400 hover:text-gray-600" disabled={idx === homeServiceCategories.length - 1}><ChevronDown size={12} /></button>
                            </div>
                            <button title="Xóa" onClick={() => removeHomeServiceCategory(idx)} className="text-gray-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                <Trash2 size={14} />
                            </button>
                            <TaxonomyBadge slug={item.slug} taxonomyRef={item.taxonomyRef} allTrees={allTaxonomyTrees} />
                        </div>
                    ))}
                    {homeServiceCategories.length === 0 && (
                        <div className="px-5 py-8 text-center text-gray-400 text-sm">Chưa có mục nào.</div>
                    )}
                </div>
            </section>

            {/* Taxonomy Suggest Popup */}
            {showTaxonomySuggest && (
                <TaxonomySuggestPopup
                    trees={taxonomyTreesForPopup}
                    onSelect={handleTaxonomySuggest}
                    onClose={() => setShowTaxonomySuggest(null)}
                />
            )}

            {/* Media Picker for Home Service Category Icon */}
            <MediaManager
                isOpen={mediaPickerFor !== null}
                onClose={() => setMediaPickerFor(null)}
                onSelect={(url) => {
                    if (mediaPickerFor !== null) {
                        updateHomeServiceCategory(mediaPickerFor, { icon: url });
                    }
                    setMediaPickerFor(null);
                }}
                title="Chọn icon danh mục"
            />
        </div>
    );
}
