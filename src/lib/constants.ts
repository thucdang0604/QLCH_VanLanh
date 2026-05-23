export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://qlch-vanlanh.web.app';
export const PART_CATEGORY = 'component'; // System ID for parts
export const PART_CATEGORY_LABEL = 'Linh kiện'; // Display label for parts
export const RETAIL_CATEGORIES = ['Phone', 'Laptop', 'Tablet', 'Audio', 'Watch', 'Accessory', PART_CATEGORY] as const;
export type RetailCategory = typeof RETAIL_CATEGORIES[number];

// Helper to standardize checking if a product is a part/component
export const isPartCategory = (category?: string, categoryIds?: string[]): boolean => {
    if (!category && (!categoryIds || categoryIds.length === 0)) return false;
    const catLower = (category || '').toLowerCase();
    if (catLower === PART_CATEGORY || catLower === 'linh kiện' || catLower === 'linh-kien') return true;
    if (categoryIds && categoryIds.length > 0) {
        const firstCatId = categoryIds[0].toLowerCase();
        if (firstCatId.startsWith('linh-kien') || firstCatId === 'component') return true;
    }
    return false;
};
