// Centralized Permissions Registry for QLCH_VanLanh

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
  | 'manage_settings';

export interface PermissionDefinition {
    id: PermissionId;
    label: string;
}

export const PERMISSIONS_REGISTRY: PermissionDefinition[] = [
    { id: 'view_dashboard', label: 'Xem Dashboard' },
    { id: 'view_revenue', label: 'Xem Doanh thu' },
    { id: 'manage_orders', label: 'Quản lý Đơn hàng & POS' },
    { id: 'manage_repairs', label: 'Quản lý Sửa chữa' },
    { id: 'manage_services', label: 'Quản lý Dịch vụ' },
    { id: 'manage_products', label: 'Quản lý Sản phẩm' },
    { id: 'manage_inventory', label: 'Quản lý Tồn kho & Nhập hàng' },
    { id: 'manage_articles', label: 'Quản lý Bài viết' },
    { id: 'chat_support', label: 'Chat & CSKH' },
    { id: 'manage_reviews', label: 'Quản lý Đánh giá' },
    { id: 'manage_ai_creator', label: 'AI Creator' },
    { id: 'manage_staff', label: 'Quản lý Nhân viên' },
    { id: 'view_commissions', label: 'Xem Hoa hồng' },
    { id: 'manage_appearance', label: 'Quản lý Giao diện & Biên nhận' },
    { id: 'manage_settings', label: 'Cài đặt Hệ thống' },
];

export const ROUTE_PERMISSION_MAP: Record<string, PermissionId> = {
    '/admin': 'view_dashboard',
    '/admin/revenue': 'view_revenue',
    '/admin/pos': 'manage_orders',
    '/admin/orders': 'manage_orders',
    '/admin/appointments': 'manage_orders',
    '/admin/repairs': 'manage_repairs',
    '/admin/technician': 'manage_repairs',
    '/admin/services': 'manage_services',
    '/admin/products': 'manage_products',
    '/admin/parts': 'manage_products',
    '/admin/inventory/stock': 'manage_inventory',
    '/admin/inventory': 'manage_inventory',
    '/admin/articles': 'manage_articles',
    '/admin/chat': 'chat_support',
    '/admin/reviews': 'manage_reviews',
    '/admin/ai-creator': 'manage_ai_creator',
    '/admin/staff': 'manage_staff',
    '/admin/commissions': 'view_commissions',
    '/admin/appearance': 'manage_appearance',
    '/admin/settings/repairs': 'manage_appearance',
    '/admin/settings/receipt': 'manage_appearance',
    '/admin/settings/integrations': 'manage_settings',
    '/admin/settings': 'manage_settings',
};

/**
 * Checks if a staff user has the required permission for a specific route.
 * @param path The current route pathname
 * @param permissions Array of permissions the user holds
 * @returns boolean indicating access
 */
export function canStaffAccess(path: string, permissions?: string[]): boolean {
    if (!permissions || permissions.length === 0) return false;
    
    // Sort routes by length descending so longest prefix matches first
    // e.g., '/admin/settings/repairs' matches before '/admin/settings' or '/admin'
    const matchedRoute = Object.keys(ROUTE_PERMISSION_MAP)
        .sort((a, b) => b.length - a.length)
        .find(route => path.startsWith(route));
    
    // If route isn't mapped to a permission, deny by default
    if (!matchedRoute) return false; 
    
    const requiredPermission = ROUTE_PERMISSION_MAP[matchedRoute];
    return permissions.includes(requiredPermission);
}

/**
 * Finds the first valid route a staff member can access based on their permissions.
 * Used to avoid redirection loops when they don't have access to the main dashboard.
 * @param permissions Array of permissions the user holds
 * @returns string The path of the first accessible route, or fallback
 */
export function findFirstAccessibleRoute(permissions?: string[]): string {
    if (!permissions || permissions.length === 0) return '/admin/login';

    // Look for the first route that matches any of the user's permissions
    for (const [route, reqPerm] of Object.entries(ROUTE_PERMISSION_MAP)) {
        if (permissions.includes(reqPerm)) {
            return route;
        }
    }

    return '/admin/login'; // No valid routes found
}
