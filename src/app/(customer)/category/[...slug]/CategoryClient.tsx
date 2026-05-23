'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Filter, Package, X } from 'lucide-react';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import ServiceCard from '@/components/home/ServiceCard';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';

type DynamicCategory = {
    id: string;
    slug: string;
    name: string;
    type: 'retail' | 'service' | 'component';
    keywords: string[];
    isActive: boolean;
};

const CONDITION_LABELS: Record<string, { label: string; color: string }> = {
    'new': { label: 'Mới 100%', color: 'bg-green-100 text-green-700' },
    'like-new': { label: 'Cũ 99%', color: 'bg-blue-100 text-blue-700' },
    'used': { label: 'Hàng cũ | TBH', color: 'bg-yellow-100 text-yellow-700' },
};

/** Known repair brands for filter extraction — includes sub-brands & product lines */
const KNOWN_BRANDS = [
    'Apple', 'iPhone', 'iPad', 'MacBook',
    'Samsung', 'Galaxy',
    'Xiaomi', 'Redmi', 'POCO',
    'OPPO', 'Realme',
    'Vivo',
    'Nokia', 'Huawei', 'Google', 'Pixel',
    'Sony', 'LG', 'Asus', 'ROG',
    'Lenovo', 'ThinkPad',
    'Dell', 'HP', 'Acer', 'MSI',
];

/** Known part types for filter extraction */
const KNOWN_PARTS = [
    { key: 'man-hinh', label: 'Màn hình', keywords: ['màn hình', 'man hinh', 'screen', 'lcd', 'oled', 'ép kính', 'ep kinh'] },
    { key: 'pin', label: 'Pin', keywords: ['pin', 'battery'] },
    { key: 'camera', label: 'Camera', keywords: ['camera', 'cam'] },
    { key: 'vo-may', label: 'Vỏ máy', keywords: ['vỏ', 'nắp lưng', 'khung'] },
    { key: 'loa', label: 'Loa / Mic', keywords: ['loa', 'mic', 'speaker'] },
    { key: 'main', label: 'Main / IC', keywords: ['main', 'mainboard', 'ic', 'chip'] },
    { key: 'sac', label: 'Cổng sạc', keywords: ['sạc', 'charging', 'cổng', 'sac'] },
    { key: 'soft', label: 'Phần mềm', keywords: ['phần mềm', 'phan mem', 'unlock', 'bypass', 'software'] },
];

/** Normalize string: lowercase + remove Vietnamese diacritics */
function normalize(str: string): string {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
}

type CategoryItem = {
    id: string;
    name?: string;
    title?: string;
    category?: string;
    subCategory?: string;
    brand?: string;
    condition?: string;
    description?: string;
    tags?: string[];
    isActive?: boolean;
    imageUrl?: string;
    image?: string;
    price?: number;
    price_original?: number;
    price_promo?: number;
    warranty_text?: string;
    repair_time?: string;
    isFlashSale?: boolean;
    sold?: number;
    stock?: number;
    videoEmbedUrl?: string;
};

const formatPrice = (p: number) => new Intl.NumberFormat('vi-VN').format(p) + 'đ';

export default function CategoryClient({ 
    initialItems,
    categoryConfig,
    navInfo 
}: { 
    initialItems: CategoryItem[];
    categoryConfig?: DynamicCategory;
    navInfo?: { label: string; condition?: string; isRepair?: boolean; isAccessory?: boolean };
}) {
    const isRepair = navInfo ? !!navInfo.isRepair : categoryConfig?.type === 'service';
    const pageLabel = navInfo?.label ?? categoryConfig?.name ?? 'Danh mục';

    // Sidebar filter state
    const [sidebarBrands, setSidebarBrands] = useState<string[]>([]);
    const [sidebarParts, setSidebarParts] = useState<string[]>([]);
    const [sidebarCategory, setSidebarCategory] = useState('');
    const [filterCondition, setFilterCondition] = useState('');
    const [filterSubCategory, setFilterSubCategory] = useState('');
    const [filterPrice, setFilterPrice] = useState('');
    const [sortBy, setSortBy] = useState('newest');

    const items = initialItems;
    const loading = false;

    /* ── Client-side filters ── */
    const filtered = useMemo(() => {
        let list = [...items];

        if (isRepair) {
            // Filter active services only
            list = list.filter(s => s.isActive !== false);

            // Match dynamic category keywords
            if (categoryConfig && categoryConfig.keywords && categoryConfig.keywords.length > 0) {
                list = list.filter(s => {
                    const haystack = normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' '));
                    return categoryConfig.keywords.some(kw => haystack.includes(normalize(kw)));
                });
            }

            // Price filter
            if (filterPrice === '0-5') list = list.filter(p => (p.price_promo ?? p.price_original ?? p.price ?? 0) < 5_000_000);
            if (filterPrice === '5-10') list = list.filter(p => { const pr = p.price_promo ?? p.price_original ?? p.price ?? 0; return pr >= 5_000_000 && pr < 10_000_000; });
            if (filterPrice === '10-20') list = list.filter(p => { const pr = p.price_promo ?? p.price_original ?? p.price ?? 0; return pr >= 10_000_000 && pr < 20_000_000; });
            if (filterPrice === '20+') list = list.filter(p => (p.price_promo ?? p.price_original ?? p.price ?? 0) >= 20_000_000);

            // Brand filter
            if (sidebarBrands.length > 0) {
                list = list.filter(s => {
                    const hay = normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' '));
                    return sidebarBrands.some(b => hay.includes(normalize(b)));
                });
            }

            // Part filter
            if (sidebarParts.length > 0) {
                list = list.filter(s => {
                    const hay = normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' '));
                    return sidebarParts.some(partKey => {
                        const partDef = KNOWN_PARTS.find(p => p.key === partKey);
                        return partDef && partDef.keywords.some(kw => hay.includes(normalize(kw)));
                    });
                });
            }

            list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
        } else {
            // Products
            if (navInfo?.condition === 'new') {
                list = list.filter(p => p.condition === 'new');
            } else if (navInfo?.condition === 'used') {
                list = list.filter(p => p.condition === 'used' || p.condition === 'like-new');
            } else if (navInfo?.isAccessory) {
                list = list.filter(p => (p.category || '').toLowerCase().includes('phụ kiện') || (p.category || '').toLowerCase().includes('phu kien') || p.category === 'Phụ kiện');
            }

            // Match dynamic category keywords for specific product categories (e.g. Dien thoai, Laptop)
            if (categoryConfig && categoryConfig.keywords && categoryConfig.keywords.length > 0) {
                list = list.filter(p => {
                    const haystack = normalize([p.name, p.category, p.description, ...(p.tags || [])].join(' '));
                    return categoryConfig.keywords.some(kw => haystack.includes(normalize(kw)));
                });
            }

            // Sidebar filters
            if (sidebarBrands.length > 0) list = list.filter(p => typeof p.brand === 'string' && sidebarBrands.includes(p.brand));
            if (sidebarCategory) list = list.filter(p => p.category === sidebarCategory);
            if (filterCondition) list = list.filter(p => p.condition === filterCondition);
            if (filterSubCategory) list = list.filter(p => p.subCategory === filterSubCategory);

            // Price filter
            if (filterPrice === '0-5') list = list.filter(p => (p.price_promo ?? p.price_original ?? p.price ?? 0) < 5_000_000);
            if (filterPrice === '5-10') list = list.filter(p => { const pr = p.price_promo ?? p.price_original ?? p.price ?? 0; return pr >= 5_000_000 && pr < 10_000_000; });
            if (filterPrice === '10-20') list = list.filter(p => { const pr = p.price_promo ?? p.price_original ?? p.price ?? 0; return pr >= 10_000_000 && pr < 20_000_000; });
            if (filterPrice === '20+') list = list.filter(p => (p.price_promo ?? p.price_original ?? p.price ?? 0) >= 20_000_000);

            if (sortBy === 'popular') list.sort((a, b) => (b.sold || 0) - (a.sold || 0));
            if (sortBy === 'price-asc') list.sort((a, b) => (a.price_promo ?? a.price_original ?? 0) - (b.price_promo ?? b.price_original ?? 0));
            if (sortBy === 'price-desc') list.sort((a, b) => (b.price_promo ?? b.price_original ?? 0) - (a.price_promo ?? a.price_original ?? 0));
        }
        return list;
    }, [items, isRepair, categoryConfig, navInfo, sidebarBrands, sidebarParts, sidebarCategory, filterCondition, filterSubCategory, filterPrice, sortBy]);

    // Unique Brands for Products
    const productBrands = useMemo(() => {
        if (isRepair) return [];
        let source = items;
        if (navInfo?.condition === 'new') source = items.filter(p => p.condition === 'new');
        else if (navInfo?.condition === 'used') source = items.filter(p => p.condition === 'used' || p.condition === 'like-new');
        
        if (categoryConfig && categoryConfig.keywords && categoryConfig.keywords.length > 0) {
            source = source.filter(p => {
                const haystack = normalize([p.name, p.category, p.description, ...(p.tags || [])].join(' '));
                return categoryConfig.keywords.some(kw => haystack.includes(normalize(kw)));
            });
        }
        
        const set = new Set(source.map(p => p.brand).filter((v): v is string => typeof v === 'string' && v.length > 0));
        return Array.from(set).sort();
    }, [items, isRepair, navInfo, categoryConfig]);

    // Unique Conditions for Products
    const productConditions = useMemo(() => {
        if (isRepair) return [];
        let source = items;
        if (navInfo?.condition === 'new') source = items.filter(p => p.condition === 'new');
        else if (navInfo?.condition === 'used') source = items.filter(p => p.condition === 'used' || p.condition === 'like-new');
        
        if (categoryConfig && categoryConfig.keywords && categoryConfig.keywords.length > 0) {
            source = source.filter(p => {
                const haystack = normalize([p.name, p.category, p.description, ...(p.tags || [])].join(' '));
                return categoryConfig.keywords.some(kw => haystack.includes(normalize(kw)));
            });
        }
        
        const set = new Set(source.map(p => p.condition).filter((v): v is string => typeof v === 'string' && v.length > 0));
        return Array.from(set);
    }, [items, isRepair, navInfo, categoryConfig]);

    // Unique Brands for Repairs (derived from text)
    const repairBrands = useMemo(() => {
        if (!isRepair) return [];
        
        let source = items.filter(s => s.isActive !== false);
        if (categoryConfig && categoryConfig.keywords && categoryConfig.keywords.length > 0) {
            source = source.filter(s => {
                const haystack = normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' '));
                return categoryConfig.keywords.some(kw => haystack.includes(normalize(kw)));
            });
        }

        const found = new Set<string>();
        source.forEach(s => {
            const hay = normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' '));
            KNOWN_BRANDS.forEach(brand => {
                if (hay.includes(normalize(brand))) found.add(brand);
            });
        });
        return Array.from(found).sort();
    }, [items, isRepair, categoryConfig]);

    const displayBrands = isRepair ? repairBrands : productBrands;

    // Unique part types found in repair services
    const repairParts = useMemo(() => {
        if (!isRepair) return [];
        
        let source = items.filter(s => s.isActive !== false);
        if (categoryConfig && categoryConfig.keywords && categoryConfig.keywords.length > 0) {
            source = source.filter(s => {
                const haystack = normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' '));
                return categoryConfig.keywords.some(kw => haystack.includes(normalize(kw)));
            });
        }

        return KNOWN_PARTS.filter(part => {
            return source.some(s => {
                const hay = normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' '));
                return part.keywords.some(kw => hay.includes(normalize(kw)));
            });
        });
    }, [items, isRepair, categoryConfig]);

    // Unique Categories (Dòng máy) for Products
    const productCategories = useMemo(() => {
        if (isRepair) return [];
        let source = items;
        if (navInfo?.condition === 'new') source = items.filter(p => p.condition === 'new');
        else if (navInfo?.condition === 'used') source = items.filter(p => p.condition === 'used' || p.condition === 'like-new');
        
        if (categoryConfig && categoryConfig.keywords && categoryConfig.keywords.length > 0) {
            source = source.filter(p => {
                const haystack = normalize([p.name, p.category, p.description, ...(p.tags || [])].join(' '));
                return categoryConfig.keywords.some(kw => haystack.includes(normalize(kw)));
            });
        }

        const set = new Set(source.map(p => p.category).filter((v): v is string => typeof v === 'string' && v.length > 0));
        return Array.from(set).sort();
    }, [items, isRepair, navInfo, categoryConfig]);

    const toggleBrand = (brand: string) => setSidebarBrands(prev => prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]);
    const togglePart = (part: string) => setSidebarParts(prev => prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]);
    
    const clearAllFilters = () => {
        setSidebarBrands([]); setSidebarParts([]); setSidebarCategory(''); setFilterCondition(''); setFilterPrice(''); setFilterSubCategory('');
    };

    const hasActiveFilters = sidebarBrands.length > 0 || sidebarParts.length > 0 || !!sidebarCategory || !!filterCondition || !!filterPrice || !!filterSubCategory;

    const { paginatedData: paginatedItems, currentPage, totalPages, pageSize, totalFiltered: totalFilteredCount, setPage, setPageSize, resetPage } = useClientPagination(filtered, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [filtered.length, sidebarBrands.length, sidebarParts.length, sidebarCategory, filterCondition, filterSubCategory, filterPrice, sortBy]);

    return (
        <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/" className="hover:text-orange-600">Trang chủ</Link>
                    <ChevronRight size={14} />
                    <span className="text-gray-800 font-medium">{pageLabel}</span>
                </nav>

                {/* ── Unified Premium Sidebar Layout ── */}
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Sidebar */}
                    <aside className="w-full md:w-60 flex-shrink-0">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sticky top-28 space-y-6">
                            <div className="flex items-center justify-between border-b pb-3">
                                <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Filter size={18} /> Bộ lọc</h3>
                                {hasActiveFilters && (
                                    <button onClick={clearAllFilters} className="text-xs text-copper hover:underline flex items-center gap-1 font-medium">
                                        <X size={14} /> Xóa lọc
                                    </button>
                                )}
                            </div>

                            {/* Brand checkboxes */}
                            {displayBrands.length > 0 && (
                                <div>
                                    <p className="text-sm font-semibold text-gray-800 mb-3">Thương hiệu</p>
                                    <div className="space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                        {displayBrands.map(b => (
                                            <label key={b} className="flex items-center gap-3 text-sm text-gray-600 cursor-pointer hover:text-copper transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={sidebarBrands.includes(b)}
                                                    onChange={() => toggleBrand(b)}
                                                    className="w-4 h-4 rounded border-gray-300 text-copper focus:ring-copper transition-colors"
                                                />
                                                <span className="flex-1">{b}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Repair Parts checkboxes */}
                            {isRepair && repairParts.length > 0 && (
                                <div>
                                    <p className="text-sm font-semibold text-gray-800 mb-3">Loại linh kiện</p>
                                    <div className="space-y-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                        {repairParts.map(p => (
                                            <label key={p.key} className="flex items-center gap-3 text-sm text-gray-600 cursor-pointer hover:text-copper transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={sidebarParts.includes(p.key)}
                                                    onChange={() => togglePart(p.key)}
                                                    className="w-4 h-4 rounded border-gray-300 text-copper focus:ring-copper transition-colors"
                                                />
                                                <span className="flex-1">{p.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Price range */}
                            <div>
                                <p className="text-sm font-semibold text-gray-800 mb-3">Mức giá</p>
                                <div className="space-y-2.5">
                                    {[{ v: '0-5', l: 'Dưới 5 triệu' }, { v: '5-10', l: '5 – 10 triệu' }, { v: '10-20', l: '10 – 20 triệu' }, { v: '20+', l: 'Trên 20 triệu' }].map(opt => (
                                        <label key={opt.v} className="flex items-center gap-3 text-sm text-gray-600 cursor-pointer hover:text-copper transition-colors">
                                            <input
                                                type="radio"
                                                name="price"
                                                checked={filterPrice === opt.v}
                                                onChange={() => setFilterPrice(filterPrice === opt.v ? '' : opt.v)}
                                                className="w-4 h-4 text-copper focus:ring-copper border-gray-300 transition-colors"
                                            />
                                            <span className="flex-1">{opt.l}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Condition (Product only) */}
                            {!isRepair && productConditions.length > 1 && (
                                <div>
                                    <p className="text-sm font-semibold text-gray-800 mb-3">Tình trạng</p>
                                    <select
                                        value={filterCondition}
                                        onChange={e => setFilterCondition(e.target.value)}
                                        aria-label="Lọc theo tình trạng"
                                        title="Lọc theo tình trạng"
                                        className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-copper focus:ring-1 focus:ring-copper bg-gray-50 hover:bg-white transition-colors"
                                    >
                                        <option value="">Tất cả</option>
                                        {productConditions.includes('new') && <option value="new">Mới 100%</option>}
                                        {productConditions.includes('like-new') && <option value="like-new">Cũ 99%</option>}
                                        {productConditions.includes('used') && <option value="used">Hàng cũ | TBH</option>}
                                    </select>
                                </div>
                            )}

                            {/* Category (Dòng máy - Product only) */}
                            {!isRepair && productCategories.length > 1 && (
                                <div>
                                    <p className="text-sm font-semibold text-gray-800 mb-3">Danh mục</p>
                                    <select
                                        value={sidebarCategory}
                                        onChange={e => setSidebarCategory(e.target.value)}
                                        aria-label="Lọc theo dòng máy"
                                        title="Lọc theo dòng máy"
                                        className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-copper focus:ring-1 focus:ring-copper bg-gray-50 hover:bg-white transition-colors"
                                    >
                                        <option value="">Tất cả</option>
                                        {productCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                    </aside>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                        {/* Subcategory filter chips for Phụ kiện */}
                        {navInfo?.isAccessory && (
                            <div className="flex flex-wrap gap-2 mb-5">
                                <button
                                    onClick={() => setFilterSubCategory('')}
                                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${!filterSubCategory ? 'bg-copper text-white border-copper shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-copper hover:text-copper'}`}
                                >
                                    Tất cả
                                </button>
                                {['Ốp lưng', 'Sạc dự phòng', 'Cáp sạc', 'Cóc sạc', 'Tai nghe', 'Khác'].map(sub => (
                                    <button
                                        key={sub}
                                        onClick={() => setFilterSubCategory(filterSubCategory === sub ? '' : sub)}
                                        className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${filterSubCategory === sub ? 'bg-copper text-white border-copper shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-copper hover:text-copper'}`}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Top bar (Count + Sort) */}
                        <div className="flex items-center justify-between mb-5 bg-gray-50 px-4 py-2.5 rounded-lg border border-gray-100">
                            {!loading && <p className="text-sm text-gray-600 font-medium">Tìm thấy <span className="text-copper">{filtered.length}</span> {isRepair ? 'dịch vụ' : 'sản phẩm'}</p>}
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500 hidden sm:inline">Sắp xếp:</span>
                                <select
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value)}
                                    aria-label="Sắp xếp"
                                    title="Sắp xếp"
                                    className="h-9 px-3 text-sm font-medium bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-copper focus:ring-1 focus:ring-copper shadow-sm cursor-pointer"
                                >
                                    <option value="newest">Mới nhất</option>
                                    <option value="popular">Phổ biến nhất</option>
                                    <option value="price-asc">Giá thấp → cao</option>
                                    <option value="price-desc">Giá cao → thấp</option>
                                </select>
                            </div>
                        </div>

                        {/* Grid */}
                        {loading ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {Array.from({ length: 10 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 bg-gray-50 rounded-2xl border border-gray-100 border-dashed">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                    <Package size={32} className="text-gray-400" />
                                </div>
                                <h4 className="text-lg font-semibold text-gray-800 mb-2">Không tìm thấy kết quả</h4>
                                <p className="text-gray-500 text-sm mb-6 text-center max-w-sm">Rất tiếc, không có {isRepair ? 'dịch vụ' : 'sản phẩm'} nào khớp với bộ lọc của bạn. Hãy thử thay đổi tiêu chí tìm kiếm.</p>
                                <button onClick={clearAllFilters} className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:text-copper hover:border-copper transition-colors shadow-sm">
                                    Xóa tất cả bộ lọc
                                </button>
                            </div>
                        ) : isRepair ? (
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {paginatedItems.map((svc) => (
                                    <ServiceCard
                                        key={svc.id}
                                        id={svc.id}
                                        name={svc.name || ''}
                                        imageUrl={svc.imageUrl}
                                        image={svc.image}
                                        price_original={svc.price_original ?? svc.price}
                                        price_promo={svc.price_promo}
                                        warranty_text={svc.warranty_text}
                                        repair_time={svc.repair_time}
                                        tags={svc.tags}
                                        rating={(svc as { rating?: number }).rating}
                                        reviewCount={(svc as { reviewCount?: number }).reviewCount}
                                        isFlashSale={svc.isFlashSale}
                                        type="service"
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                                {paginatedItems.map((product) => {
                                    const cond = CONDITION_LABELS[product.condition || ''];
                                    const displayPrice = product.price_promo || product.price_original || product.price || 0;
                                    const hasDiscount = !!(product.price_promo && product.price_original && product.price_promo < product.price_original);
                                    const discountPct = hasDiscount && product.price_promo && product.price_original
                                        ? Math.round((1 - product.price_promo / product.price_original) * 100)
                                        : 0;
                                    return (
                                        <Link key={product.id} href={`/product/${product.id}`} className="bg-white rounded-xl shadow-sm overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-gray-100 flex flex-col h-full">
                                            <div className="relative aspect-square bg-gray-50 flex-shrink-0">
                                                {product.imageUrl ? (
                                                    <Image src={product.imageUrl} alt={product.name || 'Sản phẩm'} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                                                ) : (
                                                    <Package size={32} className="absolute inset-0 m-auto text-gray-300" />
                                                )}
                                                {hasDiscount && <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-md shadow-sm z-10">-{discountPct}%</span>}
                                                {cond && <span className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded-md shadow-sm z-10 ${cond.color}`}>{cond.label}</span>}
                                            </div>
                                            <div className="p-4 flex flex-col flex-1">
                                                <p className="text-xs text-gray-400 font-medium tracking-wide uppercase mb-1.5">{product.brand || 'Khác'}</p>
                                                <h3 className="text-sm font-semibold text-gray-800 line-clamp-2 min-h-[40px] leading-tight group-hover:text-copper transition-colors mb-auto">{product.name}</h3>
                                                <div className="mt-3 pt-3 border-t border-gray-50 flex flex-col gap-1">
                                                    <p className="text-red-600 font-bold text-base">{formatPrice(displayPrice)}</p>
                                                    {hasDiscount && typeof product.price_original === 'number' && (
                                                        <p className="text-xs text-gray-400 line-through font-medium">{formatPrice(product.price_original)}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}

                        {/* Pagination */}
                        {!loading && filtered.length > 0 && (
                            <div className="mt-8 pt-4 border-t border-gray-100">
                                <PaginationBar
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    pageSize={pageSize}
                                    totalFiltered={totalFilteredCount}
                                    totalAll={items.length}
                                    onPageChange={setPage}
                                    onPageSizeChange={setPageSize}
                                    entityLabel={isRepair ? 'dịch vụ' : 'sản phẩm'}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Styles for custom scrollbar inside sidebar */}
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
            `}</style>
        </div>
    );
}
