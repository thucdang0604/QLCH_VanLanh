'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
    ChevronLeft,
    ShoppingBag,
    CheckCircle,
    Loader2,
    Phone,
    User,
    FileText,
    Copy,
    Check,
    Minus,
    Plus,
    Trash2
} from 'lucide-react';
import { useCart } from '@/lib/CartContext';
import { SITE_URL } from "@/lib/constants";

const formatPrice = (price: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
        .format(price).replace('₫', 'đ');

export default function CheckoutPage() {
    const seoTitle = 'Đặt hàng | Văn Lành Service';
    const seoDescription = 'Xác nhận đơn hàng và liên hệ mua hàng tại Văn Lành Service.';
    const canonicalUrl = `${SITE_URL}/checkout`;
    const { items: cartItems, updateQuantity, removeItem, clearCart, totalAmount } = useCart();

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [note, setNote] = useState('');
    const [honeypot, setHoneypot] = useState(''); // Bot trap
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successOrderId, setSuccessOrderId] = useState('');
    const [copied, setCopied] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Client-side validation
        if (!name.trim() || name.trim().length < 2) {
            setError('Vui lòng nhập họ tên (ít nhất 2 ký tự).');
            return;
        }
        if (!/^0\d{9,10}$/.test(phone.trim())) {
            setError('Số điện thoại không hợp lệ (VD: 0901234567).');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    phone: phone.trim(),
                    note: note.trim(),
                    website: honeypot, // Honeypot — server rejects if filled
                    items: cartItems.map(item => ({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity,
                        image: item.image,
                        color: item.color,
                        storage: item.storage,
                    })),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Đã xảy ra lỗi. Vui lòng thử lại.');
                return;
            }

            setSuccessOrderId(data.orderId);
            clearCart();
        } catch {
            setError('Không thể kết nối máy chủ. Vui lòng thử lại.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const copyOrderId = () => {
        navigator.clipboard.writeText(successOrderId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ── Màn hình đặt hàng thành công ──
    if (successOrderId) {
        return (
            <div className="min-h-screen max-w-[600px] mx-auto px-4 py-8">
                <title>{seoTitle}</title>
                <meta name="robots" content="noindex,follow" />
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle size={40} className="text-green-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                        Đặt hàng thành công!
                    </h1>
                    <p className="text-gray-500 mb-6">
                        Cảm ơn bạn đã đặt hàng. Chúng tôi sẽ liên hệ bạn trong thời gian sớm nhất để xác nhận đơn hàng.
                    </p>

                    <div className="bg-gray-50 rounded-xl p-4 mb-6">
                        <p className="text-sm text-gray-500 mb-1">Mã đơn hàng</p>
                        <div className="flex items-center justify-center gap-2">
                            <code className="text-lg font-bold text-orange-600">
                                #{successOrderId.slice(-8).toUpperCase()}
                            </code>
                            <button
                                onClick={copyOrderId}
                                className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                                title="Sao chép mã đơn"
                            >
                                {copied
                                    ? <Check size={16} className="text-green-500" />
                                    : <Copy size={16} className="text-gray-400" />
                                }
                            </button>
                        </div>
                    </div>

                    <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-6 text-left">
                        <p className="text-sm text-orange-800 font-medium mb-1">📞 Lưu ý</p>
                        <p className="text-sm text-orange-700">
                            Nhân viên sẽ gọi điện xác nhận đơn hàng và thông báo thời gian giao hàng dự kiến cho bạn.
                        </p>
                    </div>

                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors"
                    >
                        ← Tiếp tục mua sắm
                    </Link>
                </div>
            </div>
        );
    }

    // ── Giỏ hàng trống ──
    if (cartItems.length === 0) {
        return (
            <div className="min-h-screen max-w-[600px] mx-auto px-4 py-8">
                <title>{seoTitle}</title>
                <meta name="robots" content="noindex,follow" />
                <div className="bg-white rounded-2xl shadow-sm py-16 text-center">
                    <ShoppingBag size={80} className="mx-auto text-gray-300 mb-6" />
                    <h1 className="text-2xl font-bold text-gray-800 mb-4">Giỏ hàng trống</h1>
                    <p className="text-gray-500 mb-8">Vui lòng thêm sản phẩm vào giỏ hàng trước khi đặt hàng.</p>
                    <Link href="/" className="inline-flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors">
                        Tiếp tục mua sắm
                    </Link>
                </div>
            </div>
        );
    }

    // ── Form đặt hàng ──
    return (
        <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
            <title>{seoTitle}</title>
            <meta name="description" content={seoDescription} />
            <meta name="robots" content="noindex,follow" />
            <link rel="canonical" href={canonicalUrl} />

            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <Link href="/cart" className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <ChevronLeft size={24} />
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900">Đặt hàng</h1>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Cột trái: Danh sách sản phẩm */}
                        <div className="lg:col-span-2">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <ShoppingBag size={20} className="text-orange-500" />
                                Sản phẩm ({cartItems.reduce((s, i) => s + i.quantity, 0)})
                            </h2>
                            <div className="space-y-3">
                                {cartItems.map((item) => (
                                    <div key={item.id} className="flex gap-3 p-3 bg-gray-50 rounded-xl relative group">
                                        <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden flex-shrink-0 bg-white border">
                                            <Image src={item.image} alt={item.name} fill className="object-cover p-1" />
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                                            <div className="pr-8">
                                                <Link href={`/product/${item.id}`} className="text-sm font-medium text-gray-800 line-clamp-2 hover:text-orange-500 transition-colors">
                                                    {item.name}
                                                </Link>
                                                {(item.color || item.storage) && (
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        {item.color}{item.storage ? ` • ${item.storage}` : ''}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between mt-2">
                                                <p className="text-sm font-bold text-red-600 whitespace-nowrap">
                                                    {formatPrice(item.price * item.quantity)}
                                                </p>
                                                
                                                <div className="flex items-center bg-white border rounded-lg p-0.5 shadow-sm">
                                                    <button
                                                        type="button"
                                                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                                        className="w-7 h-7 flex items-center justify-center hover:text-orange-500 transition-colors"
                                                    >
                                                        <Minus size={14} />
                                                    </button>
                                                    <span className="w-8 text-center font-medium text-sm">
                                                        {item.quantity}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                        disabled={item.quantity >= item.stock}
                                                        className="w-7 h-7 flex items-center justify-center hover:text-orange-500 transition-colors disabled:opacity-50"
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <button
                                            type="button"
                                            onClick={() => removeItem(item.id)}
                                            className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Xóa sản phẩm"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Cột phải: Thông tin khách hàng */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl p-5 shadow-sm border sticky top-24 space-y-4">
                                <h2 className="text-lg font-bold text-gray-900">Thông tin đặt hàng</h2>

                                {/* Họ tên */}
                                <div>
                                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                                        <User size={14} /> Họ và tên <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Nguyễn Văn A"
                                        required
                                        maxLength={100}
                                        className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                    />
                                </div>

                                {/* Số điện thoại */}
                                <div>
                                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                                        <Phone size={14} /> Số điện thoại <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="0901234567"
                                        required
                                        maxLength={11}
                                        className="w-full h-11 px-4 border rounded-lg focus:border-orange-500 focus:outline-none"
                                    />
                                </div>

                                {/* Ghi chú */}
                                <div>
                                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                                        <FileText size={14} /> Ghi chú
                                    </label>
                                    <textarea
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        rows={2}
                                        maxLength={500}
                                        placeholder="Yêu cầu thêm (không bắt buộc)"
                                        className="w-full px-4 py-3 border rounded-lg focus:border-orange-500 focus:outline-none resize-none"
                                    />
                                </div>

                                {/* Honeypot — ẩn hoàn toàn */}
                                <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0 }} aria-hidden="true">
                                    <input
                                        type="text"
                                        name="website"
                                        tabIndex={-1}
                                        autoComplete="off"
                                        value={honeypot}
                                        onChange={(e) => setHoneypot(e.target.value)}
                                    />
                                </div>

                                {/* Tổng tiền */}
                                <div className="border-t pt-4">
                                    <div className="flex justify-between items-center">
                                        <span className="font-semibold text-gray-900">Tổng cộng</span>
                                        <span className="text-2xl font-bold text-red-600">
                                            {formatPrice(totalAmount)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">Thanh toán khi nhận hàng (COD)</p>
                                </div>

                                {/* Error message */}
                                {error && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                                        {error}
                                    </div>
                                )}

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-4 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 size={20} className="animate-spin" />
                                            Đang xử lý...
                                        </>
                                    ) : (
                                        'ĐẶT HÀNG'
                                    )}
                                </button>

                                <p className="text-xs text-gray-400 text-center">
                                    Nhân viên sẽ liên hệ xác nhận đơn hàng qua số điện thoại của bạn.
                                </p>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
