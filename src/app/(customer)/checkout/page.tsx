'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    ChevronLeft,
    MapPin,
    CreditCard,
    Wallet,
    Banknote,
    Truck,
    Shield,
    Check,
    ChevronDown,
    ShoppingBag
} from 'lucide-react';
import { useCart } from '@/lib/CartContext';

const paymentMethods = [
    { id: 'cod', name: 'Thanh toán khi nhận hàng (COD)', icon: Banknote, desc: 'Thanh toán tiền mặt khi nhận hàng' },
    { id: 'bank', name: 'Chuyển khoản ngân hàng', icon: CreditCard, desc: 'BIDV, Vietcombank, Techcombank...' },
    { id: 'momo', name: 'Ví MoMo', icon: Wallet, desc: 'Thanh toán qua ví điện tử MoMo' },
    { id: 'vnpay', name: 'VNPay QR', icon: CreditCard, desc: 'Quét mã QR bằng app ngân hàng' },
];

// Format price to VND
const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
    }).format(price).replace('₫', 'đ');
};

export default function CheckoutPage() {
    const seoTitle = 'Thanh toán | Văn Lành Service';
    const seoDescription = 'Hoàn tất thông tin giao hàng và chọn phương thức thanh toán tại Văn Lành Service.';
    const canonicalUrl = 'https://qlch-vanlanh.web.app/checkout';
    const { items: orderItems, clearCart } = useCart();
    const [formData, setFormData] = useState({
        fullName: '',
        phone: '',
        email: '',
        province: '',
        district: '',
        ward: '',
        address: '',
        note: '',
        isVAT: false,
    });
    const [paymentMethod, setPaymentMethod] = useState('cod');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = 0; // Free shipping
    const total = subtotal + shipping;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        // TODO: Submit order to Firestore
        setTimeout(() => {
            alert('Đặt hàng thành công! Chúng tôi sẽ liên hệ bạn sớm.');
            clearCart();
            setIsSubmitting(false);
        }, 2000);
    };

    if (orderItems.length === 0) {
        return (
            <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
                {/* SEO (noindex for functional page) */}
                <title>{seoTitle}</title>
                <meta name="description" content={seoDescription} />
                <meta name="robots" content="noindex,follow" />
                <link rel="canonical" href={canonicalUrl} />
                <div className="bg-white rounded-xl shadow-sm py-16 text-center">
                    <ShoppingBag size={80} className="mx-auto text-gray-300 mb-6" />
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">Giỏ hàng trống</h1>
                    <p className="text-gray-500 mb-8">Vui lòng thêm sản phẩm vào giỏ hàng trước khi thanh toán.</p>
                    <Link href="/" className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors">
                        Tiếp tục mua sắm
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
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
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <Link
                        href="/cart"
                        className="p-2 hover:bg-gray-200 rounded-full transition-colors"
                    >
                        <ChevronLeft size={24} />
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900">Thanh toán</h1>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Shipping Info */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Customer Info */}
                            <div className="bg-white rounded-xl p-6 shadow-sm">
                                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <MapPin size={20} className="text-orange-500" />
                                    Thông tin giao hàng
                                </h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Họ và tên *
                                        </label>
                                        <input
                                            type="text"
                                            name="fullName"
                                            value={formData.fullName}
                                            onChange={handleInputChange}
                                            required
                                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                            placeholder="Nguyễn Văn A"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Số điện thoại *
                                        </label>
                                        <input
                                            type="tel"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleInputChange}
                                            required
                                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                            placeholder="0901234567"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                            placeholder="email@example.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Tỉnh/Thành phố *
                                        </label>
                                        <div className="relative">
                                            <select
                                                name="province"
                                                value={formData.province}
                                                onChange={handleInputChange}
                                                required
                                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none appearance-none bg-white"
                                            >
                                                <option value="">Chọn Tỉnh/Thành phố</option>
                                                <option value="hcm">TP. Hồ Chí Minh</option>
                                                <option value="hn">Hà Nội</option>
                                                <option value="dn">Đà Nẵng</option>
                                            </select>
                                            <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Quận/Huyện *
                                        </label>
                                        <div className="relative">
                                            <select
                                                name="district"
                                                value={formData.district}
                                                onChange={handleInputChange}
                                                required
                                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none appearance-none bg-white"
                                            >
                                                <option value="">Chọn Quận/Huyện</option>
                                                <option value="q1">Quận 1</option>
                                                <option value="q3">Quận 3</option>
                                                <option value="q7">Quận 7</option>
                                            </select>
                                            <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Phường/Xã *
                                        </label>
                                        <div className="relative">
                                            <select
                                                name="ward"
                                                value={formData.ward}
                                                onChange={handleInputChange}
                                                required
                                                className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none appearance-none bg-white"
                                            >
                                                <option value="">Chọn Phường/Xã</option>
                                                <option value="p1">Phường Bến Nghé</option>
                                                <option value="p2">Phường Bến Thành</option>
                                            </select>
                                            <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Địa chỉ cụ thể *
                                        </label>
                                        <input
                                            type="text"
                                            name="address"
                                            value={formData.address}
                                            onChange={handleInputChange}
                                            required
                                            className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                            placeholder="Số nhà, tên đường..."
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Ghi chú
                                        </label>
                                        <textarea
                                            name="note"
                                            value={formData.note}
                                            onChange={handleInputChange}
                                            rows={3}
                                            className="w-full px-4 py-3 border rounded-lg focus:border-orange-500 focus:outline-none resize-none"
                                            placeholder="Ghi chú cho đơn hàng (không bắt buộc)"
                                        />
                                    </div>
                                </div>

                                {/* VAT Invoice */}
                                <div className="mt-4 pt-4 border-t">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            name="isVAT"
                                            checked={formData.isVAT}
                                            onChange={handleInputChange}
                                            className="w-5 h-5 accent-orange-500"
                                        />
                                        <span className="text-sm text-gray-700">
                                            Xuất hóa đơn VAT cho đơn hàng
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* Payment Method */}
                            <div className="bg-white rounded-xl p-6 shadow-sm">
                                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <CreditCard size={20} className="text-orange-500" />
                                    Phương thức thanh toán
                                </h2>

                                <div className="space-y-3">
                                    {paymentMethods.map((method) => (
                                        <label
                                            key={method.id}
                                            className={`flex items-center gap-4 p-4 border-2 rounded-xl cursor-pointer transition-colors ${paymentMethod === method.id
                                                ? 'border-orange-500 bg-orange-50'
                                                : 'border-gray-200 hover:border-orange-300'
                                                }`}
                                        >
                                            <input
                                                type="radio"
                                                name="payment"
                                                value={method.id}
                                                checked={paymentMethod === method.id}
                                                onChange={(e) => setPaymentMethod(e.target.value)}
                                                className="w-5 h-5 accent-orange-500"
                                            />
                                            <method.icon size={24} className="text-gray-600" />
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-800">{method.name}</p>
                                                <p className="text-sm text-gray-500">{method.desc}</p>
                                            </div>
                                            {paymentMethod === method.id && (
                                                <Check size={20} className="text-orange-500" />
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Order Summary */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-24">
                                <h2 className="text-lg font-bold text-gray-900 mb-4">
                                    Đơn hàng ({orderItems.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm)
                                </h2>

                                {/* Items */}
                                <div className="space-y-4 mb-6">
                                    {orderItems.map((item) => (
                                        <div key={item.id} className="flex gap-3">
                                            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                                                <Image
                                                    src={item.image}
                                                    alt={item.name}
                                                    fill
                                                    className="object-cover"
                                                />
                                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                                                    {item.quantity}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-800 line-clamp-1">
                                                    {item.name}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {item.color}{item.storage ? ` • ${item.storage}` : ''}
                                                </p>
                                                <p className="text-sm font-bold text-red-600 mt-1">
                                                    {formatPrice(item.price)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Summary */}
                                <div className="space-y-3 text-sm border-t pt-4">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Tạm tính</span>
                                        <span className="font-medium">{formatPrice(subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Phí vận chuyển</span>
                                        <span className="text-green-600 font-medium">Miễn phí</span>
                                    </div>
                                </div>

                                <div className="border-t my-4 pt-4">
                                    <div className="flex justify-between items-center">
                                        <span className="font-semibold text-gray-900">Tổng cộng</span>
                                        <span className="text-2xl font-bold text-red-600">
                                            {formatPrice(total)}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-4 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Đang xử lý...' : 'ĐẶT HÀNG'}
                                </button>

                                {/* Trust Badges */}
                                <div className="mt-4 pt-4 border-t flex items-center justify-center gap-4 text-xs text-gray-500">
                                    <div className="flex items-center gap-1">
                                        <Shield size={14} className="text-green-600" />
                                        <span>Bảo mật SSL</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Truck size={14} className="text-blue-600" />
                                        <span>Giao nhanh 2h</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
