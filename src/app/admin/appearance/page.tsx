'use client';

/* eslint-disable @next/next/no-img-element */
import { useState, useEffect } from 'react';
import {
    useConfig,
    DEFAULT_CONFIG,
    type SiteConfig,
    type HeroBanner,
    type HomepagePricingCategory,
    type PricingIconName,
    type StoreBranch
} from '@/lib/ConfigContext';
import MediaManager from '@/components/admin/MediaManager';
import {
    Palette, Type, LayoutDashboard, Save, Loader2,
    Trash2, Plus, GripVertical, Eye, EyeOff, ArrowUp, ArrowDown,
    CheckCircle2, X, RotateCcw, MapPin, Edit2, ImageIcon, Star
} from 'lucide-react';

// ========= Toast =========
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
    return (
        <div className="fixed top-6 right-6 z-[100] animate-[fadeIn_0.3s_ease-in-out]">
            <div className="bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm">
                <CheckCircle2 size={20} className="flex-shrink-0" />
                <span className="text-sm font-medium">{message}</span>
                <button title="Đóng" onClick={onClose} className="ml-2 hover:bg-green-600 rounded p-0.5"><X size={16} /></button>
            </div>
        </div>
    );
}

// ========= Section Card =========
function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b flex items-center gap-3">
                <span className="text-orange-500">{icon}</span>
                <h3 className="font-semibold text-gray-800">{title}</h3>
            </div>
            <div className="p-6">{children}</div>
        </div>
    );
}

// ========= Save Button =========
function SaveBtn({ onClick, saving, label = 'Lưu' }: { onClick: () => void; saving: boolean; label?: string }) {
    return (
        <div className="mt-4 flex justify-end">
            <button onClick={onClick} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {label}
            </button>
        </div>
    );
}

// ========= Main Page =========
export default function AdminAppearancePage() {
    const { config, updateConfig } = useConfig();
    const [local, setLocal] = useState<SiteConfig>(config);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [mediaOpen, setMediaOpen] = useState(false);
    const [mediaTarget, setMediaTarget] = useState<string | null>(null);

    const [editBranch, setEditBranch] = useState<StoreBranch | null>(null);
    const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', mapLink: '' });

    useEffect(() => { setLocal(config); }, [config]);

    const showToast = (msg: string) => setToast(msg);

    const save = async (partial: Partial<SiteConfig>, msg: string) => {
        setSaving(true);
        try {
            // Strip undefined values to prevent Firebase "Unsupported field value: undefined" errors
            const cleanPartial = JSON.parse(JSON.stringify(partial));
            await updateConfig(cleanPartial);
            showToast(msg);
        }
        catch (e) { console.error(e); }
        setSaving(false);
    };

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
            {toast && <Toast message={toast} onClose={() => setToast(null)} />}
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Giao diện & Cấu hình</h1>
                    <p className="text-sm text-gray-500 mt-1">Tùy chỉnh giao diện, banner, background và chi nhánh</p>
                </div>
                <button onClick={() => { setLocal(DEFAULT_CONFIG); showToast('Đã reset (chưa lưu)'); }} className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
                    <RotateCcw size={16} /> Reset mặc định
                </button>
            </div>

            {/* 1. Theme Color */}
            <SectionCard title="Màu chủ đạo" icon={<Palette size={20} />}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Màu chính</label>
                        <div className="flex items-center gap-3">
                            <input type="color" title="Chọn màu chính" value={local.primaryColor} onChange={(e) => handlePrimaryColorChange(e.target.value)} className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200" />
                            <input type="text" title="Nhập màu chính" value={local.primaryColor} onChange={(e) => handlePrimaryColorChange(e.target.value)} className="w-28 px-3 py-2 border rounded-lg text-sm font-mono" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Màu tối (auto)</label>
                        <div className="flex items-center gap-3">
                            <div title="Màu tối" className="w-12 h-12 rounded-lg border-2 border-gray-200" style={{ backgroundColor: local.primaryColorDark }} />
                            <span className="text-sm font-mono text-gray-500">{local.primaryColorDark}</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Màu sáng (auto)</label>
                        <div className="flex items-center gap-3">
                            <div title="Màu sáng" className="w-12 h-12 rounded-lg border-2 border-gray-200" style={{ backgroundColor: local.primaryColorLight }} />
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
            <SectionCard title="Thông báo đầu trang" icon={<Type size={20} />}>
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
            <SectionCard title="Logo & Nền Header" icon={<ImageIcon size={20} />}>
                <p className="text-sm text-gray-500 mb-4">Logo hiển thị và màu nền chính của thanh tiêu đề.</p>
                <div className="space-y-4">
                    {local.logoUrl ? (
                        <div className="flex items-center gap-4 p-4 border rounded-lg bg-gray-50">
                            <img src={local.logoUrl} alt="Logo preview" className="h-12 object-contain rounded" />
                            <div className="flex-1">
                                <p className="text-sm text-gray-700 font-medium">Logo hiện tại</p>
                                <p className="text-xs text-gray-400 truncate max-w-xs">{local.logoUrl}</p>
                            </div>
                            <button title="Xóa logo" onClick={() => setLocal({ ...local, logoUrl: '' })} className="text-red-400 hover:text-red-600 p-2">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ) : (
                        <div className="p-6 border-2 border-dashed border-gray-200 rounded-lg text-center">
                            <ImageIcon size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-400">Chưa có logo — Đang dùng tên cửa hàng dạng text</p>
                        </div>
                    )}
                    <button title="Chọn ảnh từ thư viện" onClick={() => openMediaFor('logo')} className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 text-gray-600 transition-colors w-full justify-center">
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
                            className="w-10 h-10 rounded-lg cursor-pointer border-2 border-gray-200 flex-shrink-0" />
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
            <SectionCard title="Banner trang chủ (Hero)" icon={<ImageIcon size={20} />}>
                <div className="space-y-4">
                    <button title="Chọn ảnh từ thư viện" onClick={() => openMediaFor('banner')} className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 text-gray-600 transition-colors w-full justify-center">
                        <Plus size={16} /> Chọn ảnh từ thư viện
                    </button>
                    {local.hero_banners.length === 0 ? (
                        <p className="text-center text-gray-400 py-4">Chưa có banner — Thêm ảnh để hiện trên trang chủ</p>
                    ) : (
                        <div className="space-y-3">
                            {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
                            {local.hero_banners.map((b, _i) => (
                                <div key={b.id} className="flex gap-4 p-3 border rounded-lg bg-gray-50 items-center">
                                    <img src={b.imageUrl} alt={b.alt} className="w-36 h-20 object-cover rounded-lg flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect fill="%23eee" width="200" height="100"/><text fill="%23999" x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="14">No Image</text></svg>'; }} />
                                    <div className="flex-1 space-y-1.5">
                                        <input type="text" value={b.alt} onChange={(e) => { const u = local.hero_banners.map(x => x.id === b.id ? { ...x, alt: e.target.value } : x); setLocal({ ...local, hero_banners: u }); }} placeholder="Mô tả banner" className="w-full px-3 py-1.5 border rounded text-sm" />
                                        <input type="text" value={b.link || ''} onChange={(e) => { const u = local.hero_banners.map(x => x.id === b.id ? { ...x, link: e.target.value } : x); setLocal({ ...local, hero_banners: u }); }} placeholder="Link khi click (tùy chọn)" className="w-full px-3 py-1.5 border rounded text-sm" />
                                    </div>
                                    <button title="Xóa banner" onClick={() => setLocal({ ...local, hero_banners: local.hero_banners.filter(x => x.id !== b.id) })} className="text-red-400 hover:text-red-600 p-2">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <SaveBtn onClick={() => save({ hero_banners: local.hero_banners }, 'Đã lưu banner!')} saving={saving} label="Lưu banner" />
            </SectionCard>

            {/* 4. Background Config */}
            <SectionCard title="Background trang web" icon={<ImageIcon size={20} />}>
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
                            <input type="color" title="Chọn màu nền" value={local.background_config.value || '#f9fafb'} onChange={(e) => setLocal({ ...local, background_config: { ...local.background_config, value: e.target.value } })} className="w-12 h-12 rounded-lg cursor-pointer border-2" />
                            <input type="text" title="Nhập màu nền" value={local.background_config.value} onChange={(e) => setLocal({ ...local, background_config: { ...local.background_config, value: e.target.value } })} className="w-28 px-3 py-2 border rounded-lg text-sm font-mono" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <button onClick={() => openMediaFor('background')} className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 text-gray-600 w-full justify-center">
                                <ImageIcon size={16} /> Chọn ảnh nền từ thư viện
                            </button>
                            {local.background_config.value && local.background_config.value.startsWith('http') && (
                                <div className="relative">
                                    <img src={local.background_config.value} alt="Background preview" className="w-full h-32 object-cover rounded-lg" />
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
            <SectionCard title="Tối ưu ảnh & Proxy (Kill-Switch)" icon={<ImageIcon size={20} />}>
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
            <SectionCard title="Quản lý chi nhánh" icon={<MapPin size={20} />}>
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
            <SectionCard title="Bảng giá sửa chữa trang chủ" icon={<Type size={20} />}>
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

                    <button onClick={addPricingCategory} className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 text-gray-600 transition-colors w-full justify-center">
                        <Plus size={16} /> Thêm nhóm bảng giá
                    </button>
                </div>
                <SaveBtn onClick={() => save({ homepagePricing: local.homepagePricing }, 'Đã lưu bảng giá trang chủ!')} saving={saving} label="Lưu bảng giá" />
            </SectionCard>

            {/* 7. Homepage Reviews */}
            <SectionCard title="Đánh giá khách hàng trang chủ" icon={<Star size={20} />}>
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

            {/* 8. Homepage Section Layout */}
            <SectionCard title="Sắp xếp & Giao diện trang chủ" icon={<LayoutDashboard size={20} />}>
                <p className="text-sm text-gray-500 mb-4">Sắp xếp thứ tự, bật/tắt và tuỳ chỉnh nền cho từng khối.</p>
                <div className="space-y-3">
                    {[...local.homeSections].sort((a, b) => a.order - b.order).map((section, index) => {
                        const bg = section.sectionBg || { type: 'none' as const };
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
                                        <button title="Di chuyển lên" onClick={() => moveSection(index, 'up')} disabled={index === 0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500"><ArrowUp size={16} /></button>
                                        <button title="Di chuyển xuống" onClick={() => moveSection(index, 'down')} disabled={index === local.homeSections.length - 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500"><ArrowDown size={16} /></button>
                                        <button title="Hiển thị/ẩn khối" onClick={() => { const u = local.homeSections.map(s => s.id === section.id ? { ...s, visible: !s.visible } : s); setLocal({ ...local, homeSections: u }); }}
                                            className={`p-1.5 rounded hover:bg-gray-100 ${section.visible ? 'text-green-500' : 'text-gray-400'}`}>
                                            {section.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Background editor (always expanded) */}
                                <div className="px-4 pb-4 pt-2 bg-gray-50/60 border-t border-gray-100 space-y-3">
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
                                                className="w-10 h-10 rounded-lg cursor-pointer border-2 border-gray-200 flex-shrink-0" />
                                            <input type="text" title="Nhập màu nền" value={bg.color || '#ffffff'} onChange={e => updateBg({ color: e.target.value })}
                                                className="w-28 px-3 py-1.5 border rounded-lg text-sm font-mono" />
                                            <div className="w-10 h-10 rounded-lg border" style={{ backgroundColor: bg.color || '#ffffff' }} />
                                        </div>
                                    )}

                                    {/* Image picker */}
                                    {bg.type === 'image' && (
                                        <div className="space-y-2">
                                            <button title="Chọn ảnh nền từ thư viện" onClick={() => { setMediaTarget(`section_bg_${section.id}` as 'banner'); setMediaOpen(true); }}
                                                className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 text-gray-600 text-sm w-full justify-center transition-colors">
                                                <ImageIcon size={14} /> {bg.imageUrl ? 'Đổi ảnh nền' : 'Chọn ảnh nền từ thư viện'}
                                            </button>
                                            {bg.imageUrl && (
                                                <div className="relative">
                                                    <img src={bg.imageUrl} alt="bg preview" className="w-full h-24 object-cover rounded-lg" />
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
                                                className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 text-gray-600 text-sm w-full justify-center transition-colors">
                                                <ImageIcon size={14} /> {bg.frameUrl ? 'Đổi ảnh khung' : 'Chọn ảnh khung từ thư viện'}
                                            </button>
                                            {bg.frameUrl && (
                                                <div className="relative">
                                                    <img src={bg.frameUrl} alt="frame preview" className="w-full h-20 object-fill rounded-lg border" />
                                                    <button title="Xóa ảnh khung" onClick={() => updateBg({ frameUrl: '' })}
                                                        className="absolute top-1 right-1 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-600">
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <SaveBtn onClick={() => save({ homeSections: local.homeSections }, 'Đã lưu bố cục!')} saving={saving} label="Lưu bố cục & nền" />
            </SectionCard>
        </div>
    );
}
