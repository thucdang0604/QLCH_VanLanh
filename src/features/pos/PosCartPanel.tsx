import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import Image from 'next/image';
import { AlertTriangle, Banknote, CreditCard, Minus, Package, Phone, Plus, QrCode, Receipt, ShoppingCart, Tag, Trash2, User, Wrench, X } from 'lucide-react';
import CurrencyInput from '@/components/admin/CurrencyInput';
import type { Product } from '@/lib/types';
import type { AppliedVoucher, CartItem, DiscountDetail, RepairTicketInfo, VoucherStatus } from './posTypes';

const paymentMethods = [
    { key: 'cash', label: 'Tiền mặt', icon: Banknote },
    { key: 'bank', label: 'Chuyển khoản', icon: CreditCard },
    { key: 'momo', label: 'MoMo', icon: QrCode },
    { key: 'installment', label: 'Trả góp', icon: CreditCard },
    { key: 'debt', label: 'Ghi nợ', icon: AlertTriangle },
];

interface PosCartPanelProps {
    cart: CartItem[];
    setCart: Dispatch<SetStateAction<CartItem[]>>;
    products: (Product & { id: string })[];
    customerName: string;
    setCustomerName: (value: string) => void;
    customerPhone: string;
    setCustomerPhone: (value: string) => void;
    customerDebt: number;
    repairLoading: boolean;
    linkedRepairs: RepairTicketInfo[];
    discountDetails: DiscountDetail[];
    autoDiscountAmount: number;
    setDiscount: Dispatch<SetStateAction<number>>;
    paymentMethod: string;
    setPaymentMethod: (value: string) => void;
    discount: number;
    voucherCode: string;
    setVoucherCode: (value: string) => void;
    voucherStatus: VoucherStatus | null;
    appliedVoucher: AppliedVoucher | null;
    setAppliedVoucher: (value: AppliedVoucher | null) => void;
    setVoucherStatus: (value: VoucherStatus | null) => void;
    voucherDiscountAmount: number;
    deposit: number;
    setDeposit: Dispatch<SetStateAction<number>>;
    useSurplusToPayDebt: boolean;
    setUseSurplusToPayDebt: (value: boolean) => void;
    subtotal: number;
    total: number;
    isProcessing: boolean;
    onCloseMobileCart: () => void;
    onLookupRepairByPhone: (phone: string) => void;
    onAddRepairToCart: (repair: RepairTicketInfo) => void;
    onApplyVoucher: () => void;
    onUpdateQuantity: (cartItemId: string, delta: number) => void;
    onUpdatePrice: (cartItemId: string, newPrice: number) => void;
    onRemoveFromCart: (cartItemId: string) => void;
    onCheckout: () => void;
    formatPrice: (value: number) => string;
}

export function PosCartPanel({
    cart,
    setCart,
    products,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    customerDebt,
    repairLoading,
    linkedRepairs,
    discountDetails,
    autoDiscountAmount,
    setDiscount,
    paymentMethod,
    setPaymentMethod,
    discount,
    voucherCode,
    setVoucherCode,
    voucherStatus,
    appliedVoucher,
    setAppliedVoucher,
    setVoucherStatus,
    voucherDiscountAmount,
    deposit,
    setDeposit,
    useSurplusToPayDebt,
    setUseSurplusToPayDebt,
    subtotal,
    total,
    isProcessing,
    onCloseMobileCart,
    onLookupRepairByPhone,
    onAddRepairToCart,
    onApplyVoucher,
    onUpdateQuantity,
    onUpdatePrice,
    onRemoveFromCart,
    onCheckout,
    formatPrice,
}: PosCartPanelProps) {
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const [showRepairsList, setShowRepairsList] = useState(true);

    // Auto-expand repair list when a new set of repairs is loaded
    useEffect(() => {
        if (linkedRepairs.length > 0) {
            setShowRepairsList(true);
        }
    }, [linkedRepairs]);

    return (
        <>
            <div className="px-4 py-3 border-b flex items-center gap-2">
                <ShoppingCart size={20} className="text-orange-500" />
                <h2 className="font-bold text-gray-800">Giỏ hàng</h2>
                <span className="ml-auto bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">
                    {itemCount} SP
                </span>
                <button
                    onClick={onCloseMobileCart}
                    className="md:hidden p-1 text-gray-400 hover:text-gray-600"
                    aria-label="Đóng giỏ hàng"
                    title="Đóng giỏ hàng"
                >
                    <X size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
                {cart.length === 0 && (
                    <div className="text-center py-12 text-gray-300">
                        <ShoppingCart size={36} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Chưa có sản phẩm</p>
                    </div>
                )}
                {cart.map(item => {
                    const product = products.find(candidate => candidate.id === item.productId);
                    return (
                        <div key={item.cartItemId} className="bg-gray-50 rounded-xl p-3 space-y-2">
                            <div className="flex items-start gap-2">
                                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                                    {product?.images?.[0] ? (
                                        <Image src={product.images[0]} alt="" width={48} height={48} className="w-full h-full object-cover" />
                                    ) : (
                                        <Package className="text-gray-300" size={18} />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-800 line-clamp-2">{item.name}</p>
                                    {item.lotCode && (
                                        <span className="inline-block mt-1 bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                            Lô: {item.lotCode}
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => onRemoveFromCart(item.cartItemId)} className="text-red-400 hover:text-red-600 p-0.5" aria-label="Xóa khỏi giỏ" title="Xóa khỏi giỏ">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 bg-white rounded-lg border">
                                    <button onClick={() => onUpdateQuantity(item.cartItemId, -1)} className="p-1 hover:bg-gray-100 rounded-l-lg disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Giảm số lượng" title="Giảm số lượng" disabled={item.isRepairTicket}>
                                        <Minus size={14} />
                                    </button>
                                    <span className="px-2 text-sm font-bold min-w-[24px] text-center">{item.quantity}</span>
                                    <button onClick={() => onUpdateQuantity(item.cartItemId, 1)} className="p-1 hover:bg-gray-100 rounded-r-lg disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Tăng số lượng" title="Tăng số lượng" disabled={item.isRepairTicket}>
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <div className="flex-1 relative">
                                    <Tag size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <CurrencyInput
                                        value={item.sellingPrice}
                                        onChange={value => onUpdatePrice(item.cartItemId, value)}
                                        disabled={item.isRepairTicket}
                                        className={`w-full pl-7 pr-2 py-1 text-sm border rounded-lg text-right font-semibold ${item.sellingPrice !== item.originalPrice ? 'border-orange-300 text-orange-600 bg-orange-50' : ''} ${item.isRepairTicket ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                                    />
                                </div>
                                <span className="text-sm font-bold text-gray-700 whitespace-nowrap min-w-[70px] text-right">
                                    {formatPrice(item.sellingPrice * item.quantity)}
                                </span>
                            </div>
                            {item.warrantyType === 'warrantyDevice' && (
                                <div className="mt-2 space-y-2 border-t pt-2 border-gray-100">
                                    <p className="text-xs font-semibold text-gray-600">Bắt buộc nhập IMEI / Serial ({item.quantity})</p>
                                    {Array.from({ length: item.quantity }).map((_, index) => (
                                        <div key={index} className="relative">
                                            <input
                                                type="text"
                                                placeholder={`Nhập IMEI/Serial #${index + 1}`}
                                                value={item.imeis?.[index] || ''}
                                                onChange={(event) => {
                                                    const value = event.target.value;
                                                    setCart(previous => previous.map(cartItem => {
                                                        if (cartItem.productId !== item.productId) return cartItem;
                                                        const imeis = [...(cartItem.imeis || [])];
                                                        imeis[index] = value;
                                                        return { ...cartItem, imeis };
                                                    }));
                                                }}
                                                className="w-full text-xs py-1.5 pl-2 pr-8 border rounded focus:ring-1 focus:ring-orange-500/20 uppercase"
                                            />
                                            {(item.imeis?.[index]?.length || 0) < 5 && (
                                                <AlertTriangle size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-orange-400" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="border-t px-4 py-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                        <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="Tên KH" value={customerName} onChange={event => setCustomerName(event.target.value)} className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                    </div>
                    <div className="relative">
                        <Phone size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="SĐT" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} onBlur={() => onLookupRepairByPhone(customerPhone)} className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                    </div>
                </div>
                {customerDebt > 0 && (
                    <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-2 text-xs flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1.5">
                            <AlertTriangle size={14} /> Khách đang nợ: {formatPrice(customerDebt)}
                        </span>
                    </div>
                )}
                {repairLoading && <p className="text-xs text-gray-400 animate-pulse">Đang tra cứu phiếu sửa...</p>}
                {linkedRepairs.length > 0 && (
                    <div className="space-y-1.5 border border-blue-100 rounded-lg p-2 bg-blue-50/20">
                        <div className="flex items-center justify-between text-blue-700 font-semibold mb-1">
                            <span className="flex items-center gap-1.5">
                                <Wrench size={13} /> Phiếu sửa chưa thanh toán ({linkedRepairs.length})
                            </span>
                            <button
                                type="button"
                                onClick={() => setShowRepairsList(!showRepairsList)}
                                className="text-blue-500 hover:text-blue-700 underline font-normal text-[11px]"
                            >
                                {showRepairsList ? 'Thu gọn' : 'Hiển thị'}
                            </button>
                        </div>
                        {showRepairsList && (
                            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                                {linkedRepairs.map(repair => (
                                    <div key={repair.id} className="bg-white rounded-lg p-2.5 text-xs space-y-1 border border-blue-100/60 shadow-sm">
                                        <div className="flex items-center gap-1.5 font-semibold text-blue-700">
                                            <Wrench size={13} /> Phiếu sửa #{repair.id.slice(-6)}
                                        </div>
                                        <p className="text-blue-600">Máy: {repair.deviceModel} — {repair.status}</p>
                                        {repair.parts.length > 0 && <p className="text-blue-500">LK: {repair.parts.map(part => part.productName).join(', ')}</p>}
                                        {repair.paymentAmount > 0 && (
                                            <div className="mt-2 pt-2 border-t border-blue-100 flex items-center justify-between gap-2">
                                                <span className="font-semibold text-blue-800">Chi phí: {formatPrice(repair.paymentAmount)}</span>
                                                {(repair.paymentStatus === 'paid' || repair.paymentStatus === 'refunded') ? (
                                                    <span className="text-green-600 font-bold bg-green-100 px-2 py-1 rounded-md whitespace-nowrap">Đã thanh toán</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            onAddRepairToCart(repair);
                                                            setShowRepairsList(false);
                                                        }}
                                                        className="py-1 px-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
                                                    >
                                                        Thêm vào HĐ
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {discountDetails.length > 0 && (
                    <div className="bg-green-50 rounded-lg p-2.5 text-xs border border-green-200">
                        <p className="font-semibold text-green-700">🎁 Giảm PK tự động:</p>
                        {discountDetails.map((detail, index) => (
                            <p key={`${detail.productName}-${index}`} className="text-green-600">
                                {detail.productName}: -{detail.discountAmount.toLocaleString('vi-VN')}đ ({detail.ruleName})
                            </p>
                        ))}
                        <button type="button" onClick={() => setDiscount(previous => Math.max(previous, autoDiscountAmount))} className="mt-1 w-full py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors">
                            Áp dụng giảm {autoDiscountAmount.toLocaleString('vi-VN')}đ
                        </button>
                    </div>
                )}
                <div className="flex gap-1.5">
                    {paymentMethods.map(method => (
                        <button key={method.key} onClick={() => setPaymentMethod(method.key)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${paymentMethod === method.key ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            <method.icon size={14} />
                            {method.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Giảm giá:</span>
                    <CurrencyInput value={discount || ''} onChange={value => setDiscount(value)} placeholder="0" className="flex-1 px-3 py-1.5 border rounded-lg text-right text-sm" />
                </div>

                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">Voucher:</span>
                        <div className="flex-1 relative flex gap-1">
                            <input type="text" placeholder="Nhập mã giảm giá" value={voucherCode} onChange={event => setVoucherCode(event.target.value.toUpperCase())} className="w-full px-3 py-1.5 border rounded-lg text-sm uppercase" />
                            <button onClick={onApplyVoucher} className="px-3 py-1.5 bg-blue-50 text-blue-600 font-semibold rounded-lg hover:bg-blue-100 text-sm whitespace-nowrap">
                                Áp dụng
                            </button>
                        </div>
                    </div>
                    {voucherStatus && (
                        <div className={`text-xs text-right pr-1 ${voucherStatus.type === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                            {voucherStatus.message}
                            {appliedVoucher && (
                                <button onClick={() => { setAppliedVoucher(null); setVoucherCode(''); setVoucherStatus(null); }} className="ml-2 text-red-500 underline">
                                    Bỏ
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Khách trả / Cọc:</span>
                    <CurrencyInput value={deposit || ''} onChange={value => setDeposit(value)} placeholder="0" className="flex-1 px-3 py-1.5 border rounded-lg text-right text-sm" />
                </div>
                {customerDebt > 0 && deposit > total && (
                    <div className="flex items-start gap-2 bg-blue-50 p-2 rounded-lg mt-2 border border-blue-200">
                        <input type="checkbox" id="useSurplusDebt" className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" checked={useSurplusToPayDebt} onChange={(event) => setUseSurplusToPayDebt(event.target.checked)} />
                        <label htmlFor="useSurplusDebt" className="text-xs text-blue-800 flex-1 cursor-pointer leading-tight">
                            <b>Khách có nợ cũ: {formatPrice(customerDebt)}</b><br />
                            Dùng số tiền thừa <b>{formatPrice(deposit - total)}</b> để cấn trừ nợ
                        </label>
                    </div>
                )}
                <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-gray-500">
                        <span>Tạm tính ({itemCount} SP)</span>
                        <span>{formatPrice(subtotal)}</span>
                    </div>
                    {discount > 0 && <div className="flex justify-between text-green-600"><span>Giảm giá NV</span><span>-{formatPrice(discount)}</span></div>}
                    {voucherDiscountAmount > 0 && <div className="flex justify-between text-blue-600 font-medium"><span>Voucher giảm giá</span><span>-{formatPrice(voucherDiscountAmount)}</span></div>}
                    <div className="flex justify-between font-bold text-lg text-orange-600 pt-1 border-t">
                        <span>TỔNG</span>
                        <span>{formatPrice(total)}</span>
                    </div>
                    {deposit > 0 && <div className="flex justify-between text-blue-600 pt-1"><span>Đã cọc</span><span>{formatPrice(deposit)}</span></div>}
                    {deposit > 0 && <div className="flex justify-between font-bold text-red-600 pt-1"><span>CÒN LẠI</span><span>{formatPrice(Math.max(0, total - deposit))}</span></div>}
                </div>
                <button onClick={onCheckout} disabled={cart.length === 0 || isProcessing} className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-orange-200/50 transition-all active:scale-[0.98]">
                    {isProcessing ? (
                        <><span className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/40 border-t-white" /> Đang xử lý...</>
                    ) : (
                        <><Receipt size={18} /> Thanh toán & Xuất hóa đơn</>
                    )}
                </button>
            </div>
        </>
    );
}
