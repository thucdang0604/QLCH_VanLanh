'use client';

/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useMemo, useRef } from 'react';
import {
    useConfig,
    type SiteConfig,
    type HeroBanner,
    type HomepagePricingCategory,
    type PricingIconName,
    type StoreBranch
} from '@/lib/ConfigContext';
import MediaManager from '@/components/admin/MediaManager';
import HomepageLayoutStudio from '@/components/admin/appearance/HomepageLayoutStudio';
import { updateHomepageLayoutProfile } from '@/lib/homeLayoutProfiles';
import {
    Palette, Type, LayoutDashboard, Save, Loader2,
    Trash2, Plus, GripVertical, Eye, EyeOff, ArrowUp, ArrowDown,
    CheckCircle2, AlertCircle, X, RotateCcw, MapPin, Edit2, ImageIcon, Star,
    ExternalLink, SlidersHorizontal, ChevronDown, ChevronUp
} from 'lucide-react';

// ========= Toast =========
function Toast({ message, variant = 'success', onClose }: { message: string; variant?: 'success' | 'error'; onClose: () => void }) {
    useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
    return (
        <div className="fixed top-6 right-6 z-[100] animate-[fadeIn_0.3s_ease-in-out]">
            <div className={`${variant === 'success' ? 'bg-emerald-600' : 'bg-red-600'} text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm`} role="status">
                {variant === 'success' ? <CheckCircle2 size={20} className="flex-shrink-0" /> : <AlertCircle size={20} className="flex-shrink-0" />}
                <span className="text-sm font-medium">{message}</span>
                <button title="Đóng" onClick={onClose} className="ml-2 hover:bg-green-600 rounded p-0.5"><X size={16} /></button>
            </div>
        </div>
    );
}

// ========= Section Card =========
function SectionCard({ id, title, description, icon, children }: { id?: string; title: string; description?: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <section id={id} className="scroll-mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <span className="rounded-md bg-orange-100 p-1.5 text-orange-600">{icon}</span>
                <div>
                    <h3 className="font-semibold text-gray-800">{title}</h3>
                    {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
                </div>
            </div>
            <div className="p-4 sm:p-5">{children}</div>
        </section>
    );
}

// ========= Save Button =========
function SaveBtn({ onClick, saving, label = 'Lưu' }: { onClick: () => void; saving: boolean; label?: string }) {
    return (
        <div className="mt-4 flex justify-end">
            <button onClick={onClick} disabled={saving} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm text-white transition-colors hover:bg-orange-600 disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {label}
            </button>
        </div>
    );
}

const HOMEPAGE_BANNER_ASPECT_RATIO = 16 / 9;

function getBannerRatioStatus(width?: number, height?: number) {
    if (!width || !height) return null;
    const ratio = width / height;
    const diff = Math.abs(ratio - HOMEPAGE_BANNER_ASPECT_RATIO);
    return {
        isValid: diff <= 0.03,
        label: `${width}x${height}`,
    };
}

// ========= Main Page =========
export default function AdminAppearancePage() {
    const { config, updateConfig } = useConfig();
    const [local, setLocal] = useState<SiteConfig>(config);
    const [baseConfig, setBaseConfig] = useState<SiteConfig>(config);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null);
    const [mediaOpen, setMediaOpen] = useState(false);
    const [mediaTarget, setMediaTarget] = useState<string | null>(null);
    const [expandedHomeSectionId, setExpandedHomeSectionId] = useState<string | null>(null);
    const [remoteUpdatePending, setRemoteUpdatePending] = useState(false);

    const [editBranch, setEditBranch] = useState<StoreBranch | null>(null);
    const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', mapLink: '' });

    const configSignature = useMemo(() => JSON.stringify(config), [config]);
    const baseConfigSignature = useMemo(() => JSON.stringify(baseConfig), [baseConfig]);
    const localSignature = useMemo(() => JSON.stringify(local), [local]);
    const isDirty = localSignature !== baseConfigSignature && localSignature !== configSignature;
    const observedConfigSignature = useRef(configSignature);
    useEffect(() => {
        if (observedConfigSignature.current === configSignature) return;
        observedConfigSignature.current = configSignature;
        if (configSignature === baseConfigSignature) {
            setRemoteUpdatePending(false);
            return;
        }
        if (isDirty) {
            setRemoteUpdatePending(true);
            return;
        }
        setLocal(config);
        setBaseConfig(config);
        setRemoteUpdatePending(false);
    }, [baseConfigSignature, config, configSignature, isDirty]);
    const visibleSectionCount = local.homeSections.filter(section => section.visible).length;

    const showToast = (message: string, variant: 'success' | 'error' = 'success') => setToast({ message, variant });

    const save = async (partial: Partial<SiteConfig>, msg: string) => {
        if (saving) return false;
        setSaving(true);
        try {
            // Strip undefined values to prevent Firebase "Unsupported field value: undefined" errors
            const cleanPartial = JSON.parse(JSON.stringify(partial));
            await updateConfig(cleanPartial);
            setBaseConfig((previous) => ({ ...previous, ...cleanPartial }));
            showToast(msg);
            return true;
        }
        catch (error) {
            console.error(error);
            showToast(error instanceof Error ? `Không thể lưu: ${error.message}` : 'Không thể lưu thay đổi. Vui lòng thử lại.', 'error');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const savePublishedHomeSections = (homeSections: SiteConfig['homeSections'], msg: string) => {
        const activeProfileId = local.activeLayoutProfileId;
        const activeProfile = local.layoutProfiles?.find((profile) => profile.id === activeProfileId);
        const layoutProfiles = activeProfile
            ? local.layoutProfiles?.map((profile) => profile.id === activeProfile.id
                ? updateHomepageLayoutProfile(profile, homeSections)
                : profile)
            : local.layoutProfiles;

        return save({
            homeSections,
            ...(layoutProfiles ? { layoutProfiles } : {}),
        }, msg);
    };

    const saveAllHomepageSettings = () => save({
        primaryColor: local.primaryColor,
        primaryColorDark: local.primaryColorDark,
        primaryColorLight: local.primaryColorLight,
        topBarText: local.topBarText,
        topBarEnabled: local.topBarEnabled,
        logoUrl: local.logoUrl,
        headerBg: local.headerBg,
        hero_banners: local.hero_banners,
        background_config: local.background_config,
        store_branches: local.store_branches,
        homepagePricing: local.homepagePricing,
        homepageReviews: local.homepageReviews,
        homeSections: local.homeSections,
    }, 'Đã lưu toàn bộ cấu hình trang chủ!');

    // ---- Media Manager handlers ----
    const openMediaFor = (target: string) => {
        setMediaTarget(target);
        setMediaOpen(true);
    };

    const handleMediaSelect = (url: string, width?: number, height?: number) => {
        if (mediaTarget === 'banner') {
            const newBanner: HeroBanner = { id: `b_${Date.now()}`, imageUrl: url, width, height, alt: '', link: '' };
            setLocal({ ...local, hero_banners: [...local.hero_banners, newBanner] });
        } else if (mediaTarget === 'background') {
            setLocal({ ...local, background_config: { ...local.background_config, type: 'image', value: url } });
        } else if (mediaTarget === 'logo') {
            setLocal({ ...local, logoUrl: url });
        } else if (mediaTarget?.startsWith('section_bg_')) {
            const sectionId = mediaTarget.slice('section_bg_'.length);
            const u = local.homeSections.map(s =>
                s.id === sectionId ? { ...s, sectionBg: { ...(s.sectionBg || { type: 'image' as const }), type: 'image' as const, imageUrl: url } } : s
            );
            setLocal({ ...local, homeSections: u });
        } else if (mediaTarget?.startsWith('section_frame_')) {
            const sectionId = mediaTarget.slice('section_frame_'.length);
            const u = local.homeSections.map(s =>
                s.id === sectionId ? { ...s, sectionBg: { ...(s.sectionBg || { type: 'image' as const }), frameUrl: url } } : s
            );
            setLocal({ ...local, homeSections: u });
        }
        setMediaTarget(null);
    };

    // ---- Color helpers ----
    const generateDarkLight = (hex: string) => {
        const darken = (h: string) => '#' + h.slice(1).replace(/../g, c => Math.max(0, parseInt(c, 16) - 30).toString(16).padStart(2, '0'));
        const lighten = (h: string) => '#' + h.slice(1).replace(/../g, c => Math.min(255, parseInt(c, 16) + 40).toString(16).padStart(2, '0'));
        return { dark: darken(hex), light: lighten(hex) };
    };

    const handlePrimaryColorChange = (hex: string) => {
        const { dark, light } = generateDarkLight(hex);
        setLocal({ ...local, primaryColor: hex, primaryColorDark: dark, primaryColorLight: light });
    };

    // ---- Section reorder ----
    const moveSection = (index: number, direction: 'up' | 'down') => {
        const items = [...local.homeSections];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= items.length) return;
        [items[index], items[newIndex]] = [items[newIndex], items[index]];
        setLocal({ ...local, homeSections: items.map((item, i) => ({ ...item, order: i })) });
    };

    const moveBanner = (index: number, direction: 'up' | 'down') => {
        const items = [...local.hero_banners];
        const nextIndex = direction === 'up' ? index - 1 : index + 1;
        if (nextIndex < 0 || nextIndex >= items.length) return;
        [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
        setLocal({ ...local, hero_banners: items });
    };

    const updateBanner = (bannerId: string, partial: Partial<HeroBanner>) => {
        setLocal({
            ...local,
            hero_banners: local.hero_banners.map(banner => banner.id === bannerId ? { ...banner, ...partial } : banner),
        });
    };

    // ---- Branch CRUD ----
    const addBranch = () => {
        if (!branchForm.name.trim()) return;
        const newBranch: StoreBranch = { id: `br_${Date.now()}`, ...branchForm };
        const updated = [...local.store_branches, newBranch];
        setLocal({ ...local, store_branches: updated });
        setBranchForm({ name: '', address: '', phone: '', mapLink: '' });
    };

    const removeBranch = (id: string) => {
        setLocal({ ...local, store_branches: local.store_branches.filter(b => b.id !== id) });
    };

    const startEditBranch = (branch: StoreBranch) => {
        setEditBranch(branch);
        setBranchForm({ name: branch.name, address: branch.address, phone: branch.phone, mapLink: branch.mapLink });
    };

    const saveBranchEdit = () => {
        if (!editBranch) return;
        const updated = local.store_branches.map(b => b.id === editBranch.id ? { ...b, ...branchForm } : b);
        setLocal({ ...local, store_branches: updated });
        setEditBranch(null);
        setBranchForm({ name: '', address: '', phone: '', mapLink: '' });
    };

    // ---- Homepage Pricing CRUD ----
    const updatePricingCategory = (categoryId: string, partial: Partial<HomepagePricingCategory>) => {
        setLocal(prev => ({
            ...prev,
            homepagePricing: {
                ...prev.homepagePricing,
                categories: prev.homepagePricing.categories.map(category => category.id === categoryId ? { ...category, ...partial } : category),
            },
        }));
    };

    const addPricingCategory = () => {
        const category: HomepagePricingCategory = {
            id: `pricing-category-${Date.now()}`,
            label: 'Nhóm mới',
            icon: 'smartphone',
            keywords: [],
            maxItems: 6,
        };
        setLocal(prev => ({ ...prev, homepagePricing: { ...prev.homepagePricing, categories: [...prev.homepagePricing.categories, category] } }));
    };

    const removePricingCategory = (categoryId: string) => {
        setLocal(prev => ({ ...prev, homepagePricing: { ...prev.homepagePricing, categories: prev.homepagePricing.categories.filter(category => category.id !== categoryId) } }));
    };

    return (
        <div className="space-y-6">
            {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
            <MediaManager
                isOpen={mediaOpen}
                onClose={() => setMediaOpen(false)}
                onSelect={handleMediaSelect}
                defaultFolder={
                    mediaTarget === 'logo' ? 'logo-brand' :
                    mediaTarget === 'banner' ? 'banners' :
                    mediaTarget?.startsWith('section_frame_') ? 'frames' :
                    mediaTarget?.startsWith('section_bg_') ? 'banners' :
                    'general'
                }
            />

            {/* Page Header */}
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 px-5 py-4 text-white sm:px-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-orange-200">
                                <SlidersHorizontal size={16} /> Trang chủ
                            </div>
                            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Giao diện & cấu hình</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Quản lý nhận diện, nội dung nổi bật và thứ tự hiển thị của trang chủ từ một nơi.</p>
                        </div>
                        <div className="flex flex-wrap gap-2 xl:justify-end">
                            <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-white/20">
                                Xem trang chủ <ExternalLink size={15} />
                            </a>
                            <button
                                onClick={() => { setLocal(config); setBaseConfig(config); setRemoteUpdatePending(false); showToast('Đã hoàn tác các thay đổi chưa lưu'); }}
                                disabled={!isDirty || saving}
                                className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <RotateCcw size={16} /> Hoàn tác
                            </button>
                            <button
                                onClick={saveAllHomepageSettings}
                                disabled={!isDirty || saving}
                                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-950/20 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Lưu tất cả
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${isDirty ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isDirty ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                        {isDirty ? 'Có thay đổi chưa lưu' : 'Tất cả thay đổi đã được lưu'}
                    </div>
                    <p className="text-xs text-gray-500">Đang hiển thị <strong className="text-gray-700">{visibleSectionCount}/{local.homeSections.length}</strong> khối trên trang chủ · <strong className="text-gray-700">{local.hero_banners.length}</strong> banner</p>
                </div>
                {remoteUpdatePending && isDirty && (
                    <div className="mx-5 mb-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
                        <span>Một quản trị viên khác vừa cập nhật cấu hình. Bản nháp của bạn vẫn được giữ; lưu để kiểm tra xung đột hoặc tải lại dữ liệu mới.</span>
                        <button
                            type="button"
                            onClick={() => { setLocal(config); setBaseConfig(config); setRemoteUpdatePending(false); }}
                            className="w-fit rounded border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-800 hover:bg-amber-100"
                        >
                            Tải lại dữ liệu mới
                        </button>
                    </div>
                )}
                <nav aria-label="Đi đến khu vực cấu hình" className="flex gap-2 overflow-x-auto border-t border-slate-100 px-5 py-2.5 sm:px-6">
                    {[
                        ['#theme', 'Màu sắc'], ['#brand', 'Thương hiệu'], ['#banners', 'Banner'], ['#pricing', 'Bảng giá'], ['#reviews', 'Review'], ['#layout', 'Bố cục'],
                    ].map(([href, label]) => (
                        <a key={href} href={href} className="whitespace-nowrap rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700">{label}</a>
                    ))}
                </nav>
            </section>

            {/* 1. Theme Color */}
            <SectionCard id="theme" title="Màu chủ đạo" description="Màu thương hiệu áp dụng cho nút, liên kết và các điểm nhấn." icon={<Palette size={20} />}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Màu chính</label>
                        <div className="flex items-center gap-3">
                            <input type="color" title="Chọn màu chính" value={local.primaryColor} onChange={(e) => handlePrimaryColorChange(e.target.value)} className="h-10 w-10 cursor-pointer rounded-md border border-gray-200" />
                            <input type="text" title="Nhập màu chính" value={local.primaryColor} onChange={(e) => handlePrimaryColorChange(e.target.value)} className="w-28 px-3 py-2 border rounded-lg text-sm font-mono" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Màu tối (auto)</label>
                        <div className="flex items-center gap-3">
                            <div title="Màu tối" className="h-10 w-10 rounded-md border border-gray-200" style={{ backgroundColor: local.primaryColorDark }} />
                            <span className="text-sm font-mono text-gray-500">{local.primaryColorDark}</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Màu sáng (auto)</label>
                        <div className="flex items-center gap-3">
                            <div title="Màu sáng" className="h-10 w-10 rounded-md border border-gray-200" style={{ backgroundColor: local.primaryColorLight }} />
                            <span className="text-sm font-mono text-gray-500">{local.primaryColorLight}</span>
                        </div>
                    </div>
                </div>
                <div className="mt-4 p-4 rounded-lg border" style={{ borderColor: local.primaryColor }}>
                    <div title="Màu chính" className="flex items-center gap-3">
                        <div title="Màu chính" className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: local.primaryColor }}>Primary</div>
                        <div title="Màu tối (auto)" className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: local.primaryColorDark }}>Dark</div>
                        <span title="Màu chính" className="text-sm font-medium" style={{ color: local.primaryColor }}>Text preview</span>
                    </div>
                </div>
                <SaveBtn onClick={() => save({ primaryColor: local.primaryColor, primaryColorDark: local.primaryColorDark, primaryColorLight: local.primaryColorLight }, 'Đã lưu màu!')} saving={saving} label="Lưu màu" />
            </SectionCard>

            {/* 2. Top Bar */}
            <SectionCard id="announcement" title="Thông báo đầu trang" description="Thanh thông tin nhỏ phía trên header." icon={<Type size={20} />}>
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" title="Hiện thanh thông báo" checked={local.topBarEnabled} onChange={(e) => setLocal({ ...local, topBarEnabled: e.target.checked })} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
                        </label>
                        <span className="text-sm text-gray-700">Hiện thanh thông báo</span>
                    </div>
                    <input type="text" value={local.topBarText} onChange={(e) => setLocal({ ...local, topBarText: e.target.value })} placeholder="VD: Nghỉ Tết từ 28 Tết đến mùng 6..." className="w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-orange-400" />
                    {local.topBarEnabled && local.topBarText && (
                        <div className="bg-orange-500 text-white text-center py-2 rounded-lg text-sm">📢 {local.topBarText}</div>
                    )}
                </div>
                <SaveBtn onClick={() => save({ topBarText: local.topBarText, topBarEnabled: local.topBarEnabled }, 'Đã lưu thông báo!')} saving={saving} label="Lưu thông báo" />
            </SectionCard>

            {/* 2b. Logo & Header */}
            <SectionCard id="brand" title="Logo & Nền Header" description="Nhận diện và nền của thanh điều hướng." icon={<ImageIcon size={20} />}>
                <p className="text-sm text-gray-500 mb-4">Logo hiển thị và màu nền chính của thanh tiêu đề.</p>
                <div className="space-y-4">
                    {local.logoUrl ? (
                        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                            <img src={local.logoUrl} alt="Logo preview" className="h-10 max-w-28 object-contain rounded" />
                            <div className="flex-1">
                                <p className="text-sm text-gray-700 font-medium">Logo hiện tại</p>
                                <p className="text-xs text-gray-400 truncate max-w-xs">{local.logoUrl}</p>
                            </div>
                            <button title="Xóa logo" onClick={() => setLocal({ ...local, logoUrl: '' })} className="text-red-400 hover:text-red-600 p-2">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
                            <ImageIcon size={26} className="mx-auto mb-1.5 text-gray-300" />
                            <p className="text-sm text-gray-400">Chưa có logo — Đang dùng tên cửa hàng dạng text</p>
                        </div>
                    )}
                    <button title="Chọn ảnh từ thư viện" onClick={() => openMediaFor('logo')} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:border-orange-400 hover:bg-orange-50">
                        <ImageIcon size={16} /> Chọn ảnh từ thư viện
                    </button>
                </div>
                <div className="mt-4 pt-4 border-t flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <div className="flex-1">
                        <p className="text-sm font-medium text-gray-700">Màu nền Header</p>
                        <p className="text-xs text-gray-400">Thay vì màu trắng mặc định</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="color" title="Chọn màu nền Header" value={local.headerBg || '#ffffff'} onChange={e => setLocal({ ...local, headerBg: e.target.value })}
                            className="h-9 w-9 flex-shrink-0 cursor-pointer rounded-md border border-gray-200" />
                        <input type="text" title="Nhập màu nền Header" value={local.headerBg || '#ffffff'} onChange={e => setLocal({ ...local, headerBg: e.target.value })}
                            className="w-24 px-2 py-1.5 border rounded-lg text-sm font-mono" />
                        {local.headerBg && local.headerBg !== '#ffffff' && (
                            <button onClick={() => setLocal({ ...local, headerBg: '#ffffff' })} className="text-xs text-gray-400 hover:text-gray-600 px-1.5">Reset</button>
                        )}
                    </div>
                </div>
                <SaveBtn onClick={() => save({ logoUrl: local.logoUrl, headerBg: local.headerBg }, 'Đã lưu logo và nền header!')} saving={saving} label="Lưu thay đổi" />
            </SectionCard>

            {/* 3. Hero Banners */}
            <SectionCard id="banners" title="Banner trang chủ (Hero)" description="Thứ tự tại đây chính là thứ tự slide hiển thị trên trang chủ." icon={<ImageIcon size={20} />}>
                <div className="space-y-4">
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                        Khung banner trang chu dung ty le rong:cao 16:9 (cao:rong 9:16). Anh upload moi trong thu muc Banner se duoc toi uu dung luong nhung giu nguyen noi dung anh; hay dung anh gan 1920x1080, 1600x900 hoac 1280x720 de khong bi crop khi hien thi.
                    </div>
                    <button title="Chọn ảnh từ thư viện" onClick={() => openMediaFor('banner')} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:border-orange-400 hover:bg-orange-50">
                        <Plus size={16} /> Chọn ảnh từ thư viện
                    </button>
                    {local.hero_banners.length === 0 ? (
                        <p className="text-center text-gray-400 py-4">Chưa có banner — Thêm ảnh để hiện trên trang chủ</p>
                    ) : (
                        <div className="space-y-3">
                            {local.hero_banners.map((b, index) => (
                                <div key={b.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 md:flex-row md:items-center">
                                    <div className="w-32 flex-shrink-0 self-start sm:w-36 md:w-40">
                                        <div className="aspect-video overflow-hidden rounded-md bg-gray-100">
                                            <img src={b.imageUrl} alt={b.alt || `Banner ${index + 1}`} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect fill="%23eee" width="200" height="100"/><text fill="%23999" x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="14">No Image</text></svg>'; }} />
                                        </div>
                                    </div>
                                    <div className="flex-1 space-y-1.5">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs font-semibold text-gray-700">Slide {index + 1} / {local.hero_banners.length}</p>
                                            {b.link && <span className="max-w-[55%] truncate text-[11px] text-gray-400">{b.link}</span>}
                                        </div>
                                        {(() => {
                                            const status = getBannerRatioStatus(b.width, b.height);
                                            if (!status) {
                                                return <p className="text-[11px] font-medium text-amber-700">Anh cu chua co thong tin kich thuoc. Hay upload lai vao thu muc Banner de he thong doc lai metadata.</p>;
                                            }
                                            return (
                                                <p className={`text-[11px] font-medium ${status.isValid ? 'text-green-700' : 'text-red-600'}`}>
                                                    {status.isValid ? 'Dung khung 16:9' : 'Lech khung 16:9'} - {status.label}
                                                </p>
                                            );
                                        })()}
                                        <input type="text" value={b.alt} onChange={(e) => updateBanner(b.id, { alt: e.target.value })} placeholder="Mô tả banner (hỗ trợ SEO và trợ năng)" className="w-full px-3 py-1.5 border rounded text-sm" />
                                        <input type="text" value={b.link || ''} onChange={(e) => updateBanner(b.id, { link: e.target.value })} placeholder="Link khi click (tùy chọn)" className="w-full px-3 py-1.5 border rounded text-sm" />
                                    </div>
                                    <div className="flex items-center self-end md:self-center">
                                        <button title="Đưa banner lên trước" onClick={() => moveBanner(index, 'up')} disabled={index === 0} className="rounded p-2 text-gray-500 transition hover:bg-white hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-30"><ArrowUp size={17} /></button>
                                        <button title="Đưa banner xuống sau" onClick={() => moveBanner(index, 'down')} disabled={index === local.hero_banners.length - 1} className="rounded p-2 text-gray-500 transition hover:bg-white hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-30"><ArrowDown size={17} /></button>
                                        <button title="Xóa banner" onClick={() => setLocal({ ...local, hero_banners: local.hero_banners.filter(x => x.id !== b.id) })} className="rounded p-2 text-red-400 transition hover:bg-red-50 hover:text-red-600">
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <SaveBtn onClick={() => save({ hero_banners: local.hero_banners }, 'Đã lưu banner!')} saving={saving} label="Lưu banner" />
            </SectionCard>

            {/* 4. Background Config */}
            <SectionCard id="background" title="Background trang web" description="Nền chung phía sau nội dung toàn website." icon={<ImageIcon size={20} />}>
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" title="Bật background tùy chỉnh" checked={local.background_config.is_active} onChange={(e) => setLocal({ ...local, background_config: { ...local.background_config, is_active: e.target.checked } })} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
                        </label>
                        <span className="text-sm text-gray-700">Bật background tùy chỉnh</span>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setLocal({ ...local, background_config: { ...local.background_config, type: 'color' } })} className={`px-4 py-2 rounded-lg text-sm border ${local.background_config.type === 'color' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-600'}`}>
                            🎨 Màu nền
                        </button>
                        <button onClick={() => setLocal({ ...local, background_config: { ...local.background_config, type: 'image' } })} className={`px-4 py-2 rounded-lg text-sm border ${local.background_config.type === 'image' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-600'}`}>
                            🖼️ Ảnh nền
                        </button>
                    </div>
                    {local.background_config.type === 'color' ? (
                        <div className="flex items-center gap-3">
                            <input type="color" title="Chọn màu nền" value={local.background_config.value || '#f9fafb'} onChange={(e) => setLocal({ ...local, background_config: { ...local.background_config, value: e.target.value } })} className="h-10 w-10 cursor-pointer rounded-md border border-gray-200" />
                            <input type="text" title="Nhập màu nền" value={local.background_config.value} onChange={(e) => setLocal({ ...local, background_config: { ...local.background_config, value: e.target.value } })} className="w-28 px-3 py-2 border rounded-lg text-sm font-mono" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <button onClick={() => openMediaFor('background')} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-gray-600 hover:border-orange-400 hover:bg-orange-50">
                                <ImageIcon size={16} /> Chọn ảnh nền từ thư viện
                            </button>
                            {local.background_config.value && local.background_config.value.startsWith('http') && (
                                <div className="relative">
                                    <img src={local.background_config.value} alt="Background preview" className="h-20 w-full rounded-md object-cover" />
                                    <button title="Xóa ảnh nền" onClick={() => setLocal({ ...local, background_config: { ...local.background_config, value: '' } })} className="absolute top-2 right-2 bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-600">
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <SaveBtn onClick={() => save({ background_config: local.background_config }, 'Đã lưu background!')} saving={saving} label="Lưu background" />
            </SectionCard>

            {/* 4.5. Image Optimization */}
            <SectionCard id="image-proxy" title="Tối ưu ảnh & Proxy (Kill-Switch)" description="Chỉ dùng khi cần chẩn đoán sự cố tải ảnh." icon={<ImageIcon size={20} />}>
                <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                    <div className="flex items-start gap-3">
                        <label className="relative inline-flex items-center cursor-pointer mt-1">
                            <input type="checkbox" title="Tắt máy chủ nén ảnh bên ngoài (Kill-Switch)" checked={local.disableImageProxy ?? false} onChange={(e) => setLocal({ ...local, disableImageProxy: e.target.checked })} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500" />
                        </label>
                        <div>
                            <span className="text-sm font-medium text-gray-800">Tắt máy chủ nén ảnh bên ngoài (Kill-Switch)</span>
                            <p className="text-xs text-gray-500 mt-1">Nếu bật (nút gạt màu đỏ), hệ thống sẽ tải ảnh trực tiếp từ Firebase (tắt wsrv.nl). Dùng chức năng này khi máy chủ proxy bị chậm hoặc lỗi.</p>
                        </div>
                    </div>
                </div>
                <SaveBtn onClick={() => save({ disableImageProxy: local.disableImageProxy ?? false }, 'Đã cập nhật trạng thái Kill-Switch!')} saving={saving} label="Lưu thiết lập" />
            </SectionCard>

            {/* 5. Store Branches */}
            <SectionCard id="branches" title="Quản lý chi nhánh" description="Thông tin hiển thị trong khu vực hỗ trợ và bản đồ." icon={<MapPin size={20} />}>
                <div className="space-y-4">
                    {local.store_branches.map((branch) => (
                        <div key={branch.id} className="flex gap-4 p-4 border rounded-lg bg-gray-50">
                            <div className="flex-1">
                                <h4 className="font-semibold text-sm text-gray-800">{branch.name}</h4>
                                <p className="text-xs text-gray-500 mt-0.5">{branch.address}</p>
                                <p className="text-xs text-gray-500">📞 {branch.phone}</p>
                            </div>
                            <div className="flex gap-1 self-start">
                                <button title="Sửa chi nhánh" onClick={() => startEditBranch(branch)} className="text-blue-500 hover:text-blue-700 p-1.5"><Edit2 size={14} /></button>
                                <button title="Xóa chi nhánh" onClick={() => removeBranch(branch.id)} className="text-red-400 hover:text-red-600 p-1.5"><Trash2 size={14} /></button>
                            </div>
                        </div>
                    ))}
                    <div className="p-4 border rounded-lg bg-blue-50/50 space-y-3">
                        <h4 className="text-sm font-semibold text-gray-700">{editBranch ? '✏️ Sửa chi nhánh' : '➕ Thêm chi nhánh mới'}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input type="text" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} placeholder="Tên chi nhánh" className="px-3 py-2 border rounded-lg text-sm" />
                            <input type="text" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} placeholder="Số điện thoại" className="px-3 py-2 border rounded-lg text-sm" />
                            <input type="text" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} placeholder="Địa chỉ" className="px-3 py-2 border rounded-lg text-sm sm:col-span-2" />
                            <input type="url" value={branchForm.mapLink} onChange={(e) => setBranchForm({ ...branchForm, mapLink: e.target.value })} placeholder="Link Google Maps" className="px-3 py-2 border rounded-lg text-sm sm:col-span-2" />
                        </div>
                        <div className="flex gap-2">
                            {editBranch ? (
                                <>
                                    <button onClick={saveBranchEdit} className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600">Cập nhật</button>
                                    <button onClick={() => { setEditBranch(null); setBranchForm({ name: '', address: '', phone: '', mapLink: '' }); }} className="px-4 py-2 border text-sm rounded-lg hover:bg-gray-100">Hủy</button>
                                </>
                            ) : (
                                <button onClick={addBranch} disabled={!branchForm.name.trim()} className="px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-40">Thêm chi nhánh</button>
                            )}
                        </div>
                    </div>
                </div>
                <SaveBtn onClick={() => save({ store_branches: local.store_branches }, 'Đã lưu chi nhánh!')} saving={saving} label="Lưu chi nhánh" />
            </SectionCard>

            {/* 6. Homepage Pricing */}
            <SectionCard id="pricing" title="Bảng giá sửa chữa trang chủ" description="Nhóm dịch vụ được lấy động từ Firestore theo từ khóa." icon={<Type size={20} />}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input value={local.homepagePricing.title} onChange={e => setLocal({ ...local, homepagePricing: { ...local.homepagePricing, title: e.target.value } })} placeholder="Tiêu đề thường" className="px-3 py-2 border rounded-lg text-sm" />
                        <input value={local.homepagePricing.highlightedTitle} onChange={e => setLocal({ ...local, homepagePricing: { ...local.homepagePricing, highlightedTitle: e.target.value } })} placeholder="Tiêu đề nổi bật" className="px-3 py-2 border rounded-lg text-sm" />
                        <input value={local.homepagePricing.subtitle} onChange={e => setLocal({ ...local, homepagePricing: { ...local.homepagePricing, subtitle: e.target.value } })} placeholder="Mô tả ngắn" className="px-3 py-2 border rounded-lg text-sm md:col-span-2" />
                        <input value={local.homepagePricing.ctaLabel} onChange={e => setLocal({ ...local, homepagePricing: { ...local.homepagePricing, ctaLabel: e.target.value } })} placeholder="Nhãn nút xem thêm" className="px-3 py-2 border rounded-lg text-sm" />
                        <input value={local.homepagePricing.ctaHref} onChange={e => setLocal({ ...local, homepagePricing: { ...local.homepagePricing, ctaHref: e.target.value } })} placeholder="/category/sua-chua" className="px-3 py-2 border rounded-lg text-sm" />
                    </div>

                    {local.homepagePricing.categories.map(category => (
                        <div key={category.id} className="border rounded-xl bg-gray-50 p-4 space-y-3">
                            <div className="flex flex-col md:flex-row gap-2">
                                <input value={category.label} onChange={e => updatePricingCategory(category.id, { label: e.target.value })} placeholder="Tên nhóm" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                                <select title="Chọn icon" value={category.icon} onChange={e => updatePricingCategory(category.id, { icon: e.target.value as PricingIconName })} className="px-3 py-2 border rounded-lg text-sm bg-white">
                                    <option value="smartphone">Điện thoại</option>
                                    <option value="tablet">Máy tính bảng</option>
                                    <option value="laptop">Laptop</option>
                                    <option value="watch">Đồng hồ</option>
                                </select>
                                <button onClick={() => removePricingCategory(category.id)} className="px-3 py-2 text-red-500 hover:bg-red-50 rounded-lg" title="Xóa nhóm"><Trash2 size={16} /></button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_140px] gap-2">
                                <input
                                    value={category.keywords.join(', ')}
                                    onChange={e => updatePricingCategory(category.id, { keywords: e.target.value.split(',').map(keyword => keyword.trim()).filter(Boolean) })}
                                    placeholder="Từ khóa lọc Firestore, VD: iphone, pin iphone"
                                    className="px-3 py-2 border rounded-lg text-sm"
                                />
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={category.maxItems}
                                    onChange={e => updatePricingCategory(category.id, { maxItems: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })}
                                    className="px-3 py-2 border rounded-lg text-sm"
                                    title="Số dịch vụ tối đa"
                                />
                            </div>
                            <p className="text-xs text-gray-500">Homepage tự đọc collection <code>services</code> Firestore và hiển thị dịch vụ active khớp ít nhất một từ khóa.</p>
                        </div>
                    ))}

                    <button onClick={addPricingCategory} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:border-orange-400 hover:bg-orange-50">
                        <Plus size={16} /> Thêm nhóm bảng giá
                    </button>
                </div>
                <SaveBtn onClick={() => save({ homepagePricing: local.homepagePricing }, 'Đã lưu bảng giá trang chủ!')} saving={saving} label="Lưu bảng giá" />
            </SectionCard>

            {/* 7. Homepage Reviews */}
            <SectionCard id="reviews" title="Đánh giá khách hàng trang chủ" description="Điều khiển tiêu đề và nguồn Google Place của khu vực đánh giá." icon={<Star size={20} />}>
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input value={local.homepageReviews.eyebrow} onChange={e => setLocal({ ...local, homepageReviews: { ...local.homepageReviews, eyebrow: e.target.value } })} placeholder="Nhãn nhỏ phía trên" className="px-3 py-2 border rounded-lg text-sm" />
                        <input value={local.homepageReviews.title} onChange={e => setLocal({ ...local, homepageReviews: { ...local.homepageReviews, title: e.target.value } })} placeholder="Tiêu đề section" className="px-3 py-2 border rounded-lg text-sm" />
                        <input value={local.homepageReviews.googlePlaceId} onChange={e => setLocal({ ...local, homepageReviews: { ...local.homepageReviews, googlePlaceId: e.target.value } })} placeholder="Google Place ID của cửa hàng" className="px-3 py-2 border rounded-lg text-sm md:col-span-2" />
                    </div>
                    <p className="text-xs text-gray-500">Nội dung review luôn lấy trực tiếp từ Google Places API. Chỉ nhập Place ID tại đây; API key giữ server-side trong <code>GOOGLE_MAPS_API_KEY</code>.</p>
                </div>
                <SaveBtn onClick={() => save({ homepageReviews: local.homepageReviews }, 'Đã lưu đánh giá trang chủ!')} saving={saving} label="Lưu đánh giá" />
            </SectionCard>

            {/* 8. Homepage Layout Studio */}
            <SectionCard id="layout" title="Layout Studio trang chủ" description="Soạn bản nháp, kéo thả responsive và chỉ phát hành khi admin áp dụng." icon={<LayoutDashboard size={20} />}>
                <HomepageLayoutStudio
                    profiles={local.layoutProfiles || []}
                    activeProfileId={local.activeLayoutProfileId}
                    activeHomeSections={local.homeSections}
                    previewConfig={local}
                    saving={saving}
                    onPersist={(payload, message) => save(payload, message)}
                />
            </SectionCard>

            {/* 9. Active Homepage Section Backgrounds */}
            <SectionCard id="section-backgrounds" title="Nền & khung của cấu hình đang áp dụng" description="Giữ các tuỳ chỉnh nền hiện có; khi lưu sẽ đồng bộ lại profile đang phát hành." icon={<LayoutDashboard size={20} />}>
                <p className="text-sm text-gray-500 mb-4">Sắp xếp thứ tự, bật/tắt và tuỳ chỉnh nền cho từng khối.</p>
                <div className="space-y-3">
                    {[...local.homeSections].sort((a, b) => a.order - b.order).map((section, index) => {
                        const bg = section.sectionBg || { type: 'none' as const };
                        const isExpanded = expandedHomeSectionId === section.id;
                        const updateBg = (partial: Partial<typeof bg>) => {
                            const u = local.homeSections.map(s =>
                                s.id === section.id ? { ...s, sectionBg: { ...bg, ...partial } } : s
                            );
                            setLocal({ ...local, homeSections: u });
                        };
                        return (
                            <div key={section.id} className={`rounded-xl border overflow-hidden transition-all ${section.visible ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                                {/* Section header row */}
                                <div className={`flex items-center gap-3 px-4 py-3 ${section.visible ? 'bg-white' : 'bg-gray-50'}`}>
                                    <GripVertical size={18} className="text-gray-300 flex-shrink-0" />
                                    <span className={`flex-1 text-sm font-medium ${section.visible ? 'text-gray-800' : 'text-gray-400'}`}>{section.label}</span>
                                    {/* Background type badge */}
                                    {bg.type !== 'none' && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 font-medium">
                                            {bg.type === 'color' ? '🎨 nền màu' : '🖼️ nền ảnh'}
                                            {bg.frameUrl ? ' + khung' : ''}
                                        </span>
                                    )}
                                    <div className="flex items-center gap-1">
                                        <button
                                            title={isExpanded ? 'Thu gọn tùy chỉnh nền' : 'Mở tùy chỉnh nền'}
                                            aria-expanded={isExpanded}
                                            onClick={() => setExpandedHomeSectionId(isExpanded ? null : section.id)}
                                            className={`flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition ${isExpanded ? 'bg-orange-50 text-orange-700' : 'text-gray-500 hover:bg-gray-100'}`}
                                        >
                                            <span className="hidden sm:inline">Nền</span>{isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                        </button>
                                        <button title="Di chuyển lên" onClick={() => moveSection(index, 'up')} disabled={index === 0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500"><ArrowUp size={16} /></button>
                                        <button title="Di chuyển xuống" onClick={() => moveSection(index, 'down')} disabled={index === local.homeSections.length - 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500"><ArrowDown size={16} /></button>
                                        <button title="Hiển thị/ẩn khối" onClick={() => { const u = local.homeSections.map(s => s.id === section.id ? { ...s, visible: !s.visible } : s); setLocal({ ...local, homeSections: u }); }}
                                            className={`p-1.5 rounded hover:bg-gray-100 ${section.visible ? 'text-green-500' : 'text-gray-400'}`}>
                                            {section.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Background editor */}
                                {isExpanded && <div className="space-y-3 border-t border-gray-100 bg-gray-50/60 px-4 pb-4 pt-3">
                                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Nền khối</p>

                                    {/* Type selector */}
                                    <div className="flex gap-2 flex-wrap">
                                        {(['none', 'color', 'image'] as const).map(t => (
                                            <button title="Chọn loại nền" key={t} onClick={() => updateBg({ type: t })}
                                                className={`px-3 py-1.5 rounded-lg text-xs border font-medium transition-all ${bg.type === t ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                                                {t === 'none' ? '⬜ Không nền' : t === 'color' ? '🎨 Màu nền' : '🖼️ Ảnh nền'}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {/* Outer background color */}
                                        <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                                            <div>
                                                <p className="text-[11px] font-medium text-gray-600">Màu nền khối ngoài</p>
                                                <p className="text-[10px] text-gray-400">(Tùy khối, VD: Đặt Lịch)</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input type="color" title="Chọn màu nền khối ngoài" value={bg.outerBg || '#1a1a2e'} onChange={e => updateBg({ outerBg: e.target.value })}
                                                    className="w-7 h-7 rounded cursor-pointer border border-gray-200 flex-shrink-0" />
                                                {bg.outerBg && (
                                                    <button title="Reset" onClick={() => updateBg({ outerBg: undefined })} className="text-[10px] text-gray-400 hover:text-gray-600">Reset</button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Card inner background color */}
                                        <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
                                            <div>
                                                <p className="text-[11px] font-medium text-gray-600">Màu nền thẻ trong</p>
                                                <p className="text-[10px] text-gray-400">(Nền trắng của nội dung)</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input type="color" title="Chọn màu nền thẻ trong" value={bg.cardBg || '#ffffff'} onChange={e => updateBg({ cardBg: e.target.value })}
                                                    className="w-7 h-7 rounded cursor-pointer border border-gray-200 flex-shrink-0" />
                                                {bg.cardBg && bg.cardBg !== '#ffffff' && (
                                                    <button title="Reset" onClick={() => updateBg({ cardBg: '#ffffff' })} className="text-[10px] text-gray-400 hover:text-gray-600">Reset</button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Color picker */}
                                    {bg.type === 'color' && (
                                        <div className="flex items-center gap-3">
                                            <input type="color" title="Chọn màu nền" value={bg.color || '#ffffff'} onChange={e => updateBg({ color: e.target.value })}
                                                className="h-9 w-9 flex-shrink-0 cursor-pointer rounded-md border border-gray-200" />
                                            <input type="text" title="Nhập màu nền" value={bg.color || '#ffffff'} onChange={e => updateBg({ color: e.target.value })}
                                                className="w-28 px-3 py-1.5 border rounded-lg text-sm font-mono" />
                                            <div className="w-10 h-10 rounded-lg border" style={{ backgroundColor: bg.color || '#ffffff' }} />
                                        </div>
                                    )}

                                    {/* Image picker */}
                                    {bg.type === 'image' && (
                                        <div className="space-y-2">
                                            <button title="Chọn ảnh nền từ thư viện" onClick={() => { setMediaTarget(`section_bg_${section.id}` as 'banner'); setMediaOpen(true); }}
                                                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:border-orange-400 hover:bg-orange-50">
                                                <ImageIcon size={14} /> {bg.imageUrl ? 'Đổi ảnh nền' : 'Chọn ảnh nền từ thư viện'}
                                            </button>
                                            {bg.imageUrl && (
                                                <div className="relative">
                                                    <img src={bg.imageUrl} alt="bg preview" className="h-16 w-full rounded-md object-cover" />
                                                    <button title="Xóa ảnh nền" onClick={() => updateBg({ imageUrl: '' })}
                                                        className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-600">
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-3">
                                                <label className="text-xs text-gray-500">Độ mờ</label>
                                                <input type="range" title="Độ mờ" min={10} max={100} step={5} value={bg.opacity ?? 100} onChange={e => updateBg({ opacity: Number(e.target.value) })}
                                                    className="flex-1 accent-orange-500" />
                                                <span className="text-xs font-mono w-8 text-center">{bg.opacity ?? 100}%</span>
                                            </div>
                                            <div className="flex gap-2">
                                                {(['cover', 'contain', 'repeat'] as const).map(s => (
                                                    <button title="Chọn kích thước nền" key={s} onClick={() => updateBg({ size: s })}
                                                        className={`px-2.5 py-1 text-xs rounded border ${(bg.size ?? 'cover') === s ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500'}`}>
                                                        {s === 'cover' ? 'Phủ đầy' : s === 'contain' ? 'Vừa khung' : 'Lặp lại'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Frame overlay (available for color & image) */}
                                    {bg.type !== 'none' && (
                                        <div className="border-t pt-3 space-y-2">
                                            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Khung viền trang trí (tuỳ chọn)</p>
                                            <button title="Chọn ảnh khung từ thư viện" onClick={() => { setMediaTarget(`section_frame_${section.id}` as 'banner'); setMediaOpen(true); }}
                                                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-purple-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:border-purple-400 hover:bg-purple-50">
                                                <ImageIcon size={14} /> {bg.frameUrl ? 'Đổi ảnh khung' : 'Chọn ảnh khung từ thư viện'}
                                            </button>
                                            {bg.frameUrl && (
                                                <div className="relative">
                                                    <img src={bg.frameUrl} alt="frame preview" className="h-14 w-full rounded-md border object-fill" />
                                                    <button title="Xóa ảnh khung" onClick={() => updateBg({ frameUrl: '' })}
                                                        className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-600">
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>}
                            </div>
                        );
                    })}
                </div>
                <SaveBtn onClick={() => savePublishedHomeSections(local.homeSections, 'Đã lưu nền và đồng bộ cấu hình đang áp dụng!')} saving={saving} label="Lưu nền & đồng bộ profile" />
            </SectionCard>
        </div>
    );
}
