'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef } from 'react';
import {
    Search, ShoppingCart, Plus, Minus, Trash2, User, Phone, Receipt, X,
    Package, CreditCard, Banknote, QrCode, Tag, Loader2, CheckCircle2,
    Upload, AlertTriangle
} from 'lucide-react';
import { collection, getDocs, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { uploadImage } from '@/lib/storage';
import { generateSlug } from '@/lib/utils';
import { addDocumentWithId } from '@/lib/useFirestore';
import { db } from '@/lib/firebase';
import type { Product } from '@/lib/types';

// ── Cart Item ──
interface CartItem {
    productId: string;
    name: string;
    image?: string;
    originalPrice: number;
    sellingPrice: number; // Overridable
    costPrice: number;
    quantity: number;
}

const paymentMethods = [
    { key: 'cash', label: 'Tiền mặt', icon: Banknote },
    { key: 'bank', label: 'Chuyển khoản', icon: CreditCard },
    { key: 'momo', label: 'MoMo', icon: QrCode },
];

export default function POSPage() {
    const { user } = useAuth();
    const { config } = useConfig();

    // Products
    const [products, setProducts] = useState<(Product & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');

    // Cart
    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [discount, setDiscount] = useState(0);

    // Checkout
    const [isProcessing, setIsProcessing] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [lastOrder, setLastOrder] = useState<any>(null);
    const [showProductModal, setShowProductModal] = useState(false);

    const searchRef = useRef<HTMLInputElement>(null);

    // ── Load products ──
    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDocs(collection(db, 'products'));
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product & { id: string }));
                setProducts(data.filter(p => p.status === 'active' && p.category !== 'Linh ki\u1ec7n'));
            } catch (err) {
                console.error('Failed to load products:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // Keyboard shortcut: F1 to focus search
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'F1') { e.preventDefault(); searchRef.current?.focus(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // ── Categories ──
    const categories = ['all', ...Array.from(new Set(products.map(p => p.category)))];

    // ── Filtered products ──
    const filtered = products.filter(p => {
        const matchCat = activeCategory === 'all' || p.category === activeCategory;
        const q = searchQuery.toLowerCase();
        const matchSearch = !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
        return matchCat && matchSearch;
    });

    // ── Cart helpers ──
    const addToCart = (product: Product & { id: string }) => {
        const stock = product.stock || 0;
        if (stock <= 0) {
            alert('Sản phẩm đã hết hàng!');
            return;
        }
        setCart(prev => {
            const existing = prev.find(c => c.productId === product.id);
            if (existing) {
                // Prevent exceeding stock
                if (existing.quantity >= stock) {
                    alert(`Tồn kho chỉ còn ${stock}. Không thể thêm.`);
                    return prev;
                }
                return prev.map(c =>
                    c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c
                );
            }
            return [...prev, {
                productId: product.id,
                name: product.name,
                image: (product as any).imageUrl || product.images?.[0],
                originalPrice: product.price_promo || product.price_original,
                sellingPrice: product.price_promo || product.price_original,
                costPrice: product.costPrice || 0,
                quantity: 1,
            }];
        });
    };

    const updateQuantity = (productId: string, delta: number) => {
        setCart(prev =>
            prev.map(c => {
                if (c.productId !== productId) return c;
                const newQty = Math.max(1, c.quantity + delta);
                // Validate against stock
                const product = products.find(p => p.id === productId);
                const maxStock = product?.stock || 999;
                if (newQty > maxStock) {
                    alert(`Tồn kho chỉ còn ${maxStock}.`);
                    return c;
                }
                return { ...c, quantity: newQty };
            })
        );
    };

    const updatePrice = (productId: string, newPrice: number) => {
        setCart(prev =>
            prev.map(c => c.productId === productId ? { ...c, sellingPrice: newPrice } : c)
        );
    };

    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(c => c.productId !== productId));
    };

    const subtotal = cart.reduce((sum, c) => sum + c.sellingPrice * c.quantity, 0);
    const total = Math.max(0, subtotal - discount);

    const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';

    // ── Checkout ──
    const handleCheckout = async () => {
        if (cart.length === 0) return;

        // Validate stock before checkout
        for (const item of cart) {
            const product = products.find(p => p.id === item.productId);
            const currentStock = product?.stock || 0;
            if (item.quantity > currentStock) {
                alert(`"${item.name}" chỉ còn ${currentStock} trong kho, nhưng bạn đang bán ${item.quantity}.`);
                return;
            }
        }

        setIsProcessing(true);
        try {
            const orderData = {
                customer_info: {
                    name: customerName || 'Khách lẻ',
                    phone: customerPhone || '',
                    email: '',
                    city: '',
                    district: '',
                    ward: '',
                    address: '',
                },
                items: cart.map(c => ({
                    product_id: c.productId,
                    product_name: c.name,
                    quantity: c.quantity,
                    price: c.sellingPrice,
                    costPrice: c.costPrice,
                })),
                total_amount: total,
                discount_amount: discount,
                subtotal_amount: subtotal,
                status: 'Completed',
                is_vat_exported: false,
                payment_method: paymentMethod === 'cash' ? 'COD' : paymentMethod === 'bank' ? 'Bank' : 'Momo',
                source: 'pos',
                createdBy: user?.uid || '',
                createdByName: user?.displayName || 'POS',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };

            const docRef = await addDoc(collection(db, 'orders'), orderData);

            // Decrease stock for each product
            for (const item of cart) {
                try {
                    await updateDoc(doc(db, 'products', item.productId), {
                        stock: increment(-item.quantity),
                    });
                } catch { /* ignore if stock field doesn't exist */ }
            }

            setLastOrder({ id: docRef.id, ...orderData, createdAt: new Date() });
            setShowReceipt(true);

            // Reset cart
            setCart([]);
            setCustomerName('');
            setCustomerPhone('');
            setDiscount(0);
        } catch (err) {
            console.error(err);
            alert('Lỗi khi tạo đơn hàng!');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Category label map ──
    const catLabel: Record<string, string> = {
        all: 'Tất cả', Phone: 'Điện thoại', Laptop: 'Laptop', Tablet: 'Tablet',
        Audio: 'Âm thanh', Watch: 'Đồng hồ', Accessory: 'Phụ kiện', 'Linh kiện': 'Linh kiện',
    };

    // Reload products after adding new one
    const reloadProducts = async () => {
        try {
            const snap = await getDocs(collection(db, 'products'));
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product & { id: string }));
            setProducts(data.filter(p => p.status === 'active'));
        } catch (err) {
            console.error(err);
        }
    };

    const [showMobileCart, setShowMobileCart] = useState(false);

    if (loading) return (
        <div className="flex items-center justify-center h-[60vh]">
            <Loader2 className="animate-spin text-orange-500" size={40} />
        </div>
    );

    const cartSection = (
        <>
            {/* Cart Header */}
            <div className="px-4 py-3 border-b flex items-center gap-2">
                <ShoppingCart size={20} className="text-orange-500" />
                <h2 className="font-bold text-gray-800">Giỏ hàng</h2>
                <span className="ml-auto bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">
                    {cart.reduce((s, c) => s + c.quantity, 0)} SP
                </span>
                {/* Close button for mobile */}
                <button onClick={() => setShowMobileCart(false)} className="md:hidden p-1 text-gray-400 hover:text-gray-600">
                    <X size={20} />
                </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
                {cart.length === 0 && (
                    <div className="text-center py-12 text-gray-300">
                        <ShoppingCart size={36} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Chưa có sản phẩm</p>
                    </div>
                )}
                {cart.map(item => {
                    const product = products.find(p => p.id === item.productId);
                    return (
                        <div key={item.productId} className="bg-gray-50 rounded-xl p-3 space-y-2">
                            <div className="flex items-start gap-2">
                                {/* Product image in cart */}
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                                    {product?.images?.[0] ? (
                                        <img src={product.images[0]} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <Package className="text-gray-300" size={18} />
                                    )}
                                </div>
                                <p className="flex-1 text-sm font-medium text-gray-800 line-clamp-2">{item.name}</p>
                                <button onClick={() => removeFromCart(item.productId)} className="text-red-400 hover:text-red-600 p-0.5">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 bg-white rounded-lg border">
                                    <button onClick={() => updateQuantity(item.productId, -1)} className="p-1 hover:bg-gray-100 rounded-l-lg">
                                        <Minus size={14} />
                                    </button>
                                    <span className="px-2 text-sm font-bold min-w-[24px] text-center">{item.quantity}</span>
                                    <button onClick={() => updateQuantity(item.productId, 1)} className="p-1 hover:bg-gray-100 rounded-r-lg">
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <div className="flex-1 relative">
                                    <Tag size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input type="number" value={item.sellingPrice}
                                        onChange={e => updatePrice(item.productId, Number(e.target.value))}
                                        className={`w-full pl-7 pr-2 py-1 text-sm border rounded-lg text-right font-semibold ${item.sellingPrice !== item.originalPrice ? 'border-orange-300 text-orange-600 bg-orange-50' : ''}`}
                                    />
                                </div>
                                <span className="text-sm font-bold text-gray-700 whitespace-nowrap min-w-[70px] text-right">
                                    {formatPrice(item.sellingPrice * item.quantity)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Customer + Payment + Total */}
            <div className="border-t px-4 py-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                        <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="Tên KH" value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                    </div>
                    <div className="relative">
                        <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="SĐT" value={customerPhone}
                            onChange={e => setCustomerPhone(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                    </div>
                </div>
                <div className="flex gap-1.5">
                    {paymentMethods.map(m => (
                        <button key={m.key} onClick={() => setPaymentMethod(m.key)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${paymentMethod === m.key
                                ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            <m.icon size={14} />
                            {m.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Giảm giá:</span>
                    <input type="number" value={discount || ''} onChange={e => setDiscount(Number(e.target.value))}
                        placeholder="0" className="flex-1 px-3 py-1.5 border rounded-lg text-right text-sm" />
                </div>
                <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-gray-500">
                        <span>Tạm tính ({cart.reduce((s, c) => s + c.quantity, 0)} SP)</span>
                        <span>{formatPrice(subtotal)}</span>
                    </div>
                    {discount > 0 && (
                        <div className="flex justify-between text-green-600">
                            <span>Giảm giá</span>
                            <span>-{formatPrice(discount)}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-lg text-orange-600 pt-1 border-t">
                        <span>TỔNG</span>
                        <span>{formatPrice(total)}</span>
                    </div>
                </div>
                <button onClick={handleCheckout} disabled={cart.length === 0 || isProcessing}
                    className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-orange-200/50 transition-all active:scale-[0.98]">
                    {isProcessing ? (
                        <><Loader2 className="animate-spin" size={18} /> Đang xử lý...</>
                    ) : (
                        <><Receipt size={18} /> Thanh toán & Xuất hóa đơn</>
                    )}
                </button>
            </div>
        </>
    );

    return (
        <div className="h-[calc(100vh-80px)] flex gap-4 p-4">
            {/* ═══ LEFT: Product Grid ═══ */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Search + Category Filter + Quick Add */}
                <div className="flex gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Tìm sản phẩm... (F1)"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 bg-white shadow-sm"
                        />
                    </div>
                    <button
                        onClick={() => setShowProductModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 shadow-sm font-semibold text-sm whitespace-nowrap transition-all"
                    >
                        <Plus size={16} />
                        Thêm SP Mới
                    </button>
                </div>

                {/* Category Tabs */}
                <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${activeCategory === cat
                                ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            {catLabel[cat] || cat}
                        </button>
                    ))}
                </div>

                {/* Product Grid */}
                <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {filtered.map(product => {
                            const outOfStock = (product.stock || 0) <= 0;
                            return (
                                <button
                                    key={product.id}
                                    onClick={() => !outOfStock && addToCart(product)}
                                    disabled={outOfStock}
                                    className={`bg-white rounded-xl border border-gray-100 p-3 text-left transition-all group relative ${
                                        outOfStock
                                            ? 'opacity-50 cursor-not-allowed'
                                            : 'hover:shadow-lg hover:border-orange-200 active:scale-[0.97]'
                                    }`}
                                >
                                    {/* Out-of-stock badge */}
                                    {outOfStock && (
                                        <div className="absolute top-2 right-2 z-10 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                                            <AlertTriangle size={10} /> Hết hàng
                                        </div>
                                    )}
                                    <div className="aspect-square rounded-lg bg-gray-50 mb-2 overflow-hidden flex items-center justify-center">
                                        {((product as any).imageUrl || product.images?.[0]) ? (
                                            <img src={(product as any).imageUrl || product.images?.[0]} alt={product.name} className={`w-full h-full object-cover ${!outOfStock ? 'group-hover:scale-105' : ''} transition-transform`} />
                                        ) : (
                                            <Package className="text-gray-300" size={32} />
                                        )}
                                    </div>
                                    <p className="text-xs font-semibold text-gray-800 line-clamp-2 mb-1">{product.name}</p>
                                    <p className="text-sm font-bold text-orange-600">{formatPrice(product.price_promo || product.price_original)}</p>
                                    <p className={`text-[10px] mt-0.5 font-medium ${outOfStock ? 'text-red-500' : (product.stock || 0) <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                                        Tồn kho: {product.stock || 0}
                                    </p>
                                </button>
                            );
                        })}
                        {filtered.length === 0 && (
                            <div className="col-span-full text-center py-16 text-gray-400">
                                <Package size={48} className="mx-auto mb-3 opacity-50" />
                                <p>Không tìm thấy sản phẩm</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══ RIGHT: Cart & Checkout (Desktop) ═══ */}
            <div className="hidden md:flex w-[380px] flex-shrink-0 bg-white rounded-2xl border shadow-sm flex-col">
                {cartSection}
            </div>

            {/* ═══ Mobile: Sticky Bottom Bar ═══ */}
            {!showMobileCart && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-4 py-3 z-40">
                    <button onClick={() => setShowMobileCart(true)}
                        className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center gap-2 shadow-lg shadow-orange-200/50 active:scale-[0.98]">
                        <ShoppingCart size={18} />
                        Giỏ hàng ({cart.reduce((s, c) => s + c.quantity, 0)}) — {formatPrice(total)}
                    </button>
                </div>
            )}

            {/* ═══ Mobile: Full-screen Cart Sheet ═══ */}
            {showMobileCart && (
                <div className="md:hidden fixed inset-0 bg-white z-50 flex flex-col">
                    {cartSection}
                </div>
            )}

            {/* ═══ Receipt Modal (80mm thermal) ═══ */}
            {showReceipt && lastOrder && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b">
                            <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle2 size={20} />
                                <span className="font-bold">Thanh toán thành công!</span>
                            </div>
                            <button onClick={() => setShowReceipt(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div id="pos-receipt" className="px-6 py-4 text-xs space-y-3" style={{ maxWidth: '302px', margin: '0 auto' }}>
                            <div className="text-center">
                                <h3 className="font-bold text-sm uppercase">{config.siteName || 'Văn Lành Service'}</h3>
                                <p className="text-gray-500 text-[10px]">Hotline: 0932.242.026</p>
                                <p className="font-bold mt-1">HÓA ĐƠN BÁN HÀNG</p>
                                <p className="text-gray-500 text-[10px]">
                                    {new Date().toLocaleString('vi-VN')} | #{lastOrder.id.slice(-6).toUpperCase()}
                                </p>
                            </div>
                            <hr className="border-dashed" />
                            <div>
                                <p>KH: <b>{lastOrder.customer_info.name}</b></p>
                                {lastOrder.customer_info.phone && <p>SĐT: {lastOrder.customer_info.phone}</p>}
                            </div>
                            <hr className="border-dashed" />
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="py-1">SP</th>
                                        <th className="text-center">SL</th>
                                        <th className="text-right">Giá</th>
                                        <th className="text-right">TT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lastOrder.items.map((item: any, i: number) => (
                                        <tr key={i} className="border-b border-dashed">
                                            <td className="py-1 max-w-[100px] truncate">{item.product_name}</td>
                                            <td className="text-center">{item.quantity}</td>
                                            <td className="text-right">{(item.price / 1000).toFixed(0)}k</td>
                                            <td className="text-right font-medium">{((item.price * item.quantity) / 1000).toFixed(0)}k</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="space-y-0.5 pt-1">
                                {lastOrder.discount_amount > 0 && (
                                    <div className="flex justify-between"><span>Giảm giá</span><span>-{formatPrice(lastOrder.discount_amount)}</span></div>
                                )}
                                <div className="flex justify-between font-bold text-sm border-t pt-1">
                                    <span>TỔNG CỘNG</span>
                                    <span>{formatPrice(lastOrder.total_amount)}</span>
                                </div>
                                <div className="flex justify-between text-gray-500">
                                    <span>Thanh toán</span>
                                    <span>{paymentMethods.find(m => m.key === paymentMethod)?.label}</span>
                                </div>
                            </div>
                            <hr className="border-dashed" />
                            <p className="text-center text-gray-400 text-[10px]">Cảm ơn quý khách! Hẹn gặp lại.</p>
                        </div>
                        <div className="px-4 pb-4 flex gap-2">
                            <button onClick={() => setShowReceipt(false)}
                                className="flex-1 py-2 rounded-lg text-sm bg-gray-100 text-gray-700 hover:bg-gray-200">
                                Đóng
                            </button>
                            <button onClick={() => {
                                const printContent = document.getElementById('pos-receipt')?.innerHTML;
                                if (printContent) {
                                    const w = window.open('', '_blank', 'width=320,height=600');
                                    w?.document.write(`<html><head><title>Hóa đơn POS</title>
                                        <style>body{font-family:monospace;font-size:11px;padding:8px;max-width:302px;margin:0 auto}
                                        table{width:100%;border-collapse:collapse}th,td{padding:2px 0}hr{border:none;border-top:1px dashed #ccc}
                                        .font-bold,b{font-weight:bold}.text-center{text-align:center}.text-right{text-align:right}
                                        </style></head><body>${printContent}</body></html>`);
                                    w?.document.close();
                                    w?.print();
                                }
                            }}
                                className="flex-1 py-2 rounded-lg text-sm bg-orange-500 text-white hover:bg-orange-600 flex items-center justify-center gap-1.5">
                                <Receipt size={14} /> In hóa đơn
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Print-only receipt */}
            {lastOrder && (
                <div className="fixed inset-0 bg-white z-[100] p-4 hidden print:block" style={{ maxWidth: '302px', margin: '0 auto', fontFamily: 'monospace', fontSize: '11px' }}>
                    <div className="text-center mb-2">
                        <p className="font-bold text-sm">{config.siteName || 'Văn Lành Service'}</p>
                        <p>HÓA ĐƠN BÁN HÀNG</p>
                        <p>{new Date().toLocaleString('vi-VN')} | #{lastOrder.id.slice(-6).toUpperCase()}</p>
                    </div>
                    <hr style={{ borderTop: '1px dashed #000' }} />
                    <p>KH: {lastOrder.customer_info.name}</p>
                    {lastOrder.customer_info.phone && <p>SĐT: {lastOrder.customer_info.phone}</p>}
                    <hr style={{ borderTop: '1px dashed #000' }} />
                    <table style={{ width: '100%' }}>
                        <tbody>
                            {lastOrder.items.map((item: any, i: number) => (
                                <tr key={i}>
                                    <td>{item.product_name}</td>
                                    <td style={{ textAlign: 'center' }}>x{item.quantity}</td>
                                    <td style={{ textAlign: 'right' }}>{formatPrice(item.price * item.quantity)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <hr style={{ borderTop: '1px dashed #000' }} />
                    <p style={{ textAlign: 'right', fontWeight: 'bold' }}>TỔNG: {formatPrice(lastOrder.total_amount)}</p>
                    <hr style={{ borderTop: '1px dashed #000' }} />
                    <p style={{ textAlign: 'center', marginTop: '8px' }}>Cảm ơn quý khách!</p>
                </div>
            )}

            {/* ═══ Quick Add Product Modal ═══ */}
            {showProductModal && (
                <POSProductModal
                    onClose={() => setShowProductModal(false)}
                    onSaved={reloadProducts}
                />
            )}
        </div>
    );
}

// ── Quick Add Product Modal for POS ──
const POS_CATEGORIES = ['Điện thoại', 'Laptop', 'Tablet', 'Phụ kiện', 'Smartwatch', 'Âm thanh'];
const POS_ACCESSORY_SUBCATEGORIES = ['Ốp lưng', 'Sạc dự phòng', 'Cáp sạc', 'Cóc sạc', 'Tai nghe', 'Khác'];
const POS_BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'OPPO', 'Vivo', 'Dell', 'HP', 'Lenovo', 'Asus', 'Sony'];
const POS_CONDITIONS = [
    { value: 'new', label: 'Mới 100%' },
    { value: 'like-new', label: 'Cũ 99%' },
    { value: 'used', label: 'Hàng cũ | TBH' },
];

function POSProductModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [formData, setFormData] = useState({
        name: '',
        price_original: '' as number | '',
        price_promo: '' as number | '',
        category: POS_CATEGORIES[0],
        subCategory: '',
        brand: POS_BRANDS[0],
        description: '',
        stock: '' as number | '',
        status: 'active',
        condition: 'new',
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            let imageUrl = '';
            if (imageFile) {
                imageUrl = await uploadImage(imageFile, 'products');
            }

            let baseSlug = generateSlug(formData.name);
            let finalSlug = baseSlug;
            // Simplified conflict checking for POS speed; if preferred we could check doc exists, 
            // but relying on append for safety in quick-add.
            // A more robust check:
            finalSlug = `${baseSlug}-${Math.floor(Math.random() * 1000)}`;

            await addDocumentWithId('products', finalSlug, {
                ...formData,
                price_original: Number(formData.price_original) || 0,
                price_promo: Number(formData.price_promo) || 0,
                stock: Number(formData.stock) || 0,
                imageUrl,
                images: imageUrl ? [imageUrl] : [],
                sold: 0,
                specs: {},
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            onSaved();
            onClose();
        } catch (err) {
            console.error(err);
            alert('Lỗi khi tạo sản phẩm!');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
                <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-lg font-bold text-gray-800">Thêm sản phẩm mới (POS)</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* Image */}
                    <div className="border-2 border-dashed rounded-xl p-4 text-center">
                        {imagePreview ? (
                            <img src={imagePreview} alt="" className="w-24 h-24 object-cover rounded-lg mx-auto mb-2" />
                        ) : (
                            <Upload className="mx-auto text-gray-300 mb-2" size={32} />
                        )}
                        <input type="file" accept="image/*" onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); }
                        }} className="text-sm" />
                        <p className="text-xs text-gray-400 mt-1">Ảnh không bắt buộc cho POS</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Tên sản phẩm *</label>
                        <input type="text" required value={formData.name}
                            onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                            className="w-full h-10 px-3 border rounded-lg" placeholder="iPhone 15 Pro Max 256GB" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Danh mục</label>
                            <select value={formData.category} onChange={(e) => setFormData(p => ({ ...p, category: e.target.value, subCategory: e.target.value === 'Phụ kiện' ? p.subCategory : '' }))}
                                className="w-full h-10 px-3 border rounded-lg">
                                {POS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Hãng</label>
                            <select value={formData.brand} onChange={(e) => setFormData(p => ({ ...p, brand: e.target.value }))}
                                className="w-full h-10 px-3 border rounded-lg">
                                {POS_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                    </div>

                    {formData.category === 'Phụ kiện' && (
                        <div>
                            <label className="block text-sm font-medium mb-1">Loại phụ kiện</label>
                            <select value={formData.subCategory} onChange={(e) => setFormData(p => ({ ...p, subCategory: e.target.value }))}
                                className="w-full h-10 px-3 border rounded-lg">
                                <option value="">— Chọn loại —</option>
                                {POS_ACCESSORY_SUBCATEGORIES.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Giá gốc *</label>
                            <input type="number" required min={0} value={formData.price_original}
                                onChange={(e) => setFormData(p => ({ ...p, price_original: e.target.value ? Number(e.target.value) : '' }))}
                                className="w-full h-10 px-3 border rounded-lg" placeholder="0" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Giá bán *</label>
                            <input type="number" required min={0} value={formData.price_promo}
                                onChange={(e) => setFormData(p => ({ ...p, price_promo: e.target.value ? Number(e.target.value) : '' }))}
                                className="w-full h-10 px-3 border rounded-lg font-semibold text-orange-600" placeholder="0" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Tồn kho</label>
                            <input type="number" min={0} value={formData.stock}
                                onChange={(e) => setFormData(p => ({ ...p, stock: e.target.value ? Number(e.target.value) : '' }))}
                                className="w-full h-10 px-3 border rounded-lg" placeholder="0" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Tình trạng</label>
                        <div className="flex gap-2">
                            {POS_CONDITIONS.map(c => (
                                <button key={c.value} type="button"
                                    onClick={() => setFormData(p => ({ ...p, condition: c.value }))}
                                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                                        formData.condition === c.value ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}>
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-3 pt-3 border-t">
                        <button type="button" onClick={onClose}
                            className="w-1/3 py-2.5 rounded-xl font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                            Hủy
                        </button>
                        <button type="submit" disabled={isSubmitting}
                            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            Tạo & Đưa vào POS
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
