'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfigProvider } from '@/lib/ConfigContext';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { canStaffAccess, findFirstAccessibleRoute, ADMIN_BADGE_ROUTE_MAP, ADMIN_NAV_GROUPS, type AdminIconKey } from '@/lib/adminModules';
import {
    ArrowDownToLine,
    Award,
    BarChart3,
    Building2,
    Calendar,
    FileText,
    LayoutDashboard,
    Loader2,
    LogOut,
    Menu,
    MessageSquare,
    Package,
    Palette,
    Settings,
    ShieldAlert,
    ShoppingBag,
    ShoppingCart,
    Sparkles,
    Star,
    User,
    Users,
    Warehouse,
    Wrench,
    X,
    type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import NotificationBell from '@/components/admin/NotificationBell';
import { Toaster } from 'sonner';
import { toastError } from '@/lib/toast';
import { useAdminBadges } from '@/lib/useAdminBadges';
import GlobalSearch from '@/components/admin/GlobalSearch';
import PwaInstallPrompt from '@/components/admin/PwaInstallPrompt';
import RefreshWebsiteButton from '@/components/admin/RefreshWebsiteButton';

const iconMap: Record<AdminIconKey, LucideIcon> = {
    dashboard: LayoutDashboard,
    revenue: BarChart3,
    pos: ShoppingBag,
    orders: ShoppingCart,
    appointments: Calendar,
    repairs: Wrench,
    technician: Wrench,
    services: Sparkles,
    products: Package,
    parts: Warehouse,
    stock: Warehouse,
    inventoryImport: ArrowDownToLine,
    suppliers: Building2,
    customers: Users,
    articles: FileText,
    chat: MessageSquare,
    reviews: Star,
    staff: User,
    commissions: Award,
    appearance: Palette,
    settings: Settings,
};

const visibleAdminRouteHrefs = ADMIN_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
const MOBILE_QUICK_ACTIONS_STORAGE_KEY = 'qlch_admin_mobile_quick_actions_v1';
const MAX_MOBILE_QUICK_ACTIONS = 5;
const DEFAULT_MOBILE_QUICK_ACTION_HREFS = [
    '/admin/pos',
    '/admin/repairs',
    '/admin/inventory/stock',
    '/admin/chat',
    '/admin/orders',
];

function isSidebarItemActive(pathname: string, href: string) {
    if (pathname === href) return true;
    if (href === '/admin' || !pathname.startsWith(`${href}/`)) return false;

    const moreSpecificVisibleRoute = visibleAdminRouteHrefs.some((candidate) => (
        candidate !== href &&
        candidate.startsWith(`${href}/`) &&
        (pathname === candidate || pathname.startsWith(`${candidate}/`))
    ));

    return !moreSpecificVisibleRoute;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [mobileQuickHrefs, setMobileQuickHrefs] = useState<string[]>([]);
    const [hasLoadedMobileQuickActions, setHasLoadedMobileQuickActions] = useState(false);
    const [hasStoredMobileQuickActions, setHasStoredMobileQuickActions] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading, logout } = useAuth();

    useEffect(() => {
        if (loading) return;

        if (pathname === '/admin/login') {
            if (user && (user.role === 'admin' || user.role === 'staff')) {
                router.push(user.role === 'staff' ? findFirstAccessibleRoute(user.permissions) : '/admin');
            }
            return;
        }

        if (!user) {
            router.push('/admin/login');
        } else if (user.role !== 'admin' && user.role !== 'staff') {
            toastError('Bạn không có quyền truy cập trang quản trị!');
            logout().then(() => router.push('/admin/login'));
        }
    }, [user, loading, router, pathname, logout]);

    const { badges, activities } = useAdminBadges(user?.uid, user?.role, user?.permissions);

    const badgeMap = useMemo<Record<string, number>>(() => {
        const entries = Object.entries(ADMIN_BADGE_ROUTE_MAP).map(([href, badgeKey]) => [href, badges[badgeKey]]);
        return Object.fromEntries(entries);
    }, [badges]);

    const filteredMenuGroups = useMemo(() => {
        if (!user || (user.role !== 'admin' && user.role !== 'staff')) return [];

        return ADMIN_NAV_GROUPS.map((group) => {
            const filteredItems = group.items.filter((item) => {
                if (user.role === 'admin') return true;
                return user.permissions?.includes(item.permission) ?? false;
            });

            return { ...group, items: filteredItems };
        }).filter((group) => group.items.length > 0);
    }, [user]);

    const availableMobileItems = useMemo(() => (
        filteredMenuGroups.flatMap((group) => group.items)
    ), [filteredMenuGroups]);

    const quickActionItems = useMemo(() => {
        const availableByHref = new Map(availableMobileItems.map((item) => [item.href, item]));
        return mobileQuickHrefs
            .map((href) => availableByHref.get(href))
            .filter((item): item is NonNullable<typeof item> => Boolean(item));
    }, [availableMobileItems, mobileQuickHrefs]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        try {
            const raw = window.localStorage.getItem(MOBILE_QUICK_ACTIONS_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    setMobileQuickHrefs(parsed.filter((href): href is string => typeof href === 'string'));
                    setHasStoredMobileQuickActions(true);
                }
            }
        } catch {
            setHasStoredMobileQuickActions(false);
        } finally {
            setHasLoadedMobileQuickActions(true);
        }
    }, []);

    useEffect(() => {
        if (!hasLoadedMobileQuickActions || availableMobileItems.length === 0) return;

        setMobileQuickHrefs((current) => {
            const allowedHrefs = new Set(availableMobileItems.map((item) => item.href));
            const cleaned = current.filter((href) => allowedHrefs.has(href)).slice(0, MAX_MOBILE_QUICK_ACTIONS);

            if (hasStoredMobileQuickActions) {
                return cleaned.length === current.length && cleaned.every((href, index) => href === current[index])
                    ? current
                    : cleaned;
            }

            const defaults = DEFAULT_MOBILE_QUICK_ACTION_HREFS
                .filter((href) => allowedHrefs.has(href))
                .slice(0, MAX_MOBILE_QUICK_ACTIONS);
            const fallback = defaults.length > 0
                ? defaults
                : availableMobileItems.slice(0, Math.min(4, MAX_MOBILE_QUICK_ACTIONS)).map((item) => item.href);

            return fallback;
        });
    }, [availableMobileItems, hasLoadedMobileQuickActions, hasStoredMobileQuickActions]);

    useEffect(() => {
        if (!hasLoadedMobileQuickActions || typeof window === 'undefined') return;

        try {
            window.localStorage.setItem(MOBILE_QUICK_ACTIONS_STORAGE_KEY, JSON.stringify(mobileQuickHrefs));
        } catch {
            // localStorage may be unavailable on locked-down devices.
        }
    }, [hasLoadedMobileQuickActions, mobileQuickHrefs]);

    if (pathname === '/admin/login') {
        return <ConfigProvider>{children}</ConfigProvider>;
    }

    if (loading || !user || (user.role !== 'admin' && user.role !== 'staff')) {
        return (
            <ConfigProvider>
                <div className="min-h-screen flex items-center justify-center bg-gray-100">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="animate-spin text-orange-500" size={40} />
                        <p className="text-gray-500">Đang kiểm tra quyền truy cập...</p>
                    </div>
                </div>
            </ConfigProvider>
        );
    }

    const handleLogout = async () => {
        await logout();
        router.push('/');
    };

    const toggleMobileQuickAction = (href: string) => {
        setHasStoredMobileQuickActions(true);
        setMobileQuickHrefs((current) => {
            if (current.includes(href)) {
                return current.filter((itemHref) => itemHref !== href);
            }

            return [href, ...current].slice(0, MAX_MOBILE_QUICK_ACTIONS);
        });
    };

    const isStaffBlocked = user.role === 'staff' && !canStaffAccess(pathname, user.permissions);

    if (isStaffBlocked) {
        return (
            <ConfigProvider>
                <div className="flex min-h-screen bg-gray-100">
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center bg-white rounded-2xl shadow-lg p-10 max-w-md mx-4">
                            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <ShieldAlert size={40} className="text-red-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-2">Truy cập bị từ chối</h2>
                            <p className="text-gray-500 mb-6">Bạn không có quyền truy cập vào chức năng này.</p>
                            <button
                                onClick={() => router.push(findFirstAccessibleRoute(user.permissions))}
                                className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors"
                            >
                                Quay lại trang chính
                            </button>
                        </div>
                    </div>
                </div>
            </ConfigProvider>
        );
    }

    return (
        <ConfigProvider>
            <div className="flex min-h-screen bg-gray-100">
                <Toaster position="top-right" richColors closeButton />
                {isSidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                )}

                <aside
                    className="hidden lg:block lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-gray-200"
                >
                    <div className="h-full flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <Link href="/" className="flex items-center gap-2">
                                <div className="bg-orange-500 p-1.5 rounded-lg">
                                    <LayoutDashboard className="text-white" size={20} />
                                </div>
                                <span className="font-bold text-xl text-gray-900">Admin</span>
                            </Link>
                            <button
                                onClick={() => setIsSidebarOpen(false)}
                                className="lg:hidden text-gray-400 hover:text-gray-600"
                                aria-label="Đóng menu"
                                title="Đóng menu"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto py-5 px-3 space-y-4">
                            {filteredMenuGroups.map((group) => (
                                <div key={group.id} className="space-y-1">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider px-3 mb-1.5">
                                        {group.label}
                                    </p>
                                    {group.items.map((item) => {
                                        const Icon = iconMap[item.iconKey];
                                        const isActive = isSidebarItemActive(pathname, item.href);

                                        return (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setIsSidebarOpen(false)}
                                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${isActive
                                                    ? 'bg-orange-50 text-orange-600 font-medium shadow-sm'
                                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                                    }`}
                                            >
                                                <Icon
                                                    size={18}
                                                    className={`transition-colors ${isActive ? 'text-orange-500' : 'text-gray-400 group-hover:text-gray-600'
                                                        }`}
                                                />
                                                <span className="text-sm">{item.label}</span>
                                                {(badgeMap[item.href] ?? 0) > 0 && (
                                                    <span className="ml-auto min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                                                        {badgeMap[item.href] > 99 ? '99+' : badgeMap[item.href]}
                                                    </span>
                                                )}
                                            </Link>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>

                        <div className="p-4 border-t border-gray-100">
                            <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-orange-600 shadow-sm font-bold border border-gray-100">
                                    {user.displayName?.[0] || 'A'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {user.displayName}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate capitalize">
                                        {user.role}
                                    </p>
                                </div>
                                <button
                                    onClick={handleLogout}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Đăng xuất"
                                >
                                    <LogOut size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </aside>

                {isSidebarOpen && (
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Menu quản trị"
                        className="fixed inset-x-0 bottom-0 z-40 lg:hidden bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 max-h-[88dvh] pb-[env(safe-area-inset-bottom)] flex flex-col"
                    >
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shrink-0">
                                    <LayoutDashboard className="text-white" size={20} />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 leading-tight">Admin</p>
                                    <p className="text-xs text-gray-500 truncate">{user.displayName || user.email}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsSidebarOpen(false)}
                                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                                aria-label="Đóng menu"
                                title="Đóng menu"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="px-4 py-3 border-b border-gray-100">
                            <GlobalSearch />
                            <PwaInstallPrompt />
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                            {filteredMenuGroups.map((group) => (
                                <section key={group.id} className="space-y-2">
                                    <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                        {group.label}
                                    </h2>
                                    <div className="grid grid-cols-2 gap-2">
                                        {group.items.map((item) => {
                                            const Icon = iconMap[item.iconKey];
                                            const isActive = isSidebarItemActive(pathname, item.href);
                                            const isPinned = mobileQuickHrefs.includes(item.href);

                                            return (
                                                <div
                                                    key={item.href}
                                                    className={`min-h-[56px] flex items-center rounded-xl border transition-colors ${isActive
                                                        ? 'bg-orange-50 border-orange-200 text-orange-700'
                                                        : 'bg-white border-gray-200 text-gray-700'
                                                        }`}
                                                >
                                                    <Link
                                                        href={item.href}
                                                        onClick={() => setIsSidebarOpen(false)}
                                                        className="min-w-0 flex-1 flex items-center gap-3 px-3 py-2.5"
                                                    >
                                                        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-orange-100 text-orange-600' : 'bg-gray-50 text-gray-500'
                                                            }`}>
                                                            <Icon size={18} />
                                                        </span>
                                                        <span className="text-sm font-medium leading-tight min-w-0">
                                                            {item.label}
                                                        </span>
                                                        {(badgeMap[item.href] ?? 0) > 0 && (
                                                            <span className="ml-auto min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                                                {badgeMap[item.href] > 99 ? '99+' : badgeMap[item.href]}
                                                            </span>
                                                        )}
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleMobileQuickAction(item.href)}
                                                        className={`mr-2 w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${isPinned
                                                            ? 'text-orange-500 bg-orange-100'
                                                            : 'text-gray-300 hover:text-orange-500 hover:bg-orange-50'
                                                            }`}
                                                        aria-label={isPinned ? `Bỏ ghim ${item.label}` : `Ghim ${item.label}`}
                                                        title={isPinned ? 'Bỏ ghim' : 'Ghim xuống lối tắt'}
                                                    >
                                                        <Star size={16} fill={isPinned ? 'currentColor' : 'none'} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                        <div className="border-t border-gray-100 px-4 py-3">
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600"
                            >
                                <LogOut size={18} />
                                Đăng xuất
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 flex flex-col min-w-0">
                    <header className="sticky top-0 z-30 bg-white shadow-sm px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 md:h-16 md:pt-0 md:pb-0 md:px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="w-full md:w-auto flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setIsSidebarOpen(true)}
                                    className="lg:hidden w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-xl"
                                    aria-label="Mở menu"
                                    title="Mở menu"
                                >
                                    <Menu size={24} />
                                </button>

                                <div className="hidden md:block">
                                    <GlobalSearch />
                                </div>
                            </div>

                            <div className="flex items-center gap-3 md:hidden">
                                <RefreshWebsiteButton />
                                <NotificationBell badges={badges} activities={activities} />
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50 text-red-500 border border-red-100"
                                    aria-label="Đăng xuất"
                                    title="Đăng xuất"
                                >
                                    <LogOut size={18} />
                                </button>
                                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center overflow-hidden">
                                    {user.photoURL ? (
                                        <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <User size={20} className="text-orange-600" />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="md:hidden w-full">
                            <GlobalSearch />
                        </div>

                        <div className="hidden md:flex items-center gap-3">
                            <RefreshWebsiteButton />
                            <NotificationBell badges={badges} activities={activities} />

                            <div className="flex items-center gap-3 pl-3 border-l text-right">
                                <div>
                                    <p className="text-sm font-medium text-gray-800">{user.displayName || 'Admin'}</p>
                                    <p className="text-xs text-gray-500">{user.email}</p>
                                </div>
                                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center overflow-hidden">
                                    {user.photoURL ? (
                                        <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <User size={20} className="text-orange-600" />
                                    )}
                                </div>
                            </div>
                        </div>
                    </header>

                    <main className="flex-1 p-4 pb-24 lg:p-8 overflow-y-auto">
                        {children}
                    </main>
                </div>

                {quickActionItems.length > 0 && (
                    <nav
                        className="fixed inset-x-0 bottom-0 z-30 lg:hidden bg-white/95 backdrop-blur border-t border-gray-200 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)]"
                        aria-label="Lối tắt quản trị"
                    >
                        <div className="flex items-stretch gap-2">
                            {quickActionItems.map((item) => {
                                const Icon = iconMap[item.iconKey];
                                const isActive = isSidebarItemActive(pathname, item.href);

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`min-w-0 flex-1 h-14 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${isActive
                                            ? 'bg-orange-50 text-orange-600'
                                            : 'text-gray-500 hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="relative">
                                            <Icon size={18} />
                                            {(badgeMap[item.href] ?? 0) > 0 && (
                                                <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                                    {badgeMap[item.href] > 9 ? '9+' : badgeMap[item.href]}
                                                </span>
                                            )}
                                        </div>
                                        <span className="w-full px-1 text-[10px] font-medium leading-tight text-center truncate">
                                            {item.label}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </nav>
                )}
            </div>
        </ConfigProvider>
    );
}
