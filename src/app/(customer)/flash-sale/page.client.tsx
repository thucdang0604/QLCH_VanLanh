'use client';

import Link from 'next/link';
import { Zap, ChevronRight, Package } from 'lucide-react';
import CatalogImage from '@/components/customer/CatalogImage';

const formatPrice = (price: number) => new Intl.NumberFormat('vi-VN').format(price) + 'đ';

interface FlashSaleProduct {
    id: string;
    name?: string;
    imageUrl?: string;
    image?: string;
    price_original?: number;
    price_promo?: number;
    sold?: number;
}

interface FlashSaleClientProps {
    products: FlashSaleProduct[];
}

export default function FlashSaleClient({ products }: FlashSaleClientProps) {
    return (
        <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
            {/* Hero Banner */}
            <div className="bg-gradient-to-r from-red-600 to-orange-500 py-8 rounded-t-xl">
                <div className="px-4 md:px-6">
                    <div className="flex items-center gap-4">
                        <Zap size={40} className="text-yellow-300 animate-pulse" />
                        <h1 className="text-3xl md:text-4xl font-bold text-white">FLASH SALE</h1>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-b-xl shadow-sm p-4 md:p-6">
                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/" className="hover:text-orange-600">Trang chủ</Link>
                    <ChevronRight size={14} />
                    <span className="text-gray-800 font-medium">Flash Sale</span>
                </nav>
                {/* Products Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {products.length === 0 ? (
                        <div className="col-span-full text-center py-20">
                            <Package size={48} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500">Chưa có sản phẩm Flash Sale</p>
                        </div>
                    ) : (
                        products.map((product) => {
                            const hasDiscount = !!(product.price_promo && product.price_original && product.price_promo < product.price_original);
                            const discountPct = hasDiscount
                                ? Math.round((1 - product.price_promo! / product.price_original!) * 100)
                                : 0;
                            const displayPrice = product.price_promo || product.price_original || 0;
                            return (
                                <Link
                                    key={product.id}
                                    href={`/product/${product.id}`}
                                    className="bg-white rounded-xl shadow-sm overflow-hidden group hover:shadow-lg transition-shadow"
                                >
                                    <div className="relative aspect-square">
                                        <CatalogImage
                                            src={product.imageUrl || product.image}
                                            alt={product.name || 'Sản phẩm'}
                                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                            imageClassName="object-cover group-hover:scale-105 transition-transform"
                                            logoClassName="h-full w-full object-contain p-4"
                                        />
                                        {hasDiscount && <div className="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded">-{discountPct}%</div>}
                                        {(product.sold || 0) > 100 && (
                                            <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                                                <Zap size={12} /> HOT
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <h3 className="text-sm font-medium text-gray-800 line-clamp-2 min-h-[40px] group-hover:text-orange-600">{product.name || ''}</h3>
                                        <div className="mt-2">
                                            <p className="text-red-600 font-bold text-lg">{formatPrice(displayPrice)}</p>
                                            {hasDiscount && <p className="text-gray-400 text-sm line-through">{formatPrice(product.price_original || 0)}</p>}
                                        </div>
                                        {(product.sold || 0) > 0 && (
                                            <p className="text-xs text-gray-500 mt-1">Đã bán {product.sold}</p>
                                        )}
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
