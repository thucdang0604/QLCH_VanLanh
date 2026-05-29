'use client';

import { useState, useEffect } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import CurrencyInput from '@/components/admin/CurrencyInput';
import { ImageIcon } from 'lucide-react';
import { getDoc, doc, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateSlug, generateSearchKeywords } from '@/lib/utils';
import { addDocumentWithId, updateDocument, useFirestoreCollection } from '@/lib/useFirestore';
import { triggerRevalidate } from '@/lib/revalidate';
import { toastError } from '@/lib/toast';
import Modal from '@/components/admin/Modal';
import MediaManager from '@/components/admin/MediaManager';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import type { Product } from '@/lib/types';
import { PART_CATEGORY_LABEL } from '@/lib/constants';

// ── Shared Constants ──

const CONDITIONS = [
    { value: 'new', label: 'Mới 100%' },
    { value: 'like-new', label: 'Cũ 99%' },
    { value: 'used', label: 'Hàng cũ | TBH' },
];
const QUALITY_OPTIONS = ['Zin', 'Loại 1', 'Loại 2', 'Bóc máy'];

// ── Props ──
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
    /** Custom label cho nút submit */
    submitLabel?: string;
}

// ── Retail Form Data ──
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
    // Variant fields
    seriesId: string;
}

// ── Component Form Data ──
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
    submitLabel,
}: UniversalProductModalProps) {
    const isEditing = !!initialData;

    // ── Retail state ──
    const [retailForm, setRetailForm] = useState<RetailFormData>({
        name: initialData?.name || '',
        price_original: initialData?.price_original || '' as number | '',
        price_promo: initialData?.price_promo || '' as number | '',
        category: initialData?.category || '',
        subCategory: initialData?.subCategory || '',
        categoryIds: initialData?.categoryIds || [],
        brand: initialData?.brand || '',
        description: initialData?.description || '',
        stock: initialData?.stock ?? '' as number | '',
        status: initialData?.status || 'active',
        condition: initialData?.condition || 'new',
        isFlashSale: initialData?.isFlashSale || false,
        seriesId: initialData?.seriesId || '',
    });

    // ── Component state ──
    const [componentForm, setComponentForm] = useState<ComponentFormData>({
        name: initialData?.name || '',
        price_original: initialData?.price_original || '' as number | '',
        price_promo: initialData?.price_promo || '' as number | '',
        categoryIds: initialData?.categoryIds || [],
        description: initialData?.description || '',
        stock: initialData?.stock ?? '' as number | '',
        status: initialData?.status || 'active',
        quality: initialData?.quality || 'Zin',
        partType: initialData?.partType || '',
        supplier: initialData?.supplier || '',
    });

    // ── Shared state ──
    const [images, setImages] = useState<string[]>(initialData?.images || []);
    const [mediaOpen, setMediaOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ── Dynamic Data ──
    
    const { data: brandsData } = useFirestoreCollection<{ name: string }>('brands', [orderBy('name', 'asc')]);
    
    
    const brands = brandsData.map(b => b.name);

    useEffect(() => {
        if (isOpen) {
            setRetailForm({
                name: initialData?.name || '',
                price_original: initialData?.price_original || '' as number | '',
                price_promo: initialData?.price_promo || '' as number | '',
                category: initialData?.category || '',
                subCategory: initialData?.subCategory || '',
                categoryIds: initialData?.categoryIds || [],
                brand: initialData?.brand || '',
                description: initialData?.description || '',
                stock: initialData?.stock ?? '' as number | '',
                status: initialData?.status || 'active',
                condition: initialData?.condition || 'new',
                isFlashSale: initialData?.isFlashSale || false,
                seriesId: initialData?.seriesId || '',
            });
            setComponentForm({
                name: initialData?.name || '',
                price_original: initialData?.price_original || '' as number | '',
                price_promo: initialData?.price_promo || '' as number | '',
                categoryIds: initialData?.categoryIds || [],
                description: initialData?.description || '',
                stock: initialData?.stock ?? '' as number | '',
                status: initialData?.status || 'active',
                quality: initialData?.quality || 'Zin',
                partType: initialData?.partType || '',
                supplier: initialData?.supplier || '',
            });
            setImages(initialData?.images?.length ? initialData.images : (initialData?.imageUrl ? [initialData.imageUrl] : []));
        }
    }, [isOpen, initialData]);

    const handleMediaSelect = (url: string) => {
        if (!images.includes(url)) {
            setImages(prev => [...prev, url]);
        }
    };

    const handleRemoveImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    // ── Submit ──
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
        const imageUrl = images[0] || '';

        const data: Record<string, unknown> = {
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
            searchKeywords: generateSearchKeywords(form.name),
            seriesId: form.seriesId,
        };

        if (isEditing && initialData) {
            data.sold = initialData?.sold || 0;
            await updateDocument('products', initialData.id, data);
            await triggerRevalidate(['/', `/product/${initialData.id}`, '/flash-sale', '/search', '/sitemap.xml'], ['products']);
            onUpdated?.();
        } else {
            data.sold = 0;
            const slug = await resolveSlug(form.name);
            await addDocumentWithId('products', slug, data);
            await triggerRevalidate(['/', `/product/${slug}`, '/flash-sale', '/search', '/sitemap.xml'], ['products']);
            onCreated?.({ id: slug, ...data } as Product & { id: string });
        }
        onClose();
    };

    const submitComponent = async () => {
        const form = componentForm;
        const imageUrl = images[0] || '';

        const data: Record<string, unknown> = {
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
            supplier: form.supplier,
            imageUrl,
            images,
            specs: {},
            searchKeywords: generateSearchKeywords(form.name),
        };

        if (isEditing && initialData) {
            await updateDocument('products', initialData.id, data);
            onUpdated?.();
        } else {
            data.sold = 0;
            const slug = await resolveSlug(form.name);
            await addDocumentWithId('products', slug, data);
            onCreated?.({ id: slug, ...data } as Product & { id: string });
        }
        onClose();
    };

    /** Generate unique slug — check Firestore for duplicates */
    const resolveSlug = async (name: string): Promise<string> => {
        const baseSlug = generateSlug(name);
        const checkRef = await getDoc(doc(db, 'products', baseSlug));
        if (checkRef.exists()) {
            return `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
        }
        return baseSlug;
    };

    // ── Derive title ──
    const title = isEditing
        ? (mode === 'retail' ? 'Sửa sản phẩm' : 'Sửa thông tin linh kiện')
        : (mode === 'retail' ? 'Thêm sản phẩm mới' : 'Tạo linh kiện mới');

    // ── Derive default submit label ──
    const defaultLabel = isEditing
        ? (mode === 'retail' ? 'Cập nhật' : 'Cập nhật linh kiện')
        : (mode === 'retail' ? 'Thêm sản phẩm' : 'Lưu linh kiện mới');
    const btnLabel = submitLabel || defaultLabel;

    return (
        <>
            <MediaManager
                isOpen={mediaOpen}
                onClose={() => setMediaOpen(false)}
                onSelect={(url) => {
                    handleMediaSelect(url);
                    // Retail single image: close after pick
                    if (mode === 'retail') setMediaOpen(false);
                }}
                title={mode === 'retail' ? 'Chọn ảnh sản phẩm' : 'Chọn hình ảnh linh kiện'}
            />
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={title}
                size="2xl"
            >
                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
                    {/* ═══ Image Section ═══ */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            {mode === 'retail' ? 'Ảnh sản phẩm' : 'Hình ảnh linh kiện'}
                        </label>

                        {mode === 'retail' ? (
                            /* Retail: single image picker */
                            <div className="border-2 border-dashed rounded-xl p-4 text-center">
                                {images[0] ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={images[0]} alt="" className="w-24 h-24 object-cover rounded-lg mx-auto mb-2" />
                                ) : (
                                    <ImageIcon className="mx-auto text-gray-300 mb-2" size={32} />
                                )}
                                <div className="flex flex-col items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setMediaOpen(true)}
                                        className="cursor-pointer text-orange-600 hover:text-orange-700 font-medium text-sm underline"
                                    >
                                        {images[0] ? 'Đổi ảnh từ thư viện' : 'Chọn ảnh từ thư viện'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Component: multi-image picker */
                            <>
                                <p className="text-xs text-gray-500 mb-2">
                                    Bạn có thể upload ảnh mới vào kho linh kiện hoặc chọn ảnh đã có trong thư viện.
                                </p>
                                <div className="flex flex-wrap items-center gap-3 mb-2">
                                    <button
                                        type="button"
                                        onClick={() => setMediaOpen(true)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-orange-300 bg-orange-50 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors"
                                    >
                                        <ImageIcon size={16} />
                                        Chọn ảnh linh kiện
                                    </button>
                                </div>
                                {images.length > 0 && (
                                    <div className="grid grid-cols-4 gap-3">
                                        {images.map((url, index) => (
                                            <div key={index} className="relative aspect-square rounded-lg border border-gray-200 overflow-hidden bg-gray-100 group">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={url} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveImage(index)}
                                                        className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm cursor-pointer"
                                                        title="Xóa hình ảnh"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* ═══ Mode-specific Fields ═══ */}
                    {mode === 'retail' ? (
                        <RetailFields
                            form={retailForm}
                            setForm={setRetailForm}
                            brands={brands}
                        />
                    ) : (
                        <ComponentFields
                            form={componentForm}
                            setForm={setComponentForm}
                            partTypeOptions={partTypeOptions}
                        />
                    )}

                    {/* ═══ Actions ═══ */}
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
                            disabled={isSubmitting}
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

// ════════════════════════════════════════════════════
// Retail Fields Sub-component
// ════════════════════════════════════════════════════
function RetailFields({
    form,
    setForm,
    brands,
}: {
    form: RetailFormData;
    setForm: React.Dispatch<React.SetStateAction<RetailFormData>>;
    brands: string[];
}) {
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
                    className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                    placeholder="iPhone 15 Pro Max 256GB"
                />
            </div>

            {/* Price */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá gốc (VNĐ) *</label>
                    <CurrencyInput
                        value={form.price_original}
                        onChange={(v) => setForm(p => ({ ...p, price_original: v || '' }))}
                        required
                        min={0}
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
                />
            </div>

            {/* Brand */}
            <div className="grid grid-cols-1 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Thương hiệu</label>
                    <select
                        value={form.brand}
                        onChange={(e) => setForm(p => ({ ...p, brand: e.target.value }))}
                        required
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
                                onChange={() => setForm(p => ({ ...p, condition: c.value }))}
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
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                        placeholder="0"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Trạng thái</label>
                    <select
                        value={form.status}
                        onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))}
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
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none transition-shadow"
                    placeholder="Mô tả chi tiết sản phẩm..."
                />
            </div>

            {/* Variants */}
            <div className="pt-4 border-t border-gray-100">
                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 bg-orange-500 rounded-full"></span>
                    Gom nhóm Biến thể
                </h3>
                <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Mã Dòng (Series ID)</label>
                    <input
                        type="text"
                        value={form.seriesId}
                        onChange={(e) => setForm(p => ({ ...p, seriesId: e.target.value }))}
                        className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
                        placeholder="vd: iphone-15-pro-max"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Các sản phẩm có cùng Mã Dòng sẽ tự động hiển thị liên kết với nhau ở trang chi tiết sản phẩm.</p>
                </div>
            </div>
        </>
    );
}

// ════════════════════════════════════════════════════
// Component (Linh kiện) Fields Sub-component
// ════════════════════════════════════════════════════
function ComponentFields({
    form,
    setForm,
    partTypeOptions,
}: {
    form: ComponentFormData;
    setForm: React.Dispatch<React.SetStateAction<ComponentFormData>>;
    partTypeOptions: string[];
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
                            categoryIds: ids
                        }));
                    }}
                />
            </div>

            {/* Device Compatibility */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Dòng máy tương thích</label>
                <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
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
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                        aria-label="Phân loại/Chất lượng"
                        title="Phân loại/Chất lượng"
                    >
                        {QUALITY_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                </div>

                {/* Part Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Loại linh kiện (BH)</label>
                    <select
                        value={form.partType}
                        onChange={(e) => setForm(p => ({ ...p, partType: e.target.value }))}
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-shadow"
                        aria-label="Loại linh kiện"
                        title="Loại linh kiện"
                    >
                        <option value="">-- Chưa chọn --</option>
                        {partTypeOptions.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Dùng để tính thời gian bảo hành khi hoàn tất phiếu SC</p>
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
                    className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                    placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">Sẽ tự động cập nhật khi nhập kho</p>
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá vốn (VNĐ) *</label>
                    <CurrencyInput
                        value={form.price_original}
                        onChange={(v) => setForm(p => ({ ...p, price_original: v || '' }))}
                        required
                        min={0}
                        className="w-full h-11 px-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-shadow"
                        placeholder="0"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Giá Bán / Giá Sửa thay thế (VNĐ) *</label>
                    <CurrencyInput
                        value={form.price_promo}
                        onChange={(v) => setForm(p => ({ ...p, price_promo: v || '' }))}
                        required
                        min={0}
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
