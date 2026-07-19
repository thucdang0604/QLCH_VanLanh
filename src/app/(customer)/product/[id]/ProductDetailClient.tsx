'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    Heart,
    ShoppingCart,
    Truck,
    Shield,
    RefreshCw,
    Minus,
    Plus,
    Calendar,
    Wrench,
    Star,
    MessageSquare,
} from 'lucide-react';
import VideoEmbed from '@/components/VideoEmbed';
import CatalogImage from '@/components/customer/CatalogImage';
import { useCart } from '@/lib/CartContext';

// Format price to VND
const formatPrice = (price: number | string | undefined) => {
    if (!price) return 'Liên hệ';
    const numPrice = typeof price === 'string' ? parseFloat(price.replace(/[^0-9]/g, '')) : price;
    if (isNaN(numPrice) || numPrice <= 0) return 'Liên hệ';

    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
    }).format(numPrice).replace('₫', 'đ');
};

export interface ProductData {
    id: string;
    name: string;
    _type?: string;
    images?: string[];
    imageUrl?: string;
    image?: string;
    price?: number;
    price_original?: number;
    price_promo?: number;
    hidePrice?: boolean;
    description?: string;
    content?: string;
    seoDescription?: string;
    specs?: Record<string, string>;
    stock?: number;
    color?: string;
    storage?: string;
    category?: string;
    slug?: string;
    videoEmbedUrl?: string;
    brand?: string;
    sold?: number;
    sku?: string;
    rating?: number;
    reviewCount?: number;
}

interface VariantItem {
    id: string;
    name: string;
    slug: string;
    color: string;
    storageCapacity: string;
    conditionLabel: string;
    price_original: number;
    price_promo: number;
    images: string[];
    imageUrl: string;
}

interface ReviewItem {
    id: string;
    customerName: string;
    rating: number;
    content: string;
    createdAt: number;
}

interface ProductDetailClientProps {
    data: ProductData;
    variants?: VariantItem[];
}

export default function ProductDetailClient({ data, variants = [] }: ProductDetailClientProps) {
    const [activeImage, setActiveImage] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const { addItem } = useCart();

    if (!data) return null;

    const isService = data._type === 'service';
    const hidePrice = data.hidePrice === true;
    const images = data.images || (data.imageUrl ? [data.imageUrl] : (data.image ? [data.image] : []));
    const originalPrice = data.price_original || (typeof data.price === 'number' ? data.price : 0);
    const promoPrice = data.price_promo || 0;
    const hasDiscount = !hidePrice && promoPrice > 0 && promoPrice < originalPrice;
    const displayPrice = hidePrice ? 0 : (promoPrice > 0 ? promoPrice : (originalPrice > 0 ? originalPrice : 0));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-white rounded-2xl p-6 shadow-sm">
            {/* Product Gallery */}
            <div className="space-y-4">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border">
                    <CatalogImage
                        src={images[activeImage]}
                        alt={data.name ?? 'Sản phẩm'}
                        sizes="(max-width: 1024px) 100vw, 50vw"
                        priority
                        imageClassName="object-contain p-4"
                        logoClassName="h-full w-full object-contain p-8"
                    />
                </div>

                {images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {images.map((img: string, idx: number) => (
                            <button
                                key={idx}
                                onClick={() => setActiveImage(idx)}
                                title={`Xem ảnh ${idx + 1}`}
                                aria-label={`Xem ảnh ${idx + 1}`}
                                className={`relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                                    activeImage === idx ? 'border-orange-500 ring-2 ring-orange-100' : 'border-gray-100 hover:border-orange-200'
                                }`}
                            >
                                <Image src={img} alt={`${data.name} ${idx}`} fill className="object-cover" />
                            </button>
                        ))}
                    </div>
                )}

                {/* Video Embed */}
                {data.videoEmbedUrl && <VideoEmbed url={data.videoEmbedUrl} />}
            </div>

            {/* Product Info */}
            <div className="space-y-6">
                <div>
                    {data.brand && (
                        <p className="text-orange-600 font-semibold text-sm mb-1 uppercase tracking-wider">
                            {data.brand}
                        </p>
                    )}
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                        {data.name}
                    </h1>
                    <div className="flex items-center gap-4 mt-3 text-sm">
                        <span className="text-gray-500">Đã bán {data.sold || 50}+</span>
                        {data.stock !== undefined && (
                            <>
                                <span className="text-gray-300">|</span>
                                <span className={data.stock > 0 ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                                    {data.stock > 0 ? `Còn ${data.stock} sản phẩm` : "Hết hàng"}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Price Section */}
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                    <div className="flex items-center gap-4 flex-wrap">
                        {hidePrice ? (
                            <span className="text-2xl font-extrabold text-red-600">Liên hệ nhận báo giá</span>
                        ) : (
                            <span className="text-3xl font-extrabold text-red-600">
                                {formatPrice(displayPrice)}
                            </span>
                        )}
                        {hasDiscount && (
                            <>
                                <span className="text-gray-400 text-lg line-through decoration-gray-400/50">
                                    {formatPrice(originalPrice)}
                                </span>
                                <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-lg">
                                    -{Math.round((1 - promoPrice / originalPrice) * 100)}%
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Variants Selector */}
                {variants.length > 0 && (
                    <div className="space-y-3">
                        <p className="font-semibold text-gray-900">Tùy chọn phiên bản:</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {variants.map(v => {
                                const vPrice = v.price_promo || v.price_original;
                                const isActive = v.id === data.id;
                                return (
                                    <Link 
                                        key={v.id} 
                                        href={`/product/${v.slug || v.id}`}
                                        className={`flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all text-center ${
                                            isActive 
                                                ? 'border-orange-500 bg-orange-50 shadow-sm relative' 
                                                : 'border-gray-200 hover:border-orange-300 bg-white'
                                        }`}
                                    >
                                        {isActive && (
                                            <div className="absolute -top-2 -right-2 bg-orange-500 text-white rounded-full p-0.5">
                                                <Star size={12} className="fill-white" />
                                            </div>
                                        )}
                                        <span className={`text-xs sm:text-sm font-semibold line-clamp-2 ${isActive ? 'text-orange-700' : 'text-gray-800'}`}>
                                            {v.name.replace(data.brand || '', '').trim()}
                                        </span>
                                        <span className={`text-xs mt-1 font-bold ${isActive ? 'text-orange-600' : 'text-red-600'}`}>
                                            {formatPrice(vPrice)}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Description (Short) */}
                {data.description && (
                    <div className="text-gray-600 text-sm leading-relaxed">
                        <p className="line-clamp-3">{data.description}</p>
                    </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] gap-3 pt-4 sm:flex sm:flex-row">
                    {!isService && (
                        <div className="col-span-2 flex h-14 items-center justify-between border-2 border-gray-100 rounded-xl bg-white sm:col-span-1 sm:h-12 sm:justify-start">
                            <button
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                title="Giảm số lượng"
                                aria-label="Giảm số lượng"
                                className="h-full w-14 px-4 hover:bg-gray-50 transition-colors sm:w-auto"
                            >
                                <Minus size={16} />
                            </button>
                            <span className="w-12 text-center font-bold">{quantity}</span>
                            <button
                                onClick={() => setQuantity(quantity + 1)}
                                title="Tăng số lượng"
                                aria-label="Tăng số lượng"
                                className="h-full w-14 px-4 hover:bg-gray-50 transition-colors sm:w-auto"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    )}

                    <button 
                        onClick={() => {
                            if (!isService && data.id) {
                                addItem({
                                    id: data.id,
                                    name: data.name,
                                    image: images[0] || '',
                                    price: displayPrice,
                                    originalPrice: originalPrice,
                                    quantity: quantity,
                                    stock: data.stock || 0
                                });
                            } else if (isService) {
                                window.location.href = '#booking';
                            }
                        }}
                        className="col-span-1 flex min-h-14 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-700 sm:h-12 sm:flex-1 sm:text-base"
                    >
                        {isService ? <Wrench size={20} /> : <ShoppingCart size={20} />}
                        {isService ? 'ĐẶT LỊCH SỬA NGAY' : 'THÊM VÀO GIỎ HÀNG'}
                    </button>

                    {isService && (
                        <Link href="/#booking" className="col-span-1 flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-orange-200 px-5 text-sm font-bold text-orange-600 transition-all hover:bg-orange-50 sm:h-12 sm:text-base">
                            <Calendar size={18} />
                            Đặt lịch
                        </Link>
                    )}

                    <button title="Thêm vào danh sách yêu thích" aria-label="Thêm vào danh sách yêu thích" className="flex h-14 w-14 items-center justify-center rounded-xl border-2 border-gray-100 transition-all hover:border-red-100 hover:bg-red-50 group sm:h-12 sm:w-12">
                        <Heart size={20} className="text-gray-400 group-hover:text-red-500 transition-colors" />
                    </button>
                </div>

                {/* Fast Support */}
                <div className="grid grid-cols-3 gap-3 pt-6 border-t border-dashed">
                    <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-green-50/50">
                        <Truck className="text-green-600" size={20} />
                        <span className="text-[10px] sm:text-xs font-medium text-green-700 text-center">Giao hàng tận nơi</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-blue-50/50">
                        <Shield className="text-blue-600" size={20} />
                        <span className="text-[10px] sm:text-xs font-medium text-blue-700 text-center">Bảo hành uy tín</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-orange-50/50">
                        <RefreshCw className="text-orange-600" size={20} />
                        <span className="text-[10px] sm:text-xs font-medium text-orange-700 text-center">Đổi trả 1-1</span>
                    </div>
                </div>
            </div>

            {/* Reviews Section was here */}
        </div>
    );
}

export function ProductReviews({ data, reviews = [] }: { data: ProductData, reviews?: ReviewItem[] }) {
    if (data._type !== 'product') return null;
    
    return (
        <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span>
                <MessageSquare size={20} className="text-orange-500" />
                Đánh giá & Nhận xét ({reviews.length})
            </h2>
            {reviews.length > 0 ? (
                <div className="space-y-4">
                    {reviews.map(r => (
                        <div key={r.id} className="border-b border-gray-50 pb-4 last:border-0">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 font-bold text-sm">
                                    {r.customerName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-800 text-sm">{r.customerName}</p>
                                    <div className="flex items-center gap-0.5">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star key={i} size={14}
                                                className={i < r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}
                                            />
                                        ))}
                                        <span className="text-xs text-gray-400 ml-2">
                                            {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <p className="text-gray-600 text-sm mt-2 pl-12">{r.content}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-gray-400">
                    <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Chưa có đánh giá nào cho sản phẩm này.</p>
                </div>
            )}
            {/* Submit review form — client-side submission to /api/reviews */}
            <ReviewForm productId={data.id} productName={data.name} />
        </div>
    );
}

/** Inline review submission form */
function ReviewForm({ productId, productName }: { productId: string; productName: string }) {
    const [name, setName] = useState('');
    const [rating, setRating] = useState(5);
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    if (submitted) {
        return (
            <div className="mt-6 bg-green-50 p-4 rounded-xl text-center text-sm text-green-700">
                Cảm ơn bạn! Đánh giá của bạn sẽ hiển thị sau khi được duyệt.
            </div>
        );
    }

    return (
        <div className="mt-6 border-t pt-6">
            <h3 className="font-semibold text-gray-800 mb-3">Viết đánh giá của bạn</h3>
            <div className="space-y-3">
                <input
                    type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Tên của bạn"
                    className="w-full h-10 px-4 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                />
                <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <button key={i} type="button" title={`Đánh giá ${i + 1} sao`} aria-label={`Đánh giá ${i + 1} sao`} onClick={() => setRating(i + 1)}>
                            <Star size={24}
                                className={i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200 hover:text-yellow-300'}
                            />
                        </button>
                    ))}
                </div>
                <textarea
                    value={content} onChange={e => setContent(e.target.value)}
                    placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm..."
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none"
                />
                <button
                    disabled={submitting || !name.trim() || !content.trim()}
                    onClick={async () => {
                        setSubmitting(true);
                        try {
                            const res = await fetch('/api/reviews/product', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ productId, productName, customerName: name, rating, content })
                            });
                            if (res.ok) setSubmitted(true);
                        } catch { /* noop */ }
                        setSubmitting(false);
                    }}
                    className="px-6 h-10 bg-orange-600 text-white font-semibold rounded-xl text-sm hover:bg-orange-700 transition-colors disabled:opacity-50"
                >
                    {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
                </button>
            </div>
        </div>
    );
}
