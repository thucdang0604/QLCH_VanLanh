'use client';

import { useState, useEffect } from 'react';
import { useConfig, DEFAULT_CONFIG, type SiteConfig, type HeroBanner, type StoreBranch, type HomeSectionItem } from '@/lib/ConfigContext';
import MediaManager from '@/components/admin/MediaManager';
import {
    Palette, Image, Phone, Type, LayoutDashboard, Save, Loader2,
    Trash2, Plus, GripVertical, Eye, EyeOff, ArrowUp, ArrowDown,
    CheckCircle2, X, RotateCcw, MapPin, Edit2, ImageIcon
} from 'lucide-react';

// ========= Toast =========
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
    useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
    return (
        <div className="fixed top-6 right-6 z-[100] animate-[fadeIn_0.3s_ease-in-out]">
            <div className="bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm">
                <CheckCircle2 size={20} className="flex-shrink-0" />
                <span className="text-sm font-medium">{message}</span>
                <button onClick={onClose} className="ml-2 hover:bg-green-600 rounded p-0.5"><X size={16} /></button>
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
    const [mediaTarget, setMediaTarget] = useState<'banner' | 'background' | 'logo' | null>(null);
    const [editBranch, setEditBranch] = useState<StoreBranch | null>(null);
    const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', mapLink: '' });

    useEffect(() => { setLocal(config); }, [config]);

    const showToast = (msg: string) => setToast(msg);

    const save = async (partial: Partial<SiteConfig>, msg: string) => {
        setSaving(true);
        try { await updateConfig(partial); showToast(msg); }
        catch (e) { console.error(e); }
        setSaving(false);
    };

    // ---- Media Manager handlers ----
    const openMediaFor = (target: 'banner' | 'background' | 'logo') => {
        setMediaTarget(target);
        setMediaOpen(true);
    };

    const handleMediaSelect = (url: string) => {
        if (mediaTarget === 'banner') {
            const newBanner: HeroBanner = { id: `b_${Date.now()}`, imageUrl: url, alt: '', link: '' };
            setLocal({ ...local, hero_banners: [...local.hero_banners, newBanner] });
        } else if (mediaTarget === 'background') {
            setLocal({ ...local, background_config: { ...local.background_config, type: 'image', value: url } });
        } else if (mediaTarget === 'logo') {
            setLocal({ ...local, logoUrl: url });
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

    return (
        <div className="space-y-6">
            {toast && <Toast message={toast} onClose={() => setToast(null)} />}
            <MediaManager isOpen={mediaOpen} onClose={() => setMediaOpen(false)} onSelect={handleMediaSelect} />

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
                            <input type="color" value={local.primaryColor} onChange={(e) => handlePrimaryColorChange(e.target.value)} className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200" />
                            <input type="text" value={local.primaryColor} onChange={(e) => handlePrimaryColorChange(e.target.value)} className="w-28 px-3 py-2 border rounded-lg text-sm font-mono" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Màu tối (auto)</label>
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg border-2 border-gray-200" style={{ backgroundColor: local.primaryColorDark }} />
                            <span className="text-sm font-mono text-gray-500">{local.primaryColorDark}</span>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Màu sáng (auto)</label>
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg border-2 border-gray-200" style={{ backgroundColor: local.primaryColorLight }} />
                            <span className="text-sm font-mono text-gray-500">{local.primaryColorLight}</span>
                        </div>
                    </div>
                </div>
                <div className="mt-4 p-4 rounded-lg border" style={{ borderColor: local.primaryColor }}>
                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: local.primaryColor }}>Primary</div>
                        <div className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: local.primaryColorDark }}>Dark</div>
                        <span className="text-sm font-medium" style={{ color: local.primaryColor }}>Text preview</span>
                    </div>
                </div>
                <SaveBtn onClick={() => save({ primaryColor: local.primaryColor, primaryColorDark: local.primaryColorDark, primaryColorLight: local.primaryColorLight }, 'Đã lưu màu!')} saving={saving} label="Lưu màu" />
            </SectionCard>

            {/* 2. Top Bar */}
            <SectionCard title="Thông báo đầu trang" icon={<Type size={20} />}>
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={local.topBarEnabled} onChange={(e) => setLocal({ ...local, topBarEnabled: e.target.checked })} className="sr-only peer" />
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

            {/* 2b. Logo Cửa Hàng */}
            <SectionCard title="Logo Cửa Hàng" icon={<ImageIcon size={20} />}>
                <p className="text-sm text-gray-500 mb-4">Logo hiển thị trên Header. Nếu không có sẽ dùng tên cửa hàng dạng text.</p>
                <div className="space-y-4">
                    {local.logoUrl ? (
                        <div className="flex items-center gap-4 p-4 border rounded-lg bg-gray-50">
                            <img src={local.logoUrl} alt="Logo preview" className="h-12 object-contain rounded" />
                            <div className="flex-1">
                                <p className="text-sm text-gray-700 font-medium">Logo hiện tại</p>
                                <p className="text-xs text-gray-400 truncate max-w-xs">{local.logoUrl}</p>
                            </div>
                            <button onClick={() => setLocal({ ...local, logoUrl: '' })} className="text-red-400 hover:text-red-600 p-2">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ) : (
                        <div className="p-6 border-2 border-dashed border-gray-200 rounded-lg text-center">
                            <ImageIcon size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-400">Chưa có logo — Đang dùng tên cửa hàng dạng text</p>
                        </div>
                    )}
                    <button onClick={() => openMediaFor('logo')} className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 text-gray-600 transition-colors w-full justify-center">
                        <ImageIcon size={16} /> Chọn ảnh từ thư viện
                    </button>
                </div>
                <SaveBtn onClick={() => save({ logoUrl: local.logoUrl }, 'Đã lưu logo!')} saving={saving} label="Lưu logo" />
            </SectionCard>

            {/* 3. Hero Banners */}
            <SectionCard title="Banner trang chủ (Hero)" icon={<Image size={20} />}>
                <div className="space-y-4">
                    <button onClick={() => openMediaFor('banner')} className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 text-gray-600 transition-colors w-full justify-center">
                        <Plus size={16} /> Chọn ảnh từ thư viện
                    </button>
                    {local.hero_banners.length === 0 ? (
                        <p className="text-center text-gray-400 py-4">Chưa có banner — Thêm ảnh để hiện trên trang chủ</p>
                    ) : (
                        <div className="space-y-3">
                            {local.hero_banners.map((b, i) => (
                                <div key={b.id} className="flex gap-4 p-3 border rounded-lg bg-gray-50 items-center">
                                    <img src={b.imageUrl} alt={b.alt} className="w-36 h-20 object-cover rounded-lg flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect fill="%23eee" width="200" height="100"/><text fill="%23999" x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="14">No Image</text></svg>'; }} />
                                    <div className="flex-1 space-y-1.5">
                                        <input type="text" value={b.alt} onChange={(e) => { const u = local.hero_banners.map(x => x.id === b.id ? { ...x, alt: e.target.value } : x); setLocal({ ...local, hero_banners: u }); }} placeholder="Mô tả banner" className="w-full px-3 py-1.5 border rounded text-sm" />
                                        <input type="text" value={b.link || ''} onChange={(e) => { const u = local.hero_banners.map(x => x.id === b.id ? { ...x, link: e.target.value } : x); setLocal({ ...local, hero_banners: u }); }} placeholder="Link khi click (tùy chọn)" className="w-full px-3 py-1.5 border rounded text-sm" />
                                    </div>
                                    <button onClick={() => setLocal({ ...local, hero_banners: local.hero_banners.filter(x => x.id !== b.id) })} className="text-red-400 hover:text-red-600 p-2">
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
                            <input type="checkbox" checked={local.background_config.is_active} onChange={(e) => setLocal({ ...local, background_config: { ...local.background_config, is_active: e.target.checked } })} className="sr-only peer" />
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
                            <input type="color" value={local.background_config.value || '#f9fafb'} onChange={(e) => setLocal({ ...local, background_config: { ...local.background_config, value: e.target.value } })} className="w-12 h-12 rounded-lg cursor-pointer border-2" />
                            <input type="text" value={local.background_config.value} onChange={(e) => setLocal({ ...local, background_config: { ...local.background_config, value: e.target.value } })} className="w-28 px-3 py-2 border rounded-lg text-sm font-mono" />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <button onClick={() => openMediaFor('background')} className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg hover:border-orange-400 hover:bg-orange-50 text-gray-600 w-full justify-center">
                                <ImageIcon size={16} /> Chọn ảnh nền từ thư viện
                            </button>
                            {local.background_config.value && local.background_config.value.startsWith('http') && (
                                <div className="relative">
                                    <img src={local.background_config.value} alt="Background preview" className="w-full h-32 object-cover rounded-lg" />
                                    <button onClick={() => setLocal({ ...local, background_config: { ...local.background_config, value: '' } })} className="absolute top-2 right-2 bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-600">
                                        <X size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <SaveBtn onClick={() => save({ background_config: local.background_config }, 'Đã lưu background!')} saving={saving} label="Lưu background" />
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
                                <button onClick={() => startEditBranch(branch)} className="text-blue-500 hover:text-blue-700 p-1.5"><Edit2 size={14} /></button>
                                <button onClick={() => removeBranch(branch.id)} className="text-red-400 hover:text-red-600 p-1.5"><Trash2 size={14} /></button>
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

            {/* 6. Homepage Section Layout */}
            <SectionCard title="Sắp xếp trang chủ" icon={<LayoutDashboard size={20} />}>
                <p className="text-sm text-gray-500 mb-4">Dùng mũi tên để sắp xếp thứ tự. Tắt/bật các khối hiển thị.</p>
                <div className="space-y-2">
                    {[...local.homeSections].sort((a, b) => a.order - b.order).map((section, index) => (
                        <div key={section.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${section.visible ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                            <GripVertical size={18} className="text-gray-300" />
                            <span className={`flex-1 text-sm font-medium ${section.visible ? 'text-gray-800' : 'text-gray-400'}`}>{section.label}</span>
                            <div className="flex items-center gap-1">
                                <button onClick={() => moveSection(index, 'up')} disabled={index === 0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500"><ArrowUp size={16} /></button>
                                <button onClick={() => moveSection(index, 'down')} disabled={index === local.homeSections.length - 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-gray-500"><ArrowDown size={16} /></button>
                                <button onClick={() => { const u = local.homeSections.map(s => s.id === section.id ? { ...s, visible: !s.visible } : s); setLocal({ ...local, homeSections: u }); }} className={`p-1.5 rounded hover:bg-gray-100 ${section.visible ? 'text-green-500' : 'text-gray-400'}`}>
                                    {section.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <SaveBtn onClick={() => save({ homeSections: local.homeSections }, 'Đã lưu bố cục!')} saving={saving} label="Lưu bố cục" />
            </SectionCard>
        </div>
    );
}
