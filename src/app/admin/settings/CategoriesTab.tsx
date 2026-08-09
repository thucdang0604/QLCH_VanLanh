'use client';

import { useState, useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { getDoc } from '@/lib/firestoreLogger';
import { useFirestoreCollection, updateDocument, deleteDocument, addDocumentWithId } from '@/lib/useFirestore';
import { db, getAuthInstance } from '@/lib/firebase';
import { Brand, TaxonomyNode } from '@/lib/types';
import { useConfig } from '@/lib/ConfigContext';
import Modal from '@/components/admin/Modal';
import MediaManager from '@/components/admin/MediaManager';
import { generateSlug } from '@/lib/utils';
import { toastSuccess, toastError, toastWarning } from '@/lib/toast';
import { Plus, Edit, Trash2, Tag, Search, Image as ImageIcon, FolderTree, Sparkles, ChevronRight, ChevronDown, Package } from 'lucide-react';
import Image from 'next/image';
import { requestRevalidate } from '@/lib/requestRevalidate';
import { getIcon } from '@/lib/icon-map';

type CategoryWarrantySelection = NonNullable<TaxonomyNode['warrantyType']> | 'inherit';
type CategoryNodeFormData = Omit<TaxonomyNode, 'id' | 'children' | 'warrantyType' | 'warrantyMonths'> & {
    warrantyType: CategoryWarrantySelection;
    warrantyMonths: number;
};

export default function CategoriesTab() {
    const [activeSubTab, setActiveSubTab] = useState<'categories' | 'brands'>('categories');
    
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Danh mục & Thương hiệu</h1>
                    <p className="text-gray-500 mt-1">Quản lý phân loại sản phẩm và nhãn hiệu cho hệ thống</p>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                <button
                    onClick={() => setActiveSubTab('categories')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                        activeSubTab === 'categories'
                            ? 'bg-white text-orange-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <FolderTree size={16} />
                    Danh mục
                </button>
                <button
                    onClick={() => setActiveSubTab('brands')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                        activeSubTab === 'brands'
                            ? 'bg-white text-orange-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Sparkles size={16} />
                    Thương hiệu
                </button>
            </div>

            {activeSubTab === 'categories' ? <CategoriesList /> : <BrandsList />}
        </div>
    );
}

function CategoriesList() {
    const { config } = useConfig();
    const taxonomy = config.taxonomy || { retail: [], service: [], component: [] };
    const [filterType, setFilterType] = useState<'retail' | 'service' | 'component'>('retail');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNode, setEditingNode] = useState<TaxonomyNode | null>(null);
    const [parentPath, setParentPath] = useState<string[] | null>(null);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [pendingDeleteNode, setPendingDeleteNode] = useState<TaxonomyNode | null>(null);
    const [isDeletingNode, setIsDeletingNode] = useState(false);

    const toggleExpand = (id: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleOpenModal = (node?: TaxonomyNode, pPath?: string[] | null) => {
        setEditingNode(node || null);
        setParentPath(pPath || null);
        setIsModalOpen(true);
    };

    const mutateTaxonomy = async (payload: Record<string, unknown>) => {
        const auth = await getAuthInstance();
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Bạn cần đăng nhập quản trị để thay đổi taxonomy.');

        const response = await fetch('/api/admin/taxonomy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(typeof result.error === 'string' ? result.error : 'Không thể cập nhật taxonomy.');
        }
    };

    const handleDelete = (node: TaxonomyNode) => {
        setPendingDeleteNode(node);
    };

    const confirmDelete = async () => {
        if (!pendingDeleteNode) return;

        setIsDeletingNode(true);
        try {
            await mutateTaxonomy({ action: 'delete', taxonomyType: filterType, nodeId: pendingDeleteNode.id });
            toastSuccess('Đã xoá danh mục');
            setPendingDeleteNode(null);
        } catch (error) {
            toastError(error instanceof Error ? error.message : 'Lỗi khi xoá danh mục');
        } finally {
            setIsDeletingNode(false);
        }
    };

    const handleSaveNode = async (nodeData: CategoryNodeFormData, applyWarrantyToDescendants = false) => {
        await mutateTaxonomy(editingNode
            ? { action: 'update', taxonomyType: filterType, nodeId: editingNode.id, node: nodeData, applyWarrantyToDescendants }
            : { action: 'create', taxonomyType: filterType, parentId: parentPath?.at(-1) ?? null, node: nodeData });
        toastSuccess(editingNode ? 'Đã cập nhật danh mục' : 'Đã thêm danh mục mới');
        setIsModalOpen(false);
    };

    const currentList = taxonomy[filterType] || [];

    const renderNode = (node: TaxonomyNode, level: number, pPath: string[], indexPath: number[]) => {
        const isExpanded = expandedNodes.has(node.id);
        const hasChildren = node.children && node.children.length > 0;
        const currentPath = [...pPath, node.id];
        const canAddChild = level < 2; // Level 0 -> Level 1 -> Level 2 (3 levels max)
        
        return (
            <div key={`node-${indexPath.join('-')}-${node.slug}`} className="w-full">
                <div className={`flex items-center gap-3 px-4 py-3 hover:bg-orange-50/50 group border-b border-gray-50 transition-colors ${level > 0 ? 'ml-' + (level*6) : ''}`}>
                    <div className="flex items-center gap-2 w-8">
                        {hasChildren ? (
                            <button title="Mở rộng" aria-label="Mở rộng" onClick={() => toggleExpand(node.id)} className="p-1 text-gray-400 hover:text-orange-500 rounded-md">
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                        ) : <div className="w-6" />}
                    </div>
                    
                    {node.icon ? (
                        node.icon.startsWith('http') || node.icon.startsWith('/') || node.icon.startsWith('data:') ? (
                            <Image src={node.icon} alt={node.name} width={32} height={32} className="w-8 h-8 object-contain bg-white rounded p-1 border border-gray-100" />
                        ) : (
                            <div className="w-8 h-8 bg-orange-50 rounded flex items-center justify-center border border-orange-100">
                                {(() => {
                                    const IconComp = getIcon(node.icon);
                                    return <IconComp size={16} className="text-orange-500" />;
                                })()}
                            </div>
                        )
                    ) : (
                        <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                            <FolderTree size={14} className="text-gray-400" />
                        </div>
                    )}
                    
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="font-medium text-gray-800 truncate">{node.name}</span>
                        <span className="text-xs text-gray-400 font-mono truncate">/{node.slug}</span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        {canAddChild && (
                            <button title="Thêm danh mục con" onClick={() => handleOpenModal(undefined, currentPath)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors">
                                <Plus size={15} />
                            </button>
                        )}
                        <button title="Sửa" onClick={() => handleOpenModal(node, pPath)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Edit size={15} />
                        </button>
                        <button title="Xoá" onClick={() => handleDelete(node)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={15} />
                        </button>
                    </div>
                </div>
                
                {isExpanded && hasChildren && (
                    <div className="border-l-2 border-gray-100 ml-6">
                        {node.children!.map((child, i) => renderNode(child, level + 1, currentPath, [...indexPath, i]))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
                            <FolderTree size={18} className="text-orange-600" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-gray-800">Cấu trúc danh mục 3 tầng</h2>
                            <p className="text-xs text-gray-400">{currentList.length} danh mục gốc</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as 'retail' | 'service' | 'component')}
                            title="Lọc loại danh mục"
                            aria-label="Lọc loại danh mục"
                            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-gray-50/50"
                        >
                            <option value="retail">Sản phẩm bán lẻ</option>
                            <option value="service">Dịch vụ sửa chữa</option>
                            <option value="component">Linh kiện</option>
                        </select>
                        <button
                            title="Thêm danh mục gốc"
                            onClick={() => handleOpenModal(undefined, [])}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 shadow-sm shadow-orange-500/20 transition-all active:scale-95 font-medium"
                        >
                            <Plus size={16} />
                            Thêm gốc
                        </button>
                    </div>
                </div>

                <div className="flex flex-col">
                    {currentList.length === 0 ? (
                        <div className="px-5 py-12 text-center">
                            <Package size={40} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-400 text-sm">Chưa có danh mục nào trong nhánh này.</p>
                            <button title="Thêm danh mục gốc" onClick={() => handleOpenModal(undefined, [])} className="mt-3 text-sm text-orange-600 hover:text-orange-700 font-medium">+ Thêm danh mục gốc</button>
                        </div>
                    ) : (
                        currentList.map((node, i) => renderNode(node, 0, [], [i]))
                    )}
                </div>
            </section>

            {isModalOpen && (
                <CategoryModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    initialData={editingNode}
                    hasParent={Boolean(parentPath?.length)}
                    hasDescendants={Boolean(editingNode?.children?.length)}
                    onSave={handleSaveNode}
                />
            )}
            <DeleteConfirmModal
                isOpen={Boolean(pendingDeleteNode)}
                title="Xoá danh mục"
                message={pendingDeleteNode
                    ? `Bạn có chắc muốn xoá danh mục "${pendingDeleteNode.name}" và tất cả danh mục con?`
                    : ''}
                confirmText="Xoá danh mục"
                isDeleting={isDeletingNode}
                onClose={() => { if (!isDeletingNode) setPendingDeleteNode(null); }}
                onConfirm={confirmDelete}
            />
        </div>
    );
}

function DeleteConfirmModal({
    isOpen,
    title,
    message,
    confirmText,
    isDeleting,
    onClose,
    onConfirm,
}: {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    isDeleting: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <div className="p-6 space-y-5">
                <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-800">
                    <p className="font-semibold">Thao tác này không thể hoàn tác.</p>
                    <p className="mt-1 leading-relaxed">{message}</p>
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isDeleting}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                    >
                        Hủy
                    </button>
                    <button
                        type="button"
                        onClick={() => { void onConfirm(); }}
                        disabled={isDeleting}
                        className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                    >
                        {isDeleting ? 'Đang xóa...' : confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

function CategoryModal({ isOpen, onClose, initialData, hasParent, hasDescendants, onSave }: { isOpen: boolean, onClose: () => void, initialData: TaxonomyNode | null, hasParent: boolean, hasDescendants: boolean, onSave: (data: CategoryNodeFormData, applyWarrantyToDescendants?: boolean) => Promise<void> }) {
    const [formData, setFormData] = useState<CategoryNodeFormData>({
        name: '',
        slug: '',
        icon: '',
        seoKeywords: '',
        seoDescription: '',
        warrantyType: 'inherit',
        warrantyMonths: 0,
    });
    const [saving, setSaving] = useState(false);
    const [showMediaForIcon, setShowMediaForIcon] = useState(false);
    const [applyWarrantyToDescendants, setApplyWarrantyToDescendants] = useState(false);

    useEffect(() => {
        if (initialData) {
            const legacyInheritedPolicy = hasParent
                && (initialData.warrantyType === undefined || (initialData.warrantyType === 'none' && initialData.warrantyMonths === undefined));
            setFormData({
                name: initialData.name,
                slug: initialData.slug,
                icon: initialData.icon || '',
                seoKeywords: initialData.seoKeywords || '',
                seoDescription: initialData.seoDescription || '',
                warrantyType: legacyInheritedPolicy ? 'inherit' : (initialData.warrantyType || 'none'),
                warrantyMonths: initialData.warrantyMonths ?? 0,
            });
        } else {
            setFormData({
                name: '',
                slug: '',
                icon: '',
                seoKeywords: '',
                seoDescription: '',
                warrantyType: hasParent ? 'inherit' : 'none',
                warrantyMonths: 0,
            });
        }
    }, [hasParent, initialData]);

    useEffect(() => {
        setApplyWarrantyToDescendants(false);
    }, [initialData, isOpen]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.slug) return toastWarning('Tên và Slug không được để trống');
        
        if (formData.warrantyType !== 'none' && formData.warrantyType !== 'inherit' && (!Number.isInteger(formData.warrantyMonths) || Number(formData.warrantyMonths) < 1 || Number(formData.warrantyMonths) > 120)) {
            return toastWarning('Thời hạn bảo hành taxonomy phải từ 1 đến 120 tháng.');
        }

        setSaving(true);
        try {
            await onSave(formData, applyWarrantyToDescendants);
        } catch {
            toastError('Lỗi khi lưu danh mục');
        } finally {
            setSaving(false);
        }
    };

    if (showMediaForIcon) {
        return (
            <Modal isOpen={true} onClose={() => setShowMediaForIcon(false)} title="Chọn Icon">
                <MediaManager
                    isOpen={true}
                    onClose={() => setShowMediaForIcon(false)}
                    defaultFolder="general"
                    onSelect={(url) => {
                        setFormData(prev => ({ ...prev, icon: url }));
                        setShowMediaForIcon(false);
                    }}
                />
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initialData ? '✏️ Sửa Danh mục' : '✨ Thêm Danh mục mới'}>
            <form onSubmit={handleSave} className="p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Tên danh mục *</label>
                        <input
                            type="text"
                            required
                            title="Tên danh mục"
                            value={formData.name}
                            onChange={(e) => {
                                const val = e.target.value;
                                setFormData(prev => ({ ...prev, name: val, slug: initialData ? prev.slug : generateSlug(val) }));
                            }}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                            placeholder="Ví dụ: Điện thoại"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-700">Đường dẫn (Slug) *</label>
                        <input
                            type="text"
                            required
                            value={formData.slug}
                            onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                            disabled={Boolean(initialData)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
                            placeholder="dien-thoai"
                        />
                        {initialData && <p className="mt-1 text-xs text-gray-500">Slug được giữ cố định để không làm đứt liên kết catalog và workflow.</p>}
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Icon / Hình đại diện</label>
                    <div className="flex items-center gap-4">
                        {formData.icon ? (
                            formData.icon.startsWith('http') || formData.icon.startsWith('/') || formData.icon.startsWith('data:') ? (
                                <Image src={formData.icon} alt="Icon preview" width={48} height={48} className="w-12 h-12 object-contain bg-gray-50 border rounded p-1" />
                            ) : (
                                <div className="w-12 h-12 bg-orange-50 border border-orange-100 rounded flex items-center justify-center">
                                    {(() => {
                                        const IconComp = getIcon(formData.icon);
                                        return <IconComp size={24} className="text-orange-500" />;
                                    })()}
                                </div>
                            )
                        ) : (
                            <div className="w-12 h-12 bg-gray-50 border rounded flex items-center justify-center">
                                <ImageIcon size={20} className="text-gray-400" />
                            </div>
                        )}
                        <button
                            type="button"
                            title="Chọn hình"
                            onClick={() => setShowMediaForIcon(true)}
                            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            Chọn hình
                        </button>
                        {formData.icon && (
                            <button
                                type="button"
                                title="Xoá icon"
                                onClick={() => setFormData(prev => ({ ...prev, icon: '' }))}
                                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                Xoá
                            </button>
                        )}
                    </div>
                </div>

                <div className="border-t pt-4 mt-2">
                    <p className="text-sm font-medium text-gray-700 mb-3">📋 Tối ưu SEO</p>
                    <div className="space-y-3">
                        <div>
                            <label className="text-sm font-medium text-gray-700">Mô tả SEO</label>
                            <textarea
                                title="Mô tả SEO"
                                value={formData.seoDescription || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, seoDescription: e.target.value }))}
                                rows={2}
                                maxLength={160}
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-gray-50 resize-none"
                                placeholder="Mô tả ngắn gọn cho trang danh mục này (tối đa 160 ký tự)"
                            />
                            <p className="text-xs text-gray-400 mt-0.5">{(formData.seoDescription || '').length}/160</p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Từ khoá SEO (Keywords)</label>
                            <input
                                type="text"
                                title="Từ khoá SEO"
                                value={formData.seoKeywords || ''}
                                onChange={(e) => setFormData(prev => ({ ...prev, seoKeywords: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-gray-50"
                                placeholder="Cách nhau bằng dấu phẩy. VD: điện thoại, điện thoại cũ, iphone"
                            />
                        </div>
                    </div>
                </div>

                <div className="border-t pt-4 mt-2">
                    <p className="text-sm font-medium text-gray-700 mb-3">📄 Cấu hình In Phiếu Bảo Hành</p>
                    <div>
                        <label htmlFor="category-warranty-type" className="text-sm font-medium text-gray-700 block mb-1">Loại phiếu bảo hành mặc định</label>
                        {hasParent && (
                        <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                checked={formData.warrantyType === 'inherit'}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    warrantyType: e.target.checked ? 'inherit' : 'none',
                                    warrantyMonths: 0,
                                }))}
                            />
                            Kế thừa chính sách bảo hành từ danh mục cha
                        </label>
                        )}
                        {formData.warrantyType !== 'none' && (!hasParent || formData.warrantyType !== 'inherit') && (
                            <div className="mb-3">
                                <label htmlFor="category-warranty-months" className="text-sm font-medium text-gray-700 block mb-1">Thời hạn bảo hành mặc định (tháng)</label>
                                <input
                                    id="category-warranty-months"
                                    type="number"
                                    min={1}
                                    max={120}
                                    step={1}
                                    required
                                    value={formData.warrantyMonths || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, warrantyMonths: e.target.value ? Number(e.target.value) : 0 }))}
                                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-gray-50"
                                    placeholder="Ví dụ: 12"
                                />
                                <p className="text-xs text-gray-500 mt-1">Áp dụng mặc định cho mọi sản phẩm thuộc danh mục này, trừ sản phẩm bật “Bảo hành riêng”.</p>
                            </div>
                        )}
                        <select
                            id="category-warranty-type"
                            title="Loại phiếu bảo hành mặc định"
                            value={hasParent && formData.warrantyType === 'inherit' ? 'none' : formData.warrantyType || 'none'}
                            disabled={hasParent && formData.warrantyType === 'inherit'}
                            onChange={(e) => setFormData(prev => ({
                                ...prev,
                                warrantyType: e.target.value as CategoryWarrantySelection,
                                warrantyMonths: e.target.value === 'none' || e.target.value === 'inherit' ? 0 : prev.warrantyMonths,
                            }))}
                            aria-label="Loại phiếu bảo hành mặc định"
                            className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-gray-50"
                        >
                            <option value="none">Không in phiếu</option>
                            <option value="warrantyDevice">Phiếu Bảo Hành Máy</option>
                            <option value="warrantyRepair">Phiếu Bảo Hành Sửa Chữa</option>
                            <option value="warrantyAccessory">Phiếu Bảo Hành Phụ Kiện</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Khi in hóa đơn cho sản phẩm thuộc danh mục này, hệ thống sẽ sử dụng mẫu phiếu bảo hành tương ứng được thiết lập trong Cài đặt chung.</p>
                    </div>
                </div>

                {initialData && hasDescendants && formData.warrantyType !== 'none' && formData.warrantyType !== 'inherit' && (
                    <label className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
                        <input
                            type="checkbox"
                            checked={applyWarrantyToDescendants}
                            onChange={(event) => setApplyWarrantyToDescendants(event.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-orange-300 text-orange-600 focus:ring-orange-500"
                        />
                        <span>
                            <span className="block font-semibold">Áp dụng chính sách này cho toàn bộ danh mục con</span>
                            <span className="mt-0.5 block text-xs text-orange-800">Các danh mục con sẽ kế thừa chính sách này; các cấu hình bảo hành riêng đang có bên dưới sẽ được xoá.</span>
                        </span>
                    </label>
                )}

                <div className="flex justify-end gap-3 pt-5 border-t border-gray-100">
                    <button type="button" title="Hủy" onClick={onClose} className="px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium">
                        Hủy
                    </button>
                    <button type="submit" title="Lưu" disabled={saving} className="flex items-center gap-2 px-6 py-2.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 shadow-lg shadow-orange-500/25 disabled:opacity-50 transition-all active:scale-95 font-medium">
                        {saving ? 'Đang lưu...' : initialData ? '💾 Cập nhật' : '✨ Tạo danh mục'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}


function BrandsList() {
    const { data: brands, loading } = useFirestoreCollection<Brand>('brands');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Brand | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [pendingDeleteBrand, setPendingDeleteBrand] = useState<Brand | null>(null);
    const [isDeletingBrand, setIsDeletingBrand] = useState(false);

    const handleOpenModal = (item?: Brand) => {
        setEditingItem(item || null);
        setIsModalOpen(true);
    };

    const handleDelete = (brand: Brand) => {
        setPendingDeleteBrand(brand);
    };

    const confirmDelete = async () => {
        if (!pendingDeleteBrand) return;

        setIsDeletingBrand(true);
        try {
            await deleteDocument('brands', pendingDeleteBrand.id);
            toastSuccess('Đã xoá thương hiệu');
            void requestRevalidate(['layout'], ['categories', 'config']);
            setPendingDeleteBrand(null);
        } catch {
            toastError('Lỗi khi xoá thương hiệu');
        } finally {
            setIsDeletingBrand(false);
        }
    };

    const filtered = brands.filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (loading) return <div className="p-8 text-center text-gray-500">Đang tải thương hiệu...</div>;

    return (
        <div className="space-y-4">
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Sparkles size={18} className="text-purple-600" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-gray-800">Thương hiệu</h2>
                            <p className="text-xs text-gray-400">{filtered.length} thương hiệu</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                            <input
                                type="text"
                                placeholder="Tìm kiếm..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 w-44 bg-gray-50/50"
                            />
                        </div>
                        <button
                            title="Thêm thương hiệu"
                            onClick={() => handleOpenModal()}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 shadow-sm shadow-orange-500/20 transition-all active:scale-95 font-medium"
                        >
                            <Plus size={16} />
                            Thêm mới
                        </button>
                    </div>
                </div>

                <div className="p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {filtered.length === 0 ? (
                            <div className="col-span-full py-12 text-center">
                                <Tag size={40} className="mx-auto text-gray-300 mb-3" />
                                <p className="text-gray-400 text-sm">Chưa có thương hiệu nào.</p>
                                <button onClick={() => handleOpenModal()} className="mt-3 text-sm text-orange-600 hover:text-orange-700 font-medium">+ Thêm thương hiệu đầu tiên</button>
                            </div>
                        ) : (
                            filtered.map(brand => (
                                <div key={brand.id} className="border border-gray-100 rounded-xl p-4 bg-gradient-to-b from-white to-gray-50/50 hover:shadow-md hover:border-orange-200 transition-all group relative cursor-pointer" onClick={() => handleOpenModal(brand)}>
                                    <div className="aspect-square bg-white rounded-lg flex items-center justify-center p-3 mb-3 border border-gray-100">
                                        {brand.logoUrl ? (
                                            <Image src={brand.logoUrl} alt={brand.name} width={120} height={120} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                                        ) : (
                                            <Tag size={28} className="text-gray-200" />
                                        )}
                                    </div>
                                    <h3 className="font-medium text-center text-gray-800 truncate text-sm" title={brand.name}>
                                        {brand.name}
                                    </h3>
                                    {/* Hover overlay */}
                                    <div className="absolute top-2 right-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(brand); }}
                                            className="p-1.5 bg-white/90 text-gray-400 hover:text-red-600 rounded-lg shadow-sm border border-gray-100 transition-colors"
                                            title="Xoá"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>

            {isModalOpen && (
                <BrandModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    initialData={editingItem}
                />
            )}
            <DeleteConfirmModal
                isOpen={Boolean(pendingDeleteBrand)}
                title="Xoá thương hiệu"
                message={pendingDeleteBrand ? `Bạn có chắc muốn xoá thương hiệu "${pendingDeleteBrand.name}"?` : ''}
                confirmText="Xoá thương hiệu"
                isDeleting={isDeletingBrand}
                onClose={() => { if (!isDeletingBrand) setPendingDeleteBrand(null); }}
                onConfirm={confirmDelete}
            />
        </div>
    );
}

function BrandModal({ isOpen, onClose, initialData }: { isOpen: boolean, onClose: () => void, initialData: Brand | null }) {
    const [formData, setFormData] = useState<Partial<Brand>>({
        name: '',
        logoUrl: ''
    });
    const [saving, setSaving] = useState(false);
    const [showMediaForLogo, setShowMediaForLogo] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return toastWarning('Tên thương hiệu không được để trống');

        setSaving(true);
        try {
            const payload = { ...formData };
            delete payload.id;

            if (initialData) {
                await updateDocument('brands', initialData.id, payload);
                toastSuccess('Cập nhật thương hiệu thành công');
            } else {
                await addDocumentWithId('brands', await getAvailableBrandId(String(payload.name || 'brand')), payload);
                toastSuccess('Thêm thương hiệu mới thành công');
            }
            void requestRevalidate(['layout'], ['categories', 'config']);
            onClose();
        } catch {
            toastError('Lỗi khi lưu thương hiệu');
        } finally {
            setSaving(false);
        }
    };

    if (showMediaForLogo) {
        return (
            <Modal isOpen={true} onClose={() => setShowMediaForLogo(false)} title="Chọn Logo">
                <MediaManager
                    isOpen={true}
                    onClose={() => setShowMediaForLogo(false)}
                    defaultFolder="logo-brand"
                    onSelect={(url) => {
                        setFormData(prev => ({ ...prev, logoUrl: url }));
                        setShowMediaForLogo(false);
                    }}
                />
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initialData ? '✏️ Sửa Thương hiệu' : '✨ Thêm Thương hiệu mới'} size="lg">
            <form onSubmit={handleSave} className="p-6 space-y-5">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Tên thương hiệu *</label>
                    <input
                        type="text"
                        required
                        title="Tên thương hiệu"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                        placeholder="Ví dụ: Apple, Samsung..."
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Logo (Nên dùng ảnh PNG trong suốt)</label>
                    <div className="flex items-center gap-4">
                        {formData.logoUrl ? (
                            <div className="w-24 h-24 bg-gray-50 border rounded flex items-center justify-center p-2 relative">
                                <Image src={formData.logoUrl} alt="Logo preview" width={80} height={80} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                            </div>
                        ) : (
                            <div className="w-24 h-24 bg-gray-50 border border-dashed rounded flex items-center justify-center">
                                <ImageIcon size={24} className="text-gray-400" />
                            </div>
                        )}
                        <div className="space-y-2">
                            <button
                                type="button"
                                title="Chọn Logo"
                                onClick={() => setShowMediaForLogo(true)}
                                className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 transition-colors block"
                            >
                                Chọn Logo
                            </button>
                            {formData.logoUrl && (
                                <button
                                    type="button"
                                    title="Xoá Logo"
                                    onClick={() => setFormData(prev => ({ ...prev, logoUrl: '' }))}
                                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors block"
                                >
                                    Xoá Logo
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-5 border-t border-gray-100">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium">
                        Hủy
                    </button>
                    <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 shadow-lg shadow-orange-500/25 disabled:opacity-50 transition-all active:scale-95 font-medium">
                        {saving ? 'Đang lưu...' : '💾 Lưu thương hiệu'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

async function getAvailableBrandId(name: string) {
    const baseId = `BR-${generateSlug(name).slice(0, 90) || 'brand'}`;
    for (let i = 0; i < 50; i += 1) {
        const candidate = i === 0 ? baseId : `${baseId}-${i + 1}`;
        const snap = await getDoc(doc(db, 'brands', candidate));
        if (!snap.exists()) return candidate;
    }
    throw new Error('Không thể tạo mã thương hiệu không trùng.');
}
