'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
    LayoutGrid, Headphones, ClipboardList, User,
    X, Phone, MessageCircle, MapPin, CalendarClock,
    Newspaper, ChevronRight
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { getBusinessIdentity } from '@/lib/businessIdentity';
import TrackingModal from '@/components/TrackingModal';
import { getIcon } from '@/lib/icon-map';
import type { SidebarMenuItem } from '@/lib/config-defaults';

const BookingSection = dynamic(() => import('@/components/home/BookingSection'), {
    ssr: false,
    loading: () => <div className="h-[420px] animate-pulse rounded-xl bg-gray-900" />,
});

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
        href: '',
    },
    {
        id: 'hotline',
        label: 'Gọi Hotline',
        icon: <Phone size={22} />,
        bgColor: 'bg-red-500',
        textColor: 'text-white',
        type: 'link' as const,
        href: '',
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
        href: '',
    },
];

export default function MobileBottomNav() {
    const pathname = usePathname();

    const { user } = useAuth();
    const { config } = useConfig();
    const [showContactMenu, setShowContactMenu] = useState(false);
    const [showCategoryMenu, setShowCategoryMenu] = useState(false);
    const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const categoryMenuRef = useRef<HTMLDivElement>(null);
    const [activeCategoryId, setActiveCategoryId] = useState<string>('');

    // Extract categories for sidebar
    const categories = config.sidebarMenu || [];
    const visibleCategories = categories.filter((cat: SidebarMenuItem) => cat.visible !== false);

    // Update contact options dynamically from config
    const identity = getBusinessIdentity(config);
    const mainPhone = identity.mainPhone;
    const mapLink = identity.mapLink;

    const dynamicOptions = contactOptions.map((opt) => {
        if (opt.id === 'hotline') return { ...opt, href: `tel:${mainPhone}` };
        if (opt.id === 'zalo') return { ...opt, href: identity.socials.zaloLink };
        if (opt.id === 'map') return { ...opt, href: mapLink };
        return opt;
    });
    const isAdminOrStaff = user && (user.role === 'admin' || user.role === 'staff');

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (showContactMenu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowContactMenu(false);
            }
            if (showCategoryMenu && categoryMenuRef.current && !categoryMenuRef.current.contains(e.target as Node)) {
                setShowCategoryMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showContactMenu, showCategoryMenu]);

    // Close menu on route change
    useEffect(() => {
        // We intentionally close a local UI menu when the route changes.
        setShowContactMenu(false);
        setShowCategoryMenu(false);
        setIsBookingModalOpen(false);
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
            {/* Category Sidebar Backdrop */}
            {showCategoryMenu && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-[fadeIn_0.2s_ease]"
                    onClick={() => setShowCategoryMenu(false)}
                />
            )}

            {/* Category Sidebar (Right to Left) */}
            <div
                ref={categoryMenuRef}
                className={`fixed top-0 right-0 h-full w-[90vw] md:w-[500px] bg-white z-50 shadow-2xl lg:hidden transform transition-transform duration-300 flex flex-col ${
                    showCategoryMenu ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="px-4 py-4 border-b flex items-center justify-between bg-white z-10">
                    <div className="flex items-center gap-2">
                        <span className="text-copper">🔧</span>
                        <span className="font-bold text-dark text-lg">Danh mục dịch vụ</span>
                    </div>
                    <button
                        aria-label="Đóng danh mục dịch vụ"
                        title="Đóng danh mục dịch vụ"
                        onClick={() => setShowCategoryMenu(false)}
                        className="p-1.5 hover:bg-gray-200 rounded-full transition-colors"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* 2-Pane Body */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left Pane (Parent Categories) */}
                    <div className="w-[100px] md:w-[140px] bg-gray-50 overflow-y-auto flex-shrink-0 border-r border-gray-100">
                        {visibleCategories.map((cat: SidebarMenuItem) => {
                            const Icon = getIcon(cat.iconName);
                            const isActiveCat = (activeCategoryId || visibleCategories[0]?.id) === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setActiveCategoryId(cat.id)}
                                    className={`w-full flex flex-col items-center gap-1.5 p-3 text-center transition-colors border-b border-gray-100 last:border-0 ${
                                        isActiveCat ? 'bg-white border-l-4 border-l-copper' : 'hover:bg-gray-100 border-l-4 border-l-transparent'
                                    }`}
                                >
                                    <span className={`text-lg flex-shrink-0 ${isActiveCat ? 'text-copper' : 'text-gray-500'}`}>
                                        <Icon size={24} />
                                    </span>
                                    <span className={`text-[11px] md:text-xs leading-tight ${isActiveCat ? 'font-semibold text-copper' : 'text-gray-600'}`}>
                                        {cat.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Right Pane (SubGroups) */}
                    <div className="flex-1 overflow-y-auto bg-white p-4">
                        {(() => {
                            const activeCat = visibleCategories.find(c => c.id === (activeCategoryId || visibleCategories[0]?.id));
                            if (!activeCat) return null;

                            return (
                                <div className="space-y-6">
                                    {/* View All Header */}
                                    <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                        <h3 className="font-bold text-gray-800 text-sm md:text-base">{activeCat.name}</h3>
                                        <Link 
                                            href={activeCat.isCustomLink ? activeCat.slug : `/category/${activeCat.slug}`}
                                            onClick={() => setShowCategoryMenu(false)}
                                            className="text-xs text-copper font-medium hover:underline flex items-center"
                                        >
                                            Xem tất cả <ChevronRight size={14} />
                                        </Link>
                                    </div>

                                    {/* Sub Groups */}
                                    {activeCat.subGroups && activeCat.subGroups.length > 0 ? (
                                        <div className="space-y-5">
                                            {activeCat.subGroups.map((group, gi: number) => (
                                                <div key={gi}>
                                                    <h4 className="text-xs font-bold text-gray-800 uppercase mb-3">{group.group}</h4>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {group.items.map((sub: string, si: number) => (
                                                            <Link
                                                                key={si}
                                                                href={activeCat.isCustomLink ? activeCat.slug : `/category/${activeCat.slug}`}
                                                                onClick={() => setShowCategoryMenu(false)}
                                                                className="text-[13px] text-gray-600 hover:text-copper border border-gray-200 rounded-lg px-2 py-2 text-center truncate hover:border-copper transition-colors bg-gray-50/50"
                                                            >
                                                                {sub}
                                                            </Link>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-gray-500 text-sm">
                                            Đang cập nhật...
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            {/* Contact Action Sheet Backdrop */}
            {showContactMenu && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-[fadeIn_0.2s_ease]"
                    onClick={() => setShowContactMenu(false)}
                />
            )}

            {/* Contact Action Sheet */}
            <div ref={menuRef} className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
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
                                    aria-label="Đóng menu liên hệ"
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
                        {/* 1. Danh mục (Sidebar) */}
                        <button
                            onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                            className={`flex flex-col items-center justify-center py-2 min-w-[56px] transition-colors ${showCategoryMenu ? 'text-copper' : 'text-gray-500'}`}
                        >
                            <LayoutGrid size={22} />
                            <span className={`text-[10px] mt-1 ${showCategoryMenu ? 'font-semibold' : ''}`}>
                                Danh mục
                            </span>
                        </button>

                        {/* 2. Bài viết */}
                        <Link
                            href="/tin-tuc"
                            className={`flex flex-col items-center justify-center py-2 min-w-[56px] transition-colors ${isActive('/tin-tuc') ? 'text-copper' : 'text-gray-500'}`}
                        >
                            <Newspaper size={22} />
                            <span className={`text-[10px] mt-1 ${isActive('/tin-tuc') ? 'font-semibold' : ''}`}>
                                Bài viết
                            </span>
                        </Link>

                        {/* 3. CENTER BUTTON - Liên hệ or Quản trị */}
                        {!isAdminOrStaff ? (
                            <button
                                onClick={() => setShowContactMenu(!showContactMenu)}
                                aria-label={showContactMenu ? 'Đóng liên hệ' : 'Mở liên hệ'}
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
                        ) : (
                            <Link
                                href="/admin"
                                className="flex flex-col items-center justify-center -mt-5 relative"
                            >
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${pathname?.startsWith('/admin') ? 'bg-copper-dark scale-95' : 'bg-gradient-to-br from-copper to-copper-dark scale-100'}`}>
                                    <User size={26} className="text-white" />
                                </div>
                                <span className={`text-[10px] font-medium mt-1 ${pathname?.startsWith('/admin') ? 'text-gray-700' : 'text-copper'}`}>
                                    Quản trị
                                </span>
                            </Link>
                        )}

                        {/* 4. Đặt lịch */}
                        <button
                            type="button"
                            onClick={() => {
                                setShowCategoryMenu(false);
                                setShowContactMenu(false);
                                setIsBookingModalOpen(true);
                            }}
                            className={`flex min-w-[56px] flex-col items-center justify-center py-2 transition-colors ${isBookingModalOpen ? 'text-copper' : 'text-gray-500'}`}
                        >
                            <CalendarClock size={22} />
                            <span className={`mt-1 text-[10px] ${isBookingModalOpen ? 'font-semibold' : ''}`}>
                                Đặt lịch
                            </span>
                        </button>

                        {/* 5. Tra cứu */}
                        <button
                            type="button"
                            onClick={() => setIsTrackingModalOpen(true)}
                            className={`flex flex-col items-center justify-center py-2 min-w-[56px] transition-colors ${isTrackingModalOpen ? 'text-copper' : 'text-gray-500'}`}
                        >
                            <ClipboardList size={22} />
                            <span className={`text-[10px] mt-1 ${isTrackingModalOpen ? 'font-semibold' : ''}`}>
                                Tra cứu
                            </span>
                        </button>
                    </div>
                </nav>
            </div>

            {isBookingModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-end bg-black/60 px-3 pb-[calc(env(safe-area-inset-bottom)+84px)] pt-6 lg:hidden md:items-center md:justify-center md:px-6 md:pb-6">
                    <button
                        type="button"
                        aria-label="Đóng đặt lịch"
                        className="absolute inset-0 cursor-default"
                        onClick={() => setIsBookingModalOpen(false)}
                    />
                    <div className="relative w-full max-w-2xl animate-[slideUp_0.25s_ease]">
                        <div className="mb-2 flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-lg">
                            <div>
                                <p className="text-sm font-bold text-gray-900">Đặt lịch online</p>
                                <p className="text-xs text-gray-500">Chọn thời gian, chi nhánh và gửi thông tin hẹn.</p>
                            </div>
                            <button
                                type="button"
                                aria-label="Đóng đặt lịch"
                                onClick={() => setIsBookingModalOpen(false)}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <BookingSection variant="modal" />
                    </div>
                </div>
            )}

            <TrackingModal isOpen={isTrackingModalOpen} onClose={() => setIsTrackingModalOpen(false)} />
        </>
    );
}
