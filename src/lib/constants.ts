export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://qlch-vanlanh.web.app';
export const RETAIL_CATEGORIES = ['Phone', 'Laptop', 'Tablet', 'Audio', 'Watch', 'Accessory', 'Linh kiện'] as const;
export type RetailCategory = typeof RETAIL_CATEGORIES[number];
