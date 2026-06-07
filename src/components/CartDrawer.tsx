'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, ShoppingBag, Minus, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useCart } from '@/lib/CartContext';

const formatPrice = (price: number) => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
    }).format(price).replace('₫', 'đ');
};

export default function CartDrawer() {
    const { items, isDrawerOpen, setIsDrawerOpen, updateQuantity, removeItem, totalAmount } = useCart();
    const router = useRouter();
    const overlayRef = useRef<HTMLDivElement>(null);

    // Prevent body scroll when drawer is open
    useEffect(() => {
        if (isDrawerOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isDrawerOpen]);

    if (!isDrawerOpen) return null;

    const handleClose = () => setIsDrawerOpen(false);

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) {
            handleClose();
        }
    };

    const handleCheckout = () => {
        handleClose();
        router.push('/checkout');
    };

    return (
        <div 
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end transition-opacity"
        >
            <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
                {/* Header */}
                <div className="px-5 py-4 border-b flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-2 text-gray-900">
                        <ShoppingBag size={20} className="text-copper" />
                        <h2 className="font-bold text-lg">Giỏ hàng</h2>
                        <span className="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full font-medium">
                            {items.reduce((sum, item) => sum + item.quantity, 0)}
                        </span>
                    </div>
                    <button 
                        title="Đóng"
                        onClick={handleClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body - Cart Items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {items.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                            <ShoppingBag size={48} className="opacity-20" />
                            <p className="text-sm">Chưa có sản phẩm nào</p>
                            <button 
                                onClick={handleClose}
                                className="mt-4 px-6 py-2 bg-copper/10 text-copper rounded-full text-sm font-medium hover:bg-copper/20 transition-colors"
                            >
                                Tiếp tục mua sắm
                            </button>
                        </div>
                    ) : (
                        items.map((item) => (
                            <div key={item.id} className="flex gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm relative group">
                                <div className="w-20 h-20 relative rounded-lg overflow-hidden flex-shrink-0 bg-gray-50">
                                    <Image 
                                        src={item.image || '/placeholder-image.png'} 
                                        alt={item.name} 
                                        fill 
                                        className="object-cover" 
                                        sizes="(max-width: 80px) 100vw, 80px"
                                    />
                                </div>
                                <div className="flex-1 flex flex-col min-w-0">
                                    <Link 
                                        href={`/product/${item.id}`} 
                                        onClick={handleClose}
                                        className="font-medium text-sm text-gray-800 hover:text-copper line-clamp-2 pr-6"
                                    >
                                        {item.name}
                                    </Link>
                                    {(item.color || item.storage) && (
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {item.color} {item.storage ? `• ${item.storage}` : ''}
                                        </p>
                                    )}
                                    <div className="mt-auto flex items-center justify-between pt-2">
                                        <div className="text-copper font-bold text-sm">
                                            {formatPrice(item.price)}
                                        </div>
                                        <div className="flex items-center bg-gray-50 rounded-lg border border-gray-100">
                                            <button 
                                                title="Trừ"
                                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                                className="p-1 px-2 text-gray-500 hover:text-copper transition-colors"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="text-xs font-medium w-6 text-center">{item.quantity}</span>
                                            <button 
                                                title="Thêm"
                                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                className="p-1 px-2 text-gray-500 hover:text-copper transition-colors"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    title="Xóa"
                                    onClick={() => removeItem(item.id)}
                                    className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-red-500 bg-white rounded-full transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                {items.length > 0 && (
                    <div className="p-5 border-t bg-gray-50 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)]">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-gray-600 font-medium">Tạm tính:</span>
                            <span className="text-xl font-bold text-red-600">{formatPrice(totalAmount)}</span>
                        </div>
                        <button 
                            title="Tiến hành thanh toán"
                            onClick={handleCheckout}
                            className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-bold py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 group"
                        >
                            TIẾN HÀNH THANH TOÁN
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                        <p className="text-center text-xs text-gray-400 mt-3 flex justify-center items-center gap-1">
                            Cam kết bảo mật thông tin
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
