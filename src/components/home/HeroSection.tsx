'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronRight as ChevronR, Shield, Clock, Award, Wrench, Smartphone, Battery, Monitor, Laptop, Watch, Cpu } from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import Link from 'next/link';

// ===== Sidebar Menu Data (CareK Style) =====
const sidebarCategories = [
    {
        icon: <Smartphone size={18} />,
        name: 'Sửa iPhone',
        slug: 'sua-iphone',
        subItems: [
            { group: 'Dòng máy', items: ['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16', 'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15', 'iPhone 14 Pro Max', 'iPhone 14', 'iPhone 13', 'iPhone 12', 'iPhone 11'] },
            { group: 'Dịch vụ phổ biến', items: ['Thay màn hình iPhone', 'Thay pin iPhone', 'Ép kính iPhone', 'Sửa loa iPhone', 'Thay camera iPhone'] },
        ]
    },
    {
        icon: <Smartphone size={18} />,
        name: 'Sửa Samsung',
        slug: 'sua-samsung',
        subItems: [
            { group: 'Dòng máy', items: ['Galaxy S25 Ultra', 'Galaxy S24 Ultra', 'Galaxy S24', 'Galaxy S23 Ultra', 'Galaxy Z Fold6', 'Galaxy Z Flip6', 'Galaxy A55', 'Galaxy A35', 'Galaxy A15'] },
            { group: 'Dịch vụ phổ biến', items: ['Thay màn hình Samsung', 'Thay pin Samsung', 'Ép kính Samsung', 'Sửa sọc màn hình'] },
        ]
    },
    {
        icon: <Battery size={18} />,
        name: 'Thay Pin',
        slug: 'thay-pin',
        subItems: [
            { group: 'Thay pin theo hãng', items: ['Pin iPhone chính hãng', 'Pin Samsung chính hãng', 'Pin OPPO', 'Pin Xiaomi', 'Pin Vivo', 'Pin Realme'] },
            { group: 'Cam kết', items: ['Bảo hành trọn đời', 'Pin dung lượng chuẩn', 'Thay trong 30 phút'] },
        ]
    },
    {
        icon: <Monitor size={18} />,
        name: 'Ép Kính',
        slug: 'ep-kinh',
        subItems: [
            { group: 'Ép kính theo hãng', items: ['Ép kính iPhone', 'Ép kính Samsung', 'Ép kính OPPO', 'Ép kính Xiaomi'] },
            { group: 'Cam kết', items: ['Kính cường lực cao cấp', 'Bảo hành 12 tháng', 'Xong trong 45 phút'] },
        ]
    },
    {
        icon: <Laptop size={18} />,
        name: 'Sửa Laptop',
        slug: 'sua-laptop',
        subItems: [
            { group: 'Hãng máy', items: ['MacBook Pro', 'MacBook Air', 'Dell XPS / Inspiron', 'HP Pavilion / EliteBook', 'Lenovo ThinkPad / IdeaPad', 'Asus VivoBook / ZenBook', 'MSI Gaming'] },
            { group: 'Dịch vụ', items: ['Thay màn hình laptop', 'Thay bàn phím laptop', 'Vệ sinh laptop', 'Nâng cấp SSD/RAM'] },
        ]
    },
    {
        icon: <Watch size={18} />,
        name: 'Sửa Apple Watch',
        slug: 'sua-apple-watch',
        subItems: [
            { group: 'Dòng máy', items: ['Apple Watch Ultra 2', 'Apple Watch Series 10', 'Apple Watch Series 9', 'Apple Watch SE'] },
            { group: 'Dịch vụ', items: ['Thay màn hình Apple Watch', 'Thay pin Apple Watch', 'Sửa nút Digital Crown'] },
        ]
    },
    {
        icon: <Smartphone size={18} />,
        name: 'Sửa OPPO / Xiaomi',
        slug: 'sua-oppo',
        subItems: [
            { group: 'OPPO', items: ['OPPO Find X7', 'OPPO Reno 12', 'OPPO A79', 'OPPO A58'] },
            { group: 'Xiaomi', items: ['Xiaomi 14 Ultra', 'Redmi Note 13', 'Redmi 13C', 'POCO X6 Pro'] },
        ]
    },
    {
        icon: <Cpu size={18} />,
        name: 'Sửa Máy tính',
        slug: 'sua-may-tinh',
        subItems: [
            { group: 'Dịch vụ', items: ['Cài đặt Windows/macOS', 'Diệt virus - Phần mềm', 'Cứu dữ liệu', 'Lắp ráp PC theo yêu cầu'] },
        ]
    },
];

// Fallback slides when no banners are configured
const fallbackSlides = [
    { title: 'Thay Pin iPhone', subtitle: 'Chính hãng - BH trọn đời', desc: 'Chỉ từ 390.000đ • Xong trong 30 phút', gradient: 'from-gray-900 via-gray-800 to-gray-900', accent: 'text-copper' },
    { title: 'Ép Kính Điện Thoại', subtitle: 'Kính cường lực cao cấp', desc: 'Giá từ 290.000đ • Bảo hành 12 tháng', gradient: 'from-gray-900 via-stone-800 to-gray-900', accent: 'text-copper-light' },
    { title: 'Sửa Chữa Laptop', subtitle: 'MacBook, Dell, HP, Lenovo', desc: 'Báo giá minh bạch • Linh kiện chính hãng', gradient: 'from-gray-900 via-neutral-800 to-gray-900', accent: 'text-copper' },
    { title: 'Flash Sale Hàng Tuần', subtitle: 'Giảm đến 40% dịch vụ', desc: 'Ưu đãi có hạn • Đặt lịch ngay hôm nay', gradient: 'from-gray-900 via-zinc-800 to-gray-900', accent: 'text-accent' },
];

const trustBadges = [
    { icon: <Shield size={28} />, title: 'Bảo hành trọn đời', desc: 'Cho mọi dịch vụ' },
    { icon: <Clock size={28} />, title: 'Xong trong 30 phút', desc: 'Nhanh chóng, tiện lợi' },
    { icon: <Award size={28} />, title: 'Linh kiện chính hãng', desc: 'Cam kết 100%' },
    { icon: <Wrench size={28} />, title: 'Kỹ thuật viên 10+ năm', desc: 'Chuyên môn cao' },
];

// Skeleton loader for banner
function BannerSkeleton() {
    return (
        <div className="relative bg-dark overflow-hidden animate-pulse">
            <div className="container mx-auto px-4">
                <div className="h-[280px] sm:h-[380px] flex items-center">
                    <div className="space-y-4 w-full max-w-xl">
                        <div className="h-4 w-32 bg-gray-700 rounded" />
                        <div className="h-10 w-64 bg-gray-700 rounded" />
                        <div className="h-5 w-48 bg-gray-700 rounded" />
                        <div className="flex gap-3">
                            <div className="h-12 w-36 bg-gray-700 rounded-lg" />
                            <div className="h-12 w-32 bg-gray-700 rounded-lg" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ===== Sidebar Flyout Menu Item =====
function SidebarItem({ item }: { item: typeof sidebarCategories[0] }) {
    const [showFlyout, setShowFlyout] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setShowFlyout(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => setShowFlyout(false), 150);
    };

    return (
        <div
            className="relative"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <Link
                href={`/category/${item.slug}`}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-copper/5 hover:text-copper transition-colors group"
            >
                <span className="text-gray-400 group-hover:text-copper transition-colors flex-shrink-0">{item.icon}</span>
                <span className="flex-1 font-medium truncate">{item.name}</span>
                <ChevronR size={14} className="text-gray-300 group-hover:text-copper transition-colors flex-shrink-0" />
            </Link>

            {/* Flyout Submenu */}
            {showFlyout && item.subItems.length > 0 && (
                <div
                    className="absolute left-full top-0 z-50 ml-0 w-[480px] bg-white rounded-r-xl shadow-2xl border border-gray-100 p-5 animate-[fadeIn_0.15s_ease-in-out]"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="grid grid-cols-2 gap-5">
                        {item.subItems.map((group, gi) => (
                            <div key={gi}>
                                <h4 className="text-xs font-bold text-copper uppercase tracking-wider mb-2.5">{group.group}</h4>
                                <ul className="space-y-1.5">
                                    {group.items.map((sub, si) => (
                                        <li key={si}>
                                            <Link
                                                href={`/category/${item.slug}`}
                                                className="text-sm text-gray-600 hover:text-copper hover:pl-1 transition-all block py-0.5"
                                            >
                                                {sub}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    {/* CTA */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                        <Link
                            href={`/category/${item.slug}`}
                            className="text-sm font-semibold text-copper hover:text-copper-dark transition-colors"
                        >
                            Xem tất cả {item.name} →
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function HeroSection() {
    const { config, loading } = useConfig();
    const [current, setCurrent] = useState(0);
    const [imgError, setImgError] = useState<Record<string, boolean>>({});

    const heroBanners = config.hero_banners || [];
    const hasBanners = heroBanners.length > 0;
    const totalSlides = hasBanners ? heroBanners.length : fallbackSlides.length;

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrent((prev) => (prev + 1) % totalSlides);
        }, 5000);
        return () => clearInterval(timer);
    }, [totalSlides]);

    const prev = () => setCurrent((c) => (c - 1 + totalSlides) % totalSlides);
    const next = () => setCurrent((c) => (c + 1) % totalSlides);

    if (loading) return <BannerSkeleton />;

    return (
        <section className="py-2">
            <div className="max-w-[1200px] mx-auto px-2 md:px-4">
                <div className="rounded-xl shadow-lg">

                    {/* ===== 2-Column Layout: Sidebar + Slider ===== */}
                    <div className="flex">

                        {/* ── Sidebar Menu (25%) ── Hidden on mobile */}
                        <div className="hidden lg:block w-[260px] flex-shrink-0 bg-white border-r border-gray-100 rounded-tl-xl overflow-visible relative z-20">
                            <div className="py-2">
                                <h3 className="px-4 py-2.5 text-sm font-bold text-dark flex items-center gap-2 border-b border-gray-50">
                                    <Wrench size={16} className="text-copper" />
                                    Danh mục dịch vụ
                                </h3>
                                <nav>
                                    {sidebarCategories.map((cat) => (
                                        <SidebarItem key={cat.slug} item={cat} />
                                    ))}
                                </nav>
                            </div>
                        </div>

                        {/* ── Banner Slider (75%) ── */}
                        <div className="flex-1 min-w-0 relative bg-dark overflow-hidden rounded-tr-xl">
                            <div className="px-0">
                                {hasBanners ? (
                                    /* Image Banner Mode */
                                    <div className="relative h-[280px] sm:h-[380px]">
                                        {heroBanners.map((banner, i) => (
                                            <div key={banner.id} className={`absolute inset-0 transition-opacity duration-700 ${i === current ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                                                {banner.link ? (
                                                    <a href={banner.link} className="block w-full h-full">
                                                        <img
                                                            src={imgError[banner.id] ? 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect fill="%23333" width="800" height="400"/><text fill="%23999" x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="20">Banner</text></svg>' : banner.imageUrl}
                                                            alt={banner.alt || 'Banner'}
                                                            className="w-full h-full object-cover"
                                                            onError={() => setImgError(prev => ({ ...prev, [banner.id]: true }))}
                                                        />
                                                    </a>
                                                ) : (
                                                    <img
                                                        src={imgError[banner.id] ? 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect fill="%23333" width="800" height="400"/><text fill="%23999" x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="20">Banner</text></svg>' : banner.imageUrl}
                                                        alt={banner.alt || 'Banner'}
                                                        className="w-full h-full object-cover"
                                                        onError={() => setImgError(prev => ({ ...prev, [banner.id]: true }))}
                                                    />
                                                )}
                                            </div>
                                        ))}
                                        {/* Arrows */}
                                        {heroBanners.length > 1 && (
                                            <>
                                                <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center z-20"><ChevronLeft size={20} /></button>
                                                <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center z-20"><ChevronRight size={20} /></button>
                                            </>
                                        )}
                                        {/* Dots */}
                                        {heroBanners.length > 1 && (
                                            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-20">
                                                {heroBanners.map((_, i) => (
                                                    <button key={i} onClick={() => setCurrent(i)} className={`transition-all duration-300 rounded-full ${i === current ? 'w-8 h-2 bg-copper' : 'w-2 h-2 bg-white/50 hover:bg-white/70'}`} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Fallback Text Slides */
                                    <div className="relative h-[280px] sm:h-[380px] flex items-center px-6 sm:px-10">
                                        <div className="relative z-10 max-w-xl">
                                            <span className={`text-sm uppercase tracking-widest ${fallbackSlides[current].accent} font-medium`}>
                                                {fallbackSlides[current].subtitle}
                                            </span>
                                            <h1 className="text-3xl sm:text-5xl font-black text-white mt-2 mb-3 leading-tight">
                                                {fallbackSlides[current].title}
                                            </h1>
                                            <p className="text-gray-300 text-base sm:text-lg mb-6">
                                                {fallbackSlides[current].desc}
                                            </p>
                                            <div className="flex gap-3">
                                                <a href="#booking-section" className="px-6 py-3 bg-copper text-white font-semibold rounded-lg hover:bg-copper-dark transition-colors">Đặt lịch ngay</a>
                                                <a href={`tel:${config.store_branches[0]?.phone || '0932242026'}`} className="px-6 py-3 border border-gray-500 text-white font-semibold rounded-lg hover:border-copper hover:text-copper transition-colors">Gọi tư vấn</a>
                                            </div>
                                        </div>
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 bg-copper/5 rounded-full blur-3xl" />
                                        <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center z-10"><ChevronLeft size={20} /></button>
                                        <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center z-10"><ChevronRight size={20} /></button>
                                    </div>
                                )}
                                {/* Dots for fallback */}
                                {!hasBanners && (
                                    <div className="flex justify-center gap-2 pb-4">
                                        {fallbackSlides.map((_, i) => (
                                            <button key={i} onClick={() => setCurrent(i)} className={`transition-all duration-300 rounded-full ${i === current ? 'w-8 h-2 bg-copper' : 'w-2 h-2 bg-gray-600 hover:bg-gray-400'}`} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>{/* end 2-column flex */}

                    {/* Trust Badges */}
                    <div className="bg-white rounded-b-xl overflow-hidden">
                        <div className="px-4 py-5">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {trustBadges.map((badge, i) => (
                                    <div key={i} className="flex items-center gap-3 px-3">
                                        <div className="text-copper flex-shrink-0">{badge.icon}</div>
                                        <div>
                                            <span className="block text-sm font-bold text-dark">{badge.title}</span>
                                            <span className="block text-xs text-gray-500">{badge.desc}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>{/* end rounded-xl */}
            </div>{/* end max-w Container */}
        </section>
    );
}
