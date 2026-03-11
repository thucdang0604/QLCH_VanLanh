'use client';

import { useState, useEffect, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    ChevronRight,
    Star,
    Heart,
    ShoppingCart,
    Truck,
    Shield,
    RefreshCw,
    Minus,
    Plus,
    Package,
    Clock,
    Wrench,
    Calendar
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import VideoEmbed from '@/components/VideoEmbed';

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

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeImage, setActiveImage] = useState(0);
    const [quantity, setQuantity] = useState(1);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Try products first
                let docRef = doc(db, 'products', id);
                let snap = await getDoc(docRef);

                if (snap.exists()) {
                    setData({ id: snap.id, ...snap.data(), _type: 'product' });
                } else {
                    // Try services if not found in products
                    docRef = doc(db, 'services', id);
                    snap = await getDoc(docRef);
                    if (snap.exists()) {
                        setData({ id: snap.id, ...snap.data(), _type: 'service' });
                    }
                }
            } catch (error) {
                console.error('Error fetching detail:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id]);

    if (loading) {
        return (
            <div className="max-w-[1200px] mx-auto px-2 md:px-4 py-2">
                <div className="bg-white rounded-xl shadow-sm p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="aspect-square bg-gray-200 rounded-2xl animate-pulse" />
                        <div className="space-y-6">
                            <div className="h-10 bg-gray-200 rounded w-3/4 animate-pulse" />
                            <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse" />
                            <div className="h-24 bg-gray-200 rounded animate-pulse" />
                            <div className="h-12 bg-gray-200 rounded w-1/2 animate-pulse" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="max-w-[1200px] mx-auto px-2 md:px-4 py-2">
                <div className="bg-white rounded-xl shadow-sm py-20 text-center">
                    <Package size={64} className="mx-auto text-gray-300 mb-4" />
                    <h1 className="text-2xl font-bold text-gray-800">Không tìm thấy sản phẩm</h1>
                    <p className="text-gray-500 mt-2">Sản phẩm hoặc dịch vụ này không tồn tại hoặc đã bị xóa.</p>
                    <Link href="/" className="mt-6 inline-block px-8 py-3 bg-orange-600 text-white rounded-xl font-bold">
                        Về trang chủ
                    </Link>
                </div>
            </div>
        );
    }

    const isService = data._type === 'service';
    const images = data.images || (data.imageUrl ? [data.imageUrl] : (data.image ? [data.image] : []));
    const originalPrice = data.price_original || (typeof data.price === 'number' ? data.price : 0);
    const promoPrice = data.price_promo || 0;
    const hasDiscount = promoPrice > 0 && promoPrice < originalPrice;
    const displayPrice = promoPrice > 0 ? promoPrice : (originalPrice > 0 ? originalPrice : 0);

    // SEO meta + JSON-LD
    const seoTitle = `${data.name} | ${isService ? 'Dịch vụ sửa chữa' : 'Sản phẩm'} tại Văn Lành Service`;
    const shortDescription =
        (data.seoDescription as string) ||
        (data.description as string) ||
        (isService
            ? `Dịch vụ ${data.name} chính hãng, sửa nhanh, bảo hành uy tín tại Văn Lành Service.`
            : `Mua ${data.name} chính hãng, giá tốt, bảo hành uy tín tại Văn Lành Service.`);

    const url = `https://qlch-vanlanh.web.app/product/${data.id}`;

    const structuredData = isService
        ? {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: data.name,
            description: shortDescription,
            provider: {
                '@type': 'LocalBusiness',
                name: 'Văn Lành Service',
                telephone: '0932242026',
            },
            areaServed: { '@type': 'City', name: 'Hồ Chí Minh' },
            url,
        }
        : {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: data.name,
            image: images,
            description: shortDescription,
            brand: data.brand || undefined,
            sku: data.sku || undefined,
            offers: {
                '@type': 'Offer',
                url,
                priceCurrency: 'VND',
                price: displayPrice || undefined,
                availability: data.stock && data.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
            aggregateRating: data.rating
                ? {
                    '@type': 'AggregateRating',
                    ratingValue: data.rating,
                    reviewCount: data.reviewCount || 1,
                }
                : undefined,
        };

    return (
        <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
                {/* SEO */}
                <title>{seoTitle}</title>
                <meta name="description" content={shortDescription.slice(0, 155)} />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
                />

                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/" className="hover:text-orange-600">Trang chủ</Link>
                    <ChevronRight size={14} />
                    <Link href={`/category/${isService ? 'sua-chua' : normalizeSlug(data.category)}`} className="hover:text-orange-600">
                        {data.category || (isService ? 'Dịch vụ' : 'Sản phẩm')}
                    </Link>
                    <ChevronRight size={14} />
                    <span className="text-gray-800 font-medium line-clamp-1">{data.name}</span>
                </nav>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-white rounded-2xl p-6 shadow-sm">
                    {/* Product Gallery */}
                    <div className="space-y-4">
                        <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border">
                            {images.length > 0 ? (
                                <Image
                                    src={images[activeImage]}
                                    alt={data.name}
                                    fill
                                    className="object-contain p-4"
                                    priority
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                                    {isService ? <Wrench size={64} /> : <Package size={64} />}
                                    <span className="mt-2 text-sm">Chưa có ảnh</span>
                                </div>
                            )}
                        </div>

                        {images.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {images.map((img: string, idx: number) => (
                                    <button
                                        key={idx}
                                        onClick={() => setActiveImage(idx)}
                                        className={`relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${activeImage === idx ? 'border-orange-500 ring-2 ring-orange-100' : 'border-gray-100 hover:border-orange-200'
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
                                <div className="flex items-center gap-0.5 text-yellow-400">
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} size={16} fill={i < 4 ? "currentColor" : "none"} />
                                    ))}
                                    <span className="text-gray-800 font-medium ml-1">4.5</span>
                                </div>
                                <span className="text-gray-300">|</span>
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
                                <span className="text-3xl font-extrabold text-red-600">
                                    {formatPrice(displayPrice)}
                                </span>
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
                            {isService && data.warranty_text && (
                                <div className="mt-3 flex items-center gap-1.5 text-green-600 text-sm font-medium">
                                    <Shield size={16} />
                                    {data.warranty_text}
                                </div>
                            )}
                            {isService && data.repair_time && (
                                <div className="mt-1.5 flex items-center gap-1.5 text-blue-600 text-sm font-medium">
                                    <Clock size={16} />
                                    {data.repair_time}
                                </div>
                            )}
                        </div>

                        {/* Description (Short) */}
                        {data.description && (
                            <div className="text-gray-600 text-sm leading-relaxed">
                                <p className="line-clamp-3">{data.description}</p>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-3 pt-4">
                            {!isService && (
                                <div className="flex items-center border-2 border-gray-100 rounded-xl bg-white h-12">
                                    <button
                                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                        className="px-4 h-full hover:bg-gray-50 transition-colors"
                                    >
                                        <Minus size={16} />
                                    </button>
                                    <span className="w-12 text-center font-bold">{quantity}</span>
                                    <button
                                        onClick={() => setQuantity(quantity + 1)}
                                        className="px-4 h-full hover:bg-gray-50 transition-colors"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                            )}

                            <button className="flex-1 h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2">
                                {isService ? <Wrench size={20} /> : <ShoppingCart size={20} />}
                                {isService ? 'ĐẶT LỊCH SỬA NGAY' : 'THÊM VÀO GIỎ HÀNG'}
                            </button>

                            {isService && (
                                <Link href="/#booking" className="h-12 px-5 border-2 border-orange-200 text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-all flex items-center justify-center gap-2">
                                    <Calendar size={18} />
                                    Đặt lịch
                                </Link>
                            )}

                            <button className="h-12 w-12 flex items-center justify-center border-2 border-gray-100 rounded-xl hover:bg-red-50 hover:border-red-100 group transition-all">
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
                </div>

                {/* Specs Table */}
                {data.specs && Object.keys(data.specs).length > 0 && (
                    <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span>
                            Thông số kỹ thuật
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
                            {Object.entries(data.specs).map(([key, value]: [string, any]) => (
                                <div key={key} className="flex border-b border-gray-50 py-3.5 group hover:bg-gray-50 transition-colors px-2 rounded-lg">
                                    <span className="w-1/3 text-gray-500 text-sm font-medium uppercase tracking-tight">{key}</span>
                                    <span className="w-2/3 text-gray-800 text-sm font-semibold">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Detailed Description */}
                {(data.content || data.description) && (
                    <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span>
                            Chi tiết sản phẩm
                        </h2>
                        <div className="prose prose-orange max-w-none text-gray-600 leading-relaxed">
                            {data.content ? (
                                <div dangerouslySetInnerHTML={{ __html: data.content }} />
                            ) : (
                                <p className="whitespace-pre-line">{data.description}</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function normalizeSlug(cat: string) {
    if (!cat) return 'unknown';
    const map: Record<string, string> = {
        'iPhone': 'sua-iphone',
        'Samsung': 'sua-samsung',
        'Điện thoại': 'phone',
        'Laptop': 'laptop',
        'Sửa iPhone': 'sua-iphone',
        'Thay Pin': 'thay-pin',
        'Ép Kính': 'ep-kinh'
    };
    return map[cat] || cat.toLowerCase().replace(/\s+/g, '-');
}
