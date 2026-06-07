'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
    Trash2,
    Minus,
    Plus,
    ShoppingBag,
    ArrowRight,
    Tag,
    Truck
} from 'lucide-react';
import { useCart } from '@/lib/CartContext';
import { SITE_URL } from "@/lib/constants";
import { useState } from 'react';

// Format price to VND
const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
    }).format(price).replace('₫', 'đ');
};

export default function CartPage() {
    const seoTitle = 'Giỏ hàng | Văn Lành Service';
    const seoDescription = 'Xem và chỉnh sửa giỏ hàng trước khi thanh toán tại Văn Lành Service.';
    const canonicalUrl = `${SITE_URL}/cart`;
    const { items: cartItems, removeItem, updateQuantity: updateCartQuantity } = useCart();
    const [couponCode, setCouponCode] = useState('');

    const handleUpdateQuantity = (id: string, delta: number) => {
        const item = cartItems.find(i => i.id === id);
        if (item) {
            updateCartQuantity(id, Math.max(1, item.quantity + delta));
        }
    };

    const subtotal = cartItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );
    const discount = 0;
    const shipping = subtotal >= 300000 ? 0 : 30000;
    const total = subtotal - discount + shipping;

    if (cartItems.length === 0) {
        return (
            <div className="max-w-[1200px] mx-auto px-2 md:px-4 py-2">
                {/* SEO (noindex for functional page) */}
                <title>{seoTitle}</title>
                <meta name="description" content={seoDescription} />
                <meta name="robots" content="noindex,follow" />
                <link rel="canonical" href={canonicalUrl} />
                <div className="bg-white rounded-xl shadow-sm py-16 text-center">
                    <ShoppingBag size={80} className="mx-auto text-gray-300 mb-6" />
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">
                        Giỏ hàng trống
                    </h1>
                    <p className="text-gray-500 mb-8">
                        Bạn chưa có sản phẩm nào trong giỏ hàng
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors"
                    >
                        Tiếp tục mua sắm
                        <ArrowRight size={18} />
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1200px] mx-auto px-2 md:px-4 py-2">
            {/* SEO (noindex for functional page) */}
            <title>{seoTitle}</title>
            <meta name="description" content={seoDescription} />
            <meta name="robots" content="noindex,follow" />
            <link rel="canonical" href={canonicalUrl} />
            <meta property="og:type" content="website" />
            <meta property="og:title" content={seoTitle} />
            <meta property="og:description" content={seoDescription} />
            <meta property="og:url" content={canonicalUrl} />
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
                    Giỏ hàng của bạn
                    <span className="text-gray-500 font-normal text-lg ml-2">
                        ({cartItems.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm)
                    </span>
                </h1>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Cart Items */}
                    <div className="lg:col-span-2 space-y-4">
                        {cartItems.map((item) => (
                            <div
                                key={item.id}
                                className="bg-white rounded-xl p-4 shadow-sm flex gap-4"
                            >
                                {/* Product Image */}
                                <Link href={`/product/${item.id}`} className="flex-shrink-0">
                                    <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden border bg-white">
                                        {item.image ? (
                                            <Image
                                                src={item.image}
                                                alt={item.name}
                                                fill
                                                className="object-cover p-1"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                                <ShoppingBag size={32} className="text-gray-300" />
                                            </div>
                                        )}
                                    </div>
                                </Link>

                                {/* Product Info */}
                                <div className="flex-1 min-w-0">
                                    <Link href={`/product/${item.id}`}>
                                        <h3 className="font-semibold text-gray-800 hover:text-orange-600 transition-colors line-clamp-2">
                                            {item.name}
                                        </h3>
                                    </Link>
                                    <div className="text-sm text-gray-500 mt-1">
                                        {item.color && <span>{item.color}</span>}
                                        {item.storage && <span> • {item.storage}</span>}
                                    </div>

                                    <div className="flex items-center justify-between mt-4">
                                        {/* Price */}
                                        <div>
                                            <p className="text-lg font-bold text-red-600">
                                                {formatPrice(item.price)}
                                            </p>
                                            {item.originalPrice > item.price && (
                                                <p className="text-sm text-gray-400 line-through">
                                                    {formatPrice(item.originalPrice)}
                                                </p>
                                            )}
                                        </div>

                                        {/* Quantity Controls */}
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center border rounded-lg">
                                                <button
                                                    onClick={() => handleUpdateQuantity(item.id, -1)}
                                                    className="p-2 hover:bg-gray-100 transition-colors"
                                                >
                                                    <Minus size={16} />
                                                </button>
                                                <span className="px-3 font-medium">{item.quantity}</span>
                                                <button
                                                    title="Thêm"
                                                    onClick={() => handleUpdateQuantity(item.id, 1)}
                                                    className="p-2 hover:bg-gray-100 transition-colors"
                                                >
                                                    <Plus size={16} />
                                                </button>
                                            </div>
                                            <button
                                                title="Xóa"
                                                onClick={() => removeItem(item.id)}
                                                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Order Summary */}
                    <div className="lg:col-span-1">
                        <div className="bg-white rounded-xl p-6 shadow-sm sticky top-24">
                            <h2 className="text-lg font-bold text-gray-900 mb-4">
                                Tóm tắt đơn hàng
                            </h2>

                            {/* Coupon Input */}
                            <div className="flex gap-2 mb-6">
                                <div className="flex-1 relative">
                                    <Tag size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Mã giảm giá"
                                        value={couponCode}
                                        onChange={(e) => setCouponCode(e.target.value)}
                                        className="w-full h-11 pl-10 pr-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                    />
                                </div>
                                <button className="px-4 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors">
                                    Áp dụng
                                </button>
                            </div>

                            {/* Summary Details */}
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Tạm tính</span>
                                    <span className="font-medium">{formatPrice(subtotal)}</span>
                                </div>
                                {discount > 0 && (
                                    <div className="flex justify-between text-green-600">
                                        <span>Giảm giá</span>
                                        <span>-{formatPrice(discount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Phí vận chuyển</span>
                                    <span className={shipping === 0 ? 'text-green-600 font-medium' : ''}>
                                        {shipping === 0 ? 'Miễn phí' : formatPrice(shipping)}
                                    </span>
                                </div>
                                {shipping > 0 && (
                                    <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded-lg">
                                        <Truck size={16} />
                                        <span>Mua thêm {formatPrice(300000 - subtotal)} để được miễn phí vận chuyển</span>
                                    </div>
                                )}
                            </div>

                            <div className="border-t my-4 pt-4">
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-gray-900">Tổng cộng</span>
                                    <span className="text-2xl font-bold text-red-600">
                                        {formatPrice(total)}
                                    </span>
                                </div>
                            </div>

                            <Link
                                href="/checkout"
                                className="block w-full bg-gradient-to-r from-orange-500 to-red-500 text-white text-center py-4 rounded-xl font-bold hover:opacity-90 transition-opacity"
                            >
                                TIẾN HÀNH THANH TOÁN
                            </Link>

                            <Link
                                href="/"
                                className="block text-center text-orange-600 font-medium mt-4 hover:text-orange-700"
                            >
                                ← Tiếp tục mua sắm
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
