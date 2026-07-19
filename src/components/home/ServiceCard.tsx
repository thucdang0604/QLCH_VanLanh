'use client';

import Link from 'next/link';
import { Shield, Clock, Zap, Star, Flame } from 'lucide-react';
import CatalogImage from '@/components/customer/CatalogImage';

interface ServiceCardProps {
    id: string;
    name: string;
    image?: string;
    imageUrl?: string;
    price?: number;
    price_original?: number;
    price_promo?: number;
    hidePrice?: boolean;
    warranty_text?: string;
    repair_time?: string;
    tags?: string[];
    rating?: number;
    reviewCount?: number;
    isFlashSale?: boolean;
    type?: 'product' | 'service';
    compact?: boolean;
}

export default function ServiceCard({
    id,
    name,
    image,
    imageUrl,
    price,
    price_original,
    price_promo,
    hidePrice,
    warranty_text,
    repair_time,
    tags = [],
    rating,
    reviewCount,
    isFlashSale,
    type,
    compact = false,
}: ServiceCardProps) {
    // Null-safe price resolution: support both old schema (price) and new (price_original/price_promo)
    const originalPrice = price_original ?? price ?? 0;
    const promoPrice = price_promo ?? undefined;
    const displayImage = image || imageUrl || '';

    const shouldHidePrice = hidePrice === true;
    const discount = !shouldHidePrice && promoPrice && originalPrice
        ? Math.round(((originalPrice - promoPrice) / originalPrice) * 100)
        : 0;

    const formatPrice = (p: number) => {
        if (p <= 0) return 'Liên hệ';
        return new Intl.NumberFormat('vi-VN').format(p) + 'đ';
    };

    // Dynamic badge logic
    const showFlashSale = isFlashSale || tags.includes('Flash Sale');
    const showDeepDiscount = discount > 30;
    const showWarranty = !!warranty_text;
    const showRepairTime = !!repair_time;

    // Route to /service/ if explicitly typed as service or has repair_time
    const isService = type === 'service' || !!repair_time;
    const linkHref = isService ? `/service/${id}` : `/product/${id}`;

    return (
        <Link
            href={linkHref}
            className="group block bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-lg hover:border-copper/30 transition-all duration-300"
        >
            {/* Image */}
            <div className={`relative overflow-hidden bg-gray-50 ${compact ? 'aspect-[4/3]' : 'aspect-square'}`}>
                <CatalogImage
                    src={displayImage}
                    alt={name || 'Sản phẩm'}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    imageClassName={`${compact ? 'object-contain p-2' : 'object-cover'} transition-transform duration-500 group-hover:scale-105`}
                    logoClassName="h-full w-full object-contain p-3"
                />

                {/* Discount Badge (top-left) */}
                {discount > 0 && (
                    <div className="absolute top-2 left-2 bg-accent text-white text-xs font-bold px-2 py-1 rounded-md">
                        -{discount}%
                    </div>
                )}

                {/* Flash Sale pulse (top-right) */}
                {showFlashSale && (
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse">
                        SALE
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-3">
                {/* Name */}
                <h3 className="text-sm font-medium text-gray-800 line-clamp-2 min-h-[40px] group-hover:text-copper transition-colors">
                    {name || 'Chưa có tên'}
                </h3>

                {/* Badges */}
                <div className="flex flex-wrap gap-1 mt-2">
                    {showDeepDiscount && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-orange-50 text-orange-600 font-semibold px-1.5 py-0.5 rounded">
                            <Flame size={10} />
                            Giảm sâu
                        </span>
                    )}
                    {showFlashSale && !showDeepDiscount && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-50 text-red-700 font-medium px-1.5 py-0.5 rounded">
                            <Zap size={10} />
                            Flash Sale
                        </span>
                    )}
                    {showWarranty && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-green-50 text-green-600 font-medium px-1.5 py-0.5 rounded">
                            <Shield size={10} />
                            {warranty_text}
                        </span>
                    )}
                    {showRepairTime && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 font-medium px-1.5 py-0.5 rounded">
                            <Clock size={10} />
                            {repair_time}
                        </span>
                    )}
                </div>

                {/* Price */}
                <div className="mt-2">
                    {shouldHidePrice ? (
                        <span className="text-copper font-semibold text-sm">Liên hệ nhận báo giá</span>
                    ) : promoPrice && promoPrice > 0 ? (
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-accent font-bold text-base">
                                {formatPrice(promoPrice)}
                            </span>
                            {originalPrice > 0 && (
                                <span className="text-gray-500 text-xs line-through">
                                    {formatPrice(originalPrice)}
                                </span>
                            )}
                        </div>
                    ) : originalPrice > 0 ? (
                        <span className="text-gray-800 font-bold text-base">
                            {formatPrice(originalPrice)}
                        </span>
                    ) : (
                        <span className="text-copper font-semibold text-sm">Liên hệ</span>
                    )}
                </div>

                {/* Rating - only show if present */}
                {rating != null && rating > 0 && (
                    <div className="flex items-center gap-1 mt-1.5">
                        <div className="flex items-center">
                            {[...Array(5)].map((_, i) => (
                                <Star
                                    key={i}
                                    size={12}
                                    className={
                                        i < Math.round(rating)
                                            ? 'text-yellow-400 fill-yellow-400'
                                            : 'text-gray-300'
                                    }
                                />
                            ))}
                        </div>
                        {reviewCount != null && reviewCount > 0 && (
                            <span className="text-xs text-gray-500">({reviewCount})</span>
                        )}
                    </div>
                )}
            </div>
        </Link>
    );
}
