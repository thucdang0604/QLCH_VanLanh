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
    Package,
    Calendar,
    Wrench,
} from 'lucide-react';
import VideoEmbed from '@/components/VideoEmbed';
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

export default function ProductDetailClient({ data }: { data: any }) {
    const [activeImage, setActiveImage] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const { addItem } = useCart();

    if (!data) return null;

    const isService = data._type === 'service';
    const images = data.images || (data.imageUrl ? [data.imageUrl] : (data.image ? [data.image] : []));
    const originalPrice = data.price_original || (typeof data.price === 'number' ? data.price : 0);
    const promoPrice = data.price_promo || 0;
    const hasDiscount = promoPrice > 0 && promoPrice < originalPrice;
    const displayPrice = promoPrice > 0 ? promoPrice : (originalPrice > 0 ? originalPrice : 0);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-white rounded-2xl p-6 shadow-sm">
            {/* Product Gallery */}
            <div className="space-y-4">
                <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border">
                    {images.length > 0 ? (
                        <Image
                            src={images[activeImage]}
                            alt={data.name ?? 'Sản phẩm'}
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
                                    // Add stock to prevent adding more than available later
                                    // @ts-ignore - stock is allowed to be passed even if types don't strictly require it
                                    stock: data.stock || 0
                                });
                            } else if (isService) {
                                window.location.href = '#booking';
                            }
                        }}
                        className="flex-1 h-12 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2"
                    >
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
    );
}
