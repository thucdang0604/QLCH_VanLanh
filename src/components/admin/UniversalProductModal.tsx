'use client';

import { useState, useEffect } from 'react';
import { Loader2, Plus } from 'lucide-react';
import CurrencyInput from '@/components/admin/CurrencyInput';
import { deleteField, orderBy } from 'firebase/firestore';
import { buildCategorySearchKeywords, generateSearchKeywords } from '@/lib/utils';
import { useFirestoreCollection } from '@/lib/useFirestore';
import { triggerRevalidate } from '@/lib/revalidate';
import { normalizeDocId } from '@/lib/idNormalizer';
import { toastError } from '@/lib/toast';
import Modal from '@/components/admin/Modal';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import MediaGalleryField from '@/components/admin/MediaGalleryField';
import type { Product } from '@/lib/types';
import { PART_CATEGORY_LABEL } from '@/lib/constants';
import { buildProductCodeFromId, getPrimaryProductCode, getProductCodeKind } from '@/lib/productCodes';
import { createProductWithCodes, updateProductWithCodes } from '@/lib/productCodeRegistry';
import { useAuth } from '@/lib/AuthContext';
import { canEditProductField, type ProductEditableField } from '@/lib/catalogEditPolicy';
import { normalizeWarrantyRuleKey } from '@/lib/repairWarrantyRules';

// €€ Shared Constants €€

const CONDITIONS = [
    { value: 'new', label: 'Mới 100%' },
    { value: 'like-new', label: 'Cũ 99%' },
    { value: 'used', label: 'Hàng cũ | TBH' },
];
const QUALITY_OPTIONS = ['Zin', 'Loại 1', 'Loại 2', 'Bóc máy'];

export type WarrantyPolicyOption = { id: string; label: string; months: number };

// €€ Props €€
interface UniversalProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** retail = sản phẩm bán lẻ; component = linh kiện */
    mode: 'retail' | 'component';
    /** Truyền product để EDIT; null/undefined = CREATE */
    initialData?: (Product & { id: string }) | null;
    /** Gọi sau khi tạo mới thành công */
    onCreated?: (product: Product & { id: string }) => void;
    /** Gọi sau khi cập nhật thành công */
    onUpdated?: () => void;
    /** Danh sách loại linh kiện từ warranty config (chỉ dùng cho mode component) */
    partTypeOptions?: string[];
    /** Chính sách bảo hành ổn định; thay thế việc nhân viên phải nhớ tên loại linh kiện. */
    warrantyPolicies?: WarrantyPolicyOption[];
    /** Custom label cho nút submit */
    submitLabel?: string;
}

// €€ Retail Form Data €€
interface RetailFormData {
    name: string;
    price_original: number | '';
    price_promo: number | '';
    category: string;
    subCategory: string;
    categoryIds: string[];
    brand: string;
    description: string;
    stock: number | '';
    status: string;
    condition: string;
    isFlashSale: boolean;
    useProductWarranty: boolean;
    warrantyType: NonNullable<Product['warrantyType']>;
    warrantyMonths: number | '';
}

// €€ Component Form Data €€
interface ComponentFormData {
    name: string;
    price_original: number | '';
    price_promo: number | '';
    categoryIds: string[];
    description: string;
    stock: number | '';
    status: string;
    quality: string;
    partType: string;
    warrantyPolicyId: string;
    supplier: string;
}

export default function UniversalProductModal({
    isOpen,
    onClose,
    mode,
    initialData,
    onCreated,
    onUpdated,
    partTypeOptions = [],
    warrantyPolicies = [],
    submitLabel,
}: UniversalProductModalProps) {
    const isEditing = !!initialData;
    const { user } = useAuth();
    const editorRole = user?.role;
    const grantedFields = mode === 'retail'
        ? user?.catalogFieldPermissions?.products || []
        : user?.catalogFieldPermissions?.parts || [];

    const storedValue = (field: ProductEditableField): unknown => {
        if (!initialData) return undefined;
        if (field === 'images') {
            return initialData.images?.length ? initialData.images : (initialData.imageUrl ? [initialData.imageUrl] : []);
        }
        if (field === 'warranty') return initialData.warrantyType ?? initialData.warrantyMonths;
        return (initialData as unknown as Record<string, unknown>)[field];
    };
    const canEdit = (field: ProductEditableField) => canEditProductField(editorRole, isEditing, field, storedValue(field), grantedFields);
    const editableFields: ProductEditableField[] = mode === 'retail'
        ? ['name', 'price_original', 'price_promo', 'category', 'subCategory', 'categoryIds', 'brand', 'description', 'status', 'condition', 'isFlashSale', 'warranty', 'images']
        : ['name', 'price_original', 'price_promo', 'categoryIds', 'description', 'status', 'quality', 'partType', 'supplier', 'images'];
    const canSubmit = editorRole === 'admin' || (!isEditing ? false : editableFields.some(canEdit));
    const resolvedWarrantyPolicies = warrantyPolicies.length > 0
        ? warrantyPolicies
        : partTypeOptions.map(label => ({ id: normalizeWarrantyRuleKey(label), label, months: 0 }));

    // €€ Retail Form State €€
    const [retailForm, setRetailForm] = useState<RetailFormData>({
        name: initialData?.name || '',
        price_original: initialData?.price_original ?? '' as number | '',
        price_promo: initialData?.price_promo ?? '' as number | '',
        category: initialData?.category || '',
        subCategory: initialData?.subCategory || '',
        categoryIds: initialData?.categoryIds || [],
        brand: initialData?.brand || '',
        description: initialData?.description || '',
        stock: initialData?.stock ?? 0,
        status: initialData?.status || 'active',
        condition: initialData?.condition || 'new',
        isFlashSale: initialData?.isFlashSale || false,
        useProductWarranty: Boolean(initialData?.warrantyType),
        warrantyType: initialData?.warrantyType || 'warrantyDevice',
        warrantyMonths: initialData?.warrantyMonths ?? '',
    });

    // €€ Component Form State €€
    const [componentForm, setComponentForm] = useState<ComponentFormData>({
        name: initialData?.name || '',
        price_original: initialData?.price_original ?? '' as number | '',
        price_promo: initialData?.price_promo ?? '' as number | '',
        categoryIds: initialData?.categoryIds || [],
        description: initialData?.description || '',
        stock: initialData?.stock ?? 0,
        status: initialData?.status || 'active',
        quality: initialData?.quality || 'Zin',
        partType: initialData?.partType || '',
        warrantyPolicyId: initialData?.warrantyPolicyId || normalizeWarrantyRuleKey(initialData?.partType),
        supplier: initialData?.supplier || '',
    });

    // €€ Shared Form State €€
    const [images, setImages] = useState<string[]>(initialData?.images || []);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Brands are only rendered by the retail form. Do not keep a listener open
    // while the component modal is mounted or closed on the Parts page.
    const { data: brandsData } = useFirestoreCollection<{ name: string }>(
        'brands',
        [orderBy('name', 'asc')],
        { enabled: isOpen && mode === 'retail' },
    );

    const brands = brandsData.map(b => b.name);

    useEffect(() => {
        if (isOpen) {
            setRetailForm({
                name: initialData?.name || '',
                price_original: initialData?.price_original ?? '' as number | '',
                price_promo: initialData?.price_promo ?? '' as number | '',
                category: initialData?.category || '',
                subCategory: initialData?.subCategory || '',
                categoryIds: initialData?.categoryIds || [],
                brand: initialData?.brand || '',
                description: initialData?.description || '',
                stock: initialData?.stock ?? 0,
                status: initialData?.status || 'active',
                condition: initialData?.condition || 'new',
                isFlashSale: initialData?.isFlashSale || false,
                useProductWarranty: Boolean(initialData?.warrantyType),
                warrantyType: initialData?.warrantyType || 'warrantyDevice',
                warrantyMonths: initialData?.warrantyMonths ?? '',
            });
            setComponentForm({
                name: initialData?.name || '',
                price_original: initialData?.price_original ?? '' as number | '',
                price_promo: initialData?.price_promo ?? '' as number | '',
                categoryIds: initialData?.categoryIds || [],
                description: initialData?.description || '',
                stock: initialData?.stock ?? 0,
                status: initialData?.status || 'active',
                quality: initialData?.quality || 'Zin',
                partType: initialData?.partType || '',
                warrantyPolicyId: initialData?.warrantyPolicyId || normalizeWarrantyRuleKey(initialData?.partType),
                supplier: initialData?.supplier || '',
            });
            setImages(initialData?.images?.length ? initialData.images : (initialData?.imageUrl ? [initialData.imageUrl] : []));
        }
    }, [isOpen, initialData]);

    const buildAllowedUpdateData = (data: Record<string, unknown>) => {
        if (!initialData) return { ...data, stock: 0 };

        const allowed = { ...data };
        const fieldKeys: Array<[ProductEditableField, string[]]> = [
            ['name', ['name']],
            ['price_original', ['price_original']],
            ['price_promo', ['price_promo']],
            ['category', ['category']],
            ['subCategory', ['subCategory']],
            ['categoryIds', ['categoryIds']],
            ['brand', ['brand']],
            ['description', ['description']],
            ['status', ['status']],
            ['condition', ['condition']],
            ['isFlashSale', ['isFlashSale']],
            ['warranty', ['warrantyType', 'warrantyMonths']],
            ['quality', ['quality']],
            ['partType', ['partType']],
            ['partType', ['warrantyPolicyId']],
            ['supplier', ['supplier']],
            ['images', ['images', 'imageUrl']],
        ];

        fieldKeys.forEach(([field, keys]) => {
            if (!canEdit(field)) keys.forEach((key) => delete allowed[key]);
        });
        if (!canEdit('name')) delete allowed.searchKeywords;
        if (!canEdit('categoryIds')) delete allowed.searchCategoryKeywords;

        // Identity and stock are operational values, never direct catalog-form updates.
        delete allowed.stock;
        delete allowed.sku;
        delete allowed.barcode;
        delete allowed.productCode;
        delete allowed.specs;
        if (mode === 'component') {
            delete allowed.category;
            delete allowed.brand;
        }
        return allowed;
    };

    // €€ Submit Form €€
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (mode === 'retail') {
                await submitRetail();
            } else {
                await submitComponent();
            }
        } catch (err) {
            console.error(err);
            toastError(mode === 'retail' ? 'Lỗi khi lưu sản phẩm!' : 'Lỗi khi lưu linh kiện!');
        } finally {
            setIsSubmitting(false);
        }
    };

    const submitRetail = async () => {
        const form = retailForm;
        if (form.categoryIds.length === 0) {
            toastError('Vui lòng chọn danh mục taxonomy cho sản phẩm.');
            return;
        }
        const imageUrl = images[0] || '';
        const productId = isEditing && initialData ? initialData.id : await normalizeDocId(form.name, 'retail', form.category);
        const productCode = initialData
            ? getPrimaryProductCode(initialData)
            : buildProductCodeFromId(productId, getProductCodeKind({ category: form.category, categoryIds: form.categoryIds }));
        const searchKeywords = Array.from(new Set([...generateSearchKeywords(form.name), productCode.toLowerCase()])).slice(0, 60);

        const data: Record<string, unknown> = {
            sku: productCode,
            barcode: productCode,
            productCode,
            name: form.name,
            price_original: Number(form.price_original) || 0,
            price_promo: Number(form.price_promo) || 0,
            category: form.category,
            subCategory: form.subCategory,
            categoryIds: form.categoryIds,
            brand: form.brand,
            description: form.description,
            stock: Number(form.stock) || 0,
            status: form.status,
            condition: form.condition,
            isFlashSale: form.isFlashSale,
            imageUrl,
            images,
            specs: initialData?.specs || {},
            searchKeywords,
            searchCategoryKeywords: buildCategorySearchKeywords(form.categoryIds, searchKeywords),
        };
        const allowsWarrantyOverride = form.condition !== 'new';
        if (allowsWarrantyOverride && form.useProductWarranty) {
            const warrantyMonths = form.warrantyType === 'none' ? 0 : Number(form.warrantyMonths);
            if (form.warrantyType !== 'none' && (!Number.isInteger(warrantyMonths) || warrantyMonths < 1 || warrantyMonths > 120)) {
                toastError('Thời hạn bảo hành riêng phải từ 1 đến 120 tháng.');
                return;
            }
            data.warrantyType = form.warrantyType;
            data.warrantyMonths = warrantyMonths;
        } else if (initialData?.warrantyType) {
            data.warrantyType = deleteField();
            data.warrantyMonths = deleteField();
        }
        const qrCodes = [productCode];

        if (isEditing && initialData) {
            const updateData = buildAllowedUpdateData(data);
            await updateProductWithCodes(initialData.id, qrCodes, updateData);
            await triggerRevalidate(['/', `/product/${initialData.id}`, '/flash-sale', '/search', '/sitemap.xml'], ['products']);
            onUpdated?.();
        } else {
            data.sold = 0;
            await createProductWithCodes(productId, data, qrCodes);
            await triggerRevalidate(['/', `/product/${productId}`, '/flash-sale', '/search', '/sitemap.xml'], ['products']);
            onCreated?.({ id: productId, ...data } as Product & { id: string });
        }
        onClose();
    };

    const submitComponent = async () => {
        const form = componentForm;
        if (form.categoryIds.length === 0) {
            toastError('Vui lòng chọn danh mục taxonomy cho linh kiện.');
            return;
        }
        const imageUrl = images[0] || '';
        const productId = isEditing && initialData ? initialData.id : await normalizeDocId(form.name, 'component');
        const productCode = initialData ? getPrimaryProductCode(initialData) : buildProductCodeFromId(productId, 'component');
        const searchKeywords = Array.from(new Set([
            ...generateSearchKeywords(form.name),
            ...generateSearchKeywords(form.partType),
            ...generateSearchKeywords(productCode),
        ])).slice(0, 60);

        const data: Record<string, unknown> = {
            sku: productCode,
            barcode: productCode,
            productCode,
            name: form.name,
            category: PART_CATEGORY_LABEL,
            categoryIds: form.categoryIds,
            brand: '',
            price_original: Number(form.price_original) || 0,
            price_promo: Number(form.price_promo) || 0,
            description: form.description,
            stock: Number(form.stock) || 0,
            status: form.status,
            quality: form.quality,
            partType: form.partType,
            warrantyPolicyId: form.warrantyPolicyId,
            supplier: form.supplier,
            imageUrl,
            images,
            specs: {},
            searchKeywords,
            searchCategoryKeywords: buildCategorySearchKeywords(form.categoryIds, searchKeywords),
        };
        const qrCodes = [productCode];

        if (isEditing && initialData) {
            await updateProductWithCodes(initialData.id, qrCodes, buildAllowedUpdateData(data));
            onUpdated?.();
        } else {
            data.sold = 0;
            await createProductWithCodes(productId, data, qrCodes);
            onCreated?.({ id: productId, ...data } as Product & { id: string });
        }
        onClose();
    };

    // €€ Derive title €€
    const title = isEditing
        ? (mode === 'retail' ? 'Sửa sản phẩm' : 'Sửa thông tin linh kiện')
        : (mode === 'retail' ? 'Thêm sản phẩm mới' : 'Tạo linh kiện mới');

    // €€ Derive default submit label €€
    const defaultLabel = isEditing
        ? (mode === 'retail' ? 'Cập nhật' : 'Cập nhật linh kiện')
        : (mode === 'retail' ? 'Thêm sản phẩm' : 'Lưu linh kiện mới');
    const btnLabel = submitLabel || defaultLabel;

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={title}
                size="2xl"
            >
                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
                    {/* Image Section */}
                    <MediaGalleryField
                        label={mode === 'retail' ? 'Ảnh sản phẩm' : 'Hình ảnh linh kiện'}
                        mediaTitle={mode === 'retail' ? 'Chọn ảnh sản phẩm' : 'Chọn hình ảnh linh kiện'}
                        value={images}
                        onChange={setImages}
                        emptyText={mode === 'retail' ? 'Chọn ảnh sản phẩm từ thư viện' : 'Chọn ảnh linh kiện từ thư viện'}
                        defaultFolder={mode === 'retail' ? 'products' : 'parts'}
                        disabled={!canEdit('images')}
                    />

                    {editorRole === 'staff' && isEditing && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Nhân viên chỉ có thể sửa trường được admin cấp quyền hoặc bổ sung trường đang trống. Số lượng tồn kho chỉ thay đổi qua nhập kho hoặc kiểm kê.
                        </p>
                    )}

                    {/* Mode-specific Fields €€ */}
                    {mode === 'retail' ? (
                        <RetailFields
                            form={retailForm}
                            setForm={setRetailForm}
                            brands={brands}
                            canEdit={canEdit}
                        />
                    ) : (
                        <ComponentFields
                            form={componentForm}
                            setForm={setComponentForm}
                            warrantyPolicies={resolvedWarrantyPolicies}
                            canEdit={canEdit}
                        />
                    )}

                    {/* €€ Actions €€ */}
                    <div className="flex gap-3 pt-4 border-t sticky bottom-0 bg-white z-10 -mx-6 px-6 pb-6 md:pb-0 mt-6 pointer-events-auto items-center">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-1/3 py-3 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !canSubmit}
                            className="flex-1 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm transition-all"
                        >
                            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                            {isSubmitting ? 'Đang xử lý...' : btnLabel}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}

// €€ Retail Fields Sub-component €€
function RetailFields({
    form,
    setForm,
    brands,
    canEdit,
}: {
    form: RetailFormData;
    setForm: React.Dispatch<React.SetStateAction<RetailFormData>>;
    brands: string[];
    canEdit: (field: ProductEditableField) => boolean;
}) {
    const allowsWarrantyOverride = form.condition !== 'new';
    return (
        <>
            {/* Name */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên sản phẩm *</label>
                <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                    required
                    disabled={!canEdit('name')}
                    className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                    placeholder="iPhone 15 Pro Max 256GB"
                />
            </div>

            {/* Price */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá gốc (VND) *</label>
                    <CurrencyInput
                        value={form.price_original}
                        onChange={(v) => setForm(p => ({ ...p, price_original: v || '' }))}
                        required
                        min={0}
                        disabled={!canEdit('price_original')}
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                        placeholder="0"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá khuyến mãi</label>
                    <CurrencyInput
                        value={form.price_promo}
                        onChange={(v) => setForm(p => ({ ...p, price_promo: v || '' }))}
                        min={0}
                        disabled={!canEdit('price_promo')}
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                        placeholder="0"
                    />
                </div>
            </div>

            {/* Category */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Danh mục</label>
                <CategoryTaxonomySelector
                    type="retail"
                    value={form.categoryIds}
                    onChange={(ids, cat, subCat) => {
                        setForm(p => ({
                            ...p,
                            categoryIds: ids,
                            category: cat,
                            subCategory: subCat
                        }));
                    }}
                    disabled={!canEdit('categoryIds')}
                />
            </div>

            {allowsWarrantyOverride && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <input
                        type="checkbox"
                        checked={form.useProductWarranty}
                        onChange={(event) => setForm(current => ({ ...current, useProductWarranty: event.target.checked }))}
                        disabled={!canEdit('warranty')}
                        className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Bảo hành riêng cho sản phẩm này
                </label>
                <p className="text-xs text-emerald-800">
                    Bỏ chọn để dùng cấu hình bảo hành của taxonomy. Thông tin thực tế sẽ được chốt trên từng đơn bán.
                </p>
                {form.useProductWarranty && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Loại bảo hành</label>
                            <select
                                value={form.warrantyType}
                                onChange={(event) => setForm(current => ({ ...current, warrantyType: event.target.value as RetailFormData['warrantyType'] }))}
                                disabled={!canEdit('warranty')}
                                className="w-full h-10 px-3 border border-gray-300 rounded-lg bg-white"
                            >
                                <option value="warrantyDevice">Thiết bị</option>
                                <option value="warrantyAccessory">Phụ kiện</option>
                                <option value="warrantyRepair">Sửa chữa</option>
                                <option value="none">Không bảo hành</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Thời hạn (tháng)</label>
                            <input
                                type="number"
                                min={1}
                                max={120}
                                value={form.warrantyType === 'none' ? 0 : form.warrantyMonths}
                                onChange={(event) => setForm(current => ({ ...current, warrantyMonths: event.target.value ? Number(event.target.value) : '' }))}
                                disabled={!canEdit('warranty') || form.warrantyType === 'none'}
                                className="w-full h-10 px-3 border border-gray-300 rounded-lg bg-white disabled:bg-gray-100"
                                aria-label="Thời hạn bảo hành"
                            />
                        </div>
                    </div>
                )}
            </div>
            )}

            {/* Brand */}
            <div className="grid grid-cols-1 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Thương hiệu</label>
                    <select
                        value={form.brand}
                        onChange={(e) => setForm(p => ({ ...p, brand: e.target.value }))}
                        required
                        disabled={!canEdit('brand')}
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                        aria-label="Thương hiệu"
                        title="Thương hiệu"
                    >
                        <option value="">-- Chọn thương hiệu --</option>
                        {brands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                </div>
            </div>

            {/* Condition */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tình trạng sản phẩm</label>
                <div className="grid grid-cols-3 gap-2">
                    {CONDITIONS.map(c => (
                        <label
                            key={c.value}
                            className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${form.condition === c.value
                                ? 'border-orange-400 bg-orange-50'
                                : 'border-gray-200 hover:border-gray-300'
                                }`}
                        >
                            <input
                                type="radio"
                                name="condition"
                                value={c.value}
                                checked={form.condition === c.value}
                                onChange={() => setForm(p => ({
                                    ...p,
                                    condition: c.value,
                                    ...(c.value === 'new' ? { useProductWarranty: false } : {}),
                                }))}
                                disabled={!canEdit('condition')}
                                className="accent-orange-500"
                            />
                            <span className="text-xs font-medium">{c.label}</span>
                        </label>
                    ))}
                </div>
            </div>

            {/* Stock & Status */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Số lượng tồn kho</label>
                    <input
                        type="number"
                        value={form.stock}
                        onChange={(e) => setForm(p => ({ ...p, stock: e.target.value ? Number(e.target.value) : '' }))}
                        min={0}
                        disabled
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                        placeholder="0"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Trạng thái</label>
                    <select
                        value={form.status}
                        onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))}
                        disabled={!canEdit('status')}
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                        aria-label="Trạng thái"
                        title="Trạng thái"
                    >
                        <option value="active">Đang bán</option>
                        <option value="inactive">Tạm ẩn</option>
                    </select>
                </div>
            </div>

            {/* Flash Sale */}
            <div>
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={form.isFlashSale}
                        onChange={(e) => setForm(p => ({ ...p, isFlashSale: e.target.checked }))}
                        disabled={!canEdit('isFlashSale')}
                        className="w-5 h-5 accent-orange-500"
                    />
                    <span className="text-sm font-medium">Hiển thị trong Flash Sale</span>
                </label>
            </div>

            {/* Description */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mô tả</label>
                <textarea
                    value={form.description}
                    onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                    rows={4}
                    disabled={!canEdit('description')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none transition-shadow"
                    placeholder="Mô tả chi tiết sản phẩm..."
                />
            </div>

        </>
    );
}

function suggestWarrantyPolicy(categoryIds: string[], policies: WarrantyPolicyOption[]) {
    const categoryText = normalizeWarrantyRuleKey(categoryIds.join(' '));
    if (!categoryText) return undefined;
    return policies.find(policy => {
        const policyText = normalizeWarrantyRuleKey(policy.label || policy.id);
        return policyText.length >= 3 && categoryText.includes(policyText);
    });
}

// €€ Component Fields Sub-component €€
function ComponentFields({
    form,
    setForm,
    warrantyPolicies,
    canEdit,
}: {
    form: ComponentFormData;
    setForm: React.Dispatch<React.SetStateAction<ComponentFormData>>;
    warrantyPolicies: WarrantyPolicyOption[];
    canEdit: (field: ProductEditableField) => boolean;
}) {
    return (
        <>
            {/* Name */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên linh kiện *</label>
                <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                    required
                    disabled={!canEdit('name')}
                    className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                    placeholder="Vd: Màn hình iPhone 13 Pro Max"
                />
            </div>

            {/* Category Taxonomy */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Danh mục</label>
                <CategoryTaxonomySelector
                    type="component"
                    value={form.categoryIds}
                    onChange={(ids) => {
                        setForm(p => ({
                            ...p,
                            categoryIds: ids,
                            ...(!p.warrantyPolicyId && suggestWarrantyPolicy(ids, warrantyPolicies)
                                ? (() => {
                                    const policy = suggestWarrantyPolicy(ids, warrantyPolicies)!;
                                    return { warrantyPolicyId: policy.id, partType: policy.label };
                                })()
                                : {}),
                        }));
                    }}
                    disabled={!canEdit('categoryIds')}
                />
            </div>

            {/* Device Compatibility */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Dòng máy tương thích</label>
                <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                    disabled={!canEdit('description')}
                    className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                    placeholder="Vd: iPhone 13 Pro, iPhone 13 Pro Max"
                />
            </div>

            {/* Supplier */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nguồn cung cấp</label>
                <input
                    type="text"
                    value={form.supplier}
                    onChange={(e) => setForm(p => ({ ...p, supplier: e.target.value }))}
                    disabled={!canEdit('supplier')}
                    className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                    placeholder="Vd: Quán A, Web B..."
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Quality */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Phân loại/Chất lượng</label>
                    <select
                        value={form.quality}
                        onChange={(e) => setForm(p => ({ ...p, quality: e.target.value }))}
                        disabled={!canEdit('quality')}
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                        aria-label="Phân loại/Chất lượng"
                        title="Phân loại/Chất lượng"
                    >
                        {QUALITY_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                </div>

                {/* Warranty policy */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Chính sách bảo hành</label>
                    <select
                        value={form.warrantyPolicyId}
                        onChange={(e) => {
                            const policy = warrantyPolicies.find(item => item.id === e.target.value);
                            setForm(p => ({ ...p, warrantyPolicyId: e.target.value, partType: policy?.label || '' }));
                        }}
                        disabled={!canEdit('partType')}
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow"
                        aria-label="Chính sách bảo hành"
                        title="Chính sách bảo hành"
                    >
                        <option value="">-- Chưa áp dụng --</option>
                        {warrantyPolicies.map(policy => (
                            <option key={policy.id} value={policy.id}>
                                {policy.label}{policy.months > 0 ? ` · ${policy.months} tháng` : ''}
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Tự gợi ý từ taxonomy; có thể đổi khi linh kiện cần policy khác.</p>
                </div>
            </div>

            {/* Stock */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Số lượng Tồn kho gốc</label>
                <input
                    type="number"
                    value={form.stock}
                    onChange={(e) => setForm(p => ({ ...p, stock: e.target.value ? Number(e.target.value) : '' }))}
                    min={0}
                    disabled
                    className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                    placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">Sẽ tự động cập nhật khi nhập kho</p>
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá vốn (VND) *</label>
                    <CurrencyInput
                        value={form.price_original}
                        onChange={(v) => setForm(p => ({ ...p, price_original: v || '' }))}
                        required
                        min={0}
                        disabled={!canEdit('price_original')}
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                        placeholder="0"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá Bán / Giá Sửa thay thế (VND) *</label>
                    <CurrencyInput
                        value={form.price_promo}
                        onChange={(v) => setForm(p => ({ ...p, price_promo: v || '' }))}
                        required
                        min={0}
                        disabled={!canEdit('price_promo')}
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow font-semibold text-orange-600"
                        placeholder="0"
                    />
                </div>
            </div>

            {/* Status */}
            <div>
                <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-xl hover:bg-gray-50 transition-colors">
                    <input
                        type="checkbox"
                        checked={form.status === 'active'}
                        onChange={(e) => setForm(p => ({ ...p, status: e.target.checked ? 'active' : 'inactive' }))}
                        disabled={!canEdit('status')}
                        className="w-5 h-5 accent-orange-500 rounded"
                    />
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-800">Đang hoạt động</span>
                        <span className="text-xs text-gray-500">Bỏ chọn nếu muốn tạm ẩn linh kiện này khỏi danh sách chọn của Kỹ Thuật Viên</span>
                    </div>
                </label>
            </div>
        </>
    );
}
