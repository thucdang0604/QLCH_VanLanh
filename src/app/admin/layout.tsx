'use client';

import { useState, ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    Package,
    Wrench,
    ShoppingCart,
    FileText,
    MessageSquare,
    Sparkles,
    Palette,
    Settings,
    LogOut,
    Menu,
    X,
    Search,
    User,
    ShieldAlert,
    Loader2,
    Calendar,
    BarChart3,
    ShoppingBag,
    ArrowDownToLine,
    Award,
    Warehouse,
    Star
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import NotificationBell from '@/components/admin/NotificationBell';

// Menu Groups with Permissions
const menuGroups = [
    {
        groupName: 'Tổng quan',
        items: [
            { name: 'Dashboard', href: '/admin', icon: LayoutDashboard, permission: null, roles: ['admin'] },
            { name: 'Doanh thu', href: '/admin/revenue', icon: BarChart3, permission: 'admin_only', roles: ['admin'] },
        ]
    },
    {
        groupName: 'Cửa hàng',
        items: [
            { name: 'Bán hàng (POS)', href: '/admin/pos', icon: ShoppingBag, permission: 'manage_orders' },
            { name: 'Đơn hàng', href: '/admin/orders', icon: ShoppingCart, permission: 'manage_orders' },
            { name: 'Đặt lịch', href: '/admin/appointments', icon: Calendar, permission: 'manage_orders' },
        ]
    },
    {
        groupName: 'Sửa chữa & Dịch vụ',
        items: [
            { name: 'Sửa chữa', href: '/admin/repairs', icon: Wrench, permission: 'manage_repairs' },
            { name: 'Kỹ thuật viên', href: '/admin/technician', icon: Wrench, permission: 'manage_repairs' },
            { name: 'Dịch vụ', href: '/admin/services', icon: Sparkles, permission: 'manage_services' },
        ]
    },
    {
        groupName: 'Kho hàng',
        items: [
            { name: 'Sản phẩm bán lẻ', href: '/admin/products', icon: Package, permission: 'manage_products' },
            { name: 'Kho linh kiện', href: '/admin/parts', icon: Warehouse, permission: 'manage_products' },
            { name: 'Tồn kho', href: '/admin/inventory/stock', icon: Warehouse, permission: 'admin_only', roles: ['admin'] },
            { name: 'Nhập hàng', href: '/admin/inventory', icon: ArrowDownToLine, permission: 'admin_only', roles: ['admin'] },
        ]
    },
    {
        groupName: 'Nội dung & CSKH',
        items: [
            { name: 'Bài viết', href: '/admin/articles', icon: FileText, permission: 'manage_articles', roles: ['admin'] },
            { name: 'Live Chat', href: '/admin/chat', icon: MessageSquare, permission: 'chat_support' },
            { name: 'Đánh giá', href: '/admin/reviews', icon: Star, permission: 'admin_only', roles: ['admin'] },
            { name: 'AI Creator', href: '/admin/ai-creator', icon: Sparkles, permission: 'admin_only', roles: ['admin'] },
        ]
    },
    {
        groupName: 'Hệ thống',
        items: [
            { name: 'Nhân viên', href: '/admin/staff', icon: User, permission: 'admin_only' },
            { name: 'Hoa hồng', href: '/admin/commissions', icon: Award, permission: 'admin_only', roles: ['admin'] },
            { name: 'Giao diện', href: '/admin/appearance', icon: Palette, permission: 'admin_only', roles: ['admin'] },
            { name: 'CĐ Sửa chữa', href: '/admin/settings/repairs', icon: Settings, permission: 'admin_only', roles: ['admin'] },
            { name: 'Mẫu Biên Nhận', href: '/admin/settings/receipt', icon: FileText, permission: 'admin_only', roles: ['admin'] },
            { name: 'Cài đặt', href: '/admin/settings', icon: Settings, permission: 'admin_only', roles: ['admin'] },
        ]
    }
];

// Routes that staff users are allowed to access
const staffAllowedRoutes = [
    '/admin/orders',
    '/admin/repairs',
    '/admin/chat',
    '/admin/products',
    '/admin/parts',
    '/admin/services',
    '/admin/appointments',
    '/admin/pos',
    '/admin/commissions',
    '/admin/technician',
];

export default function AdminLayout({ children }: { children: ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { user, loading, logout } = useAuth();

    // Protected Route Logic
    useEffect(() => {
        if (!loading) {
            // Allow access to login page
            if (pathname === '/admin/login') {
                if (user && (user.role === 'admin' || user.role === 'staff')) {
                    // Already logged in? Redirect to dashboard
                    router.push('/admin');
                }
                return;
            }

            if (!user) {
                // Not logged in -> redirect to login
                router.push('/admin/login');
            } else if (user.role !== 'admin' && user.role !== 'staff') {
                // Logged in but not admin/staff -> redirect to home with message and logout
                alert('Bạn không có quyền truy cập trang quản trị!');
                logout().then(() => router.push('/admin/login'));
            }
        }
    }, [user, loading, router, pathname]);

    // ✅ Login page always renders directly — no auth guard, no spinner
    if (pathname === '/admin/login') {
        return <>{children}</>;
    }

    // For all other admin pages: block rendering until auth is confirmed
    if (loading || !user || (user.role !== 'admin' && user.role !== 'staff')) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-orange-500" size={40} />
                    <p className="text-gray-500">Đang kiểm tra quyền truy cập...</p>
                </div>
            </div>
        );
    }

    const handleLogout = async () => {
        await logout();
        router.push('/');
    };

    // Filter menu groups based on user role and permissions
    const filteredMenuGroups = menuGroups.map(group => {
        const filteredItems = group.items.map(item => ({
            ...item,
            label: item.name,
        })).filter(item => {
            // Role-based filter: if item has `roles`, user must be in that list
            if (item.roles && !item.roles.includes(user?.role || '')) return false;
            // Permission-based filter (legacy)
            if (user?.role !== 'admin') {
                if (item.permission === 'admin_only') return false;
                if (item.permission && !user?.permissions?.includes(item.permission)) return false;
            }
            return true;
        });

        return { ...group, items: filteredItems };
    }).filter(group => group.items.length > 0);

    // ── Strict RBAC: Block staff from unauthorized routes ──
    const isStaffBlocked = user.role === 'staff' && !staffAllowedRoutes.some(route => pathname.startsWith(route));

    if (isStaffBlocked) {
        return (
            <div className="flex min-h-screen bg-gray-100">
                {/* Keep sidebar visible so they can navigate to allowed routes */}
                {/* Sidebar omitted for simplicity — render access denied in main area */}
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center bg-white rounded-2xl shadow-lg p-10 max-w-md mx-4">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <ShieldAlert size={40} className="text-red-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Truy cập bị từ chối</h2>
                        <p className="text-gray-500 mb-6">Bạn không có quyền truy cập vào chức năng này.</p>
                        <button
                            onClick={() => router.push('/admin/repairs')}
                            className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors"
                        >
                            ← Quay lại trang chính
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-gray-100">
            {/* Overlay for mobile */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                    }`}
            >
                <div className="h-full flex flex-col">
                    {/* Logo */}
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
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Nav Items */}
                    <div className="flex-1 overflow-y-auto py-6 px-3 space-y-5">
                        {filteredMenuGroups.map((group, groupIdx) => (
                            <div key={groupIdx} className="space-y-1">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider px-3 mb-1.5">
                                    {group.groupName}
                                </p>
                                {group.items.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== '/admin');

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
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
                                        </Link>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* User Profile - Fixed at bottom */}
                    <div className="p-4 border-t border-gray-100">
                        <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-orange-600 shadow-sm font-bold border border-gray-100">
                                {user?.displayName?.[0] || 'A'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                    {user?.displayName}
                                </p>
                                <p className="text-xs text-gray-500 truncate capitalize">
                                    {user?.role}
                                </p>
                            </div>
                            <button
                                onClick={() => handleLogout()} // Changed to handleLogout
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Đăng xuất"
                            >
                                <LogOut size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Header */}
                <header className="sticky top-0 z-30 bg-white shadow-sm h-16 px-4 md:px-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="lg:hidden p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            <Menu size={24} />
                        </button>

                        {/* Search */}
                        <div className="hidden md:block relative">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Tìm kiếm..."
                                className="w-80 h-10 pl-10 pr-4 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Notifications */}
                        <NotificationBell />

                        {/* User */}
                        <div className="flex items-center gap-3 pl-3 border-l text-right">
                            <div className="hidden md:block">
                                <p className="text-sm font-medium text-gray-800">{user?.displayName || 'Admin'}</p>
                                <p className="text-xs text-gray-500">{user?.email}</p>
                            </div>
                            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center overflow-hidden">
                                {user?.photoURL ? (
                                    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <User size={20} className="text-orange-600" />
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
