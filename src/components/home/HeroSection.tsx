'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ChevronRight as ChevronR, Shield, Clock, Award, Wrench } from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import type { HeroBanner, StoreBranch } from '@/lib/ConfigContext';
import { getIcon } from '@/lib/icon-map';
import Link from 'next/link';


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
function SidebarItem({ item }: { item: { name: string; slug: string; iconName: string; subGroups: Array<{ group: string; items: string[] }> } }) {
    const [showFlyout, setShowFlyout] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const Icon = getIcon(item.iconName);

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
                <span className="text-gray-400 group-hover:text-copper transition-colors flex-shrink-0"><Icon size={18} /></span>
                <span className="flex-1 font-medium truncate">{item.name}</span>
                <ChevronR size={14} className="text-gray-300 group-hover:text-copper transition-colors flex-shrink-0" />
            </Link>

            {/* Flyout Submenu */}
            {showFlyout && item.subGroups.length > 0 && (
                <div
                    className="absolute left-full top-0 z-50 ml-0 w-[480px] bg-white rounded-r-xl shadow-2xl border border-gray-100 p-5 animate-[fadeIn_0.15s_ease-in-out]"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    <div className="grid grid-cols-2 gap-5">
                        {item.subGroups.map((group, gi) => (
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

interface HeroSectionProps {
    initialBanners?: HeroBanner[];
    storeBranches?: StoreBranch[];
}

export default function HeroSection({ initialBanners, storeBranches }: HeroSectionProps) {
    const { config, loading } = useConfig();
    const [current, setCurrent] = useState(0);
    const [imgError, setImgError] = useState<Record<string, boolean>>({});
    // Defer non-first banner images to client mount so PageSpeed only discovers the LCP image
    const [mounted, setMounted] = useState(false);

    // Ưu tiên dùng initialBanners (từ SSR), fallback về config (client-side) khi đã load xong
    const heroBanners = (initialBanners && initialBanners.length > 0)
        ? initialBanners
        : (config.hero_banners || []);
    const hasBanners = heroBanners.length > 0;
    const totalSlides = hasBanners ? heroBanners.length : fallbackSlides.length;

    // Lấy phone từ storeBranches SSR hoặc config client
    const fallbackPhone = storeBranches?.[0]?.phone || config.store_branches?.[0]?.phone || '0932242026';

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        // Delay auto-rotation 10s so Lighthouse sees a stable viewport (SI fix)
        let intervalId: ReturnType<typeof setInterval>;
        const delayId = setTimeout(() => {
            intervalId = setInterval(() => {
                setCurrent((prev) => (prev + 1) % totalSlides);
            }, 15000);
        }, 10000);
        return () => {
            clearTimeout(delayId);
            clearInterval(intervalId);
        };
    }, [totalSlides]);

    const prev = () => setCurrent((c) => (c - 1 + totalSlides) % totalSlides);
    const next = () => setCurrent((c) => (c + 1) % totalSlides);

    // Chỉ hiện skeleton nếu KHÔNG có initialBanners (SSR) VÀ client config đang loading
    if (!initialBanners?.length && loading) return <BannerSkeleton />;

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
                                    {(config.sidebarMenu || [])
                                        .filter(i => i.visible)
                                        .sort((a, b) => a.order - b.order)
                                        .map((cat) => (
                                        <SidebarItem key={cat.slug} item={cat} />
                                    ))}
                                </nav>
                            </div>
                        </div>

                        {/* ── Banner Slider (75%) ── */}
                        <div className="flex-1 min-w-0 relative bg-dark overflow-hidden rounded-tr-xl">
                            <div className="px-0">
                                {hasBanners ? (
                                    <div className="relative h-[280px] sm:h-[380px]">
                                        {heroBanners.map((banner, i) => {
                                            const isFirst = i === 0;
                                            // SSR: render first slide only.
                                            // Client: render current + next slide (for smooth transition preload).
                                            // All other slides stay as placeholder → reduces bandwidth contention.
                                            const isCurrentOrNext = i === current || i === (current + 1) % heroBanners.length;
                                            const shouldRenderImage = isFirst || (mounted && isCurrentOrNext);
                                            const finalSrc = banner.imageUrl;

                                            return (
                                            <div key={banner.id} className={`absolute inset-0 ${isFirst ? '' : 'transition-opacity duration-700'} ${i === current ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
                                                {!shouldRenderImage ? (
                                                    <div className="w-full h-full bg-dark" />
                                                ) : banner.link ? (
                                                    <a href={banner.link} className="block w-full h-full">
                                                        {imgError[banner.id] ? (
                                                            <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-500 text-lg">Banner</div>
                                                        ) : banner.width && banner.height ? (
                                                                <Image
                                                                    src={finalSrc}
                                                                    alt={banner.alt || 'Banner Văn Lành Service'}
                                                                    width={banner.width}
                                                                    height={banner.height}
                                                                    priority={isFirst}
                                                                    fetchPriority={isFirst ? "high" : "auto"}
                                                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 867px"
                                                                    quality={60}
                                                                    unoptimized={isFirst}
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                    {...(isFirst ? { decoding: "sync" } : {})}
                                                                    onError={() => setImgError(prev => ({ ...prev, [banner.id]: true }))}
                                                                />
                                                        ) : (
                                                            <Image
                                                                src={finalSrc}
                                                                alt={banner.alt || 'Banner Văn Lành Service'}
                                                                fill
                                                                priority={isFirst}
                                                                fetchPriority={isFirst ? "high" : "auto"}
                                                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 867px"
                                                                quality={60}
                                                                unoptimized={isFirst}
                                                                className="object-cover"
                                                                {...(isFirst ? { decoding: "sync" } : {})}
                                                                onError={() => setImgError(prev => ({ ...prev, [banner.id]: true }))}
                                                            />
                                                        )}
                                                    </a>
                                                ) : (
                                                    imgError[banner.id] ? (
                                                        <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-500 text-lg">Banner</div>
                                                    ) : banner.width && banner.height ? (
                                                        <Image
                                                            src={finalSrc}
                                                            alt={banner.alt || 'Banner Văn Lành Service'}
                                                            width={banner.width}
                                                            height={banner.height}
                                                            priority={isFirst}
                                                            fetchPriority={isFirst ? "high" : "auto"}
                                                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 867px"
                                                            quality={60}
                                                            unoptimized={isFirst}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            {...(isFirst ? { decoding: "sync" } : {})}
                                                            onError={() => setImgError(prev => ({ ...prev, [banner.id]: true }))}
                                                        />
                                                    ) : (
                                                        <Image
                                                            src={finalSrc}
                                                            alt={banner.alt || 'Banner Văn Lành Service'}
                                                            fill
                                                            priority={isFirst}
                                                            fetchPriority={isFirst ? "high" : "auto"}
                                                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 75vw, 867px"
                                                            quality={60}
                                                            unoptimized={isFirst}
                                                            className="object-cover"
                                                            {...(isFirst ? { decoding: "sync" } : {})}
                                                            onError={() => setImgError(prev => ({ ...prev, [banner.id]: true }))}
                                                        />
                                                    )
                                                )}
                                            </div>
                                            );
                                        })}
                                        {/* Arrows */}
                                        {heroBanners.length > 1 && (
                                            <>
                                                <button onClick={prev} aria-label="Ảnh trước" className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center z-20"><ChevronLeft size={20} /></button>
                                                <button onClick={next} aria-label="Ảnh tiếp theo" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center z-20"><ChevronRight size={20} /></button>
                                            </>
                                        )}
                                        {/* Dots */}
                                        {heroBanners.length > 1 && (
                                            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-20">
                                                {heroBanners.map((_, i) => (
                                                    <button key={i} onClick={() => setCurrent(i)} aria-label={`Chuyển đến slide ${i + 1}`} className={`w-3 h-3 p-2 box-content rounded-full transition-[transform,opacity] duration-300 ${i === current ? 'scale-x-[2.5] opacity-100 bg-copper' : 'scale-100 opacity-50 bg-white hover:opacity-70'}`} />
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
                                                <a href={`tel:${fallbackPhone}`} className="px-6 py-3 border border-gray-500 text-white font-semibold rounded-lg hover:border-copper hover:text-copper transition-colors">Gọi tư vấn</a>
                                            </div>
                                        </div>
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-64 h-64 sm:w-96 sm:h-96 bg-copper/5 rounded-full blur-3xl" />
                                        <button onClick={prev} aria-label="Ảnh trước" className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center z-10"><ChevronLeft size={20} /></button>
                                        <button onClick={next} aria-label="Ảnh tiếp theo" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center z-10"><ChevronRight size={20} /></button>
                                    </div>
                                )}
                                {/* Dots for fallback */}
                                {!hasBanners && (
                                    <div className="flex justify-center gap-2 pb-4">
                                        {fallbackSlides.map((_, i) => (
                                            <button key={i} onClick={() => setCurrent(i)} aria-label={`Chuyển đến slide ${i + 1}`} className={`w-3 h-3 p-2 box-content rounded-full transition-[transform,opacity] duration-300 ${i === current ? 'scale-x-[2.5] opacity-100 bg-copper' : 'scale-100 opacity-50 bg-gray-600 hover:opacity-70'}`} />
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
                                            <span className="block text-xs text-gray-600">{badge.desc}</span>
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
