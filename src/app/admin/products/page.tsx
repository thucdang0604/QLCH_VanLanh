'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Plus, Search, Edit, Trash2, X, Upload, Loader2, Package } from 'lucide-react';
import { useFirestoreCollection, updateDocument, deleteDocument, addDocumentWithId } from '@/lib/useFirestore';
import { uploadImage, deleteImage } from '@/lib/storage';
import { generateSlug } from '@/lib/utils';
import { orderBy, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';


// Product type
interface Product {
    id: string;
    name: string;
    price_original: number;
    price_promo?: number;
    category: string;
    subCategory?: string;
    brand: string;
    description: string;
    imageUrl: string;
    images?: string[];
    stock: number;
    status: 'active' | 'inactive';
    condition?: 'new' | 'like-new' | 'used';
    isFlashSale?: boolean;
    sold?: number;
    createdAt?: any;
}

const CONDITIONS: { value: Product['condition'] | ''; label: string; color: string }[] = [
    { value: '', label: 'Tất cả tình trạng', color: '' },
    { value: 'new', label: 'Mới 100%', color: 'bg-green-100 text-green-700' },
    { value: 'like-new', label: 'Cũ 99%', color: 'bg-blue-100 text-blue-700' },
    { value: 'used', label: 'Hàng cũ | TBH', color: 'bg-yellow-100 text-yellow-700' },
];

const categories = ['Điện thoại', 'Laptop', 'Tablet', 'Phụ kiện', 'Smartwatch', 'Âm thanh'];
const brands = ['Apple', 'Samsung', 'Xiaomi', 'OPPO', 'Vivo', 'Dell', 'HP', 'Lenovo', 'Asus', 'Sony'];
const accessorySubCategories = ['Ốp lưng', 'Sạc dự phòng', 'Cáp sạc', 'Cóc sạc', 'Tai nghe', 'Khác'];

export default function ProductsPage() {
    const { data: products, loading } = useFirestoreCollection<Product>('products', [orderBy('createdAt', 'desc')]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterCondition, setFilterCondition] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const handleDelete = async (product: Product) => {
        if (confirm(`Bạn có chắc muốn xóa "${product.name}"?`)) {
            try {
                // Delete image from storage
                if (product.imageUrl) {
                    await deleteImage(product.imageUrl);
                }
                // Delete document
                await deleteDocument('products', product.id);
            } catch (error) {
                alert('Lỗi khi xóa sản phẩm!');
            }
        }
    };

    const filteredProducts = products.filter((p) => {
        if (p.category === 'Linh kiện') return false; // Linh kiện managed separately in /admin/parts
        const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchCategory = !filterCategory || p.category === filterCategory;
        const matchCondition = !filterCondition || p.condition === filterCondition;
        return matchSearch && matchCategory && matchCondition;
    });

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý sản phẩm</h1>
                    <p className="text-gray-500">{products.length} sản phẩm</p>
                </div>
                <button
                    onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
                    className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-orange-600 transition-colors"
                >
                    <Plus size={20} />
                    Thêm sản phẩm
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Tìm sản phẩm..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                    />
                </div>
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                >
                    <option value="">Tất cả danh mục</option>
                    {categories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
                <select
                    value={filterCondition}
                    onChange={(e) => setFilterCondition(e.target.value)}
                    className="h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                >
                    {CONDITIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                </select>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 size={32} className="animate-spin text-orange-500" />
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-20">
                        <Package size={48} className="mx-auto text-gray-300 mb-4" />
                        <p className="text-gray-500">Chưa có sản phẩm nào</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Sản phẩm</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Danh mục</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tình trạng</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Giá</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tồn kho</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Hành động</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredProducts.map((product) => (
                                <tr key={product.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
                                                {product.imageUrl ? (
                                                    <Image
                                                        src={product.imageUrl}
                                                        alt={product.name}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <Package size={24} className="absolute inset-0 m-auto text-gray-400" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 line-clamp-1">{product.name}</p>
                                                <p className="text-xs text-gray-500">{product.brand}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">{product.category}</td>
                                    <td className="px-6 py-4">
                                        {(() => {
                                            const cond = CONDITIONS.find(c => c.value === product.condition);
                                            return cond?.value ? (
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${cond.color}`}>
                                                    {cond.label}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-400">—</span>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-6 py-4">
                                        {product.price_promo ? (
                                            <div>
                                                <p className="text-sm font-bold text-red-600">{formatPrice(product.price_promo)}</p>
                                                <p className="text-xs text-gray-400 line-through">{formatPrice(product.price_original)}</p>
                                            </div>
                                        ) : (
                                            <p className="text-sm font-medium">{formatPrice(product.price_original)}</p>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-sm font-medium ${product.stock > 10 ? 'text-green-600' : product.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                                            {product.stock}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${product.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                            {product.status === 'active' ? 'Đang bán' : 'Tạm ẩn'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => { setEditingProduct(product); setIsModalOpen(true); }}
                                                className="p-2 hover:bg-blue-100 text-blue-600 rounded-lg"
                                            >
                                                <Edit size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(product)}
                                                className="p-2 hover:bg-red-100 text-red-600 rounded-lg"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <ProductModal
                    product={editingProduct}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </div>
    );
}

// Product Modal Component
function ProductModal({
    product,
    onClose,
}: {
    product: Product | null;
    onClose: () => void;
}) {
    const [formData, setFormData] = useState({
        name: product?.name || '',
        price_original: product?.price_original || '' as number | '',
        price_promo: product?.price_promo || '' as number | '',
        category: product?.category || categories[0],
        brand: product?.brand || brands[0],
        description: product?.description || '',
        stock: product?.stock ?? '' as number | '',
        status: product?.status || 'active',
        condition: product?.condition || 'new' as Product['condition'],
        isFlashSale: product?.isFlashSale || false,
        subCategory: product?.subCategory || '',
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>(product?.imageUrl || '');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            let imageUrl = product?.imageUrl || '';

            // Upload new image if selected
            if (imageFile) {
                // Delete old image if updating
                if (product?.imageUrl) {
                    await deleteImage(product.imageUrl);
                }
                // Upload new image
                imageUrl = await uploadImage(imageFile, 'products');
            }

            // Validate: must have image
            if (!imageUrl) {
                alert('Vui lòng chọn ảnh sản phẩm!');
                setIsSubmitting(false);
                return;
            }

            const data = {
                ...formData,
                price_original: Number(formData.price_original) || 0,
                price_promo: Number(formData.price_promo) || 0,
                stock: Number(formData.stock) || 0,
                imageUrl,
                sold: product?.sold || 0,
            };

            if (product) {
                // Update existing
                await updateDocument('products', product.id, data);
            } else {
                // Create new with Slug
                const baseSlug = generateSlug(data.name);
                let finalSlug = baseSlug;
                const checkRef = await getDoc(doc(db, 'products', baseSlug));
                if (checkRef.exists()) {
                    finalSlug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
                }
                await addDocumentWithId('products', finalSlug, data);
            }

            onClose();
        } catch (error) {
            console.error('Error saving product:', error);
            alert('Lỗi khi lưu sản phẩm!');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
                    <h2 className="text-xl font-bold">{product ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Image Upload */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Ảnh sản phẩm *</label>
                        <div className="border-2 border-dashed rounded-xl p-4 text-center">
                            {imagePreview ? (
                                <div className="relative w-32 h-32 mx-auto mb-3">
                                    <Image
                                        src={imagePreview}
                                        alt="Preview"
                                        fill
                                        className="object-cover rounded-lg"
                                    />
                                </div>
                            ) : (
                                <div className="w-32 h-32 mx-auto mb-3 bg-gray-100 rounded-lg flex items-center justify-center">
                                    <Upload size={32} className="text-gray-400" />
                                </div>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                className="hidden"
                                id="image-upload"
                            />
                            <label
                                htmlFor="image-upload"
                                className="cursor-pointer text-orange-600 hover:text-orange-700 font-medium"
                            >
                                {imagePreview ? 'Đổi ảnh' : 'Chọn ảnh'}
                            </label>
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Tên sản phẩm *</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            required
                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            placeholder="iPhone 15 Pro Max 256GB"
                        />
                    </div>

                    {/* Price */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Giá gốc (VNĐ) *</label>
                            <input
                                type="number"
                                value={formData.price_original}
                                onChange={(e) => setFormData({ ...formData, price_original: e.target.value ? Number(e.target.value) : '' })}
                                required
                                min={0}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Giá khuyến mãi</label>
                            <input
                                type="number"
                                value={formData.price_promo}
                                onChange={(e) => setFormData({ ...formData, price_promo: e.target.value ? Number(e.target.value) : '' })}
                                min={0}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    {/* Category & Brand */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Danh mục</label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value, subCategory: e.target.value === 'Phụ kiện' ? formData.subCategory : '' })}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            >
                                {categories.map((cat) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Thương hiệu</label>
                            <select
                                value={formData.brand}
                                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            >
                                {brands.map((brand) => (
                                    <option key={brand} value={brand}>{brand}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Subcategory for Phụ kiện */}
                    {formData.category === 'Phụ kiện' && (
                        <div>
                            <label className="block text-sm font-medium mb-1">Loại phụ kiện</label>
                            <select
                                value={formData.subCategory}
                                onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                            >
                                <option value="">— Chọn loại —</option>
                                {accessorySubCategories.map((sub) => (
                                    <option key={sub} value={sub}>{sub}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Condition */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Tình trạng sản phẩm *</label>
                        <div className="grid grid-cols-3 gap-2">
                            {CONDITIONS.filter(c => c.value).map(c => (
                                <label
                                    key={c.value}
                                    className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${formData.condition === c.value
                                        ? 'border-orange-400 bg-orange-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="condition"
                                        value={c.value}
                                        checked={formData.condition === c.value}
                                        onChange={() => setFormData({ ...formData, condition: c.value as Product['condition'] })}
                                        className="accent-orange-500"
                                    />
                                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${c.color}`}>{c.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Stock & Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Số lượng tồn kho</label>
                            <input
                                type="number"
                                value={formData.stock}
                                onChange={(e) => setFormData({ ...formData, stock: e.target.value ? Number(e.target.value) : '' })}
                                min={0}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Trạng thái</label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
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
                                checked={formData.isFlashSale}
                                onChange={(e) => setFormData({ ...formData, isFlashSale: e.target.checked })}
                                className="w-5 h-5 accent-orange-500"
                            />
                            <span className="text-sm font-medium">Hiển thị trong Flash Sale</span>
                        </label>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium mb-1">Mô tả</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={4}
                            className="w-full px-4 py-3 border rounded-lg focus:border-orange-500 focus:outline-none resize-none"
                            placeholder="Mô tả chi tiết sản phẩm..."
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border rounded-lg font-medium hover:bg-gray-50"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-3 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                            {product ? 'Cập nhật' : 'Thêm sản phẩm'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
