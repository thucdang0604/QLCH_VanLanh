'use client';


import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Search, ShoppingCart, Plus, Minus, Trash2, User, Phone, Receipt, X,
    Package, CreditCard, Banknote, QrCode, Tag, Loader2, CheckCircle2,
    AlertTriangle, Wrench, Camera, Keyboard
} from 'lucide-react';
import { collection, getDocs, query, where, orderBy as fbOrderBy } from 'firebase/firestore';

import { useConfig } from '@/lib/ConfigContext';
import Modal from '@/components/admin/Modal';
import UniversalProductModal from '@/components/admin/UniversalProductModal';
import Image from 'next/image';
import { db, getAuthInstance } from '@/lib/firebase';
import type { Product, TaxonomyNode } from '@/lib/types';

import { toastError } from '@/lib/toast';
import { DEFAULT_CONFIG } from '@/lib/config-defaults';
import { PART_CATEGORY, isPartCategory } from '@/lib/constants';
import { fetchActiveDiscountRules, calculateAccessoryDiscounts } from '@/lib/discountRuleUtils';
import CurrencyInput from '@/components/admin/CurrencyInput';
import { consumeChatWorkflowHandoff } from '@/lib/chatWorkflowHandoff';
import { extractProductCodeFromScan, getPrimaryProductCode, getProductScanCandidates, productCodeSearchText } from '@/lib/productCodes';
import { isProductSellable } from '@/lib/productLifecycle';

type BarcodeDetectionResult = { rawValue?: string };
type BrowserBarcodeDetector = {
    detect(source: HTMLVideoElement): Promise<BarcodeDetectionResult[]>;
};
type BrowserBarcodeDetectorConstructor = {
    new(options?: { formats?: string[] }): BrowserBarcodeDetector;
    getSupportedFormats?: () => Promise<string[]>;
};
const RETAIL_CATEGORY_IDS = DEFAULT_CONFIG.taxonomy.retail.map((node) => node.id);
const CAMERA_BARCODE_FORMATS = ['qr_code', 'code_128'];

declare global {
    interface Window {
        BarcodeDetector?: BrowserBarcodeDetectorConstructor;
    }
}


// ── Receipt item shape (matches orderData.items) ──
interface OrderLineItem {
    productId: string;
    productName: string;
    product_id?: string;
    product_name?: string;
    quantity: number;
    price: number;
    costPrice?: number;
}

interface LastOrderData {
    id: string;
    customer_info: { name: string; phone: string; email?: string; city?: string; district?: string; ward?: string; address?: string };
    items: OrderLineItem[];
    total_amount: number;
    discount_amount: number;
    subtotal_amount: number;
    deposit_amount: number;
    payment_method: string;
    createdByName?: string;
    createdAt: Date;
}

// ── Cart Item ──
interface CartItem {
    productId: string;
    name: string;
    image?: string;
    originalPrice: number;
    sellingPrice: number; // Overridable
    costPrice?: number;
    quantity: number;
    isRepairTicket?: boolean;
    warrantyType?: string;
    imeis?: string[];
}

const paymentMethods = [
    { key: 'cash', label: 'Tiền mặt', icon: Banknote },
    { key: 'bank', label: 'Chuyển khoản', icon: CreditCard },
    { key: 'momo', label: 'MoMo', icon: QrCode },
    { key: 'installment', label: 'Trả góp', icon: CreditCard },
];

export default function POSPage() {
    const { config } = useConfig();
    const searchParams = useSearchParams();

    const resolveWarranty = useCallback((product: Product) => {
        if (product.warrantyType && product.warrantyType !== 'none') {
            return product.warrantyType;
        }
        if (product.warrantyType === 'none') return 'none';

        const cat = product.category;
        const segments = typeof cat === 'string' ? cat.split('/') : [];
        let nodes: TaxonomyNode[] = config?.taxonomy?.retail || [];
        let lastFound: Product['warrantyType'] | null = null;
        for (let i = 0; i < segments.length; i++) {
            const partialId = segments.slice(0, i + 1).join('/');
            const node = nodes.find((n) => n.id === partialId || n.slug === segments[i]);
            if (!node) break;
            if (node.warrantyType && node.warrantyType !== 'none') lastFound = node.warrantyType;
            else if (node.warrantyType === 'none') lastFound = null;
            if (!node.children?.length) break;
            nodes = node.children;
        }
        return lastFound || 'none';
    }, [config?.taxonomy?.retail]);

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
    const [deposit, setDeposit] = useState(0);
    const chatPrefillApplied = useRef(false);

    // Checkout
    const [isProcessing, setIsProcessing] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [printTemplate, setPrintTemplate] = useState<'thermal' | 'a5'>('a5');
    const [lastOrder, setLastOrder] = useState<LastOrderData | null>(null);
    const [showProductModal, setShowProductModal] = useState(false);

    // Repair lookup
    interface RepairTicketInfo {
        id: string;
        customerName: string;
        customerPhone: string;
        deviceModel: string;
        status: string;
        parts: { productName: string; partType?: string; unitPriceAtUse?: number }[];
        paymentAmount: number;
        paymentStatus: string;
    }
    const [linkedRepair, setLinkedRepair] = useState<RepairTicketInfo | null>(null);
    const [repairLoading, setRepairLoading] = useState(false);
    const [autoDiscountAmount, setAutoDiscountAmount] = useState(0);
    const [discountDetails, setDiscountDetails] = useState<{ productName: string; discountAmount: number; ruleName: string }[]>([]);

    useEffect(() => {
        if (chatPrefillApplied.current || searchParams.get('source') !== 'chat') return;
        const handoff = consumeChatWorkflowHandoff();
        if (!handoff) return;
        setCustomerName(handoff.customerName);
        setCustomerPhone(handoff.customerPhone);
        chatPrefillApplied.current = true;
    }, [searchParams]);

    // Lookup repair by phone
    const lookupRepairByPhone = async (phone: string) => {
        if (!phone || phone.length < 8) {
            setLinkedRepair(null);
            setAutoDiscountAmount(0);
            setDiscountDetails([]);
            return;
        }
        setRepairLoading(true);
        try {
            const q = query(
                collection(db, 'repairs'),
                where('customerPhone', '==', phone.trim()),
                fbOrderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                const d = snap.docs[0];
                const data = d.data();
                setLinkedRepair({
                    id: d.id,
                    customerName: data.customerName || '',
                    customerPhone: data.customerPhone || phone,
                    deviceModel: data.deviceModel || '',
                    status: data.status || '',
                    parts: (data.parts || []).map((p: Record<string, unknown>) => ({
                        productName: String(p.productName || ''),
                        partType: String(p.partType || ''),
                        unitPriceAtUse: Number(p.unitPriceAtUse || 0)
                    })),
                    paymentAmount: Number(data.payment?.amount || 0),
                    paymentStatus: String(data.payment?.status || 'unpaid')
                });
                // Auto-fill customer name if empty
                if (!customerName && data.customerName) {
                    setCustomerName(data.customerName);
                }
            } else {
                setLinkedRepair(null);
            }
        } catch (err) {
            console.error('Repair lookup failed:', err);
        }
        setRepairLoading(false);
    };

    // Auto-calculate discount when cart or linked repair changes
    useEffect(() => {
        if (!linkedRepair || linkedRepair.parts.length === 0 || cart.length === 0) {
            setAutoDiscountAmount(0);
            setDiscountDetails([]);
            return;
        }
        (async () => {
            try {
                const rules = await fetchActiveDiscountRules();
                if (rules.length === 0) return;
                const results = calculateAccessoryDiscounts(
                    linkedRepair.parts,
                    cart.map(c => ({ productId: c.productId, productName: c.name, price: c.sellingPrice })),
                    rules
                );
                const totalDisc = results.reduce((s, r) => s + r.discountAmount, 0);
                setAutoDiscountAmount(totalDisc);
                setDiscountDetails(results);
            } catch { /* rules not configured yet */ }
        })();
    }, [linkedRepair, cart]);

    const searchRef = useRef<HTMLInputElement>(null);

    const filterPosProducts = useCallback((data: (Product & { id: string })[]) => {
        return data.filter(p => {
            if (!isProductSellable(p)) return false;
            if (isPartCategory(p.category, p.categoryIds)) return true;
            if (p.categoryIds && p.categoryIds.length > 0) {
                return RETAIL_CATEGORY_IDS.includes(p.categoryIds[0]);
            }
            return p.category !== 'Dịch vụ sửa chữa' && p.category !== 'service';
        });
    }, []);

    // ── Load products ──
    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDocs(collection(db, 'products'));
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product & { id: string }));
                setProducts(filterPosProducts(data));
            } catch (err) {
                console.error('Failed to load products:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [filterPosProducts]);

    // Keyboard shortcut: F1 to focus search
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'F1') { e.preventDefault(); searchRef.current?.focus(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // ── Scan state ──
    const barcodeBuffer = useRef('');
    const lastKeyTime = useRef(Date.now());
    const scanStartTime = useRef(Date.now());
    const scannerVideoRef = useRef<HTMLVideoElement>(null);
    const scannerStreamRef = useRef<MediaStream | null>(null);
    const scanFrameRef = useRef<number | null>(null);
    const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
    const [showScanner, setShowScanner] = useState(false);
    const [manualScanCode, setManualScanCode] = useState('');
    const [scanStatus, setScanStatus] = useState('Sẵn sàng quét QR hoặc barcode sản phẩm');
    const [scannerError, setScannerError] = useState('');

    // ── Categories ──
    const categories = ['all', ...Array.from(new Set(products.map(p => p.category)))];

    // ── Filtered products ──
    const filtered = products.filter(p => {
        const matchCat = activeCategory === 'all' || p.category === activeCategory;
        const q = searchQuery.toLowerCase();
        const matchSearch = !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || productCodeSearchText(p).includes(q);
        return matchCat && matchSearch;
    });

    // ── Cart helpers ──
    const addToCart = useCallback((product: Product & { id: string }) => {
        const available = (product.stock || 0) - (product.held || 0);
        if (available <= 0) {
            toastError('Sản phẩm đã hết hàng!');
            return;
        }
        setCart(prev => {
            const existing = prev.find(c => c.productId === product.id);
            if (existing) {
                // Prevent exceeding available stock
                if (existing.quantity >= available) {
                    toastError(`Khả dụng chỉ còn ${available}. Không thể thêm.`);
                    return prev;
                }
                return prev.map(c =>
                    c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c
                );
            }
            const wType = resolveWarranty(product);
            return [...prev, {
                productId: product.id,
                name: product.name,
                image: (product as unknown as { imageUrl?: string }).imageUrl || product.images?.[0],
                originalPrice: product.price_promo || product.price_original,
                sellingPrice: product.price_promo || product.price_original,
                costPrice: product.costPrice || 0,
                quantity: 1,
                warrantyType: wType,
                imeis: [],
            }];
        });
    }, [resolveWarranty]);

    const findProductByScanCode = useCallback((rawCode: string) => {
        const code = extractProductCodeFromScan(rawCode);
        if (!code) return null;
        return products.find((product) => getProductScanCandidates(product).some((candidate) => candidate === rawCode.trim() || candidate === code)) || null;
    }, [products]);

    const handleProductScan = useCallback((rawCode: string, source: 'keyboard' | 'camera' | 'manual') => {
        const code = extractProductCodeFromScan(rawCode);
        const found = findProductByScanCode(rawCode);
        if (!found) {
            const label = code || rawCode.trim();
            setScanStatus(`Không tìm thấy mã ${label}`);
            toastError(`Không tìm thấy sản phẩm với mã ${label}`);
            return false;
        }
        addToCart(found);
        setScanStatus(`Đã thêm ${found.name}`);
        if (source === 'camera') setShowScanner(false);
        return true;
    }, [addToCart, findProductByScanCode]);
    const handleProductScanRef = useRef(handleProductScan);

    useEffect(() => {
        handleProductScanRef.current = handleProductScan;
    }, [handleProductScan]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isSearchFocused = activeElement === searchRef.current;
            if ((activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') && !isSearchFocused) return;

            const now = Date.now();
            if (now - lastKeyTime.current > 80) {
                barcodeBuffer.current = '';
                scanStartTime.current = now;
            }
            lastKeyTime.current = now;

            if (e.key === 'Enter') {
                const elapsed = now - scanStartTime.current;
                const looksLikeScannerInput = barcodeBuffer.current.length >= 3 && elapsed <= Math.max(350, barcodeBuffer.current.length * 80);
                if (looksLikeScannerInput) {
                    const code = barcodeBuffer.current;
                    barcodeBuffer.current = '';
                    if (isSearchFocused) {
                        e.preventDefault();
                        setSearchQuery('');
                    }
                    handleProductScan(code, 'keyboard');
                }
            } else if (e.key.length === 1) {
                barcodeBuffer.current += e.key;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleProductScan]);

    const stopCameraScanner = useCallback(() => {
        if (scanFrameRef.current) {
            window.cancelAnimationFrame(scanFrameRef.current);
            scanFrameRef.current = null;
        }
        scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
        scannerStreamRef.current = null;
        zxingControlsRef.current?.stop();
        zxingControlsRef.current = null;
        if (scannerVideoRef.current) scannerVideoRef.current.srcObject = null;
    }, []);

    useEffect(() => {
        if (!showScanner) {
            stopCameraScanner();
            return;
        }

        let cancelled = false;

        const startScanner = async () => {
            setScannerError('');
            setScanStatus('Đang mở camera...');

            try {
                const video = scannerVideoRef.current;
                if (!video) return;

                const BarcodeDetector = window.BarcodeDetector;
                const supportedNativeFormats = BarcodeDetector?.getSupportedFormats
                    ? await BarcodeDetector.getSupportedFormats()
                    : [];
                const canUseNativeScanner = BarcodeDetector
                    && CAMERA_BARCODE_FORMATS.every((format) => supportedNativeFormats.includes(format));

                if (!canUseNativeScanner) {
                    const { BrowserMultiFormatReader } = await import('@zxing/browser');
                    const reader = new BrowserMultiFormatReader();
                    const controls = await reader.decodeFromConstraints(
                        { video: { facingMode: { ideal: 'environment' } }, audio: false },
                        video,
                        (result) => {
                            const rawValue = result?.getText();
                            if (rawValue) handleProductScanRef.current(rawValue, 'camera');
                        },
                    );
                    if (cancelled) {
                        controls.stop();
                        return;
                    }
                    zxingControlsRef.current = controls;
                    setScanStatus('Đưa QR hoặc barcode vào khung camera');
                    return;
                }

                const detector = new BarcodeDetector({ formats: CAMERA_BARCODE_FORMATS });
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false,
                });
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                scannerStreamRef.current = stream;
                video.srcObject = stream;
                await video.play();
                setScanStatus('Đưa QR hoặc barcode vào khung camera');

                const scan = async () => {
                    if (cancelled || !scannerVideoRef.current) return;
                    try {
                        if (scannerVideoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                            const results = await detector.detect(scannerVideoRef.current);
                            const rawValue = results[0]?.rawValue;
                            if (rawValue && handleProductScanRef.current(rawValue, 'camera')) return;
                        }
                    } catch (err) {
                        console.error('Camera scan failed:', err);
                    }
                    scanFrameRef.current = window.requestAnimationFrame(scan);
                };
                scanFrameRef.current = window.requestAnimationFrame(scan);
            } catch (err) {
                if (cancelled) return;
                console.error('Camera open failed:', err);
                setScannerError('Không mở được camera. Kiểm tra quyền camera của trình duyệt hoặc nhập mã tay.');
            }
        };

        startScanner();
        return () => {
            cancelled = true;
            stopCameraScanner();
        };
    }, [showScanner, stopCameraScanner]);

    const addRepairToCart = () => {
        if (!linkedRepair) return;

        // Prevent adding if already in cart
        if (cart.some(c => c.productId === linkedRepair.id)) {
            toastError('Phiếu sửa chữa đã có trong hóa đơn!');
            return;
        }

        if (linkedRepair.paymentStatus === 'paid' || linkedRepair.paymentStatus === 'refunded') {
            toastError('Phiếu này đã được thanh toán hoặc hoàn tiền!');
            return;
        }

        setCart(prev => [{
            productId: linkedRepair.id,
            name: `[Phiếu sửa chữa] ${linkedRepair.deviceModel}`,
            originalPrice: linkedRepair.paymentAmount,
            sellingPrice: linkedRepair.paymentAmount,
            costPrice: 0,
            quantity: 1,
            isRepairTicket: true
        }, ...prev]);
    };

    const updateQuantity = (productId: string, delta: number) => {
        setCart(prev =>
            prev.map(c => {
                if (c.productId !== productId) return c;
                const newQty = Math.max(1, c.quantity + delta);
                // Validate against stock
                const product = products.find(p => p.id === productId);
                const maxAvailable = (product?.stock || 0) - (product?.held || 0);
                if (newQty > maxAvailable) {
                    toastError(`Khả dụng chỉ còn ${maxAvailable}.`);
                    return c;
                }
                return { ...c, quantity: newQty };
            })
        );
    };

    const updatePrice = (productId: string, newPrice: number) => {
        const item = cart.find(c => c.productId === productId);
        if (item && (item.costPrice || 0) > 0 && newPrice < (item.costPrice || 0) && newPrice > 0) {
            if (!confirm(`Giá bán (${newPrice.toLocaleString('vi-VN')}đ) thấp hơn giá vốn (${(item.costPrice || 0).toLocaleString('vi-VN')}đ). Bạn sẽ lỗ ${((item.costPrice || 0) - newPrice).toLocaleString('vi-VN')}đ/sp. Tiếp tục?`)) {
                return;
            }
        }
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

        setIsProcessing(true);
        try {
            // Pre-processing: gom nhóm cart theo productId chống payload manipulation
            const groupedCart = new Map<string, { name: string; totalQty: number; costPrice?: number; items: typeof cart }>();
            for (const item of cart) {
                const existing = groupedCart.get(item.productId);
                if (existing) {
                    existing.totalQty += item.quantity;
                    existing.items.push(item);
                } else {
                    groupedCart.set(item.productId, {
                        name: item.name,
                        totalQty: item.quantity,
                        costPrice: item.costPrice || 0,
                        items: [item],
                    });
                }
            }

            // Validate IMEIs
            for (const item of cart) {
                if (item.warrantyType === 'warrantyDevice') {
                    const validImeis = (item.imeis || []).map(i => i.trim()).filter(Boolean);
                    if (validImeis.length < item.quantity && deposit === 0) { // Nếu có deposit thì có thể là pending order, nhưng POS ta require luôn nếu không có cọc
                        toastError(`Vui lòng nhập đủ ${item.quantity} IMEI/Serial cho sản phẩm ${item.name}`);
                        setIsProcessing(false);
                        return;
                    }
                }
            }

            const operationKey = crypto.randomUUID();

            const repairItem = cart.find(c => c.isRepairTicket);
            const repairTicketId = repairItem ? repairItem.productId : undefined;

            const orderData = {
                idempotencyKey: operationKey,
                repairTicketId,
                customer_info: {
                    name: customerName.trim() || 'Khách lẻ',
                    phone: customerPhone.trim(),
                },
                items: cart.map(c => ({
                    productId: c.productId,
                    productName: c.name,
                    quantity: c.quantity,
                    price: c.sellingPrice,
                    isRepairTicket: c.isRepairTicket,
                    imeis: c.imeis
                })),
                total_amount: total,
                discount_amount: discount,
                subtotal_amount: subtotal,
                deposit_amount: deposit,
                payment_method: paymentMethod === 'cash' ? 'CASH' : paymentMethod === 'bank' ? 'BANK' : paymentMethod === 'installment' ? 'INSTALLMENT' : 'MOMO',
            };

            const auth = await getAuthInstance();
            const idToken = await auth.currentUser?.getIdToken();
            const res = await fetch('/api/pos/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(orderData)
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Lỗi khi thanh toán qua API');
            }

            setLastOrder({ id: data.orderId, ...orderData, createdAt: new Date() });
            setShowReceipt(true);

            // Reset cart
            setCart([]);
            setCustomerName('');
            setCustomerPhone('');
            setDiscount(0);
            setDeposit(0);
        } catch (err: unknown) {
            console.error(err);
            toastError(err instanceof Error ? err.message : 'Lỗi khi tạo đơn hàng!');
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Category label map ──
    const catLabel: Record<string, string> = {
        all: 'Tất cả', Phone: 'Điện thoại', Laptop: 'Laptop', Tablet: 'Tablet',
        Audio: 'Âm thanh', Watch: 'Đồng hồ', Accessory: 'Phụ kiện', [PART_CATEGORY]: PART_CATEGORY,
    };

    // Reload products after adding new one
    const reloadProducts = async () => {
        try {
            const snap = await getDocs(collection(db, 'products'));
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Product & { id: string }));
            setProducts(filterPosProducts(data));
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
                <button
                    onClick={() => setShowMobileCart(false)}
                    className="md:hidden p-1 text-gray-400 hover:text-gray-600"
                    aria-label="Đóng giỏ hàng"
                    title="Đóng giỏ hàng"
                >
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
                                        <Image src={product.images[0]} alt="" width={48} height={48} className="w-full h-full object-cover" />
                                    ) : (
                                        <Package className="text-gray-300" size={18} />
                                    )}
                                </div>
                                <p className="flex-1 text-sm font-medium text-gray-800 line-clamp-2">{item.name}</p>
                                <button
                                    onClick={() => removeFromCart(item.productId)}
                                    className="text-red-400 hover:text-red-600 p-0.5"
                                    aria-label="Xóa khỏi giỏ"
                                    title="Xóa khỏi giỏ"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 bg-white rounded-lg border">
                                    <button
                                        onClick={() => updateQuantity(item.productId, -1)}
                                        className="p-1 hover:bg-gray-100 rounded-l-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                        aria-label="Giảm số lượng"
                                        title="Giảm số lượng"
                                        disabled={item.isRepairTicket}
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <span className="px-2 text-sm font-bold min-w-[24px] text-center">{item.quantity}</span>
                                    <button
                                        onClick={() => updateQuantity(item.productId, 1)}
                                        className="p-1 hover:bg-gray-100 rounded-r-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                        aria-label="Tăng số lượng"
                                        title="Tăng số lượng"
                                        disabled={item.isRepairTicket}
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <div className="flex-1 relative">
                                    <Tag size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <CurrencyInput value={item.sellingPrice}
                                        onChange={v => updatePrice(item.productId, v)}
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
                                    {Array.from({ length: item.quantity }).map((_, idx) => (
                                        <div key={idx} className="relative">
                                            <input
                                                type="text"
                                                placeholder={`Nhập IMEI/Serial #${idx + 1}`}
                                                value={item.imeis?.[idx] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setCart(prev => prev.map(c => {
                                                        if (c.productId !== item.productId) return c;
                                                        const newImeis = [...(c.imeis || [])];
                                                        newImeis[idx] = val;
                                                        return { ...c, imeis: newImeis };
                                                    }));
                                                }}
                                                className="w-full text-xs py-1.5 pl-2 pr-8 border rounded focus:ring-1 focus:ring-orange-500/20 uppercase"
                                            />
                                            {(item.imeis?.[idx]?.length || 0) < 5 && (
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
                            onBlur={() => lookupRepairByPhone(customerPhone)}
                            className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-orange-500/20" />
                    </div>
                </div>
                {/* Repair ticket link */}
                {repairLoading && <p className="text-xs text-gray-400 animate-pulse">Đang tra cứu phiếu sửa...</p>}
                {linkedRepair && (
                    <div className="bg-blue-50 rounded-lg p-2.5 text-xs space-y-1 border border-blue-100">
                        <div className="flex items-center gap-1.5 font-semibold text-blue-700">
                            <Wrench size={13} /> Phiếu sửa #{linkedRepair.id.slice(-6)}
                        </div>
                        <p className="text-blue-600">Máy: {linkedRepair.deviceModel} — {linkedRepair.status}</p>
                        {linkedRepair.parts.length > 0 && (
                            <p className="text-blue-500">LK: {linkedRepair.parts.map(p => p.productName).join(', ')}</p>
                        )}

                        {linkedRepair.paymentAmount > 0 && (
                            <div className="mt-2 pt-2 border-t border-blue-200 flex items-center justify-between">
                                <span className="font-semibold text-blue-800">
                                    Chi phí sửa chữa: {formatPrice(linkedRepair.paymentAmount)}
                                </span>
                                {(linkedRepair.paymentStatus === 'paid' || linkedRepair.paymentStatus === 'refunded') ? (
                                    <span className="text-green-600 font-bold bg-green-100 px-2 py-1 rounded-md">
                                        Đã thanh toán
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={addRepairToCart}
                                        className="py-1 px-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                                    >
                                        Thêm vào HĐ
                                    </button>
                                )}
                            </div>
                        )}

                        {discountDetails.length > 0 && (
                            <div className="mt-1 pt-1 border-t border-blue-200">
                                <p className="font-semibold text-green-700">🎁 Giảm PK tự động:</p>
                                {discountDetails.map((d, i) => (
                                    <p key={i} className="text-green-600">
                                        {d.productName}: -{d.discountAmount.toLocaleString('vi-VN')}đ ({d.ruleName})
                                    </p>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setDiscount(prev => prev + autoDiscountAmount)}
                                    className="mt-1 w-full py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors"
                                >
                                    Áp dụng giảm {autoDiscountAmount.toLocaleString('vi-VN')}đ
                                </button>
                            </div>
                        )}
                    </div>
                )}
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
                    <CurrencyInput value={discount || ''} onChange={v => setDiscount(v)}
                        placeholder="0" className="flex-1 px-3 py-1.5 border rounded-lg text-right text-sm" />
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Khách cọc:</span>
                    <CurrencyInput value={deposit || ''} onChange={v => setDeposit(v)}
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
                    {deposit > 0 && (
                        <div className="flex justify-between text-blue-600 pt-1">
                            <span>Đã cọc</span>
                            <span>{formatPrice(deposit)}</span>
                        </div>
                    )}
                    {deposit > 0 && (
                        <div className="flex justify-between font-bold text-red-600 pt-1">
                            <span>CÒN LẠI</span>
                            <span>{formatPrice(Math.max(0, total - deposit))}</span>
                        </div>
                    )}
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
                    <button
                        onClick={() => setShowScanner(true)}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-black shadow-sm font-semibold text-sm whitespace-nowrap transition-all"
                    >
                        <Camera size={16} />
                        Quét mã
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
                            const available = (product.stock || 0) - (product.held || 0);
                            const outOfStock = available <= 0;
                            return (
                                <button
                                    key={product.id}
                                    onClick={() => !outOfStock && addToCart(product)}
                                    disabled={outOfStock}
                                    className={`bg-white rounded-xl border border-gray-100 p-3 text-left transition-all group relative ${outOfStock
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
                                        {((product as unknown as { imageUrl?: string }).imageUrl || product.images?.[0]) ? (
                                            <Image src={((product as unknown as { imageUrl?: string }).imageUrl || product.images?.[0]) as string} alt={product.name} width={200} height={200} className={`w-full h-full object-cover ${!outOfStock ? 'group-hover:scale-105' : ''} transition-transform`} />
                                        ) : (
                                            <Package className="text-gray-300" size={32} />
                                        )}
                                    </div>
                                    <p className="text-xs font-semibold text-gray-800 line-clamp-2 mb-1">{product.name}</p>
                                    <p className="text-[10px] font-mono text-gray-400 mb-1">{getPrimaryProductCode(product)}</p>
                                    <p className="text-sm font-bold text-orange-600">{formatPrice(product.price_promo || product.price_original)}</p>
                                    <p className={`text-[10px] mt-0.5 font-medium ${outOfStock ? 'text-red-500' : available <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                                        Tồn kho: {product.stock || 0}{(product.held || 0) > 0 ? ` (Đang giữ: ${product.held})` : ''}
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

            {/* ═══ QR / barcode scanner modal ═══ */}
            <Modal
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                title="Quét QR hoặc barcode sản phẩm"
                size="lg"
            >
                <div className="p-5 space-y-4">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-950">
                        <video ref={scannerVideoRef} className="h-full w-full object-cover" muted playsInline />
                        <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
                        <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-black/70 px-3 py-2 text-center text-sm font-medium text-white">
                            {scannerError || scanStatus}
                        </div>
                    </div>

                    {scannerError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {scannerError}
                        </div>
                    )}

                    <form
                        className="flex flex-col gap-2 sm:flex-row"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (handleProductScan(manualScanCode, 'manual')) setManualScanCode('');
                        }}
                    >
                        <div className="relative flex-1">
                            <Keyboard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                value={manualScanCode}
                                onChange={(e) => setManualScanCode(e.target.value)}
                                className="h-11 w-full rounded-lg border pl-9 pr-3 font-mono text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                placeholder="Nhập mã nếu camera không hỗ trợ"
                            />
                        </div>
                        <button
                            type="submit"
                            className="h-11 rounded-lg bg-orange-500 px-5 text-sm font-bold text-white hover:bg-orange-600"
                        >
                            Thêm vào giỏ
                        </button>
                    </form>
                </div>
            </Modal>

            {/* ═══ Receipt Modal (80mm thermal) ═══ */}
            {lastOrder && (
                <Modal
                    isOpen={showReceipt}
                    onClose={() => setShowReceipt(false)}
                >
                    <div className="flex flex-col max-h-[80vh]">
                        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
                            <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle2 size={20} />
                                <span className="font-bold">Thanh toán thành công!</span>
                            </div>
                            <button
                                onClick={() => setShowReceipt(false)}
                                className="text-gray-400 hover:text-gray-600"
                                aria-label="Đóng hóa đơn"
                                title="Đóng"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Format selector */}
                        <div className="px-6 pt-4 flex-shrink-0">
                            <div className="flex bg-gray-100 p-1 rounded-lg mb-2">
                                <button
                                    onClick={() => setPrintTemplate('thermal')}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${printTemplate === 'thermal' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >Mẫu Nhiệt 80mm</button>
                                <button
                                    onClick={() => setPrintTemplate('a5')}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${printTemplate === 'a5' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >Mẫu A4/A5</button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {printTemplate === 'thermal' ? (
                                <div id="pos-receipt-thermal" className="px-6 py-4 text-xs space-y-3" style={{ maxWidth: '302px', margin: '0 auto' }}>
                                    <div className="text-center">
                                        <h3 className="font-bold text-sm uppercase">{config.siteName || 'Văn Lành Service'}</h3>
                                        <p className="text-gray-500 text-[10px]">Hotline: {config.contact_info?.main_phone || '0932.242.026'}</p>
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
                                            {lastOrder.items.map((item: OrderLineItem, i: number) => (
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
                                        <div className="flex justify-between text-gray-600"><span>Tổng tiền hàng</span><span>{formatPrice(lastOrder.subtotal_amount)}</span></div>
                                        {lastOrder.discount_amount > 0 && (
                                            <div className="flex justify-between"><span>Giảm giá</span><span>-{formatPrice(lastOrder.discount_amount)}</span></div>
                                        )}
                                        <div className="flex justify-between font-bold text-sm border-t pt-1">
                                            <span>TỔNG CỘNG</span>
                                            <span>{formatPrice(lastOrder.total_amount)}</span>
                                        </div>
                                        {lastOrder.deposit_amount > 0 && (
                                            <>
                                                <div className="flex justify-between text-blue-600 mt-1"><span>Khách đã cọc</span><span>{formatPrice(lastOrder.deposit_amount)}</span></div>
                                                <div className="flex justify-between font-bold text-red-600"><span>CÒN LẠI</span><span>{formatPrice(Math.max(0, lastOrder.total_amount - lastOrder.deposit_amount))}</span></div>
                                            </>
                                        )}
                                        <div className="flex justify-between text-gray-500 pt-1">
                                            <span>HTTT</span>
                                            <span>{lastOrder.payment_method === 'COD' ? 'Tiền mặt' : lastOrder.payment_method === 'Installment' ? 'Trả góp' : 'Chuyển khoản/MoMo'}</span>
                                        </div>
                                    </div>
                                    <hr className="border-dashed" />
                                    <p className="text-center text-gray-400 text-[10px]">Cảm ơn quý khách! Hẹn gặp lại.</p>
                                </div>
                            ) : (
                                <div className="px-6 py-4 flex flex-col items-center opacity-70">
                                    <div className="w-[150px] aspect-[1/1.414] bg-white border shadow-sm rounded flex flex-col p-2 text-[4px] leading-tight text-center relative overflow-hidden pointer-events-none">
                                        <b className="mb-1 uppercase">{config.siteName || 'VĂN LÀNH SERVICE'}</b>
                                        <p>HÓA ĐƠN BÁN HÀNG</p>
                                        <div className="border-t my-1"></div>
                                        <div className="text-left"><p>KH: {lastOrder.customer_info.name}</p></div>
                                        <div className="bg-gray-100 flex-1 my-1 rounded"></div>
                                        <div className="text-right font-bold text-orange-500">TỔNG: {formatPrice(lastOrder.total_amount)}</div>
                                    </div>
                                    <p className="text-center text-xs text-gray-500 mt-3">Sẽ mở cửa sổ in khổ A5 chi tiết khi bấm nút in.</p>
                                </div>
                            )}
                        </div>

                        <div className="px-4 py-4 flex gap-2 border-t mt-auto flex-shrink-0">
                            <button onClick={() => setShowReceipt(false)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                                Đóng
                            </button>
                            <button onClick={() => {
                                if (printTemplate === 'thermal') {
                                    const printContent = document.getElementById('pos-receipt-thermal')?.innerHTML;
                                    if (printContent) {
                                        const w = window.open('', '_blank', 'width=320,height=600');
                                        w?.document.write(`<html><head><title>Hóa đơn POS</title>
                                            <style>body{font-family:monospace;font-size:11px;padding:8px;max-width:302px;margin:0 auto}
                                            table{width:100%;border-collapse:collapse}th,td{padding:2px 0}hr{border:none;border-top:1px dashed #ccc}
                                            .font-bold,b{font-weight:bold}.text-center{text-align:center}.text-right{text-align:right}
                                            </style></head><body>${printContent}</body></html>`);
                                        w?.document.close();
                                        setTimeout(() => w?.print(), 300);
                                    }
                                } else {
                                    const receiptHtml = `
                                        <html>
                                        <head>
                                            <title>Hóa đơn bán hàng #${lastOrder.id.slice(-6).toUpperCase()}</title>
                                            <style>
                                                body { font-family: 'Times New Roman', serif; font-size: 14px; line-height: 1.4; padding: 20px; color: #000; }
                                                .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                                                .store-info h2 { margin: 0 0 5px 0; font-size: 18px; text-transform: uppercase; }
                                                .store-info p { margin: 2px 0; }
                                                .title { text-align: center; margin: 20px 0; }
                                                .title h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
                                                .info-row { display: flex; margin-bottom: 5px; }
                                                .info-row .label { width: 120px; font-weight: bold; }
                                                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                                                table, th, td { border: 1px solid #000; }
                                                th, td { padding: 8px; text-align: left; }
                                                th { text-align: center; font-weight: bold; }
                                                .text-right { text-align: right; }
                                                .text-center { text-align: center; }
                                                .summary { width: 300px; margin-left: auto; }
                                                .summary-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
                                                .summary-row.bold { font-weight: bold; }
                                                .signatures { display: flex; justify-content: space-around; margin-top: 50px; text-align: center; }
                                                .signatures p.title { margin: 0 0 70px 0; font-weight: bold; }
                                                @media print {
                                                    @page { size: A5; margin: 15mm; }
                                                    body { width: 100%; margin: 0; padding: 0; }
                                                }
                                            </style>
                                        </head>
                                        <body>
                                            <div class="header">
                                                <div class="store-info">
                                                    <h2>${config.siteName || 'VĂN LÀNH SERVICE'}</h2>
                                                    <p><b>Địa chỉ:</b> ${config.contact_info?.address || 'An Phú Đông, Q12, TPHCM'}</p>
                                                    <p><b>Điện thoại:</b> ${config.contact_info?.main_phone || '0932.242.026'}</p>
                                                </div>
                                                <div style="text-align: right;">
                                                    <p><b>Số:</b> #${lastOrder.id.slice(-6).toUpperCase()}</p>
                                                    <p><b>Ngày:</b> ${new Date().toLocaleDateString('vi-VN')}</p>
                                                    <p><b>Nhân viên:</b> ${lastOrder.createdByName || 'Admin'}</p>
                                                </div>
                                            </div>

                                            <div class="title">
                                                <h1>HÓA ĐƠN BÁN HÀNG</h1>
                                            </div>

                                            <div>
                                                <div class="info-row"><div class="label">Khách hàng:</div><div><b>${lastOrder.customer_info.name}</b></div></div>
                                                <div class="info-row"><div class="label">Điện thoại:</div><div>${lastOrder.customer_info.phone || ''}</div></div>
                                                <div class="info-row"><div class="label">Địa chỉ:</div><div>${lastOrder.customer_info.address || ''}</div></div>
                                            </div>

                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th style="width: 40px;">STT</th>
                                                        <th>Tên Hàng Hóa / Dịch Vụ</th>
                                                        <th style="width: 60px;">SL</th>
                                                        <th style="width: 100px;">Đơn Giá</th>
                                                        <th style="width: 120px;">Thành Tiền</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${lastOrder.items.map((item: OrderLineItem, i: number) => `
                                                    <tr>
                                                        <td class="text-center">${i + 1}</td>
                                                        <td>${item.product_name}</td>
                                                        <td class="text-center">${item.quantity}</td>
                                                        <td class="text-right">${item.price.toLocaleString('vi-VN')}</td>
                                                        <td class="text-right">${(item.price * item.quantity).toLocaleString('vi-VN')}</td>
                                                    </tr>
                                                    `).join('')}
                                                </tbody>
                                            </table>

                                            <div class="summary">
                                                <div class="summary-row"><span>Tổng tiền hàng:</span><span>${lastOrder.subtotal_amount.toLocaleString('vi-VN')} đ</span></div>
                                                ${lastOrder.discount_amount > 0 ? `<div class="summary-row"><span>Chiết khấu:</span><span>- ${lastOrder.discount_amount.toLocaleString('vi-VN')} đ</span></div>` : ''}
                                                <div class="summary-row bold" style="font-size: 16px; margin-top: 5px; border-top: 1px dotted #ccc; padding-top: 5px;">
                                                    <span>Tổng thanh toán:</span><span>${lastOrder.total_amount.toLocaleString('vi-VN')} đ</span>
                                                </div>
                                                ${lastOrder.deposit_amount > 0 ? `<div class="summary-row" style="margin-top: 5px;"><span>Đã thanh toán (cọc):</span><span>${lastOrder.deposit_amount.toLocaleString('vi-VN')} đ</span></div>
                                                <div class="summary-row bold" style="color: red; font-size: 16px;"><span>CÒN LẠI:</span><span>${Math.max(0, lastOrder.total_amount - lastOrder.deposit_amount).toLocaleString('vi-VN')} đ</span></div>` : ''}
                                            </div>

                                            <p style="text-align: right; font-style: italic; margin-top: 10px;">Hành thức TT: ${lastOrder.payment_method === 'COD' ? 'Tiền mặt' : lastOrder.payment_method === 'Installment' ? 'Trả góp' : 'Chuyển khoản / Momo'}</p>

                                            <div class="signatures">
                                                <div>
                                                    <p class="title">Khách hàng</p>
                                                    <p style="color: #666; font-style: italic;">(Ký, ghi rõ họ tên)</p>
                                                </div>
                                                <div>
                                                    <p class="title">Người lập phiếu</p>
                                                    <p style="color: #666; font-style: italic;">(Ký, ghi rõ họ tên)</p>
                                                </div>
                                            </div>
                                        </body>
                                        </html>
                                    `;
                                    const w = window.open('', '_blank');
                                    w?.document.write(receiptHtml);
                                    w?.document.close();
                                    w?.focus();
                                    setTimeout(() => w?.print(), 500);
                                }
                            }}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-orange-500 text-white hover:bg-orange-600 flex items-center justify-center gap-1.5 shadow-lg shadow-orange-200 transition-all">
                                <Receipt size={16} /> In hóa đơn ({printTemplate === 'a5' ? 'A5' : '80mm'})
                            </button>
                        </div>
                    </div>
                </Modal>
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
                            {lastOrder.items.map((item: OrderLineItem, i: number) => (
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
            <UniversalProductModal
                isOpen={showProductModal}
                onClose={() => setShowProductModal(false)}
                mode="retail"
                onCreated={reloadProducts}
                submitLabel="Tạo & Đưa vào POS"
            />
        </div>
    );
}

