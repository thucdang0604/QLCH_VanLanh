'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
    Search, ShoppingCart, Phone, Menu, X, MapPin,
    ClipboardList,
} from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import { useCart } from '@/lib/CartContext';
import { getIcon } from '@/lib/icon-map';
import { getBusinessIdentity } from '@/lib/businessIdentity';
import TrackingModal from '@/components/TrackingModal';

export default function Header() {
    const pathname = usePathname();
    const router = useRouter();
    const { config, formatHotline } = useConfig();
    const { items: cartItems, setIsDrawerOpen } = useCart();
    const [searchQuery, setSearchQuery] = useState('');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);

    /* ── Dynamic nav from config ── */
    const mainNav = (config.headerNav || [])
        .filter(i => i.visible)
        .sort((a, b) => a.order - b.order)
        .map(i => ({ id: i.id, label: i.label, href: `/category/${i.slug}`, icon: getIcon(i.iconName) }));


    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 60);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const identity = getBusinessIdentity(config);
    const mainPhone = identity.mainPhone;
    const storeName = identity.siteName;
    const cartCount = cartItems.reduce((sum: number, item: { quantity?: number }) => sum + (item.quantity || 1), 0);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery('');
            setMobileMenuOpen(false);
        }
    };

    const isActive = (href: string) => pathname?.startsWith(href);

    return (
        <header className="sticky top-0 z-30 w-full transition-all duration-300">
            {/* ── Main header bar — full width ── */}
            <div 
                className={`w-full border-b border-gray-100 transition-all duration-300 ${scrolled ? 'shadow-md' : ''}`}
                style={{ backgroundColor: config.headerBg || '#ffffff' }}
            >
                <div className="max-w-[1200px] mx-auto">
                <div className={`flex items-center gap-3 px-4 md:px-4 transition-all duration-300 ${scrolled ? 'h-14' : 'h-20'}`}>

                    {/* Logo */}
                    <Link href="/" className="flex-shrink-0">
                        {config.logoUrl ? (
                            <Image
                                src={config.logoUrl}
                                alt={storeName}
                                width={160}
                                height={64}
                                quality={80}
                                priority
                                style={{ width: 'auto' }}
                                className={`object-contain transition-all duration-300 ${scrolled ? 'h-9' : 'h-16'}`}
                            />
                        ) : (
                            <span className={`font-bold text-copper whitespace-nowrap transition-all duration-300 ${scrolled ? 'text-base' : 'text-lg'}`}>
                                {storeName}
                            </span>
                        )}
                    </Link>

                    {/* Search — desktop */}
                    <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-lg mx-4">
                        <div className="relative w-full">
                            <input
                                type="text"
                                placeholder="Tìm sản phẩm, dịch vụ..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-10 pl-3 pr-9 rounded-lg text-sm text-gray-800 bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-copper/30 focus:border-copper transition-colors"
                            />
                            <button type="submit" aria-label="Tìm kiếm" className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-gray-400 hover:text-copper transition-colors">
                                <Search size={16} />
                            </button>
                        </div>
                    </form>

                    {/* Right actions */}
                    <div className="flex items-center gap-0.5 ml-auto text-xs">
                        <a href={`tel:${mainPhone}`} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-copper/10 text-copper font-semibold hover:bg-copper/20 transition-colors">
                            <Phone size={13} />
                            <span className="whitespace-nowrap">{identity.formattedPhone || formatHotline(mainPhone)}</span>
                        </a>
                        <button onClick={() => setIsTrackingModalOpen(true)} className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-copper hover:bg-gray-50 transition-colors">
                            <ClipboardList size={15} />
                            <span>Tra cứu</span>
                        </button>
                        <Link href="/info/gioi-thieu" className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-copper hover:bg-gray-50 transition-colors">
                            <MapPin size={15} />
                            <span>Cửa hàng</span>
                        </Link>
                        <button onClick={(e) => { e.preventDefault(); setIsDrawerOpen(true); }} aria-label="Giỏ hàng" className="relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-copper hover:bg-gray-50 transition-colors">
                            <ShoppingCart size={15} />
                            <span className="hidden sm:inline">Giỏ hàng</span>
                            {cartCount > 0 && (
                                <span className="absolute -top-0.5 left-4 sm:static bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-0.5">
                                    {cartCount > 9 ? '9+' : cartCount}
                                </span>
                            )}
                        </button>
                        <button
                            title={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label={mobileMenuOpen ? 'Đóng menu' : 'Mở menu'}
                            aria-expanded={mobileMenuOpen}
                            className="md:hidden p-1.5 rounded-lg text-gray-600 hover:text-copper hover:bg-gray-50 transition-colors"
                        >
                            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                    </div>
                </div>{/* .flex */}
                </div>{/* max-w */}
            </div>

            {/* ── Mobile Search Bar — Always visible ── */}
            <div 
                className={`md:hidden w-full px-4 py-2.5 border-b border-gray-100 transition-all duration-300 ${scrolled ? 'shadow-md' : ''}`}
                style={{ backgroundColor: config.headerBg || '#ffffff' }}
            >
                <form onSubmit={handleSearch} className="w-full">
                    <div className="relative w-full shadow-sm rounded-lg">
                        <input
                            type="text"
                            placeholder="Bạn cần tìm gì hôm nay?"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 pl-4 pr-10 rounded-lg text-sm text-gray-800 bg-gray-50 border border-gray-200 focus:outline-none focus:ring-1 focus:ring-copper/50 focus:border-copper transition-all"
                        />
                        <button type="submit" aria-label="Tìm kiếm" className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-gray-500 hover:text-copper transition-colors">
                            <Search size={18} />
                        </button>
                    </div>
                </form>
            </div>

            {/* ── Desktop nav strip — full width bg, centered inner ── */}
            <nav 
                className="hidden md:block w-full border-b border-gray-200"
                style={{ backgroundColor: config.headerBg || '#f9fafb' }} // #f9fafb is gray-50
            >
                <div className="max-w-[1200px] mx-auto">
                <ul className="flex items-center h-10 px-4">
                    {mainNav.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href);
                        return (
                            <li key={item.id} className="flex-1">
                                <Link
                                    href={item.href}
                                    className={`flex items-center justify-center gap-1.5 h-10 text-[13px] font-medium transition-colors
                                        ${active ? 'text-copper bg-copper/5 border-b-2 border-copper' : 'text-gray-600 hover:text-copper hover:bg-gray-100'}`}
                                >
                                    <Icon size={14} />
                                    {item.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
                </div>{/* max-w */}
            </nav>

            {/* ── Mobile menu ── */}
            {mobileMenuOpen && (
                <>
                    <div className="fixed inset-0 top-[50px] bg-black/40 z-20 md:hidden" onClick={() => setMobileMenuOpen(false)} />
                    <div className="w-full relative z-30 md:hidden">
                        <div className="shadow-xl overflow-hidden" style={{ backgroundColor: config.headerBg || '#ffffff' }}>
                            <ul className="py-1">
                                {mainNav.map((item) => {
                                    const Icon = item.icon;
                                    const active = isActive(item.href);
                                    return (
                                        <li key={item.id}>
                                            <Link
                                                href={item.href}
                                                onClick={() => setMobileMenuOpen(false)}
                                                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors
                                                    ${active ? 'text-copper bg-copper/5' : 'text-gray-700 hover:bg-gray-50'}`}
                                            >
                                                <Icon size={15} className={active ? 'text-copper' : 'text-gray-400'} />
                                                {item.label}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="border-t px-4 py-2 flex items-center gap-4 text-xs text-gray-500">
                                <a href={`tel:${mainPhone}`} className="flex items-center gap-1">
                                    <Phone size={11} /> {identity.formattedPhone || formatHotline(mainPhone)}
                                </a>
                                <button onClick={() => { setMobileMenuOpen(false); setIsTrackingModalOpen(true); }} className="flex items-center gap-1">
                                    <ClipboardList size={11} /> Tra cứu
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
            
            <TrackingModal isOpen={isTrackingModalOpen} onClose={() => setIsTrackingModalOpen(false)} />
        </header>
    );
}
