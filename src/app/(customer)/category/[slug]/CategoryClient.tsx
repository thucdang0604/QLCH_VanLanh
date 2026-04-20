'use client';

import { useState, use, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Filter, Package, X } from 'lucide-react';
import { ProductCardSkeleton } from '@/components/ui/Skeleton';
import ServiceCard from '@/components/home/ServiceCard';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { SITE_URL } from "@/lib/constants";

/* ─────────────────────────────────────────────
   Slug → Metadata maps
───────────────────────────────────────────── */
const REPAIR_MAP: Record<string, { label: string; category: string }> = {
    'sua-iphone': { label: 'Sửa chữa iPhone', category: 'Sửa iPhone' },
    'sua-samsung': { label: 'Sửa chữa Samsung', category: 'Sửa Samsung' },
    'sua-oppo': { label: 'Sửa chữa OPPO', category: 'Sửa OPPO' },
    'sua-xiaomi': { label: 'Sửa chữa Xiaomi', category: 'Sửa Xiaomi' },
    'sua-tablet': { label: 'Sửa chữa Tablet', category: 'Sửa Tablet' },
    'sua-laptop': { label: 'Sửa chữa Laptop', category: 'Sửa Laptop' },
    'sua-may-tinh': { label: 'Sửa chữa Máy tính', category: 'Sửa Máy tính' },
    'thay-pin': { label: 'Thay Pin Chính Hãng', category: 'Thay Pin' },
    'ep-kinh': { label: 'Ép Kính – Thay Màn Hình', category: 'Ép Kính' },
};

const PRODUCT_MAP: Record<string, { label: string; category: string }> = {
    'phone': { label: 'Điện thoại', category: 'Điện thoại' },
    'dien-thoai': { label: 'Điện thoại', category: 'Điện thoại' },
    'laptop': { label: 'Laptop', category: 'Laptop' },
    'tablet': { label: 'Tablet', category: 'Tablet' },
    'smartwatch': { label: 'Smartwatch', category: 'Smartwatch' },
    'am-thanh': { label: 'Âm thanh', category: 'Âm thanh' },
    'phu-kien-sp': { label: 'Phụ kiện', category: 'Phụ kiện' },
    'accessory': { label: 'Phụ kiện', category: 'Phụ kiện' },
};

/* ── New top-level slugs (from simplified nav) ── */
const NAV_SLUG_MAP: Record<string, { label: string; condition?: string; isRepair?: boolean; isAccessory?: boolean }> = {
    'may-moi': { label: 'Máy Mới', condition: 'new' },
    'may-cu': { label: 'Máy Cũ Giá Rẻ', condition: 'used' }, // includes like-new
    'sua-chua': { label: 'Sửa Chữa - Bảo Hành', isRepair: true },
    'phu-kien': { label: 'Phụ Kiện', isAccessory: true },
};

const CONDITION_LABELS: Record<string, { label: string; color: string }> = {
    'new': { label: 'Mới 100%', color: 'bg-green-100 text-green-700' },
    'like-new': { label: 'Cũ 99%', color: 'bg-blue-100 text-blue-700' },
    'used': { label: 'Hàng cũ | TBH', color: 'bg-yellow-100 text-yellow-700' },
};

// Keywords to match services client-side for each slug
// (handles DB having generic categories like "Sửa chữa" or specific names)
const REPAIR_KEYWORDS: Record<string, string[]> = {
    'sua-iphone': ['iphone', 'ios', 'apple'],
    'sua-samsung': ['samsung', 'galaxy'],
    'sua-oppo': ['oppo'],
    'sua-xiaomi': ['xiaomi', 'redmi', 'poco'],
    'sua-tablet': ['tablet', 'ipad', 'galaxy tab', 'tab', 'surface'],
    'sua-laptop': ['laptop', 'macbook', 'notebook'],
    'sua-may-tinh': ['máy tính', 'may tinh', 'desktop', 'pc'],
    'thay-pin': ['pin', 'battery', 'thay pin'],
    'ep-kinh': ['kính', 'kinh', 'màn hình', 'man hinh', 'screen', 'ép kính', 'ep kinh'],
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
    { key: 'man-hinh', label: 'Màn hình', keywords: ['màn hình', 'man hinh', 'screen', 'lcd', 'oled', 'ép kính'] },
    { key: 'pin', label: 'Pin', keywords: ['pin', 'battery'] },
    { key: 'camera', label: 'Camera', keywords: ['camera', 'cam'] },
    { key: 'vo-may', label: 'Vỏ máy', keywords: ['vỏ', 'nắp lưng', 'khung'] },
    { key: 'loa', label: 'Loa / Mic', keywords: ['loa', 'mic', 'speaker'] },
    { key: 'main', label: 'Main / IC', keywords: ['main', 'mainboard', 'ic', 'chip'] },
    { key: 'sac', label: 'Cổng sạc', keywords: ['sạc', 'charging', 'cổng'] },
    { key: 'soft', label: 'Phần mềm', keywords: ['phần mềm', 'unlock', 'bypass', 'software'] },
];

/** Normalize string: lowercase + remove Vietnamese diacritics */
function normalize(str: string): string {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd');
}

/** Match a service document against keywords for the given slug */
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

function matchesSlug(svc: CategoryItem, slug: string): boolean {
    const keywords = REPAIR_KEYWORDS[slug];
    if (!keywords) return true; // unknown slug → show all
    const haystack = normalize([svc.name, svc.category, svc.description, ...(svc.tags || [])].join(' '));
    return keywords.some(kw => haystack.includes(normalize(kw)));
}

const formatPrice = (p: number) => new Intl.NumberFormat('vi-VN').format(p) + 'đ';

/* ─────────────────────────────────────────────
   Page
───────────────────────────────────────────── */
export default function CategoryClient({ slug, initialItems }: { slug: string; initialItems: CategoryItem[] }) {

    // Determine collection type — check new nav slugs first
    const navInfo = NAV_SLUG_MAP[slug];
    const repairInfo = REPAIR_MAP[slug];
    const productInfo = PRODUCT_MAP[slug];
    const isRepair = navInfo ? !!navInfo.isRepair : !!repairInfo; // NAV_SLUG_MAP takes priority
    const isNavProductSlug = !!navInfo && !navInfo.isRepair; // may-moi, may-cu, phu-kien
    const pageLabel = navInfo?.label ?? repairInfo?.label ?? productInfo?.label ?? 'Danh mục';

    // Sidebar filter state (for may-moi / may-cu)
    const [sidebarBrands, setSidebarBrands] = useState<string[]>([]);
    const [sidebarCategory, setSidebarCategory] = useState('');

    // Filters
    const [filterBrand, setFilterBrand] = useState('');
    const [filterCondition, setFilterCondition] = useState('');
    const [filterPrice, setFilterPrice] = useState('');
    const [sortBy, setSortBy] = useState('newest');
    const [filterRepairBrand, setFilterRepairBrand] = useState('');
    const [filterRepairPart, setFilterRepairPart] = useState('');
    const [filterSubCategory, setFilterSubCategory] = useState('');
    // Price range slider for repair services
    const [priceMin, setPriceMin] = useState(10_000);
    const [priceMax, setPriceMax] = useState(5_000_000);
    const isPriceSliderActive = priceMin > 10_000 || priceMax < 5_000_000;

    // initialItems passed from server
    const items = initialItems;
    const loading = false;

    /* ── Client-side filters (brand, condition, price range, popular sort) ── */
    const filtered = useMemo(() => {
        let list = [...items];

        if (isRepair) {
            // Filter services: keyword match client-side + skip inactive
            list = list.filter(s => s.isActive !== false);
            // For specific repair slugs, apply keyword matching
            if (slug !== 'sua-chua') {
                list = list.filter(s => matchesSlug(s, slug));
            }

            // Service price range slider filter
            if (isPriceSliderActive) {
                list = list.filter(s => {
                    const pr = Number(s.price_promo || s.price_original || s.price) || 0;
                    return pr >= priceMin && pr <= priceMax;
                });
            }

            // Brand filter for repair services
            if (filterRepairBrand) {
                list = list.filter(s => normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' ')).includes(normalize(filterRepairBrand)));
            }

            // Part type filter for repair services
            if (filterRepairPart) {
                const partDef = KNOWN_PARTS.find(p => p.key === filterRepairPart);
                if (partDef) {
                    list = list.filter(s => {
                        const hay = normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' '));
                        return partDef.keywords.some(kw => hay.includes(normalize(kw)));
                    });
                }
            }

            list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
        } else {
            // Nav product slugs: filter by condition
            if (navInfo?.condition === 'new') {
                list = list.filter(p => p.condition === 'new');
            } else if (navInfo?.condition === 'used') {
                list = list.filter(p => p.condition === 'used' || p.condition === 'like-new');
            } else if (navInfo?.isAccessory) {
                list = list.filter(p => (p.category || '').toLowerCase().includes('phụ kiện') || (p.category || '').toLowerCase().includes('phu kien') || p.category === 'Phụ kiện');
                // Subcategory filter for accessories
                if (filterSubCategory) list = list.filter(p => p.subCategory === filterSubCategory);
            }

            // Sidebar brand filter (multiple selection)
            if (sidebarBrands.length > 0) list = list.filter(p => typeof p.brand === 'string' && sidebarBrands.includes(p.brand));
            // Legacy single brand filter
            else if (filterBrand) list = list.filter(p => p.brand === filterBrand);

            // Sidebar category filter
            if (sidebarCategory) list = list.filter(p => p.category === sidebarCategory);

            if (filterCondition) list = list.filter(p => p.condition === filterCondition);

            if (filterPrice === '0-5') list = list.filter(p => (p.price_promo ?? p.price_original ?? 0) < 5_000_000);
            if (filterPrice === '5-10') list = list.filter(p => { const pr = p.price_promo ?? p.price_original ?? 0; return pr >= 5_000_000 && pr < 10_000_000; });
            if (filterPrice === '10-20') list = list.filter(p => { const pr = p.price_promo ?? p.price_original ?? 0; return pr >= 10_000_000 && pr < 20_000_000; });
            if (filterPrice === '20+') list = list.filter(p => (p.price_promo ?? p.price_original ?? 0) >= 20_000_000);

            if (sortBy === 'popular') list.sort((a, b) => (b.sold || 0) - (a.sold || 0));
            if (sortBy === 'price-asc') list.sort((a, b) => (a.price_original || 0) - (b.price_original || 0));
            if (sortBy === 'price-desc') list.sort((a, b) => (b.price_original || 0) - (a.price_original || 0));
        }
        return list;
    }, [items, filterBrand, filterCondition, filterPrice, sortBy, isRepair, sidebarBrands, sidebarCategory, navInfo, slug, filterRepairBrand, filterRepairPart, priceMin, priceMax, isPriceSliderActive, filterSubCategory]);

    // Unique brands from loaded data (products only)
    const brands = useMemo(() => {
        // For nav product slugs, compute brands from condition-filtered items
        let source = items;
        if (navInfo?.condition === 'new') source = items.filter((p) => p.condition === 'new');
        else if (navInfo?.condition === 'used') source = items.filter((p) => p.condition === 'used' || p.condition === 'like-new');
        const set = new Set(source.map((p) => p.brand).filter((v): v is string => typeof v === 'string' && v.length > 0));
        return Array.from(set).sort();
    }, [items, navInfo]);

    // Unique categories (dòng máy) from loaded data
    const categories = useMemo(() => {
        let source = items;
        if (navInfo?.condition === 'new') source = items.filter((p) => p.condition === 'new');
        else if (navInfo?.condition === 'used') source = items.filter((p) => p.condition === 'used' || p.condition === 'like-new');
        const set = new Set(source.map((p) => p.category).filter((v): v is string => typeof v === 'string' && v.length > 0));
        return Array.from(set).sort();
    }, [items, navInfo]);

    // Whether to show sidebar layout
    const showSidebar = slug === 'may-moi' || slug === 'may-cu';

    const toggleBrand = (brand: string) => {
        setSidebarBrands(prev => prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]);
    };
    const clearAllFilters = () => {
        setSidebarBrands([]); setSidebarCategory(''); setFilterPrice(''); setFilterBrand(''); setFilterCondition('');
        setFilterRepairBrand(''); setFilterRepairPart(''); setFilterSubCategory('');
        setPriceMin(10_000); setPriceMax(5_000_000);
    };
    const hasActiveFilters = sidebarBrands.length > 0 || !!sidebarCategory || !!filterPrice || !!filterRepairBrand || !!filterRepairPart || isPriceSliderActive || !!filterSubCategory;

    const { paginatedData: paginatedItems, currentPage, totalPages, pageSize, totalFiltered: totalFilteredCount, setPage, setPageSize, resetPage } = useClientPagination(filtered, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [filtered.length, filterBrand, filterCondition, filterPrice, sortBy, filterRepairBrand, filterRepairPart, filterSubCategory, sidebarBrands.length, sidebarCategory, priceMin, priceMax]);

    // Unique brands found in repair services (for filter dropdown)
    const repairBrands = useMemo(() => {
        if (!isRepair) return [];
        const found = new Set<string>();
        items.filter(s => s.isActive !== false).forEach(s => {
            const hay = normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' '));
            KNOWN_BRANDS.forEach(brand => {
                if (hay.includes(normalize(brand))) found.add(brand);
            });
        });
        return Array.from(found).sort();
    }, [items, isRepair]);

    // Unique part types found in repair services (for filter dropdown)
    const repairParts = useMemo(() => {
        if (!isRepair) return [];
        return KNOWN_PARTS.filter(part => {
            return items.filter(s => s.isActive !== false).some(s => {
                const hay = normalize([s.name, s.category, s.description, ...(s.tags || [])].join(' '));
                return part.keywords.some(kw => hay.includes(normalize(kw)));
            });
        });
    }, [items, isRepair]);

    /* ─────────────── Render ─────────────── */
    return (
        <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/" className="hover:text-orange-600">Trang chủ</Link>
                    <ChevronRight size={14} />
                    <span className="text-gray-800 font-medium">{pageLabel}</span>
                </nav>

                {/* ── Sidebar Layout for may-moi / may-cu ── */}
                {showSidebar ? (
                    <div className="flex gap-6">
                        {/* Sidebar */}
                        <aside className="hidden md:block w-60 flex-shrink-0">
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sticky top-28 space-y-5">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-gray-800 flex items-center gap-1.5"><Filter size={16} /> Bộ lọc</h3>
                                    {hasActiveFilters && (
                                        <button onClick={clearAllFilters} className="text-xs text-copper hover:underline flex items-center gap-0.5">
                                            <X size={12} /> Xóa lọc
                                        </button>
                                    )}
                                </div>

                                {/* Brand checkboxes */}
                                {brands.length > 0 && (
                                    <div>
                                        <p className="text-sm font-medium text-gray-700 mb-2">Hãng</p>
                                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                            {brands.map(b => (
                                                <label key={b} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                                                    <input
                                                        type="checkbox"
                                                        checked={sidebarBrands.includes(b)}
                                                        onChange={() => toggleBrand(b)}
                                                        className="rounded border-gray-300 text-copper focus:ring-copper"
                                                    />
                                                    {b}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Price range */}
                                <div>
                                    <p className="text-sm font-medium text-gray-700 mb-2">Mức giá</p>
                                    <div className="space-y-1.5">
                                        {[{ v: '0-5', l: 'Dưới 5 triệu' }, { v: '5-10', l: '5 – 10 triệu' }, { v: '10-20', l: '10 – 20 triệu' }, { v: '20+', l: 'Trên 20 triệu' }].map(opt => (
                                            <label key={opt.v} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-900">
                                                <input
                                                    type="radio"
                                                    name="price"
                                                    checked={filterPrice === opt.v}
                                                    onChange={() => setFilterPrice(filterPrice === opt.v ? '' : opt.v)}
                                                    className="text-copper focus:ring-copper"
                                                />
                                                {opt.l}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Category (Dòng máy) */}
                                {categories.length > 1 && (
                                    <div>
                                        <p className="text-sm font-medium text-gray-700 mb-2">Dòng máy</p>
                                        <select
                                            value={sidebarCategory}
                                            onChange={e => setSidebarCategory(e.target.value)}
                                            aria-label="Lọc theo dòng máy"
                                            title="Lọc theo dòng máy"
                                            className="w-full h-9 px-3 text-sm border rounded-lg focus:outline-none focus:border-copper"
                                        >
                                            <option value="">Tất cả</option>
                                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </aside>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                            {/* Mobile filter bar */}
                            <div className="md:hidden bg-white rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2 shadow-sm">
                                <span className="flex items-center gap-1 text-gray-500 text-xs font-medium"><Filter size={14} /> Lọc:</span>
                                {brands.length > 0 && (
                                    <select
                                        value={sidebarBrands[0] || ''}
                                        onChange={e => setSidebarBrands(e.target.value ? [e.target.value] : [])}
                                        aria-label="Lọc theo hãng (mobile)"
                                        title="Lọc theo hãng"
                                        className="h-8 px-2 text-xs border rounded-lg"
                                    >
                                        <option value="">Hãng</option>
                                        {brands.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                )}
                                <select
                                    value={filterPrice}
                                    onChange={e => setFilterPrice(e.target.value)}
                                    aria-label="Lọc theo mức giá (mobile)"
                                    title="Lọc theo mức giá"
                                    className="h-8 px-2 text-xs border rounded-lg"
                                >
                                    <option value="">Giá</option>
                                    <option value="0-5">Dưới 5tr</option><option value="5-10">5-10tr</option><option value="10-20">10-20tr</option><option value="20+">20tr+</option>
                                </select>
                            </div>

                            {/* Sort bar */}
                            <div className="flex items-center justify-between mb-4">
                                {!loading && <p className="text-sm text-gray-500">{filtered.length} sản phẩm</p>}
                                <select
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value)}
                                    aria-label="Sắp xếp"
                                    title="Sắp xếp"
                                    className="h-9 px-3 text-sm border rounded-lg focus:outline-none focus:border-copper"
                                >
                                    <option value="newest">Mới nhất</option>
                                    <option value="price-asc">Giá thấp → cao</option>
                                    <option value="price-desc">Giá cao → thấp</option>
                                    <option value="popular">Phổ biến nhất</option>
                                </select>
                            </div>

                            {/* Grid */}
                            {loading ? (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-20">
                                    <Package size={48} className="mx-auto text-gray-300 mb-3" />
                                    <p className="text-gray-500">Không có sản phẩm nào phù hợp</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {paginatedItems.map((product) => {
                                        const cond = CONDITION_LABELS[product.condition || ''];
                                        const displayPrice = product.price_promo || product.price_original || product.price || 0;
                                        const hasDiscount = !!(product.price_promo && product.price_original && product.price_promo < product.price_original);
                                        const discountPct = hasDiscount && product.price_promo && product.price_original
                                            ? Math.round((1 - product.price_promo / product.price_original) * 100)
                                            : 0;
                                        return (
                                            <Link key={product.id} href={`/product/${product.id}`} className="bg-white rounded-xl shadow-sm overflow-hidden group hover:shadow-lg transition-shadow border border-gray-100">
                                                <div className="relative aspect-square bg-gray-50">
                                                    {product.imageUrl ? (
                                                        <Image src={product.imageUrl} alt={product.name || 'Sản phẩm'} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                                                    ) : (
                                                        <Package size={32} className="absolute inset-0 m-auto text-gray-300" />
                                                    )}
                                                    {hasDiscount && <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">-{discountPct}%</span>}
                                                    {cond && <span className={`absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${cond.color}`}>{cond.label}</span>}
                                                </div>
                                                <div className="p-3">
                                                    <p className="text-xs text-gray-400 mb-0.5">{product.brand}</p>
                                                    <h3 className="text-sm font-medium text-gray-800 line-clamp-2 min-h-[40px] group-hover:text-copper transition-colors">{product.name}</h3>
                                                    <div className="mt-2">
                                                        <p className="text-red-600 font-bold text-sm">{formatPrice(displayPrice)}</p>
                                                        {hasDiscount && <p className="text-xs text-gray-400 line-through">{formatPrice(product.price_original || 0)}</p>}
                                                    </div>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Pagination */}
                            {!loading && filtered.length > 0 && (
                                <PaginationBar
                                    currentPage={currentPage}
                                    totalPages={totalPages}
                                    pageSize={pageSize}
                                    totalFiltered={totalFilteredCount}
                                    totalAll={items.length}
                                    onPageChange={setPage}
                                    onPageSizeChange={setPageSize}
                                    entityLabel="sản phẩm"
                                />
                            )}
                        </div>
                    </div>
                ) : (
                    /* ── Original layout (non-sidebar) ── */
                    <>
                        {/* Filter Bar */}
                        <div className="bg-white rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="flex items-center gap-1.5 text-gray-500 text-sm font-medium">
                                    <Filter size={16} /> Lọc:
                                </span>

                                {!isRepair && brands.length > 0 && (
                                    <select
                                        value={filterBrand}
                                        onChange={e => setFilterBrand(e.target.value)}
                                        aria-label="Lọc theo hãng"
                                        title="Lọc theo hãng"
                                        className="h-9 px-3 text-sm border rounded-lg focus:outline-none focus:border-orange-500"
                                    >
                                        <option value="">Tất cả hãng</option>
                                        {brands.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                )}

                                {isRepair && repairBrands.length > 0 && (
                                    <select
                                        value={filterRepairBrand}
                                        onChange={e => setFilterRepairBrand(e.target.value)}
                                        aria-label="Lọc theo hãng (dịch vụ sửa chữa)"
                                        title="Lọc theo hãng"
                                        className="h-9 px-3 text-sm border rounded-lg focus:outline-none focus:border-orange-500"
                                    >
                                        <option value="">Tất cả hãng</option>
                                        {repairBrands.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                )}

                                {isRepair && repairParts.length > 0 && (
                                    <select
                                        value={filterRepairPart}
                                        onChange={e => setFilterRepairPart(e.target.value)}
                                        aria-label="Lọc theo loại linh kiện (dịch vụ sửa chữa)"
                                        title="Lọc theo loại linh kiện"
                                        className="h-9 px-3 text-sm border rounded-lg focus:outline-none focus:border-orange-500"
                                    >
                                        <option value="">Tất cả linh kiện</option>
                                        {repairParts.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                                    </select>
                                )}

                                {isRepair ? (
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <span className="text-xs text-gray-500 whitespace-nowrap">Giá:</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-gray-700 min-w-[60px]">{formatPrice(priceMin)}</span>
                                            <div className="relative w-40 h-6 flex items-center">
                                                <input
                                                    type="range"
                                                    min={10000}
                                                    max={5000000}
                                                    step={10000}
                                                    value={priceMin}
                                                    aria-label="Giá tối thiểu (dịch vụ)"
                                                    title="Giá tối thiểu"
                                                    onChange={e => {
                                                        const v = Number(e.target.value);
                                                        if (v <= priceMax - 10000) setPriceMin(v);
                                                    }}
                                                    className="absolute w-full h-1.5 appearance-none bg-gray-200 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10"
                                                    style={{ pointerEvents: 'auto' }}
                                                />
                                                <input
                                                    type="range"
                                                    min={10000}
                                                    max={5000000}
                                                    step={10000}
                                                    value={priceMax}
                                                    aria-label="Giá tối đa (dịch vụ)"
                                                    title="Giá tối đa"
                                                    onChange={e => {
                                                        const v = Number(e.target.value);
                                                        if (v >= priceMin + 10000) setPriceMax(v);
                                                    }}
                                                    className="absolute w-full h-1.5 appearance-none bg-transparent rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-orange-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20"
                                                    style={{ pointerEvents: 'auto' }}
                                                />
                                            </div>
                                            <span className="text-xs font-medium text-gray-700 min-w-[75px]">{formatPrice(priceMax)}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <select
                                        value={filterPrice}
                                        onChange={e => setFilterPrice(e.target.value)}
                                        aria-label="Lọc theo mức giá"
                                        title="Lọc theo mức giá"
                                        className="h-9 px-3 text-sm border rounded-lg focus:outline-none focus:border-orange-500"
                                    >
                                        <option value="">Mức giá</option>
                                        <option value="0-5">Dưới 5 triệu</option><option value="5-10">5 – 10 triệu</option><option value="10-20">10 – 20 triệu</option><option value="20+">Trên 20 triệu</option>
                                    </select>
                                )}

                                {!isRepair && (
                                    <select
                                        value={filterCondition}
                                        onChange={e => setFilterCondition(e.target.value)}
                                        aria-label="Lọc theo tình trạng"
                                        title="Lọc theo tình trạng"
                                        className="h-9 px-3 text-sm border rounded-lg focus:outline-none focus:border-orange-500"
                                    >
                                        <option value="">Tất cả tình trạng</option>
                                        <option value="new">Mới 100%</option><option value="like-new">Cũ 99%</option><option value="used">Hàng cũ | TBH</option>
                                    </select>
                                )}
                            </div>

                            {!isRepair && (
                                <select
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value)}
                                    aria-label="Sắp xếp"
                                    title="Sắp xếp"
                                    className="h-9 px-3 text-sm border rounded-lg focus:outline-none focus:border-orange-500"
                                >
                                    <option value="newest">Mới nhất</option>
                                    <option value="price-asc">Giá thấp → cao</option>
                                    <option value="price-desc">Giá cao → thấp</option>
                                    <option value="popular">Phổ biến nhất</option>
                                </select>
                            )}
                        </div>

                        {/* Subcategory filter chips for Phụ kiện */}
                        {navInfo?.isAccessory && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                <button
                                    onClick={() => setFilterSubCategory('')}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${!filterSubCategory ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600'}`}
                                >
                                    Tất cả
                                </button>
                                {['Ốp lưng', 'Sạc dự phòng', 'Cáp sạc', 'Cóc sạc', 'Tai nghe', 'Khác'].map(sub => (
                                    <button
                                        key={sub}
                                        onClick={() => setFilterSubCategory(filterSubCategory === sub ? '' : sub)}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${filterSubCategory === sub ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600'}`}
                                    >
                                        {sub}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Result count */}
                        {!loading && (
                            <p className="text-sm text-gray-500 mb-4">
                                {filtered.length} {isRepair ? 'dịch vụ' : 'sản phẩm'}
                            </p>
                        )}

                        {/* Grid */}
                        {loading ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-20">
                                <Package size={48} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-500">Không có {isRepair ? 'dịch vụ' : 'sản phẩm'} nào trong danh mục này</p>
                            </div>
                        ) : isRepair ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                {paginatedItems.map((product) => {
                                    const cond = CONDITION_LABELS[product.condition || ''];
                                    const displayPrice = product.price_promo || product.price_original || product.price || 0;
                                    const hasDiscount = !!(product.price_promo && product.price_original && product.price_promo < product.price_original);
                                    const discountPct = hasDiscount && product.price_promo && product.price_original
                                        ? Math.round((1 - product.price_promo / product.price_original) * 100)
                                        : 0;
                                    return (
                                        <Link key={product.id} href={`/product/${product.id}`} className="bg-white rounded-xl shadow-sm overflow-hidden group hover:shadow-lg transition-shadow border border-gray-100">
                                            <div className="relative aspect-square bg-gray-50">
                                                {product.imageUrl ? (
                                                    <Image src={product.imageUrl} alt={product.name || 'Sản phẩm'} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                                                ) : (
                                                    <Package size={32} className="absolute inset-0 m-auto text-gray-300" />
                                                )}
                                                {hasDiscount && <span className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">-{discountPct}%</span>}
                                                {cond && <span className={`absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${cond.color}`}>{cond.label}</span>}
                                            </div>
                                            <div className="p-3">
                                                <p className="text-xs text-gray-400 mb-0.5">{product.brand}</p>
                                                <h3 className="text-sm font-medium text-gray-800 line-clamp-2 min-h-[40px] group-hover:text-copper transition-colors">{product.name}</h3>
                                                <div className="mt-2">
                                                    <p className="text-red-600 font-bold text-sm">{formatPrice(displayPrice)}</p>
                                                    {hasDiscount && typeof product.price_original === 'number' && (
                                                        <p className="text-xs text-gray-400 line-through">{formatPrice(product.price_original)}</p>
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
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
