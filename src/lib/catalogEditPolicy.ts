export type CatalogEditorRole = 'admin' | 'staff' | 'customer' | undefined;
export type CatalogPermissionScope = 'products' | 'parts' | 'services';
export type CatalogFieldPermissions = Partial<Record<CatalogPermissionScope, string[]>>;

export type ProductEditableField =
    | 'name'
    | 'price_original'
    | 'price_promo'
    | 'category'
    | 'subCategory'
    | 'categoryIds'
    | 'brand'
    | 'description'
    | 'stock'
    | 'status'
    | 'condition'
    | 'isFlashSale'
    | 'quality'
    | 'partType'
    | 'supplier'
    | 'images';

export type ServiceEditableField =
    | 'name'
    | 'description'
    | 'price_original'
    | 'price_promo'
    | 'hidePrice'
    | 'device_model'
    | 'category'
    | 'categoryIds'
    | 'linkedProductCategoryIds'
    | 'recommendedPartCategoryIds'
    | 'isActive'
    | 'warranty_text'
    | 'repair_time'
    | 'seoDescription'
    | 'tags'
    | 'images';

interface CatalogFieldPermissionGroup {
    scope: CatalogPermissionScope;
    modulePermission: 'manage_products' | 'manage_inventory' | 'manage_services';
    title: string;
    fields: Array<{ id: string; label: string }>;
}

/** Fields that an admin may explicitly let a staff member revise after data exists. */
export const CATALOG_FIELD_PERMISSION_GROUPS: CatalogFieldPermissionGroup[] = [
    {
        scope: 'products',
        modulePermission: 'manage_products',
        title: 'Sản phẩm',
        fields: [
            { id: 'name', label: 'Tên sản phẩm' },
            { id: 'price_original', label: 'Giá gốc' },
            { id: 'price_promo', label: 'Giá khuyến mãi' },
            { id: 'categoryIds', label: 'Danh mục' },
            { id: 'brand', label: 'Thương hiệu' },
            { id: 'description', label: 'Mô tả' },
            { id: 'condition', label: 'Tình trạng' },
            { id: 'status', label: 'Trạng thái hiển thị' },
            { id: 'isFlashSale', label: 'Flash Sale' },
            { id: 'images', label: 'Hình ảnh' },
        ],
    },
    {
        scope: 'parts',
        modulePermission: 'manage_inventory',
        title: 'Linh kiện',
        fields: [
            { id: 'name', label: 'Tên linh kiện' },
            { id: 'categoryIds', label: 'Danh mục' },
            { id: 'description', label: 'Dòng máy tương thích' },
            { id: 'quality', label: 'Phân loại / chất lượng' },
            { id: 'partType', label: 'Loại linh kiện (bảo hành)' },
            { id: 'price_original', label: 'Giá vốn' },
            { id: 'price_promo', label: 'Giá bán / giá thay thế' },
            { id: 'status', label: 'Trạng thái hoạt động' },
            { id: 'images', label: 'Hình ảnh' },
        ],
    },
    {
        scope: 'services',
        modulePermission: 'manage_services',
        title: 'Dịch vụ',
        fields: [
            { id: 'name', label: 'Tên dịch vụ' },
            { id: 'description', label: 'Mô tả' },
            { id: 'device_model', label: 'Dòng máy hỗ trợ' },
            { id: 'price_original', label: 'Giá dịch vụ' },
            { id: 'price_promo', label: 'Giá khuyến mãi' },
            { id: 'hidePrice', label: 'Ẩn giá phía khách hàng' },
            { id: 'categoryIds', label: 'Danh mục' },
            { id: 'linkedProductCategoryIds', label: 'Nhóm sản phẩm bán kèm' },
            { id: 'recommendedPartCategoryIds', label: 'Nhóm linh kiện liên quan' },
            { id: 'warranty_text', label: 'Bảo hành' },
            { id: 'repair_time', label: 'Thời gian sửa' },
            { id: 'seoDescription', label: 'Mô tả SEO' },
            { id: 'tags', label: 'Tags' },
            { id: 'isActive', label: 'Trạng thái hoạt động' },
            { id: 'images', label: 'Hình ảnh' },
        ],
    },
];

function hasFieldGrant(grantedFields: readonly string[], field: string): boolean {
    const normalizedField = field === 'category' || field === 'subCategory' ? 'categoryIds' : field;
    return grantedFields.includes(normalizedField);
}

/**
 * A catalog value is considered missing only when it was not stored at all,
 * or is an empty text/list value. Numeric zero and `false` are real data.
 */
export function isCatalogValueMissing(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

export function canCreateCatalogRecord(role: CatalogEditorRole): boolean {
    return role === 'admin';
}

export function canEditProductField(
    role: CatalogEditorRole,
    isEditing: boolean,
    field: ProductEditableField,
    storedValue: unknown,
    grantedFields: readonly string[] = [],
): boolean {
    // Inventory is an operational value. It is never adjusted from catalog forms.
    if (field === 'stock') return false;

    if (!isEditing) return role === 'admin';

    // Supplier is write-once for every role, including admin.
    if (field === 'supplier') return isCatalogValueMissing(storedValue);

    if (role === 'admin') return true;
    if (role !== 'staff') return false;

    // Staff may complete missing values by default; an admin can explicitly grant a revision field.
    return isCatalogValueMissing(storedValue) || hasFieldGrant(grantedFields, field);
}

export function canEditServiceField(
    role: CatalogEditorRole,
    isEditing: boolean,
    field: ServiceEditableField,
    storedValue: unknown,
    grantedFields: readonly string[] = [],
): boolean {
    if (!isEditing) return role === 'admin';
    if (role === 'admin') return true;
    return role === 'staff' && (isCatalogValueMissing(storedValue) || hasFieldGrant(grantedFields, field));
}
