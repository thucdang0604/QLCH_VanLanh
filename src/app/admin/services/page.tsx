'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
    Plus,
    Search,
    Edit,
    Trash2,
    Loader2,
    Wrench
} from 'lucide-react';
import { useFirestoreCollection, addDocumentWithId, updateDocument, deleteDocument } from '@/lib/useFirestore';

import { generateSlug } from '@/lib/utils';
import type { FirestoreDateValue } from '@/lib/types';
import { getCategoryPath, collectAllNodeIds } from '@/lib/utils';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { triggerRevalidate } from '@/lib/revalidate';
import Modal from '@/components/admin/Modal';
import CategoryTaxonomySelector from '@/components/admin/CategoryTaxonomySelector';
import CurrencyInput from '@/components/admin/CurrencyInput';
import { useConfig } from '@/lib/ConfigContext';
import MediaGalleryField from '@/components/admin/MediaGalleryField';

interface Service {
    id: string;
    name: string;
    description: string;
    price?: string; // legacy string price (backward compat)
    price_original: number;
    price_promo?: number;
    hidePrice?: boolean;
    device_model: string;
    imageUrl?: string;
    images?: string[];
    icon?: string;
    category: string;
    categoryIds?: string[];
    linkedProductCategoryIds?: string[];
    recommendedPartCategoryIds?: string[];
    isActive: boolean;
    warranty_text?: string;
    repair_time?: string;
    seoDescription?: string;
    tags?: string[];
    createdAt?: FirestoreDateValue;
}

const formatPrice = (p: number) => p > 0 ? new Intl.NumberFormat('vi-VN').format(p) + ' đ' : 'Liên hệ';

/** Parse legacy string price like "Từ 200.000đ" or "100000" to number */
function parseLegacyPrice(s?: string): number {
    if (!s) return 0;
    const cleaned = s.replace(/[^\d]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
}

export default function ServicesPage() {
    const { config, loading: configLoading } = useConfig();
    const { data: services, loading } = useFirestoreCollection<Service>('services');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategoryIds, setFilterCategoryIds] = useState<string[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingService, setEditingService] = useState<Service | null>(null);

    // Batch reassign state
    const [showReassign, setShowReassign] = useState(false);
    const [reassignFrom, setReassignFrom] = useState('');
    const [reassignTo, setReassignTo] = useState('');
    const [reassignToIds, setReassignToIds] = useState<string[]>([]);
    const [isReassigning, setIsReassigning] = useState(false);
    const [reassignProgress, setReassignProgress] = useState<{current: number, total: number} | null>(null);

    const handleDelete = async (service: Service) => {
        if (confirm(`Bạn có chắc muốn xóa dịch vụ "${service.name}"?`)) {
            try {
                await deleteDocument('services', service.id);
                await triggerRevalidate(['/', `/service/${service.id}`, '/category/sua-chua', '/sitemap.xml'], ['services']);
            } catch {
                toastError('Lỗi khi xóa dịch vụ!');
            }
        }
    };

    const handleBatchReassign = async () => {
        if (!reassignFrom || !reassignTo) return;
        setIsReassigning(true);
        try {
            const targets = services.filter(s => s.category === reassignFrom);
            setReassignProgress({ current: 0, total: targets.length });
            
            let successCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < targets.length; i++) {
                const s = targets[i];
                try {
                    await updateDocument('services', s.id, { 
                        category: reassignTo,
                        categoryIds: reassignToIds 
                    });
                    successCount++;
                } catch (err) {
                    console.error(`Error updating service ${s.id}:`, err);
                    errorCount++;
                }
                setReassignProgress({ current: i + 1, total: targets.length });
            }

            if (errorCount > 0) {
                toastWarning(`Hoàn tất gán lại ${successCount}/${targets.length} dịch vụ (${errorCount} lỗi)`);
            } else {
                toastSuccess(`Đã gán lại thành công ${successCount} dịch vụ từ "${reassignFrom}" sang "${reassignTo}"`);
            }
            
            setShowReassign(false);
            setReassignFrom('');
            setReassignTo('');
            setReassignToIds([]);
            setReassignProgress(null);
        } catch {
            toastError('Lỗi khi gán lại danh mục!');
        } finally {
            setIsReassigning(false);
        }
    };

    const filteredServices = services.filter((s) => {
        const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
        let matchCategory = true;

        if (filterCategoryIds.length > 0) {
            const targetId = filterCategoryIds[filterCategoryIds.length - 1];
            matchCategory = s.categoryIds?.includes(targetId) || false;
        }

        return matchSearch && matchCategory;
    });

    // --- ORPHAN CATEGORY DETECTION (ID-based) ---
    const serviceTaxonomy = config?.taxonomy?.service || [];
    const retailTaxonomy = config?.taxonomy?.retail || [];
    const componentTaxonomy = config?.taxonomy?.component || [];
    const validNodeIds = collectAllNodeIds(serviceTaxonomy);

    const getOrphanStatus = (service: Service): 'valid' | 'orphan' | 'unassigned' => {
        if (!service.categoryIds || service.categoryIds.length === 0) {
            return service.category ? 'orphan' : 'unassigned'; // legacy string only = orphan
        }
        const deepestId = service.categoryIds[service.categoryIds.length - 1];
        return validNodeIds.has(deepestId) ? 'valid' : 'orphan';
    };

    const orphanServices = services.filter(s => getOrphanStatus(s) === 'orphan');
    const missingCategoryCount = orphanServices.length;
    const missingCategories = Array.from(new Set(
        orphanServices.map(s => {
            if (s.categoryIds?.length) return s.categoryIds[s.categoryIds.length - 1];
            return s.category;
        })
    ));
    // ---------------------------------

    const { paginatedData: paginatedServices, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredServices, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery, filterCategoryIds]);

    /** Get display price â€” prefers numeric fields, falls back to legacy string */
    const getDisplayPrice = (s: Service) => {
        if (s.hidePrice) return 'Liên hệ nhận báo giá';
        if (s.price_original > 0) return formatPrice(s.price_original);
        if (s.price) return s.price; // legacy string
        return 'Liên hệ';
    };

    const getPromoPrice = (s: Service) => {
        if (s.hidePrice) return null;
        if (s.price_promo && s.price_promo > 0 && s.price_original > 0 && s.price_promo < s.price_original) {
            return formatPrice(s.price_promo);
        }
        return null;
    };

    const getLinkedCategoryPath = (type: 'retail' | 'component', categoryIds?: string[]) => {
        const taxonomy = type === 'retail' ? retailTaxonomy : componentTaxonomy;
        const deepestId = categoryIds?.[categoryIds.length - 1];
        return deepestId ? getCategoryPath(deepestId, taxonomy) || deepestId : '';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý dịch vụ</h1>
                    <p className="text-gray-500">{services.length} dịch vụ</p>
                </div>
                <button
                    onClick={() => { setEditingService(null); setIsModalOpen(true); }}
                    className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-orange-600 transition-colors"
                >
                    <Plus size={20} />
                    Thêm dịch vụ
                </button>
            </div>

            {/* Orphan Categories Warning */}
            {(!loading && !configLoading && missingCategories.length > 0) && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex flex-col sm:flex-row items-start justify-between gap-3">
                    <div>
                        <p className="font-medium flex items-center gap-2">
                            Có {missingCategoryCount} dịch vụ đang bị mất danh mục!
                        </p>
                        <p className="text-sm mt-1 text-red-600">
                            Các danh mục không tồn tại: {missingCategories.join(', ')}.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {missingCategories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => { setReassignFrom(cat); setShowReassign(true); }}
                                className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-md transition-colors"
                            >
                                Gán lại &quot;{cat}&quot;
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Search + Category filter */}
            <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm dịch vụ..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                        />
                    </div>
                </div>
                {/* Modern Taxonomy Filter */}
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-2">Lọc theo danh mục:</p>
                    <CategoryTaxonomySelector
                        type="service"
                        value={filterCategoryIds}
                        onChange={setFilterCategoryIds}
                    />
                </div>
            </div>

            {/* Services Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-orange-500" />
                </div>
            ) : filteredServices.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl">
                    <Wrench size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">Chưa có dịch vụ nào</p>
                </div>
            ) : (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {paginatedServices.map((service) => {
                        const promo = getPromoPrice(service);
                        return (
                        <div key={service.id} className={`bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow`}>
                            <div className="flex items-start justify-between mb-4">
                                <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
                                    {service.imageUrl ? (
                                        <Image
                                            src={service.imageUrl}
                                            alt={service.name}
                                            width={40}
                                            height={40}
                                            className="rounded-lg object-cover"
                                        />
                                    ) : (
                                        <Wrench size={24} className="text-orange-600" />
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        title="Sửa dịch vụ"
                                        onClick={() => { setEditingService(service); setIsModalOpen(true); }}
                                        className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg"
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <button
                                        title="Xóa dịch vụ"
                                        onClick={() => handleDelete(service)}
                                        className="p-2 hover:bg-red-100 text-red-600 rounded-lg"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <h3 className="font-semibold text-gray-900 mb-1">{service.name}</h3>
                            {/* Auto-render category path from taxonomy tree */}
                            {(() => {
                                const status = getOrphanStatus(service);
                                const deepestId = service.categoryIds?.[service.categoryIds.length - 1];
                                const path = deepestId ? getCategoryPath(deepestId, serviceTaxonomy) : null;
                                if (status === 'orphan') {
                                    return <p className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded inline-block mb-1">⚠ Lỗi danh mục: {deepestId || service.category}</p>;
                                }
                                if (status === 'unassigned') {
                                    return <p className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded inline-block mb-1">⚠ Chưa gán danh mục</p>;
                                }
                                return path ? <p className="text-xs text-gray-400 mb-1">📌 {path}</p> : null;
                            })()}
                            <p className="text-sm text-gray-500 line-clamp-2 mb-3">{service.description}</p>
                            {(service.linkedProductCategoryIds?.length || service.recommendedPartCategoryIds?.length) && (
                                <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
                                    {service.linkedProductCategoryIds?.length ? (
                                        <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                                            Bán kèm: {getLinkedCategoryPath('retail', service.linkedProductCategoryIds)}
                                        </span>
                                    ) : null}
                                    {service.recommendedPartCategoryIds?.length ? (
                                        <span className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                                            Linh kiện: {getLinkedCategoryPath('component', service.recommendedPartCategoryIds)}
                                        </span>
                                    ) : null}
                                </div>
                            )}
                            <div className="flex items-center justify-between">
                                <div>
                                    {promo ? (
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-orange-600 font-bold">{promo}</span>
                                            <span className="text-gray-400 text-xs line-through">{getDisplayPrice(service)}</span>
                                        </div>
                                    ) : (
                                        <span className="text-orange-600 font-bold">{getDisplayPrice(service)}</span>
                                    )}
                                </div>
                                <span className={`px-2 py-1 text-xs rounded-full ${service.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                    {service.isActive ? 'Hoạt động' : 'Tạm dừng'}
                                </span>
                            </div>
                        </div>
                    );})}
                </div>
                <PaginationBar
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalFiltered={totalFiltered}
                    totalAll={services.length}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    entityLabel="dịch vụ"
                />
                </>
            )}

            {/* Modal */}
            <ServiceModal
                isOpen={isModalOpen}
                service={editingService}
                onClose={() => setIsModalOpen(false)}
                existingIds={services.map(s => s.id)}
            />

            {/* Batch Reassign Modal */}
            <Modal isOpen={showReassign} onClose={() => setShowReassign(false)} title="Gán lại danh mục hàng loạt" size="md">
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-600">
                        Chọn danh mục mới cho các dịch vụ đang thuộc danh mục <strong className="text-gray-900">&quot;{reassignFrom}&quot;</strong>.
                    </p>
                    <div>
                        <label className="block text-sm font-medium mb-1">Danh mục mới *</label>
                        <CategoryTaxonomySelector
                            type="service"
                            value={reassignToIds}
                            onChange={(ids, catName) => {
                                setReassignTo(catName || '');
                                setReassignToIds(ids);
                            }}
                        />
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button onClick={() => setShowReassign(false)} className="flex-1 py-2.5 border rounded-lg hover:bg-gray-50 font-medium">Há»§y</button>
                        <button 
                            onClick={handleBatchReassign} 
                            disabled={!reassignTo || isReassigning}
                            className="flex-1 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium disabled:opacity-50 flex justify-center items-center gap-2"
                        >
                            {isReassigning && <Loader2 size={16} className="animate-spin" />}
                            {isReassigning 
                                ? (reassignProgress ? `Đang xử lý ${reassignProgress.current}/${reassignProgress.total}...` : 'Đang xử lý...')
                                : 'Xác nhận gán lại'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

// Service Modal
function ServiceModal({
    isOpen,
    service,
    onClose,
    existingIds,
}: {
    isOpen: boolean;
    service: Service | null;
    onClose: () => void;
    existingIds: string[];
}) {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price_original: 0,
        price_promo: 0,
        hidePrice: false,
        device_model: '',
        category: '',
        categoryIds: [] as string[],
        linkedProductCategoryIds: [] as string[],
        recommendedPartCategoryIds: [] as string[],
        isActive: true,
        warranty_text: '',
        repair_time: '',
        seoDescription: '',
        tags: '',
    });

    useEffect(() => {
        if (isOpen) {
            setFormData({
                name: service?.name || '',
                description: service?.description || '',
                price_original: service?.price_original || parseLegacyPrice(service?.price),
                price_promo: service?.price_promo || 0,
                hidePrice: service?.hidePrice ?? false,
                device_model: service?.device_model || '',
                category: service?.category || '',
                categoryIds: service?.categoryIds || [],
                linkedProductCategoryIds: service?.linkedProductCategoryIds || [],
                recommendedPartCategoryIds: service?.recommendedPartCategoryIds || [],
                isActive: service?.isActive ?? true,
                warranty_text: service?.warranty_text || '',
                repair_time: service?.repair_time || '',
                seoDescription: service?.seoDescription || '',
                tags: service?.tags?.join(', ') || '',
            });
            setImages(service?.images?.length ? service.images : (service?.imageUrl ? [service.imageUrl] : []));
        }
    }, [isOpen, service]);
    const [images, setImages] = useState<string[]>(service?.images?.length ? service.images : (service?.imageUrl ? [service.imageUrl] : []));
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.categoryIds.length === 0) {
            toastError('Vui lòng chọn danh mục taxonomy cho dịch vụ.');
            return;
        }
        setIsSubmitting(true);

        try {
            const imageUrl = images[0] || '';

            const tagsArray = formData.tags.split(',').map(t => t.trim()).filter(Boolean);

            const data: Record<string, unknown> = {
                name: formData.name,
                description: formData.description,
                price_original: formData.price_original,
                price_promo: formData.price_promo || null,
                hidePrice: formData.hidePrice,
                device_model: formData.device_model,
                category: formData.category,
                categoryIds: formData.categoryIds,
                linkedProductCategoryIds: formData.linkedProductCategoryIds,
                recommendedPartCategoryIds: formData.recommendedPartCategoryIds,
                isActive: formData.isActive,
                warranty_text: formData.warranty_text || '',
                repair_time: formData.repair_time || '',
                seoDescription: formData.seoDescription || '',
                tags: tagsArray,
                imageUrl,
                images,
            };

            // Remove legacy string price field when saving new data
            if (service?.price) {
                data.price = null; // clear legacy field
            }

            if (service) {
                await updateDocument('services', service.id, data);
                await triggerRevalidate(['/', `/service/${service.id}`, '/category/sua-chua', '/sitemap.xml'], ['services']);
            } else {
                const docId = generateSlug(formData.name);
                if (existingIds.includes(docId)) {
                    toastError(`ID "${docId}" đã tồn tại! Hãy đổi tên dịch vụ.`);
                    setIsSubmitting(false);
                    return;
                }
                await addDocumentWithId('services', docId, data);
                await triggerRevalidate(['/', '/category/sua-chua', '/sitemap.xml'], ['services']);
            }

            onClose();
        } catch (error) {
            console.error('Error saving service:', error);
            toastError('Lỗi khi lưu dịch vụ!');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={service ? 'Sửa dịch vụ' : 'Thêm dịch vụ'} size="2xl">

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <MediaGalleryField
                        label={'Ảnh dịch vụ'}
                        mediaTitle={'Chọn Ảnh dịch vụ'}
                        value={images}
                        onChange={setImages}
                        emptyText={'Chọn Ảnh dịch vụ từ thư viện'}
                        defaultFolder="services"
                    />

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Tên dịch vụ *</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            placeholder="Thay pin iPhone"
                        />
                    </div>

                    {/* Device Model with suggestions */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Dòng máy hỗ trợ</label>
                        <input
                            type="text"
                            list="device-model-suggestions"
                            value={formData.device_model}
                            onChange={(e) => setFormData({ ...formData, device_model: e.target.value })}
                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            placeholder="iPhone 15 Pro Max, Samsung S24 Ultra..."
                        />
                        <datalist id="device-model-suggestions">
                            {['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16', 'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15', 'iPhone 14 Pro Max', 'iPhone 14', 'iPhone 13', 'iPhone 12', 'iPhone 11', 'iPhone SE',
                                'Samsung Galaxy S25 Ultra', 'Samsung Galaxy S25', 'Samsung Galaxy S24 Ultra', 'Samsung Galaxy S24', 'Samsung Galaxy S23', 'Samsung Galaxy Z Fold6', 'Samsung Galaxy Z Flip6', 'Samsung Galaxy A55', 'Samsung Galaxy A35', 'Samsung Galaxy A15',
                                'Xiaomi 14 Ultra', 'Xiaomi 14', 'Xiaomi 13', 'Redmi Note 13 Pro', 'Redmi Note 13', 'Redmi Note 12', 'POCO F6 Pro', 'POCO X6',
                                'OPPO Find X7', 'OPPO Reno 12', 'OPPO Reno 11', 'OPPO A98', 'OPPO A78',
                                'Vivo X100', 'Vivo V30', 'Vivo Y36',
                                'MacBook Pro', 'MacBook Air', 'Dell XPS', 'HP Pavilion', 'Lenovo ThinkPad', 'Asus ROG', 'Acer Nitro', 'MSI Gaming',
                                'iPad Pro', 'iPad Air', 'iPad mini', 'Samsung Galaxy Tab',
                            ].map(m => <option key={m} value={m} />)}
                        </datalist>
                        <p className="text-xs text-gray-400 mt-1">Nhấn vào gợi ý bên dưới để thêm nhanh:</p>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {[
                                { group: 'iPhone', items: ['iPhone 16 Pro Max', 'iPhone 15 Pro Max', 'iPhone 14', 'iPhone 13', 'iPhone 12', 'iPhone 11'] },
                                { group: 'Samsung', items: ['Galaxy S25 Ultra', 'Galaxy S24 Ultra', 'Galaxy A55', 'Galaxy Z Fold6'] },
                                { group: 'Xiaomi', items: ['Xiaomi 14', 'Redmi Note 13 Pro', 'OPPO Reno 12', 'OPPO A78', 'Vivo V30'] },
                                { group: 'MacBook', items: ['MacBook Pro', 'MacBook Air', 'Dell XPS', 'HP Pavilion', 'Lenovo ThinkPad'] },
                            ].map(g => g.items.map(item => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => {
                                        const current = formData.device_model.trim();
                                        const newVal = current ? `${current}, ${item}` : item;
                                        setFormData({ ...formData, device_model: newVal });
                                    }}
                                    className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-orange-100 hover:text-orange-700 rounded-full border border-gray-200 transition-colors cursor-pointer"
                                >
                                    {g.group} {item}
                                </button>
                            )))}
                        </div>
                    </div>

                    {/* Price */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Giá dịch vụ (đ) *</label>
                            <CurrencyInput
                                value={formData.price_original || ''}
                                onChange={(v) => setFormData({ ...formData, price_original: v })}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                placeholder="350.000"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Giá khuyến mãi (đ)</label>
                            <CurrencyInput
                                value={formData.price_promo || ''}
                                onChange={(v) => setFormData({ ...formData, price_promo: v })}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                placeholder="Để trống nếu không giảm"
                            />
                        </div>
                    </div>
                    <label className="flex items-start gap-3 rounded-lg border border-orange-100 bg-orange-50/60 p-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={formData.hidePrice}
                            onChange={(e) => setFormData({ ...formData, hidePrice: e.target.checked })}
                            className="mt-0.5 w-5 h-5 accent-orange-500"
                        />
                        <span>
                            <span className="block text-sm font-semibold text-orange-800">Ẩn giá phía khách hàng</span>
                            <span className="block text-xs text-orange-700">Trang khách sẽ hiển thị “Liên hệ nhận báo giá”. Giá vẫn được lưu nội bộ để admin tham khảo.</span>
                        </span>
                    </label>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Danh mục *</label>
                        <CategoryTaxonomySelector
                            type="service"
                            value={formData.categoryIds}
                            onChange={(ids, catName) => setFormData({ ...formData, categoryIds: ids, category: catName || formData.category })}
                        />
                    </div>

                    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                        <p className="text-sm font-semibold text-blue-900">Liên kết nghiệp vụ</p>
                        <p className="mt-1 text-xs text-blue-700">
                            Đây là dữ liệu gợi ý dùng lại cho các luồng khác. Không tự trừ tồn kho, không tự đổi workflow và không tự tạo khuyến mãi.
                        </p>
                        <div className="mt-3 grid gap-2 text-xs text-blue-900 sm:grid-cols-2">
                            <div className="rounded-lg border border-blue-100 bg-white/80 p-2">
                                <span className="font-semibold">POS / giảm giá:</span> nhóm sản phẩm bán kèm giúp rule voucher biết dịch vụ này nên gợi ý phụ kiện nào.
                            </div>
                            <div className="rounded-lg border border-blue-100 bg-white/80 p-2">
                                <span className="font-semibold">Phiếu sửa:</span> nhóm linh kiện giúp nhân viên/KTV có gợi ý linh kiện khi nhập bệnh.
                            </div>
                            <div className="rounded-lg border border-blue-100 bg-white/80 p-2">
                                <span className="font-semibold">Bảo hành:</span> danh mục dịch vụ vẫn là nguồn lấy cấu hình thời hạn và mẫu phiếu bảo hành.
                            </div>
                            <div className="rounded-lg border border-blue-100 bg-white/80 p-2">
                                <span className="font-semibold">Giá dự kiến:</span> giá dịch vụ dùng làm tham khảo khi tạo chi tiết sửa chữa, không khóa giá cuối.
                            </div>
                        </div>
                        <div className="mt-3 space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Nhóm sản phẩm/phụ kiện bán kèm</label>
                                <CategoryTaxonomySelector
                                    type="retail"
                                    value={formData.linkedProductCategoryIds}
                                    onChange={(ids) => setFormData({ ...formData, linkedProductCategoryIds: ids })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Nhóm linh kiện liên quan</label>
                                <CategoryTaxonomySelector
                                    type="component"
                                    value={formData.recommendedPartCategoryIds}
                                    onChange={(ids) => setFormData({ ...formData, recommendedPartCategoryIds: ids })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Mô tả</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={3}
                            className="w-full px-4 py-3 border rounded-lg focus:border-orange-500 focus:outline-none resize-none"
                            placeholder="Mô tả dịch vụ..."
                        />
                    </div>

                    {/* SEO & Service Details */}
                    <div className="border-t pt-4 mt-2">
                        <p className="text-sm font-medium text-gray-700 mb-3">Thông tin bổ sung & SEO</p>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Bảo hành</label>
                                <input
                                    type="text"
                                    value={formData.warranty_text}
                                    onChange={(e) => setFormData({ ...formData, warranty_text: e.target.value })}
                                    className="w-full h-10 px-3 text-sm border rounded-lg focus:border-orange-500 focus:outline-none"
                                    placeholder="BH 12 tháng"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Thời gian sửa</label>
                                <input
                                    type="text"
                                    value={formData.repair_time}
                                    onChange={(e) => setFormData({ ...formData, repair_time: e.target.value })}
                                    className="w-full h-10 px-3 text-sm border rounded-lg focus:border-orange-500 focus:outline-none"
                                    placeholder="30 phút"
                                />
                            </div>
                        </div>
                        <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả SEO (hiển thị trên Google)</label>
                            <textarea
                                value={formData.seoDescription}
                                onChange={(e) => setFormData({ ...formData, seoDescription: e.target.value })}
                                rows={2}
                                maxLength={160}
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:border-orange-500 focus:outline-none resize-none"
                                placeholder="Mô tả ngắn gọn cho SEO (tối đa 160 ký tự)"
                            />
                            <p className="text-xs text-gray-400 mt-0.5">{formData.seoDescription.length}/160</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Tags (phân cách bằng dấu phẩy)</label>
                            <input
                                type="text"
                                value={formData.tags}
                                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                                className="w-full h-10 px-3 text-sm border rounded-lg focus:border-orange-500 focus:outline-none"
                                placeholder="thay pin, iphone, bảo hành"
                            />
                        </div>
                    </div>

                    {/* Active */}
                    <div>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={formData.isActive}
                                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                className="w-5 h-5 accent-orange-500"
                            />
                            <span className="text-sm font-medium">Đang hoạt động</span>
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={onClose} className="flex-1 py-3 border rounded-lg font-medium hover:bg-gray-50">
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                            {service ? 'Cập nhật' : 'Thêm dịch vụ'}
                        </button>
                    </div>
                </form>
        </Modal>
    );
}
