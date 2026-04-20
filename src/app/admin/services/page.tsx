'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
    Plus,
    Search,
    Edit,
    Trash2,
    Upload,
    Loader2,
    Wrench
} from 'lucide-react';
import { useFirestoreCollection, addDocument, updateDocument, deleteDocument } from '@/lib/useFirestore';
import { uploadImage, deleteImage } from '@/lib/storage';
import { orderBy } from 'firebase/firestore';
import type { FirestoreDateValue } from '@/lib/types';
import { toastError } from '@/lib/toast';
import { useClientPagination } from '@/lib/useClientPagination';
import PaginationBar from '@/components/admin/PaginationBar';
import { triggerRevalidate } from '@/lib/revalidate';
import Modal from '@/components/admin/Modal';
import MediaManager from '@/components/admin/MediaManager';

interface Service {
    id: string;
    name: string;
    description: string;
    price: string;
    device_model: string;
    imageUrl?: string;
    icon?: string;
    category: string;
    isActive: boolean;
    createdAt?: FirestoreDateValue;
}

const serviceCategories = ['Sửa chữa', 'Thay thế', 'Bảo hành', 'Nâng cấp', 'Khác'];

export default function ServicesPage() {
    const { data: services, loading } = useFirestoreCollection<Service>('services', [orderBy('createdAt', 'desc')]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingService, setEditingService] = useState<Service | null>(null);

    const handleDelete = async (service: Service) => {
        if (confirm(`Bạn có chắc muốn xóa dịch vụ "${service.name}"?`)) {
            try {
                if (service.imageUrl) {
                    await deleteImage(service.imageUrl);
                }
                await deleteDocument('services', service.id);
                await triggerRevalidate(['/', `/service/${service.id}`, '/category/sua-chua', '/sitemap.xml'], ['services']);
            } catch (error) {
                toastError('Lỗi khi xóa dịch vụ!');
            }
        }
    };

    const filteredServices = services.filter((s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const { paginatedData: paginatedServices, currentPage, totalPages, pageSize, totalFiltered, setPage, setPageSize, resetPage } = useClientPagination(filteredServices, 20);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { resetPage(); }, [searchQuery]);

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

            {/* Search */}
            <div className="relative max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                    type="text"
                    placeholder="Tìm dịch vụ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                />
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
                    {paginatedServices.map((service) => (
                        <div key={service.id} className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
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
                                        onClick={() => { setEditingService(service); setIsModalOpen(true); }}
                                        className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg"
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(service)}
                                        className="p-2 hover:bg-red-100 text-red-600 rounded-lg"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                            <h3 className="font-semibold text-gray-900 mb-1">{service.name}</h3>
                            <p className="text-sm text-gray-500 line-clamp-2 mb-3">{service.description}</p>
                            <div className="flex items-center justify-between">
                                <span className="text-orange-600 font-bold">{service.price}</span>
                                <span className={`px-2 py-1 text-xs rounded-full ${service.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                    }`}>
                                    {service.isActive ? 'Hoạt động' : 'Tạm dừng'}
                                </span>
                            </div>
                        </div>
                    ))}
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
            />
        </div>
    );
}

// Service Modal
function ServiceModal({
    isOpen,
    service,
    onClose,
}: {
    isOpen: boolean;
    service: Service | null;
    onClose: () => void;
}) {
    const [formData, setFormData] = useState({
        name: service?.name || '',
        description: service?.description || '',
        price: service?.price || '',
        device_model: service?.device_model || '',
        category: service?.category || serviceCategories[0],
        isActive: service?.isActive ?? true,
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [selectedImageUrl, setSelectedImageUrl] = useState<string>(service?.imageUrl || '');
    const [imagePreview, setImagePreview] = useState<string>(service?.imageUrl || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isMediaManagerOpen, setIsMediaManagerOpen] = useState(false);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
            setSelectedImageUrl('');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            // Có thể không có ảnh, nên chấp nhận cả: ảnh cũ, ảnh thư viện, hoặc không ảnh
            let imageUrl = selectedImageUrl || service?.imageUrl || '';

            if (imageFile) {
                if (service?.imageUrl) {
                    await deleteImage(service.imageUrl);
                }
                imageUrl = await uploadImage(imageFile, 'services');
            }

            const data = {
                ...formData,
                imageUrl,
            };

            if (service) {
                await updateDocument('services', service.id, data);
                await triggerRevalidate(['/', `/service/${service.id}`, '/category/sua-chua', '/sitemap.xml'], ['services']);
            } else {
                await addDocument('services', data);
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
        <Modal isOpen={isOpen} onClose={onClose} title={service ? 'Sửa dịch vụ' : 'Thêm dịch vụ'} size="lg">

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Image */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Ảnh dịch vụ</label>
                        <div className="border-2 border-dashed rounded-xl p-4 text-center">
                            {imagePreview ? (
                                <div className="relative w-20 h-20 mx-auto mb-3">
                                    <Image src={imagePreview} alt="Preview" fill className="object-cover rounded-lg" />
                                </div>
                            ) : (
                                <div className="w-20 h-20 mx-auto mb-3 bg-gray-100 rounded-lg flex items-center justify-center">
                                    <Upload size={24} className="text-gray-400" />
                                </div>
                            )}
                            <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" id="service-image" />
                            <div className="flex items-center justify-center gap-4 mt-2">
                                <label htmlFor="service-image" className="cursor-pointer text-orange-600 hover:text-orange-700 font-medium text-sm">
                                    {imagePreview ? 'Đổi ảnh (upload mới)' : 'Upload ảnh mới'}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setIsMediaManagerOpen(true)}
                                    className="text-xs text-gray-600 hover:text-orange-600 underline"
                                >
                                    Chọn từ thư viện
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* MediaManager — shared component */}
                    <MediaManager
                        isOpen={isMediaManagerOpen}
                        onClose={() => setIsMediaManagerOpen(false)}
                        onSelect={(url) => {
                            setSelectedImageUrl(url);
                            setImagePreview(url);
                            setImageFile(null);
                        }}
                        title="Chọn ảnh dịch vụ"
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
                                { group: '🍎', items: ['iPhone 16 Pro Max', 'iPhone 15 Pro Max', 'iPhone 14', 'iPhone 13', 'iPhone 12', 'iPhone 11'] },
                                { group: '🌌', items: ['Galaxy S25 Ultra', 'Galaxy S24 Ultra', 'Galaxy A55', 'Galaxy Z Fold6'] },
                                { group: '📱', items: ['Xiaomi 14', 'Redmi Note 13 Pro', 'OPPO Reno 12', 'OPPO A78', 'Vivo V30'] },
                                { group: '💻', items: ['MacBook Pro', 'MacBook Air', 'Dell XPS', 'HP Pavilion', 'Lenovo ThinkPad'] },
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
                    <div>
                        <label className="block text-sm font-medium mb-1">Giá dịch vụ *</label>
                        <input
                            type="text"
                            value={formData.price}
                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                            required
                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            placeholder="Từ 350.000đ"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Danh mục</label>
                        <select
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                        >
                            {serviceCategories.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
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
