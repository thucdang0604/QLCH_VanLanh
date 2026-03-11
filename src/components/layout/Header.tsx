'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    Search, ShoppingCart, Phone, Menu, X, MapPin,
    Smartphone, Monitor, Wrench, Headphones as HeadphonesIcon,
    ClipboardList,
} from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import { useCart } from '@/lib/CartContext';

/* ── Main navigation — 4 items only ── */
const mainNav = [
    { label: 'Máy mới', href: '/category/may-moi', icon: Smartphone },
    { label: 'Máy cũ giá rẻ', href: '/category/may-cu', icon: Monitor },
    { label: 'Sửa chữa - Bảo hành', href: '/category/sua-chua', icon: Wrench },
    { label: 'Phụ kiện', href: '/category/phu-kien', icon: HeadphonesIcon },
];

export default function Header() {
    const pathname = usePathname();
    const router = useRouter();
    const { config, formatHotline } = useConfig();
    const { items: cartItems } = useCart();
    const [searchQuery, setSearchQuery] = useState('');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const mainPhone = config.contact_info?.main_phone || config.store_branches?.[0]?.phone || '0932242026';
    const storeName = config.siteName || 'Văn Lành Services';
    const cartCount = cartItems.reduce((sum: number, item: any) => sum + (item.quantity || 1), 0);

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
        <header className="sticky top-0 z-30">
            {/* Wrapper matches content width: max-w-[1200px] */}
            <div className="max-w-[1200px] mx-auto px-2 md:px-4">

                {/* ── Main header bar (white, rounded) ── */}
                <div className="bg-white text-gray-800 rounded-b-xl overflow-hidden shadow-md border border-gray-100">
                    <div className="flex items-center h-20 px-4 gap-3">
                        {/* Logo — 20% width */}
                        <Link href="/" className="flex-shrink-0 w-[20%] max-w-[200px]">
                            {config.logoUrl ? (
                                <img
                                    src={config.logoUrl}
                                    alt={storeName}
                                    className="h-20 w-auto object-contain"
                                />
                            ) : (
                                <span className="text-lg font-bold text-copper whitespace-nowrap">
                                    {storeName}
                                </span>
                            )}
                        </Link>

                        {/* Search — desktop */}
                        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md">
                            <div className="relative w-full">
                                <input
                                    type="text"
                                    placeholder="Tìm sản phẩm, dịch vụ..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full h-10 pl-3 pr-9 rounded-lg text-sm text-gray-800 bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-copper/30 focus:border-copper transition-colors"
                                />
                                <button type="submit" className="absolute right-0 top-0 h-10 w-10 flex items-center justify-center text-gray-400 hover:text-copper transition-colors">
                                    <Search size={16} />
                                </button>
                            </div>
                        </form>

                        {/* Right actions */}
                        <div className="flex items-center gap-0.5 ml-auto text-xs">
                            <a href={`tel:${mainPhone}`} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-copper/10 text-copper font-semibold hover:bg-copper/20 transition-colors">
                                <Phone size={13} />
                                <span className="whitespace-nowrap">{formatHotline(mainPhone)}</span>
                            </a>
                            <Link href="/tracking" className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-copper hover:bg-gray-50 transition-colors">
                                <ClipboardList size={15} />
                                <span>Tra cứu</span>
                            </Link>
                            <Link href="/info/gioi-thieu" className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-copper hover:bg-gray-50 transition-colors">
                                <MapPin size={15} />
                                <span>Cửa hàng</span>
                            </Link>
                            <Link href="/cart" className="relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-gray-600 hover:text-copper hover:bg-gray-50 transition-colors">
                                <ShoppingCart size={15} />
                                <span className="hidden sm:inline">Giỏ hàng</span>
                                {cartCount > 0 && (
                                    <span className="absolute -top-0.5 left-4 sm:static bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-0.5">
                                        {cartCount > 9 ? '9+' : cartCount}
                                    </span>
                                )}
                            </Link>
                            <button
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                                className="md:hidden p-1.5 rounded-lg text-gray-600 hover:text-copper hover:bg-gray-50 transition-colors"
                            >
                                {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                            </button>
                        </div>
                    </div>

                    {/* ── Desktop nav strip ── */}
                    <nav className="hidden md:block border-t border-gray-100 bg-gray-50">
                        <ul className="flex items-center h-9 w-full">
                            {mainNav.map((item) => {
                                const Icon = item.icon;
                                const active = isActive(item.href);
                                return (
                                    <li key={item.href} className="flex-1">
                                        <Link
                                            href={item.href}
                                            className={`flex items-center justify-center gap-1.5 h-9 text-[13px] font-medium transition-colors
                                                ${active ? 'text-copper bg-copper/5 border-b-2 border-copper' : 'text-gray-600 hover:text-copper hover:bg-gray-100'}`}
                                        >
                                            <Icon size={14} />
                                            {item.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>
                </div>
            </div>

            {/* ── Mobile menu (slide-down) ── */}
            {mobileMenuOpen && (
                <>
                    <div className="fixed inset-0 top-[50px] bg-black/40 z-20 md:hidden" onClick={() => setMobileMenuOpen(false)} />
                    <div className="max-w-[1200px] mx-auto px-2 md:px-4 relative z-30 md:hidden">
                        <div className="bg-white rounded-b-xl shadow-xl overflow-hidden animate-[slideDown_0.2s_ease]">
                            {/* Mobile Search */}
                            <form onSubmit={handleSearch} className="p-3 border-b">
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Tìm sản phẩm, dịch vụ..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full h-9 pl-3 pr-9 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:border-copper"
                                    />
                                    <button type="submit" className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-gray-400">
                                        <Search size={15} />
                                    </button>
                                </div>
                            </form>
                            <ul className="py-1">
                                {mainNav.map((item) => {
                                    const Icon = item.icon;
                                    const active = isActive(item.href);
                                    return (
                                        <li key={item.href}>
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
                                    <Phone size={11} /> {formatHotline(mainPhone)}
                                </a>
                                <Link href="/tracking" className="flex items-center gap-1">
                                    <ClipboardList size={11} /> Tra cứu
                                </Link>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </header>
    );
}
