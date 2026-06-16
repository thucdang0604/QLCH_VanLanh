export type PermissionId =
    | 'manage_products'
    | 'manage_orders'
    | 'manage_repairs'
    | 'manage_services'
    | 'manage_articles'
    | 'view_revenue'
    | 'chat_support'
    | 'view_commissions'
    | 'view_dashboard'
    | 'manage_inventory'
    | 'manage_reviews'
    | 'manage_ai_creator'
    | 'manage_staff'
    | 'manage_appearance'
    | 'manage_settings'
    | 'manage_customers'
    | 'manage_discounts';

export type AdminIconKey =
    | 'dashboard'
    | 'revenue'
    | 'pos'
    | 'orders'
    | 'appointments'
    | 'repairs'
    | 'technician'
    | 'services'
    | 'products'
    | 'parts'
    | 'stock'
    | 'inventoryImport'
    | 'suppliers'
    | 'customers'
    | 'articles'
    | 'chat'
    | 'reviews'
    | 'aiCreator'
    | 'staff'
    | 'commissions'
    | 'appearance'
    | 'settings';

export type AdminBadgeKey =
    | 'orders'
    | 'appointments'
    | 'repairs'
    | 'technician'
    | 'chats'
    | 'reviews';

export interface PermissionDefinition {
    id: PermissionId;
    label: string;
    group: string;
}

export interface AdminRouteItem {
    label: string;
    href: string;
    iconKey: AdminIconKey;
    permission: PermissionId;
    badgeKey?: AdminBadgeKey;
}

export interface AdminNavGroup {
    id: string;
    label: string;
    items: AdminRouteItem[];
}

export interface AdminRolePreset {
    id: string;
    label: string;
    description: string;
    permissions: PermissionId[];
}

export const PERMISSIONS_REGISTRY: PermissionDefinition[] = [
    { id: 'view_dashboard', label: 'Xem Dashboard', group: 'Tổng quan' },
    { id: 'view_revenue', label: 'Xem Doanh thu', group: 'Tổng quan' },
    { id: 'manage_orders', label: 'Quản lý Đơn hàng & POS', group: 'Bán hàng' },
    { id: 'manage_repairs', label: 'Quản lý Sửa chữa', group: 'Sửa chữa' },
    { id: 'manage_services', label: 'Quản lý Dịch vụ', group: 'Sửa chữa' },
    { id: 'manage_products', label: 'Quản lý Sản phẩm', group: 'Kho hàng' },
    { id: 'manage_inventory', label: 'Quản lý Tồn kho & Nhập hàng', group: 'Kho hàng' },
    { id: 'manage_customers', label: 'Quản lý Khách hàng CRM', group: 'Khách hàng & CSKH' },
    { id: 'chat_support', label: 'Chat & CSKH', group: 'Khách hàng & CSKH' },
    { id: 'manage_reviews', label: 'Quản lý Đánh giá', group: 'Khách hàng & CSKH' },
    { id: 'manage_articles', label: 'Quản lý Bài viết', group: 'Quản trị' },
    { id: 'manage_ai_creator', label: 'AI Creator', group: 'Quản trị' },
    { id: 'manage_staff', label: 'Quản lý Nhân viên', group: 'Quản trị' },
    { id: 'view_commissions', label: 'Xem Hoa hồng', group: 'Quản trị' },
    { id: 'manage_appearance', label: 'Quản lý Giao diện & Biên nhận', group: 'Quản trị' },
    { id: 'manage_discounts', label: 'Quản lý Giảm giá & Cấp bậc', group: 'Quản trị' },
    { id: 'manage_settings', label: 'Cài đặt Hệ thống', group: 'Quản trị' },
];

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
    {
        id: 'overview',
        label: 'Tổng quan',
        items: [
            { label: 'Dashboard', href: '/admin', iconKey: 'dashboard', permission: 'view_dashboard' },
            { label: 'Doanh thu', href: '/admin/revenue', iconKey: 'revenue', permission: 'view_revenue' },
        ],
    },
    {
        id: 'sales',
        label: 'Bán hàng',
        items: [
            { label: 'Bán hàng (POS)', href: '/admin/pos', iconKey: 'pos', permission: 'manage_orders' },
            { label: 'Đơn hàng', href: '/admin/orders', iconKey: 'orders', permission: 'manage_orders', badgeKey: 'orders' },
            { label: 'Đặt lịch', href: '/admin/appointments', iconKey: 'appointments', permission: 'manage_orders', badgeKey: 'appointments' },
            { label: 'Voucher', href: '/admin/vouchers', iconKey: 'settings', permission: 'manage_discounts' },
        ],
    },
    {
        id: 'repair',
        label: 'Sửa chữa',
        items: [
            { label: 'Sửa chữa', href: '/admin/repairs', iconKey: 'repairs', permission: 'manage_repairs', badgeKey: 'repairs' },
            { label: 'Kỹ thuật viên', href: '/admin/technician', iconKey: 'technician', permission: 'manage_repairs', badgeKey: 'technician' },
            { label: 'Dịch vụ', href: '/admin/services', iconKey: 'services', permission: 'manage_services' },
        ],
    },
    {
        id: 'inventory',
        label: 'Kho hàng',
        items: [
            { label: 'Sản phẩm bán lẻ', href: '/admin/products', iconKey: 'products', permission: 'manage_products' },
            { label: 'Kho linh kiện', href: '/admin/parts', iconKey: 'parts', permission: 'manage_inventory' },
            { label: 'Tồn kho', href: '/admin/inventory/stock', iconKey: 'stock', permission: 'manage_inventory' },
            { label: 'Nhập hàng', href: '/admin/inventory', iconKey: 'inventoryImport', permission: 'manage_inventory' },
            { label: 'Nhà cung cấp', href: '/admin/suppliers', iconKey: 'suppliers', permission: 'manage_inventory' },
        ],
    },
    {
        id: 'customer-care',
        label: 'Khách hàng & CSKH',
        items: [
            { label: 'Khách hàng', href: '/admin/customers', iconKey: 'customers', permission: 'manage_customers' },
            { label: 'Live Chat', href: '/admin/chat', iconKey: 'chat', permission: 'chat_support', badgeKey: 'chats' },
            { label: 'Đánh giá', href: '/admin/reviews', iconKey: 'reviews', permission: 'manage_reviews', badgeKey: 'reviews' },
        ],
    },
    {
        id: 'system',
        label: 'Quản trị',
        items: [
            { label: 'Bài viết', href: '/admin/articles', iconKey: 'articles', permission: 'manage_articles' },
            { label: 'AI Creator', href: '/admin/ai-creator', iconKey: 'aiCreator', permission: 'manage_ai_creator' },
            { label: 'Nhân viên', href: '/admin/staff', iconKey: 'staff', permission: 'manage_staff' },
            { label: 'Hoa hồng', href: '/admin/commissions', iconKey: 'commissions', permission: 'view_commissions' },
            { label: 'Giao diện', href: '/admin/appearance', iconKey: 'appearance', permission: 'manage_appearance' },
            { label: 'Cài đặt', href: '/admin/settings', iconKey: 'settings', permission: 'manage_settings' },
        ],
    },
];

export const ADMIN_HIDDEN_ROUTE_ITEMS: AdminRouteItem[] = [
    { label: 'Mẫu biên nhận', href: '/admin/settings/receipt', iconKey: 'settings', permission: 'manage_appearance' },
];

export const ADMIN_ROUTE_ITEMS: AdminRouteItem[] = [
    ...ADMIN_NAV_GROUPS.flatMap((group) => group.items),
    ...ADMIN_HIDDEN_ROUTE_ITEMS,
];

export const ROUTE_PERMISSION_MAP: Record<string, PermissionId> = Object.fromEntries(
    ADMIN_ROUTE_ITEMS.map((item) => [item.href, item.permission])
) as Record<string, PermissionId>;

export const ADMIN_BADGE_ROUTE_MAP: Record<string, AdminBadgeKey> = Object.fromEntries(
    ADMIN_ROUTE_ITEMS
        .filter((item): item is AdminRouteItem & { badgeKey: AdminBadgeKey } => Boolean(item.badgeKey))
        .map((item) => [item.href, item.badgeKey])
) as Record<string, AdminBadgeKey>;

export const ADMIN_ROLE_PRESETS: AdminRolePreset[] = [
    {
        id: 'cashier',
        label: 'Thu ngân',
        description: 'Bán POS, xử lý đơn hàng và đặt lịch.',
        permissions: ['manage_orders'],
    },
    {
        id: 'technician',
        label: 'KTV',
        description: 'Theo dõi và xử lý phiếu sửa chữa được giao.',
        permissions: ['manage_repairs'],
    },
    {
        id: 'warehouse',
        label: 'Kho',
        description: 'Quản lý sản phẩm, linh kiện, tồn kho, nhập hàng và nhà cung cấp.',
        permissions: ['manage_products', 'manage_inventory'],
    },
    {
        id: 'customer-care',
        label: 'CSKH',
        description: 'Quản lý khách hàng, chat, đặt lịch và đánh giá.',
        permissions: ['manage_customers', 'manage_orders', 'chat_support', 'manage_reviews'],
    },
    {
        id: 'content',
        label: 'Content',
        description: 'Quản lý bài viết, giao diện nội dung và AI Creator.',
        permissions: ['manage_articles', 'manage_appearance', 'manage_ai_creator'],
    },
];

export function getMatchedAdminRoute(path: string): AdminRouteItem | undefined {
    return [...ADMIN_ROUTE_ITEMS]
        .sort((a, b) => b.href.length - a.href.length)
        .find((item) => path === item.href || path.startsWith(`${item.href}/`));
}

export function canStaffAccess(path: string, permissions?: string[]): boolean {
    if (!permissions || permissions.length === 0) return false;
    const matchedRoute = getMatchedAdminRoute(path);
    if (!matchedRoute) return false;
    return permissions.includes(matchedRoute.permission);
}

export function findFirstAccessibleRoute(permissions?: string[]): string {
    if (!permissions || permissions.length === 0) return '/admin/login';

    for (const item of ADMIN_NAV_GROUPS.flatMap((group) => group.items)) {
        if (permissions.includes(item.permission)) {
            return item.href;
        }
    }

    for (const item of ADMIN_HIDDEN_ROUTE_ITEMS) {
        if (permissions.includes(item.permission)) {
            return item.href;
        }
    }

    return '/admin/login';
}
