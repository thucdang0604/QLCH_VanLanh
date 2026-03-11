'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Home, LayoutGrid, Headphones, ClipboardList, User,
    X, Phone, MessageCircle, MapPin,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';

// Zalo SVG icon - compact inline
function ZaloIcon({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
            <path d="M24 2C11.85 2 2 11.85 2 24s9.85 22 22 22 22-9.85 22-22S36.15 2 24 2z" fill="#0068FF" />
            <path d="M33.5 15H14.5c-.83 0-1.5.67-1.5 1.5v12c0 .83.67 1.5 1.5 1.5H20l4 4 4-4h5.5c.83 0 1.5-.67 1.5-1.5v-12c0-.83-.67-1.5-1.5-1.5z" fill="#fff" />
            <text x="17" y="26" fill="#0068FF" fontSize="10" fontWeight="bold" fontFamily="Arial">Za</text>
        </svg>
    );
}

// Contact options
const contactOptions = [
    {
        id: 'zalo',
        label: 'Chat Zalo',
        icon: <ZaloIcon size={24} />,
        bgColor: 'bg-blue-500',
        textColor: 'text-white',
        type: 'link' as const,
        href: 'https://zalo.me/0932242026',
    },
    {
        id: 'hotline',
        label: 'Gọi Hotline',
        icon: <Phone size={22} />,
        bgColor: 'bg-red-500',
        textColor: 'text-white',
        type: 'link' as const,
        href: 'tel:0932242026',
    },
    {
        id: 'chat',
        label: 'Chat trực tiếp',
        icon: <MessageCircle size={22} />,
        bgColor: 'bg-orange-500',
        textColor: 'text-white',
        type: 'action' as const,
    },
    {
        id: 'map',
        label: 'Chỉ đường',
        icon: <MapPin size={22} />,
        bgColor: 'bg-green-500',
        textColor: 'text-white',
        type: 'link' as const,
        href: 'https://maps.app.goo.gl/oHjSM6ztw4ExyfwJA',
    },
];

export default function MobileBottomNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useAuth();
    const { config } = useConfig();
    const [showContactMenu, setShowContactMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Update contact options dynamically from config
    const contactInfo = config.contact_info;
    const mainPhone = contactInfo?.main_phone || config.store_branches?.[0]?.phone || '0932242026';
    const mapLink = contactInfo?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contactInfo.address)}` : (config.store_branches?.[0]?.mapLink || 'https://maps.app.goo.gl/681NguyenKiem');

    const dynamicOptions = contactOptions.map((opt) => {
        if (opt.id === 'hotline') return { ...opt, href: `tel:${mainPhone}` };
        if (opt.id === 'zalo') return { ...opt, href: contactInfo?.zalo_link || `https://zalo.me/${mainPhone}` };
        if (opt.id === 'map') return { ...opt, href: mapLink };
        return opt;
    });

    // Close menu when clicking outside
    useEffect(() => {
        if (!showContactMenu) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowContactMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showContactMenu]);

    // Close menu on route change
    useEffect(() => {
        setShowContactMenu(false);
    }, [pathname]);

    const handleContactOptionClick = (optId: string) => {
        if (optId === 'chat') {
            // Dispatch custom event to open ChatWidget
            window.dispatchEvent(new CustomEvent('open-chat-widget'));
        }
        setShowContactMenu(false);
    };

    const isActive = (path: string) => pathname === path;

    return (
        <>
            {/* Contact Action Sheet Backdrop */}
            {showContactMenu && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden animate-[fadeIn_0.2s_ease]"
                    onClick={() => setShowContactMenu(false)}
                />
            )}

            {/* Contact Action Sheet */}
            <div ref={menuRef} className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
                {showContactMenu && (
                    <div className="mx-4 mb-20 animate-[slideUp_0.3s_ease]">
                        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
                            {/* Header */}
                            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Headphones size={18} className="text-copper" />
                                    <span className="font-semibold text-dark text-sm">Liên hệ hỗ trợ</span>
                                </div>
                                <button
                                    onClick={() => setShowContactMenu(false)}
                                    className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                                >
                                    <X size={18} className="text-gray-500" />
                                </button>
                            </div>

                            {/* Options Grid */}
                            <div className="grid grid-cols-4 gap-2 p-4">
                                {dynamicOptions.map((opt, i) => (
                                    opt.type === 'link' ? (
                                        <a
                                            key={opt.id}
                                            href={opt.href}
                                            target={opt.id === 'zalo' || opt.id === 'map' ? '_blank' : undefined}
                                            rel={opt.id === 'zalo' || opt.id === 'map' ? 'noopener noreferrer' : undefined}
                                            onClick={() => setShowContactMenu(false)}
                                            className="flex flex-col items-center gap-2 py-3 rounded-xl hover:bg-gray-50 transition-colors"
                                            style={{ animationDelay: `${i * 50}ms` }}
                                        >
                                            <div className={`w-12 h-12 ${opt.bgColor} ${opt.textColor} rounded-full flex items-center justify-center shadow-md`}>
                                                {opt.icon}
                                            </div>
                                            <span className="text-xs text-gray-700 font-medium text-center leading-tight">{opt.label}</span>
                                        </a>
                                    ) : (
                                        <button
                                            key={opt.id}
                                            onClick={() => handleContactOptionClick(opt.id)}
                                            className="flex flex-col items-center gap-2 py-3 rounded-xl hover:bg-gray-50 transition-colors"
                                            style={{ animationDelay: `${i * 50}ms` }}
                                        >
                                            <div className={`w-12 h-12 ${opt.bgColor} ${opt.textColor} rounded-full flex items-center justify-center shadow-md`}>
                                                {opt.icon}
                                            </div>
                                            <span className="text-xs text-gray-700 font-medium text-center leading-tight">{opt.label}</span>
                                        </button>
                                    )
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Bottom Nav Bar */}
                <nav className="bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center justify-around h-16">
                        {/* 1. Trang chủ */}
                        <Link
                            href="/"
                            className={`flex flex-col items-center justify-center py-1 min-w-[56px] transition-colors ${isActive('/') ? 'text-copper' : 'text-gray-500'}`}
                        >
                            <Home size={22} />
                            <span className={`text-[10px] mt-1 ${isActive('/') ? 'font-semibold' : ''}`}>
                                Trang chủ
                            </span>
                        </Link>

                        {/* 2. Danh mục */}
                        <Link
                            href="/category/all"
                            className={`flex flex-col items-center justify-center py-1 min-w-[56px] transition-colors ${pathname?.startsWith('/category') ? 'text-copper' : 'text-gray-500'}`}
                        >
                            <LayoutGrid size={22} />
                            <span className={`text-[10px] mt-1 ${pathname?.startsWith('/category') ? 'font-semibold' : ''}`}>
                                Danh mục
                            </span>
                        </Link>

                        {/* 3. CENTER BUTTON - Liên hệ */}
                        <button
                            onClick={() => setShowContactMenu(!showContactMenu)}
                            className="flex flex-col items-center justify-center -mt-5 relative"
                        >
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${showContactMenu
                                ? 'bg-gray-700 rotate-45 scale-95'
                                : 'bg-gradient-to-br from-copper to-copper-dark scale-100'
                                }`}>
                                {showContactMenu ?
                                    <X size={26} className="text-white" /> :
                                    <Headphones size={26} className="text-white" />
                                }
                            </div>
                            <span className={`text-[10px] font-medium mt-1 ${showContactMenu ? 'text-gray-700' : 'text-copper'}`}>
                                {showContactMenu ? 'Đóng' : 'Liên hệ'}
                            </span>
                        </button>

                        {/* 4. Tra cứu */}
                        <Link
                            href="/tracking"
                            className={`flex flex-col items-center justify-center py-1 min-w-[56px] transition-colors ${pathname?.startsWith('/tracking') ? 'text-copper' : 'text-gray-500'}`}
                        >
                            <ClipboardList size={22} />
                            <span className={`text-[10px] mt-1 ${pathname?.startsWith('/tracking') ? 'font-semibold' : ''}`}>
                                Tra cứu
                            </span>
                        </Link>

                        {/* 5. Quản trị — chỉ hiển thị khi là admin hoặc staff */}
                        {user && (user.role === 'admin' || user.role === 'staff') && (
                            <Link
                                href="/admin"
                                className={`flex flex-col items-center justify-center py-1 min-w-[56px] transition-colors ${pathname?.startsWith('/admin') ? 'text-copper' : 'text-gray-500'}`}
                            >
                                <User size={22} />
                                <span className={`text-[10px] mt-1 ${pathname?.startsWith('/admin') ? 'font-semibold' : ''}`}>
                                    Quản trị
                                </span>
                            </Link>
                        )}
                    </div>
                </nav>
            </div>

        </>
    );
}
