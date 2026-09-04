'use client';


import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Search, ShoppingCart, Plus, Receipt, X,
    Package, Loader2, CheckCircle2,
    AlertTriangle, Camera, Keyboard, Banknote
} from 'lucide-react';
import { collection, doc, limit, query, where, orderBy as fbOrderBy } from 'firebase/firestore';
import { getDoc, getDocs } from '@/lib/firestoreLogger';
import { appConfirm } from '@/lib/appDialog';

import { useConfig } from '@/lib/ConfigContext';
import Modal from '@/components/admin/Modal';
import Image from 'next/image';
import { db, getAuthInstance } from '@/lib/firebase';
import type { Product } from '@/lib/types';
import type { ContactMethod, ContactMethodType } from '@/lib/types/contact';

import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { PART_CATEGORY, PART_CATEGORY_VALUES, isPartCategory } from '@/lib/constants';
import { fetchActiveDiscountRules, calculateAccessoryDiscounts } from '@/lib/discountRuleUtils';
import { consumeChatWorkflowHandoff } from '@/lib/chatWorkflowHandoff';
import { extractProductCodeFromScan, getPrimaryProductCode, getProductScanCandidates, productCodeSearchText } from '@/lib/productCodes';
import { requiresImeiForPosRetailProduct, resolveProductWarranty } from '@/lib/posCheckoutRules';
import { normalizeVietnamPhone } from '@/lib/phone';
import { resolvePosZaloContactIdentity, type PosCustomerIdentityMode, type PosCustomerSearchMatch } from '@/lib/posCustomerIdentity';
import { PRODUCT_STATUS, isProductSellable } from '@/lib/productLifecycle';
import { generateSearchKeywords } from '@/lib/utils';
import { PosCartPanel, PosCartItemsSection, PosPaymentSection } from '@/features/pos/PosCartPanel';
import { PosCustomerWorkspace } from '@/features/pos/PosCustomerWorkspace';
import { calculatePosDiscountBreakdown } from '@/features/pos/posDiscountTotals';
import { getRepairTicketIdsInCart, removeCartItem, removeRepairTicketFromCart } from '@/features/pos/posCartRules';
import { getRepairIssueLaborCost } from '@/lib/repairIssuePricing';
import { isRepairReadyForPosPayment } from '@/features/pos/posRepairPaymentEligibility';
import type { PosPaymentMode } from '@/features/pos/PosPaymentComposer';
import type { AppliedVoucher, CartItem, DiscountDetail, LastOrderData, OrderLineItem, PayableOrderInfo, RepairShippingDraft, RepairTicketInfo, VoucherStatus } from '@/features/pos/posTypes';
import CurrencyInput from '@/components/admin/CurrencyInput';
import { buildPosPaymentBreakdown, createPosPaymentReference } from '@/lib/posPaymentBreakdown';
import {
    filterAvailableCategoryRecommendations,
    getLinkedProductCategoryIds,
    getRepairServiceIds,
    type ServiceBusinessLink,
} from '@/lib/serviceRecommendations';

type BarcodeDetectionResult = { rawValue?: string };
type BrowserBarcodeDetector = {
    detect(source: HTMLVideoElement): Promise<BarcodeDetectionResult[]>;
};
type BrowserBarcodeDetectorConstructor = {
    new(options?: { formats?: string[] }): BrowserBarcodeDetector;
    getSupportedFormats?: () => Promise<string[]>;
};
const CAMERA_BARCODE_FORMATS = ['qr_code', 'code_128'];
const POS_DEFAULT_RETAIL_LIMIT = 80;
const POS_DEFAULT_COMPONENT_LIMIT = 40;
const POS_SEARCH_PRODUCT_LIMIT = 60;
const POS_LEGACY_SCAN_FALLBACK_LIMIT = 500;
type PosProduct = Product & { id: string };
type PosTab = 'sales' | 'cashier';

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mapRepairTicketInfo(id: string, data: Record<string, unknown>, fallbackPhone = ''): RepairTicketInfo {
    const customer = (data.customer || {}) as Record<string, unknown>;
    const deviceInfo = (data.deviceInfo || {}) as Record<string, unknown>;
    const payment = (data.payment || {}) as Record<string, unknown>;

    return {
        id,
        customerId: String(customer.id || customer.customerId || ''),
        customerName: String(customer.name || data.customerName || ''),
        customerPhone: String(customer.phone || data.customerPhone || fallbackPhone),
        customerAddress: String(customer.address || ''),
        primaryContactValue: String(customer.primaryContactValue || ''),
        deviceModel: String(deviceInfo.model || data.deviceModel || ''),
        status: String(data.status || ''),
        serviceName: typeof data.serviceName === 'string' ? data.serviceName : '',
        categoryPath: toStringArray(data.categoryPath),
        parts: Array.isArray(data.parts) ? data.parts.map((part) => {
            const item = (part || {}) as Record<string, unknown>;
            return {
                productName: String(item.productName || item.name || item.partName || ''),
                partType: String(item.partType || ''),
                issueId: typeof item.issueId === 'string' ? item.issueId : '',
                unitPriceAtUse: Number(item.unitPriceAtUse || 0),
                status: String(item.status || ''),
                quantity: Number(item.quantity || 1),
            };
        }) : [],
        gifts: toStringArray(data.gifts),
        paymentAmount: Number(payment.amount || 0),
        paymentLaborCost: Number(payment.laborCost || 0),
        paymentStatus: String(payment.status || 'unpaid'),
        paymentOutstandingOrderId: String(payment.outstandingOrderId || ''),
        issues: Array.isArray(data.issues) ? data.issues.map((issue) => {
            const item = (issue || {}) as Record<string, unknown>;
            return {
                id: typeof item.id === 'string' ? item.id : '',
                label: typeof item.label === 'string' ? item.label : '',
                estimatedPrice: Number(item.estimatedPrice || 0),
                status: item.status === 'resolved' || item.status === 'unresolved' ? item.status : 'pending',
                billingMode: item.billingMode === 'parts_only' || item.billingMode === 'parts_and_service' || item.billingMode === 'free' || item.billingMode === 'service_only'
                    ? item.billingMode
                    : undefined,
                categoryPath: toStringArray(item.categoryPath),
                serviceName: typeof item.serviceName === 'string' ? item.serviceName : '',
                serviceId: typeof item.serviceId === 'string' ? item.serviceId : '',
            };
        }) : [],
    };
}

function firstContactValue(methods: ContactMethod[] | undefined, type: ContactMethodType) {
    return methods?.find(method => method.type === type)?.value || '';
}

function formatPaymentMethodLabel(paymentMethod: string, paymentBreakdown?: { method: string }[]) {
    const methods = Array.from(new Set((paymentBreakdown || []).map(entry => entry.method)));
    if (methods.length > 0) {
        const labels = methods.map(method => method === 'CASH'
            ? 'Tiền mặt'
            : method === 'BANK' || method === 'QR' || method === 'CARD'
                ? 'Chuyển khoản'
                : method === 'MOMO'
                    ? 'MoMo'
                    : method === 'INSTALLMENT'
                        ? 'Trả góp'
                        : method);
        return labels.join(' + ');
    }
    if (paymentMethod === 'CASH') return 'Tiền mặt';
    if (paymentMethod === 'INSTALLMENT') return 'Trả góp';
    if (paymentMethod === 'DEBT') return 'Ghi nợ';
    if (paymentMethod === 'MIXED') return 'Thanh toán nhiều kênh';
    return 'Chuyển khoản/MoMo';
}

function normalizeCustomerLookup(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

function mapCustomerSearchMatch(id: string, data: Record<string, unknown>): PosCustomerSearchMatch {
    const contactMethods = Array.isArray(data.contactMethods) ? data.contactMethods as ContactMethod[] : [];
    const primaryContact = contactMethods.find(method => method.isPrimary) || contactMethods[0];
    const phone = String(data.phone || data.primaryPhone || '');
    return {
        id,
        name: String(data.name || ''),
        phone,
        primaryContactLabel: primaryContact?.value || String(data.primaryContactValue || phone || ''),
        totalDebt: Number(data.totalDebt || 0),
    };
}

function isContactMethodType(value: string | null | undefined): value is ContactMethodType {
    return value === 'phone' || value === 'zalo' || value === 'facebook' || value === 'email' || value === 'address' || value === 'note' || value === 'other';
}

function formatLookupDate(value: unknown) {
    if (!value) return '';
    const timestamp = value as { toDate?: () => Date };
    const date = timestamp.toDate ? timestamp.toDate() : new Date(value as string | number);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('vi-VN');
}

function getOrderLineDisplayName(item: Partial<OrderLineItem> & { name?: string }) {
    return String(item.productName || item.product_name || item.name || item.productId || 'Sản phẩm').trim();
}

function escapeReceiptHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function mapPayableOrderInfo(id: string, data: Record<string, unknown>): PayableOrderInfo | null {
    const customer = (data.customer_info || data.customer || {}) as Record<string, unknown>;
    const totalAmount = Number(data.total_amount || 0);
    const paymentHistory = Array.isArray(data.paymentHistory) ? data.paymentHistory : [];
    const paidFromHistory = paymentHistory.reduce((sum, entry) => {
        const line = (entry || {}) as Record<string, unknown>;
        return sum + (Number(line.amount) || 0);
    }, 0);
    const paidAmount = Math.max(Number(data.deposit_amount || 0), paidFromHistory);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);
    const status = String(data.status || '');
    const paymentMethod = String(data.payment_method || '');
    const paymentStatus = String(data.paymentStatus || '');
    const normalizedPaymentStatus = paymentStatus.toLowerCase();
    const normalizedPaymentMethod = paymentMethod.toLowerCase();
    const isDebtLike = normalizedPaymentStatus === 'debt'
        || normalizedPaymentStatus === 'unpaid'
        || normalizedPaymentMethod === 'debt'
        || normalizedPaymentMethod === 'ghi nợ';
    const isActionable = status !== 'Cancelled' && normalizedPaymentStatus !== 'paid' && (remainingAmount > 0 || isDebtLike);

    if (!isActionable) return null;

    const items = Array.isArray(data.items) ? data.items : [];
    return {
        id,
        customerName: String(customer.name || data.customerName || ''),
        customerPhone: String(customer.phone || data.customerPhone || ''),
        status,
        paymentMethod,
        paymentStatus,
        totalAmount,
        paidAmount,
        remainingAmount: remainingAmount || totalAmount,
        createdAtLabel: formatLookupDate(data.createdAt),
        itemNames: items.slice(0, 4).map(item => getOrderLineDisplayName((item || {}) as Partial<OrderLineItem> & { name?: string })).filter(Boolean),
        isShippingAdvance: data.isShippingAdvance === true,
        shippingAdvanceRepairTicketId: String(data.shippingAdvanceRepairTicketId || ''),
    };
}

declare global {
    interface Window {
        BarcodeDetector?: BrowserBarcodeDetectorConstructor;
    }
}


interface BankAccountConfig {
    id?: string;
    bankId: string;
    accountNo: string;
    accountName: string;
    isDefault?: boolean;
}

interface BankConfig {
    accounts?: BankAccountConfig[];
    bankId?: string;
    accountNo?: string;
    accountName?: string;
}

interface CashierShiftView {
    id: string;
    status: 'open' | 'closed' | string;
    openingCashAmount: number;
    openingBankAmount: number;
    cashSalesAmount: number;
    bankSalesAmount: number;
    otherSalesAmount?: number;
    cashExpenseAmount?: number;
    cashInventoryExpenseAmount?: number;
    cashShippingExpenseAmount?: number;
    cashShippingExpenseTodayAmount?: number;
    bankExpenseAmount?: number;
    otherExpenseAmount?: number;
    expectedCashAmount: number;
    expectedBankAmount: number;
    closingCashAmount?: number;
    closingBankAmount?: number;
    openedByName?: string;
    openedAt?: string | null;
    closedByName?: string;
    closedAt?: string | null;
}

const UniversalProductModal = dynamic(() => import('@/components/admin/UniversalProductModal'), { ssr: false });

export default function POSPage() {
    const { config } = useConfig();
    const searchParams = useSearchParams();
    const retailCategoryRootIds = useMemo(
        () => (config?.taxonomy?.retail || []).map(node => node.id).filter(Boolean),
        [config?.taxonomy?.retail],
    );

    const resolveWarranty = useCallback((product: Product) => {
        return resolveProductWarranty(product, config?.taxonomy?.retail || [])?.warrantyType || 'none';
    }, [config?.taxonomy?.retail]);

    // Products
    const [products, setProducts] = useState<PosProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');

    // Cart
    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerId, setCustomerId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [customerZalo, setCustomerZalo] = useState('');
    const [customerFacebook, setCustomerFacebook] = useState('');
    const [customerOtherContact, setCustomerOtherContact] = useState('');
    const [customerPrimaryContactType, setCustomerPrimaryContactType] = useState<ContactMethodType>('phone');
    const [customerIdentityMode, setCustomerIdentityMode] = useState<PosCustomerIdentityMode>('guest');
    const [customerMatches, setCustomerMatches] = useState<PosCustomerSearchMatch[]>([]);
    const [phoneVerificationToken, setPhoneVerificationToken] = useState('');
    const [verifiedPhone, setVerifiedPhone] = useState('');
    const [customerDebt, setCustomerDebt] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState<PosPaymentMode>('cash');
    const [discount, setDiscount] = useState(0);
    const [cashTendered, setCashTendered] = useState(0);
    const [bankTransferAmount, setBankTransferAmount] = useState(0);
    const [bankTransferConfirmed, setBankTransferConfirmed] = useState(false);
    const [debtRequested, setDebtRequested] = useState(false);
    const [bankTransferReference, setBankTransferReference] = useState(() => createPosPaymentReference(crypto.randomUUID()));
    const [repairShipping, setRepairShipping] = useState<RepairShippingDraft | null>(null);
    const [useSurplusToPayDebt, setUseSurplusToPayDebt] = useState(false);
    const [voucherCode, setVoucherCode] = useState('');
    const [voucherStatus, setVoucherStatus] = useState<VoucherStatus | null>(null);
    const [appliedVoucher, setAppliedVoucher] = useState<AppliedVoucher | null>(null);
    const chatPrefillApplied = useRef(false);

    // Checkout
    const [isProcessing, setIsProcessing] = useState(false);
    const [showReceipt, setShowReceipt] = useState(false);
    const [printTemplate, setPrintTemplate] = useState<'thermal' | 'a5'>('a5');
    const [lastOrder, setLastOrder] = useState<LastOrderData | null>(null);
    const [showProductModal, setShowProductModal] = useState(false);
    const [bankConfig, setBankConfig] = useState<BankConfig | null>(null);
    const bankConfigRequestRef = useRef<Promise<void> | null>(null);
    const [posTab, setPosTab] = useState<PosTab>('sales');
    const [cashierShift, setCashierShift] = useState<CashierShiftView | null>(null);
    const [cashierShiftHistory, setCashierShiftHistory] = useState<CashierShiftView[]>([]);
    const [cashierLoading, setCashierLoading] = useState(true);
    const [cashierSaving, setCashierSaving] = useState(false);
    const [openingCashAmount, setOpeningCashAmount] = useState(0);
    const [openingBankAmount, setOpeningBankAmount] = useState(0);

    const loadBankConfig = useCallback(async () => {
        if (bankConfig) return;
        if (bankConfigRequestRef.current) return bankConfigRequestRef.current;

        const request = (async () => {
            try {
                const auth = await getAuthInstance();
                const idToken = await auth.currentUser?.getIdToken();
                if (!idToken) return;

                const res = await fetch('/api/pos/payment-config', {
                    headers: { Authorization: `Bearer ${idToken}` },
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Không thể tải cấu hình thanh toán');
                if (data.success && data.config) {
                    setBankConfig(data.config);
                }
            } catch (err) {
                console.error('Lỗi tải cấu hình ngân hàng:', err);
            }
        })().finally(() => {
            bankConfigRequestRef.current = null;
        });

        bankConfigRequestRef.current = request;
        return request;
    }, [bankConfig]);

    useEffect(() => {
        const needsBankConfig = paymentMethod === 'bank'
            || bankTransferAmount > 0
            || (showReceipt && lastOrder?.payment_method === 'BANK');
        if (needsBankConfig) void loadBankConfig();
    }, [bankTransferAmount, lastOrder?.payment_method, loadBankConfig, paymentMethod, showReceipt]);

    const loadCashierShift = useCallback(async (includeHistory = false) => {
        setCashierLoading(true);
        try {
            const auth = await getAuthInstance();
            const idToken = await auth.currentUser?.getIdToken();
            if (!idToken) {
                setCashierShift(null);
                return;
            }
            const res = await fetch(`/api/pos/cashier-shift${includeHistory ? '?includeHistory=true' : ''}`, {
                headers: { Authorization: `Bearer ${idToken}` },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể tải ca thu ngân');
            setCashierShift(data.shift || null);
            if (includeHistory) {
                setCashierShiftHistory(Array.isArray(data.history) ? data.history : []);
            }
        } catch (err) {
            console.error(err);
            toastError(err instanceof Error ? err.message : 'Không thể tải ca thu ngân');
        } finally {
            setCashierLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadCashierShift();
    }, [loadCashierShift]);

    useEffect(() => {
        if (posTab === 'cashier') void loadCashierShift(true);
    }, [loadCashierShift, posTab]);

    const handleOpenCashierShift = async () => {
        if (cashierSaving) return;
        setCashierSaving(true);
        try {
            const auth = await getAuthInstance();
            const idToken = await auth.currentUser?.getIdToken();
            const res = await fetch('/api/pos/cashier-shift', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ openingCashAmount, openingBankAmount }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể mở ca thu ngân');
            setCashierShift(data.shift);
            setOpeningCashAmount(0);
            setOpeningBankAmount(0);
            toastSuccess('Đã mở ca thu ngân.');
        } catch (err) {
            console.error(err);
            toastError(err instanceof Error ? err.message : 'Không thể mở ca thu ngân');
        } finally {
            setCashierSaving(false);
        }
    };

    const handleCloseCashierShift = async () => {
        if (cashierSaving || !cashierShift) return;
        if (!await appConfirm('Chốt ca thu ngân hiện tại? Sau khi chốt, POS sẽ cần mở ca mới để tiếp tục thu tiền mặt/chuyển khoản.', { title: 'Chốt ca thu ngân', confirmText: 'Chốt ca', destructive: true })) return;
        setCashierSaving(true);
        try {
            const auth = await getAuthInstance();
            const idToken = await auth.currentUser?.getIdToken();
            const res = await fetch('/api/pos/cashier-shift', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ action: 'close' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Không thể chốt ca thu ngân');
            setCashierShift(null);
            if (data.shift) {
                setCashierShiftHistory(prev => [
                    data.shift,
                    ...prev.filter(shift => shift.id !== data.shift.id),
                ].slice(0, 10));
            }
            toastSuccess('Đã chốt ca thu ngân.');
        } catch (err) {
            console.error(err);
            toastError(err instanceof Error ? err.message : 'Không thể chốt ca thu ngân');
        } finally {
            setCashierSaving(false);
        }
    };

    const [linkedRepairs, setLinkedRepairs] = useState<RepairTicketInfo[]>([]);
    const [payableOrders, setPayableOrders] = useState<PayableOrderInfo[]>([]);
    const [repairLoading, setRepairLoading] = useState(false);
    const [autoDiscountAmount, setAutoDiscountAmount] = useState(0);
    const [discountDetails, setDiscountDetails] = useState<DiscountDetail[]>([]);
    const [autoDiscountApplied, setAutoDiscountApplied] = useState(false);
    const [serviceAccessorySuggestions, setServiceAccessorySuggestions] = useState<PosProduct[]>([]);
    const [isLoadingServiceAccessories, setIsLoadingServiceAccessories] = useState(false);
    const repairDiscountContextKey = useMemo(
        () => linkedRepairs.map(repair => repair.id).sort().join('|'),
        [linkedRepairs],
    );

    useEffect(() => {
        setAutoDiscountApplied(false);
    }, [repairDiscountContextKey]);

    const linkedRepairServiceKey = useMemo(() => {
        const repairIdsInCart = getRepairTicketIdsInCart(cart);
        return linkedRepairs
            .filter(repair => repairIdsInCart.has(repair.id))
            .flatMap(repair => getRepairServiceIds(repair))
            .sort()
            .join('|');
    }, [cart, linkedRepairs]);

    useEffect(() => {
        let disposed = false;
        const repairIdsInCart = getRepairTicketIdsInCart(cart);
        const serviceIds = Array.from(new Set(linkedRepairs
            .filter(repair => repairIdsInCart.has(repair.id))
            .flatMap(repair => getRepairServiceIds(repair))));
        if (serviceIds.length === 0) {
            setServiceAccessorySuggestions([]);
            setIsLoadingServiceAccessories(false);
            return;
        }

        const loadSuggestions = async () => {
            setIsLoadingServiceAccessories(true);
            try {
                const serviceSnaps = await Promise.all(serviceIds.map(serviceId => getDoc(doc(db, 'services', serviceId))));
                const categories = getLinkedProductCategoryIds(serviceSnaps
                    .filter(snapshot => snapshot.exists())
                    .map(snapshot => ({ id: snapshot.id, ...snapshot.data() } as ServiceBusinessLink)));
                if (categories.length === 0) {
                    if (!disposed) setServiceAccessorySuggestions([]);
                    return;
                }
                const productSnaps = await Promise.all(categories.slice(0, 10).map(categoryId => getDocs(query(
                    collection(db, 'products'),
                    where('categoryIds', 'array-contains', categoryId),
                    limit(20),
                ))));
                const productMap = new Map<string, PosProduct>();
                productSnaps.forEach(snapshot => snapshot.docs.forEach(productDoc => {
                    const product = { id: productDoc.id, ...productDoc.data() } as PosProduct;
                    if (product.status === PRODUCT_STATUS.ACTIVE && !isPartCategory(product.category, product.categoryIds)) {
                        productMap.set(product.id, product);
                    }
                }));
                const suggestions = filterAvailableCategoryRecommendations(Array.from(productMap.values()), categories).slice(0, 10);
                if (!disposed) setServiceAccessorySuggestions(suggestions);
            } catch (error) {
                console.error('Failed to load service-linked accessory suggestions', error);
                if (!disposed) setServiceAccessorySuggestions([]);
            } finally {
                if (!disposed) setIsLoadingServiceAccessories(false);
            }
        };
        void loadSuggestions();
        return () => { disposed = true; };
    }, [cart, linkedRepairServiceKey, linkedRepairs]);

    useEffect(() => {
        if (chatPrefillApplied.current || searchParams.get('source') !== 'chat') return;
        const handoff = consumeChatWorkflowHandoff(searchParams);
        if (!handoff) return;
        setCustomerId(handoff.customerId || '');
        setCustomerIdentityMode(handoff.customerId ? 'existing' : 'guest');
        setCustomerName(handoff.customerName);
        setCustomerPhone(handoff.customerPhone);
        const handoffContactType = isContactMethodType(handoff.primaryContactType) ? handoff.primaryContactType : handoff.customerPhone ? 'phone' : 'other';
        const handoffContactValue = handoff.primaryContactValue || '';
        setCustomerPrimaryContactType(handoffContactType);
        if (handoffContactType === 'zalo') setCustomerZalo(handoffContactValue);
        if (handoffContactType === 'facebook') setCustomerFacebook(handoffContactValue);
        if (handoffContactType !== 'phone' && handoffContactType !== 'zalo' && handoffContactType !== 'facebook') setCustomerOtherContact(handoffContactValue);
        chatPrefillApplied.current = true;
    }, [searchParams]);

    // Load a repair handed off from the repair screen.
    useEffect(() => {
        const repairId = searchParams.get('repairId');
        if (!repairId || linkedRepairs.some(repair => repair.id === repairId)) return;

        let cancelled = false;
        const fetchRepair = async () => {
            setRepairLoading(true);
            try {
                const { doc, getDoc } = await import('firebase/firestore');
                const snapshot = await getDoc(doc(db, 'repairs', repairId));
                if (!snapshot.exists() || cancelled) return;

                const repair = mapRepairTicketInfo(snapshot.id, snapshot.data());

                setLinkedRepairs(previous => [...previous, repair]);
                setCustomerId(previous => previous || repair.customerId || '');
                if (repair.customerId) setCustomerIdentityMode('existing');
                setCustomerName(previous => previous || repair.customerName);
                setCustomerPhone(previous => previous || repair.customerPhone);
                setCustomerOtherContact(previous => previous || repair.primaryContactValue || '');
            } catch (error) {
                console.error('Failed to load repair by ID:', error);
            } finally {
                if (!cancelled) setRepairLoading(false);
            }
        };

        fetchRepair();
        return () => {
            cancelled = true;
        };
    }, [searchParams, linkedRepairs]);


    const applyCustomerSnapshot = (id: string, data: Record<string, unknown>) => {
        const contactMethods = Array.isArray(data.contactMethods) ? data.contactMethods as ContactMethod[] : [];
        setCustomerId(id);
        setCustomerName(String(data.name || ''));
        setCustomerPhone(String(data.phone || data.primaryPhone || ''));
        setCustomerAddress(String(data.address || ''));
        setCustomerZalo(firstContactValue(contactMethods, 'zalo'));
        setCustomerFacebook(firstContactValue(contactMethods, 'facebook'));
        setCustomerOtherContact(firstContactValue(contactMethods, 'other') || String(data.primaryContactValue || ''));
        setCustomerPrimaryContactType((data.primaryContactType as ContactMethodType) || contactMethods.find(method => method.isPrimary)?.type || 'phone');
        setCustomerDebt(Number(data.totalDebt || 0));
    };

    // Lookup repair/order debt by customer id first, then legacy phone fallback.
    const loadCustomerActivity = async (resolvedCustomerId: string, phone: string) => {
        setRepairLoading(true);
        try {
            const normalizedPhone = normalizeVietnamPhone(phone)?.local || phone.replace(/[^0-9]/g, '');
            const repairDocs = new Map<string, Record<string, unknown> & { id: string }>();
            const orderDocs = new Map<string, Record<string, unknown> & { id: string }>();
            const addRepairsFromSnap = async (repairQuery: ReturnType<typeof query>) => {
                const snap = await getDocs(repairQuery);
                snap.docs.forEach(d => repairDocs.set(d.id, { id: d.id, ...(d.data() as Record<string, unknown>) }));
            };
            const addOrdersFromSnap = async (ordersQuery: ReturnType<typeof query>) => {
                const snap = await getDocs(ordersQuery);
                snap.docs.forEach(d => orderDocs.set(d.id, { id: d.id, ...(d.data() as Record<string, unknown>) }));
            };
            const queryPairs: Promise<void>[] = [
                addRepairsFromSnap(query(collection(db, 'repairs'), where('customer.id', '==', resolvedCustomerId), fbOrderBy('createdAt', 'desc'), limit(20))),
                addOrdersFromSnap(query(collection(db, 'orders'), where('customer_info.customerId', '==', resolvedCustomerId), limit(20))),
            ];
            if (normalizedPhone) {
                queryPairs.push(addRepairsFromSnap(query(collection(db, 'repairs'), where('customer.phone', '==', normalizedPhone), fbOrderBy('createdAt', 'desc'), limit(20))));
                queryPairs.push(addOrdersFromSnap(query(collection(db, 'orders'), where('customer_info.phone', '==', normalizedPhone), limit(20))));
            }
            await Promise.all(queryPairs);

            setLinkedRepairs(Array.from(repairDocs.values())
                .filter(isRepairReadyForPosPayment)
                .sort((a, b) => ((b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0) - ((a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0))
                .map(d => mapRepairTicketInfo(d.id, d, normalizedPhone)));
            setPayableOrders(Array.from(orderDocs.values())
                .sort((a, b) => ((b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0) - ((a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0))
                .map(orderDoc => mapPayableOrderInfo(orderDoc.id, orderDoc))
                .filter((order): order is PayableOrderInfo => Boolean(order)));
        } catch (error) {
            console.error('Customer activity lookup failed:', error);
        } finally {
            setRepairLoading(false);
        }
    };

    const lookupCustomer = async (lookupValue: string) => {
        const rawValue = lookupValue.trim();
        const normalizedLookup = normalizeCustomerLookup(rawValue);
        if (normalizedLookup.length < 2) {
            setCustomerMatches([]);
            return;
        }

        setRepairLoading(true);
        try {
            const normalizedPhone = normalizeVietnamPhone(rawValue)?.local || '';
            const zaloIdentity = resolvePosZaloContactIdentity(rawValue);
            const directIds = Array.from(new Set([rawValue, normalizedPhone, zaloIdentity?.customerId || '']))
                .filter(value => value && !/[\/\\#?\[\]]/.test(value) && value.length <= 120);
            const fallbackKeyword = generateSearchKeywords(normalizedLookup)[0] || normalizedLookup;
            const searchKeywords = Array.from(new Set([normalizedLookup, fallbackKeyword].filter(keyword => keyword.length >= 2)));
            const [directSnapshots, searchSnapshots] = await Promise.all([
                Promise.all(directIds.map(id => getDoc(doc(db, 'customers', id)))),
                Promise.all(searchKeywords.map(keyword => getDocs(query(collection(db, 'customers'), where('searchKeywords', 'array-contains', keyword), limit(8))))),
            ]);
            const matchesById = new Map<string, PosCustomerSearchMatch>();
            directSnapshots.forEach(snapshot => {
                if (snapshot.exists()) matchesById.set(snapshot.id, mapCustomerSearchMatch(snapshot.id, snapshot.data() as Record<string, unknown>));
            });
            searchSnapshots.forEach(snapshot => snapshot.docs.forEach(customerDoc => {
                matchesById.set(customerDoc.id, mapCustomerSearchMatch(customerDoc.id, customerDoc.data() as Record<string, unknown>));
            }));
            const scoreMatch = (match: PosCustomerSearchMatch) => {
                if (match.id.toLowerCase() === rawValue.toLowerCase() || match.id === zaloIdentity?.customerId || (normalizedPhone && match.phone === normalizedPhone)) return 3;
                if (normalizeCustomerLookup(match.name) === normalizedLookup) return 2;
                return 1;
            };
            const requiresSpecificMatch = Boolean(normalizedPhone)
                || normalizedLookup.includes(' ')
                || rawValue.includes('/')
                || rawValue.includes('@');
            setCustomerMatches(Array.from(matchesById.values())
                .filter(match => {
                    if (!requiresSpecificMatch) return true;
                    if (match.id.toLowerCase() === rawValue.toLowerCase() || match.id === zaloIdentity?.customerId || (normalizedPhone && match.phone === normalizedPhone)) return true;
                    const searchable = normalizeCustomerLookup(`${match.name} ${match.primaryContactLabel}`);
                    return searchable.includes(normalizedLookup);
                })
                .sort((left, right) => scoreMatch(right) - scoreMatch(left) || left.name.localeCompare(right.name, 'vi'))
                .slice(0, 8));
        } catch (error) {
            console.error('Customer search failed:', error);
            toastError('Không thể tra cứu khách hàng. Vui lòng thử lại.');
        } finally {
            setRepairLoading(false);
        }
    };

    const selectCustomer = async (customerIdToSelect: string) => {
        setRepairLoading(true);
        try {
            const snapshot = await getDoc(doc(db, 'customers', customerIdToSelect));
            if (!snapshot.exists()) {
                toastError('Hồ sơ khách hàng không còn tồn tại. Vui lòng tra cứu lại.');
                return;
            }
            const data = snapshot.data() as Record<string, unknown>;
            applyCustomerSnapshot(snapshot.id, data);
            setCustomerIdentityMode('existing');
            setCustomerMatches([]);
            setPhoneVerificationToken('');
            setVerifiedPhone('');
            await loadCustomerActivity(snapshot.id, String(data.phone || data.primaryPhone || ''));
        } catch (error) {
            console.error('Customer selection failed:', error);
            toastError('Không thể chọn khách hàng. Vui lòng thử lại.');
        } finally {
            setRepairLoading(false);
        }
    };

    const clearCustomerSelection = () => {
        setCustomerId('');
        setCustomerName('');
        setCustomerPhone('');
        setCustomerAddress('');
        setCustomerZalo('');
        setCustomerFacebook('');
        setCustomerOtherContact('');
        setCustomerPrimaryContactType('phone');
        setCustomerIdentityMode('guest');
        setCustomerMatches([]);
        setPhoneVerificationToken('');
        setVerifiedPhone('');
        setCustomerDebt(0);
        setLinkedRepairs([]);
        setPayableOrders([]);
    };

    const handleCustomerPhoneChanged = (value: string) => {
        if (customerIdentityMode === 'zalo_contact') return;
        if (value === verifiedPhone) return;
        setCustomerIdentityMode('guest');
        setPhoneVerificationToken('');
        setVerifiedPhone('');
    };

    const handleCustomerZaloChanged = (value: string) => {
        if (customerIdentityMode === 'existing' || customerIdentityMode === 'verified_phone') return;

        const zaloIdentity = resolvePosZaloContactIdentity(value);
        if (zaloIdentity) {
            setCustomerId('');
            setCustomerDebt(0);
            setCustomerMatches([]);
            setCustomerIdentityMode('zalo_contact');
            return;
        }

        if (customerIdentityMode === 'zalo_contact') {
            setCustomerIdentityMode('guest');
        }
    };

    const handlePhoneVerified = (phone: string, token: string) => {
        if (normalizeVietnamPhone(customerPhone)?.local !== phone) {
            toastError('SĐT đã thay đổi, vui lòng xác minh lại.');
            return;
        }
        setCustomerId('');
        setCustomerDebt(0);
        setCustomerMatches([]);
        setCustomerIdentityMode('verified_phone');
        setVerifiedPhone(phone);
        setPhoneVerificationToken(token);
    };

    // Auto-calculate discount when cart or linked repair changes
    useEffect(() => {
        let cancelled = false;
        const resetAutoDiscount = () => {
            if (cancelled) return;
            setAutoDiscountAmount(0);
            setDiscountDetails([]);
        };

        resetAutoDiscount();
        if (linkedRepairs.length === 0 || cart.length === 0) {
            return () => { cancelled = true; };
        }
        void (async () => {
            try {
                const rules = await fetchActiveDiscountRules();
                if (rules.length === 0) {
                    resetAutoDiscount();
                    return;
                }

                const repairTicketIdsInCart = getRepairTicketIdsInCart(cart);
                const repairsInCart = linkedRepairs.filter(repair => repairTicketIdsInCart.has(repair.id));
                if (repairsInCart.length === 0) {
                    resetAutoDiscount();
                    return;
                }

                let allParts: { productName: string; partType?: string; unitPriceAtUse?: number; categoryIds?: string[] }[] = [];
                repairsInCart.forEach(r => {
                    allParts = [...allParts, ...r.parts];
                });
                const repairContexts = repairsInCart.map(repair => ({
                    serviceName: repair.serviceName,
                    categoryPath: repair.categoryPath,
                    issues: repair.issues,
                }));

                if (allParts.length === 0 && repairContexts.every(repair =>
                    !repair.serviceName && !repair.categoryPath?.length && (!repair.issues || repair.issues.length === 0)
                )) {
                    resetAutoDiscount();
                    return;
                }

                const results = calculateAccessoryDiscounts(
                    allParts,
                    cart.filter(item => !item.isRepairTicket && !item.isOrderPayment).map(c => {
                        const prod = products.find(p => p.id === c.productId);
                        return {
                            productId: c.productId,
                            productName: c.name,
                            price: c.sellingPrice,
                            category: prod?.category,
                            categoryIds: prod?.categoryIds,
                        };
                    }),
                    rules,
                    repairContexts
                );
                const totalDisc = results.reduce((s, r) => s + r.discountAmount, 0);
                if (cancelled) return;
                setAutoDiscountAmount(totalDisc);
                setDiscountDetails(results);
            } catch {
                resetAutoDiscount();
            }
        })();

        return () => { cancelled = true; };
    }, [linkedRepairs, cart, products]);

    const searchRef = useRef<HTMLInputElement>(null);

    const filterPosProducts = useCallback((data: PosProduct[], options?: { includeOutOfStock?: boolean }) => {
        return data.filter(p => {
            if (p.status !== PRODUCT_STATUS.ACTIVE || p.isProposed === true) return false;
            if (!options?.includeOutOfStock && !isProductSellable(p)) return false;
            if (isPartCategory(p.category, p.categoryIds)) return true;
            if (p.categoryIds && p.categoryIds.length > 0) {
                return retailCategoryRootIds.includes(p.categoryIds[0]);
            }
            return p.category !== 'Dịch vụ sửa chữa' && p.category !== 'service';
        });
    }, [retailCategoryRootIds]);

    const mergeProducts = useCallback((nextProducts: PosProduct[], options?: { includeOutOfStock?: boolean }) => {
        const sellableProducts = filterPosProducts(nextProducts, options);
        setProducts(prev => {
            const merged = new Map(prev.map(product => [product.id, product]));
            sellableProducts.forEach(product => merged.set(product.id, product));
            return Array.from(merged.values());
        });
    }, [filterPosProducts]);

    const loadDefaultProducts = useCallback(async () => {
        const productsRef = collection(db, 'products');
        const [retailSnapshot, componentSnapshot] = await Promise.all([
            getDocs(query(
                productsRef,
                where('status', '==', PRODUCT_STATUS.ACTIVE),
                where('category', 'not-in', PART_CATEGORY_VALUES),
                fbOrderBy('category', 'asc'),
                fbOrderBy('createdAt', 'desc'),
                limit(POS_DEFAULT_RETAIL_LIMIT),
            )),
            getDocs(query(
                productsRef,
                where('status', '==', PRODUCT_STATUS.ACTIVE),
                where('category', 'in', PART_CATEGORY_VALUES),
                fbOrderBy('category', 'asc'),
                fbOrderBy('createdAt', 'desc'),
                limit(POS_DEFAULT_COMPONENT_LIMIT),
            )),
        ]);
        const productsById = new Map<string, PosProduct>();
        [...retailSnapshot.docs, ...componentSnapshot.docs].forEach((snapshot) => {
            productsById.set(snapshot.id, { id: snapshot.id, ...snapshot.data() } as PosProduct);
        });
        setProducts(filterPosProducts(Array.from(productsById.values())));
    }, [filterPosProducts]);

    // Load a bounded POS product cache instead of the full products collection.
    useEffect(() => {
        const load = async () => {
            try {
                await loadDefaultProducts();
            } catch (err) {
                console.error('Failed to load POS products:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [loadDefaultProducts]);

    useEffect(() => {
        const normalizedSearch = appliedSearchQuery.trim();
        if (normalizedSearch.length === 0) return;
        if (normalizedSearch.length < 2) return;

        void (async () => {
            try {
                const keyword = generateSearchKeywords(normalizedSearch)[0] || normalizedSearch.toLowerCase();
                const keywordSnap = await getDocs(query(
                    collection(db, 'products'),
                    where('searchKeywords', 'array-contains', keyword),
                    limit(POS_SEARCH_PRODUCT_LIMIT),
                ));
                mergeProducts(
                    keywordSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as PosProduct)),
                    { includeOutOfStock: true },
                );
            } catch (err) {
                console.error('Failed to search POS products:', err);
            }
        })();
    }, [appliedSearchQuery, mergeProducts]);

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
        const q = appliedSearchQuery.toLowerCase();
        const matchSearch = !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || productCodeSearchText(p).includes(q);
        return matchCat && matchSearch;
    });

    // ── Cart helpers ──
    const addToCart = useCallback((product: Product & { id: string }, preferredLotCode?: string) => {
        const available = (product.stock || 0) - (product.held || 0);
        if (available <= 0) {
            toastError('Sản phẩm đã hết hàng!');
            return;
        }

        const targetCartItemId = preferredLotCode ? `${product.id}_${preferredLotCode}` : product.id;

        setCart(prev => {
            const existing = prev.find(c => c.cartItemId === targetCartItemId);
            if (existing) {
                // Prevent exceeding available stock
                if (existing.quantity >= available) {
                    toastError(`Khả dụng chỉ còn ${available}. Không thể thêm.`);
                    return prev;
                }
                return prev.map(c =>
                    c.cartItemId === targetCartItemId ? { ...c, quantity: c.quantity + 1 } : c
                );
            }
            const wType = resolveWarranty(product);
            return [...prev, {
                cartItemId: targetCartItemId,
                productId: product.id,
                name: product.name,
                image: (product as unknown as { imageUrl?: string }).imageUrl || product.images?.[0],
                originalPrice: product.price_promo || product.price_original,
                sellingPrice: product.price_promo || product.price_original,
                costPrice: product.costPrice || 0,
                quantity: 1,
                warrantyType: wType,
                requiresImei: requiresImeiForPosRetailProduct(product),
                imeis: [],
                lotCode: preferredLotCode,
            }];
        });
    }, [resolveWarranty]);

    const findProductByScanCode = useCallback(async (rawCode: string): Promise<PosProduct | null> => {
        const code = extractProductCodeFromScan(rawCode);
        if (!code) return null;

        const cached = products.find((product) => getProductScanCandidates(product).some((candidate) => candidate === rawCode.trim() || candidate === code));
        if (cached) return cached;

        const registrySnap = await getDoc(doc(db, 'product_code_registry', code));
        const registryProductId = registrySnap.exists() ? registrySnap.data().productId as string | undefined : undefined;
        if (registryProductId) {
            const productSnap = await getDoc(doc(db, 'products', registryProductId));
            if (productSnap.exists()) {
                const product = { id: productSnap.id, ...productSnap.data() } as PosProduct;
                const [sellable] = filterPosProducts([product], { includeOutOfStock: true });
                if (sellable) {
                    mergeProducts([sellable]);
                    return sellable;
                }
            }
        }

        const productsRef = collection(db, 'products');
        const legacySnapshots = await Promise.all([
            getDocs(query(productsRef, where('sku', '==', code), limit(1))),
            getDocs(query(productsRef, where('barcode', '==', code), limit(1))),
            getDocs(query(productsRef, where('productCode', '==', code), limit(1))),
            getDocs(query(productsRef, where('qrCodes', 'array-contains', code), limit(1))),
        ]);
        for (const snapshot of legacySnapshots) {
            const docSnap = snapshot.docs[0];
            if (!docSnap) continue;
            const product = { id: docSnap.id, ...docSnap.data() } as PosProduct;
            const [sellable] = filterPosProducts([product], { includeOutOfStock: true });
            if (sellable) {
                mergeProducts([sellable]);
                return sellable;
            }
        }

        const fallbackSnap = await getDocs(query(
            productsRef,
            fbOrderBy('createdAt', 'desc'),
            limit(POS_LEGACY_SCAN_FALLBACK_LIMIT),
        ));
        const fallbackProducts = filterPosProducts(
            fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() } as PosProduct)),
            { includeOutOfStock: true }
        );
        mergeProducts(fallbackProducts);
        return fallbackProducts.find((product) => getProductScanCandidates(product).some((candidate) => candidate === rawCode.trim() || candidate === code)) || null;
    }, [filterPosProducts, mergeProducts, products]);

    const handleProductScan = useCallback(async (rawCode: string, source: 'keyboard' | 'camera' | 'manual') => {
        const code = extractProductCodeFromScan(rawCode);
        const parts = rawCode.trim().split('#');
        const lotCode = parts.length > 1 ? parts[1] : undefined;

        const found = await findProductByScanCode(rawCode);
        if (!found) {
            const label = code || rawCode.trim();
            setScanStatus(`Không tìm thấy mã ${label}`);
            toastError(`Không tìm thấy sản phẩm với mã ${label}`);
            return false;
        }
        addToCart(found, lotCode);
        setScanStatus(`Đã thêm ${found.name}${lotCode ? ` (Lô: ${lotCode})` : ''}`);
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
                        setAppliedSearchQuery('');
                    }
                    void handleProductScan(code, 'keyboard');
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
                            if (rawValue) void handleProductScanRef.current(rawValue, 'camera');
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
                            if (rawValue && await handleProductScanRef.current(rawValue, 'camera')) return;
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

    const addRepairToCart = (repair: RepairTicketInfo) => {
        // Prevent adding if already in cart
        if (cart.some(c => c.repairTicketId === repair.id)) {
            toastError('Phiếu sửa chữa đã có trong hóa đơn!');
            return;
        }

        if (repair.paymentStatus === 'paid' || repair.paymentStatus === 'refunded') {
            toastError('Phiếu này đã được thanh toán hoặc hoàn tiền!');
            return;
        }

        if (repair.paymentOutstandingOrderId) {
            toastWarning('Phiếu này đã có hóa đơn ghi nợ. Vui lòng thu khoản còn lại từ danh sách đơn cần thanh toán để tránh thu trùng.');
            return;
        }

        const newItems: CartItem[] = [];
        let usedPartsCount = 0;

        repair.parts?.forEach((part, index) => {
            if (part.status === 'selected') {
                usedPartsCount++;
                newItems.push({
                    cartItemId: `${repair.id}_part_${index}`,
                    productId: `${repair.id}_part_${index}`,
                    name: `[LK Sửa] ${part.productName}`,
                    originalPrice: part.unitPriceAtUse || 0,
                    sellingPrice: part.unitPriceAtUse || 0,
                    costPrice: 0,
                    quantity: part.quantity || 1,
                    repairTicketId: repair.id,
                    isRepairTicket: true
                });
            }
        });

        const laborCost = getRepairIssueLaborCost(repair.issues, repair.parts, repair.paymentLaborCost);

        if (laborCost > 0 || (usedPartsCount === 0 && repair.paymentAmount > 0)) {
            const finalLaborCost = laborCost > 0 ? laborCost : repair.paymentAmount;
            newItems.push({
                cartItemId: `${repair.id}_labor`,
                productId: `${repair.id}_labor`,
                name: `[Công SC] ${repair.deviceModel}`,
                originalPrice: finalLaborCost,
                sellingPrice: finalLaborCost,
                costPrice: 0,
                quantity: 1,
                repairTicketId: repair.id,
                isRepairTicket: true
            });
        }

        // Add gifts if they exist and are not already in cart
        if (repair.gifts && repair.gifts.length > 0) {
            repair.gifts.forEach(giftId => {
                const cartGiftId = `gift_${repair.id}_${giftId}`;
                if (!cart.some(c => c.productId === cartGiftId)) {
                    newItems.push({
                        cartItemId: cartGiftId,
                        productId: cartGiftId,
                        name: `[Quà tặng] Mã SP: ${giftId}`,
                        originalPrice: 0,
                        sellingPrice: 0,
                        costPrice: 0, // Gift logic cost
                        quantity: 1,
                        repairTicketId: repair.id,
                        isRepairTicket: false
                    });
                }
            });
        }

        setCart(prev => [...newItems, ...prev]);
    };

    const addPayableOrderToCart = (order: PayableOrderInfo) => {
        if (cart.some(c => c.orderPaymentId === order.id)) {
            toastError('Hóa đơn này đã có trong giỏ POS!');
            return;
        }

        const remainingAmount = Math.max(0, Number(order.remainingAmount) || 0);
        if (remainingAmount <= 0) {
            toastError('Hóa đơn này không còn số tiền cần thanh toán.');
            return;
        }

        setCart(prev => [{
            cartItemId: `order_payment_${order.id}`,
            productId: `order_payment_${order.id}`,
            orderPaymentId: order.id,
            name: `[Thu nợ ĐH] #${order.id.slice(-6)}`,
            originalPrice: remainingAmount,
            sellingPrice: remainingAmount,
            costPrice: 0,
            quantity: 1,
            isOrderPayment: true,
        }, ...prev]);
    };

    const updateQuantity = (cartItemId: string, delta: number) => {
        setCart(prev =>
            prev.map(c => {
                if (c.cartItemId !== cartItemId) return c;
                if (c.isRepairTicket || c.isOrderPayment) return c;
                const newQty = Math.max(1, c.quantity + delta);
                // Validate against stock
                const product = products.find(p => p.id === c.productId);
                const maxAvailable = (product?.stock || 0) - (product?.held || 0);
                if (newQty > maxAvailable) {
                    toastError(`Khả dụng chỉ còn ${maxAvailable}.`);
                    return c;
                }
                return { ...c, quantity: newQty };
            })
        );
    };

    const removeFromCart = (cartItemId: string) => {
        setCart(prev => removeCartItem(prev, cartItemId));
        setAutoDiscountAmount(0);
        setDiscountDetails([]);
    };

    const removeRepairFromCart = async (repairTicketId: string) => {
        const repairItemCount = cart.filter(item => item.repairTicketId === repairTicketId).length;
        if (repairItemCount === 0) return;

        if (!await appConfirm(
            `Bỏ toàn bộ ${repairItemCount} dòng thuộc phiếu sửa chữa này khỏi giỏ?`,
            { title: 'Bỏ phiếu sửa chữa', confirmText: 'Bỏ toàn bộ phiếu', destructive: true },
        )) return;

        setCart(prev => removeRepairTicketFromCart(prev, repairTicketId));
        setAutoDiscountAmount(0);
        setDiscountDetails([]);
    };

    const subtotal = cart.reduce((sum, c) => sum + c.sellingPrice * c.quantity, 0);
    const orderPaymentSubtotal = cart
        .filter(c => c.isOrderPayment)
        .reduce((sum, c) => sum + c.sellingPrice * c.quantity, 0);
    const discountableSubtotal = Math.max(0, subtotal - orderPaymentSubtotal);
    const { effectiveDiscount } = calculatePosDiscountBreakdown({
        discountableSubtotal,
        manualDiscount: discount,
        autoDiscountAmount,
        autoDiscountApplied,
    });

    // Calculate voucher discount automatically based on subtotal
    const voucherDiscountAmount = appliedVoucher ? (
        appliedVoucher.type === 'fixed'
            ? Math.min(appliedVoucher.value, Math.max(0, discountableSubtotal - effectiveDiscount))
            : Math.min(Math.round(discountableSubtotal * appliedVoucher.value / 100), appliedVoucher.maxDiscount || Infinity, Math.max(0, discountableSubtotal - effectiveDiscount))
    ) : 0;

    const repairTicketIdsInCart = Array.from(getRepairTicketIdsInCart(cart));
    const shippingRepair = repairTicketIdsInCart.length === 1
        ? linkedRepairs.find(repair => repair.id === repairTicketIdsInCart[0]) || null
        : null;
    const shippingCustomerCharge = repairShipping?.mode === 'customer_paid_now' ? Math.max(0, repairShipping.fee) : 0;
    const shopShippingPayment = Boolean(repairShipping && repairShipping.mode !== 'customer_paid_now' && repairShipping.fee > 0);
    const total = Math.max(0, subtotal - effectiveDiscount - voucherDiscountAmount + shippingCustomerCharge);
    const selectedDebtTotal = cart
        .filter(item => item.isOrderPayment)
        .reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
    const surplusCashForDebt = useSurplusToPayDebt
        ? Math.min(Math.max(0, cashTendered - total), Math.max(0, customerDebt - selectedDebtTotal))
        : 0;
    const paymentSummary = useMemo(() => buildPosPaymentBreakdown({
        total,
        cashTendered,
        bankTransferAmount,
        bankReference: bankTransferReference,
        extraCashAllocation: surplusCashForDebt,
    }), [bankTransferAmount, bankTransferReference, cashTendered, surplusCashForDebt, total]);
    const usesLegacySurplusPayment = surplusCashForDebt > 0;
    const deposit = usesLegacySurplusPayment ? cashTendered : paymentSummary.paidAmount;
    const checkoutPaymentBreakdown = usesLegacySurplusPayment ? undefined : paymentSummary.entries;
    const paymentBankAccounts = useMemo(() => {
        const configuredAccounts = bankConfig?.accounts || [];
        if (configuredAccounts.length > 0) return configuredAccounts;
        if (bankConfig?.bankId && bankConfig.accountNo) {
            return [{ bankId: bankConfig.bankId, accountNo: bankConfig.accountNo, accountName: bankConfig.accountName || '', isDefault: true }];
        }
        return [];
    }, [bankConfig]);

    const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';
    const activeCashierShift = cashierShift?.status === 'open' ? cashierShift : null;
    const currentCashAmount = activeCashierShift
        ? activeCashierShift.openingCashAmount + activeCashierShift.cashSalesAmount - (activeCashierShift.cashExpenseAmount || 0)
        : openingCashAmount;
    const currentBankAmount = activeCashierShift
        ? activeCashierShift.openingBankAmount + activeCashierShift.bankSalesAmount
        : openingBankAmount;
    const currentCashInventoryExpenseAmount = activeCashierShift?.cashInventoryExpenseAmount || 0;
    const currentCashShippingExpenseAmount = activeCashierShift?.cashShippingExpenseAmount
        ?? Math.max(0, (activeCashierShift?.cashExpenseAmount || 0) - currentCashInventoryExpenseAmount);
    const currentCashShippingExpenseTodayAmount = activeCashierShift?.cashShippingExpenseTodayAmount
        ?? currentCashShippingExpenseAmount;
    const openingShiftTotal = openingCashAmount + openingBankAmount;
    const formatDateTime = (value?: string | null) => {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    };

    const handleApplyVoucher = async () => {
        if (!voucherCode.trim()) {
            setVoucherStatus({ message: 'Vui lòng nhập mã Voucher', type: 'error' });
            return;
        }
        setVoucherStatus({ message: 'Đang kiểm tra...', type: 'success' });
        try {
            const res = await fetch('/api/vouchers/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: voucherCode.trim(), subtotal: discountableSubtotal, phone: customerPhone }),
            });
            const data = await res.json();
            if (data.valid) {
                setAppliedVoucher(data);
                setVoucherStatus({ message: `Đã áp dụng giảm ${data.type === 'fixed' ? data.value.toLocaleString('vi-VN') + 'đ' : data.value + '%'}`, type: 'success' });
            } else {
                setAppliedVoucher(null);
                setVoucherStatus({ message: data.error || 'Voucher không hợp lệ', type: 'error' });
            }
        } catch (error) {
            console.error(error);
            setVoucherStatus({ message: 'Lỗi kiểm tra voucher', type: 'error' });
        }
    };

    useEffect(() => {
        if (debtRequested && paymentSummary.remainingAmount <= 0) {
            setDebtRequested(false);
        }
    }, [debtRequested, paymentSummary.remainingAmount]);

    useEffect(() => {
        if (!shippingRepair) {
            setRepairShipping(null);
            return;
        }
        setRepairShipping(current => current?.repairTicketId === shippingRepair.id ? current : null);
    }, [shippingRepair]);

    // ── Checkout ──
    const handleCheckout = async () => {
        if (cart.length === 0) return;

        if (customerIdentityMode === 'zalo_contact') {
            if (!customerName.trim()) {
                toastError('Khách mới qua Zalo cần nhập tên trước khi tạo hồ sơ hoặc ghi nợ.');
                return;
            }
            if (!resolvePosZaloContactIdentity(customerZalo)) {
                toastError('Liên kết Zalo chưa phải danh thiếp hợp lệ. Hãy quét QR Zalo hoặc nhập link zaloapp.com/qr/p/…');
                return;
            }
        }
        if (customerIdentityMode === 'verified_phone' && !customerName.trim()) {
            toastError('Khách mới xác minh SĐT cần nhập tên trước khi tạo hồ sơ hoặc ghi nợ.');
            return;
        }

        const isExternalImmediatePayment = paymentMethod === 'momo' || paymentMethod === 'installment';
        const immediateMethods = Array.from(new Set(paymentSummary.entries.map(entry => entry.method)));
        const checkoutPaymentMethod = debtRequested && paymentSummary.remainingAmount > 0
            ? 'DEBT'
            : immediateMethods.length > 1
                ? 'MIXED'
                : immediateMethods[0] || (paymentMethod === 'installment' ? 'INSTALLMENT' : paymentMethod === 'momo' ? 'MOMO' : 'CASH');
        if (paymentSummary.bankApplied > 0 && !bankTransferConfirmed) {
            toastError('Vui lòng xác nhận tiền chuyển khoản đã vào tài khoản trước khi thanh toán.');
            return;
        }
        if (!isExternalImmediatePayment && paymentSummary.remainingAmount > 0 && !debtRequested) {
            toastWarning('Chọn Chuyển khoản hoặc Ghi nợ phần còn lại trước khi thanh toán.');
            return;
        }
        if (debtRequested && selectedDebtTotal > 0) {
            toastError('Khoản thu nợ cũ phải được thanh toán đủ trong một lần, không thể ghi nợ tiếp.');
            return;
        }
        const requiresCashierShift = (
            (paymentSummary.entries.length > 0 || isExternalImmediatePayment) && total > 0
        ) || shopShippingPayment;
        if (requiresCashierShift && !activeCashierShift) {
            setPosTab('cashier');
            toastError('Chưa mở ca thu ngân. Vui lòng mở ca ở tab Thu ngân trước khi thanh toán tiền mặt, chuyển khoản hoặc ví.');
            return;
        }

        // Validation for debt/partial payments
        const isDebtPayment = debtRequested && paymentSummary.remainingAmount > 0;
        if (isDebtPayment) {
            if (customerIdentityMode === 'guest') {
                toastError('Khách lẻ không thể ghi nợ. Hãy chọn hồ sơ khách cũ hoặc xác minh SĐT khách mới bằng OTP.');
                return;
            }
            if (customerIdentityMode === 'existing' && !customerId.trim()) {
                toastError('Vui lòng chọn hồ sơ khách hàng trước khi ghi nợ.');
                return;
            }
            if (customerIdentityMode === 'verified_phone') {
                const normalizedVerifiedPhone = normalizeVietnamPhone(customerPhone)?.local || '';
                if (!phoneVerificationToken || !verifiedPhone || normalizedVerifiedPhone !== verifiedPhone) {
                    toastError('SĐT khách mới chưa được xác minh hoặc đã thay đổi. Vui lòng xác minh OTP lại.');
                    return;
                }
            }
            const phoneClean = customerPhone.trim();
            const hasDebtContact = Boolean(customerId.trim() || phoneClean || customerZalo.trim() || customerFacebook.trim() || customerOtherContact.trim());
            if (!hasDebtContact) {
                toastError('Đơn hàng ghi nợ hoặc thanh toán thiếu bắt buộc phải có Mã KH, SĐT, Zalo, Facebook hoặc liên hệ khác.');
                return;
            }
            if (phoneClean && !normalizeVietnamPhone(phoneClean)) {
                toastError('Số điện thoại khách hàng không hợp lệ (bắt đầu bằng 0, gồm 10–11 chữ số).');
                return;
            }
        }

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
                if (item.requiresImei) {
                    const validImeis = (item.imeis || []).map(i => i.trim()).filter(Boolean);
                    if (validImeis.length < item.quantity) {
                        toastError(`Vui lòng nhập đủ ${item.quantity} IMEI/Serial cho sản phẩm ${item.name}`);
                        setIsProcessing(false);
                        return;
                    }
                }
            }

            const operationKey = crypto.randomUUID();

            const repairTicketIds = Array.from(new Set(
                cart
                    .filter(c => c.isRepairTicket)
                    .map(item => item.repairTicketId || item.productId)
                    .filter(Boolean)
            ));

            const orderData = {
                idempotencyKey: operationKey,
                repairTicketIds: repairTicketIds.length > 0 ? repairTicketIds : undefined,
                customer_info: {
                    customerId: customerId.trim(),
                    name: customerName.trim() || 'Khách lẻ',
                    phone: customerPhone.trim(),
                    identityMode: customerIdentityMode,
                    zalo: customerZalo.trim(),
                    facebook: customerFacebook.trim(),
                    otherContact: customerOtherContact.trim(),
                    primaryContactType: customerPrimaryContactType,
                },
                ...(customerIdentityMode === 'verified_phone' ? { phone_verification_token: phoneVerificationToken } : {}),
                items: cart.map(c => ({
                    productId: c.productId,
                    productName: c.name,
                    quantity: c.quantity,
                    price: c.sellingPrice,
                    isRepairTicket: c.isRepairTicket,
                    repairTicketId: c.repairTicketId,
                    isOrderPayment: c.isOrderPayment,
                    orderPaymentId: c.orderPaymentId,
                    imeis: c.imeis,
                    lotCode: c.lotCode
                })),
                total_amount: total,
                discount_amount: effectiveDiscount + voucherDiscountAmount,
                subtotal_amount: subtotal,
                shipping_fee: shippingCustomerCharge,
                ...(repairShipping ? { repair_shipping: repairShipping } : {}),
                deposit_amount: deposit,
                deposit_payment_method: paymentSummary.entries[0]?.method || (cashTendered > 0 ? 'CASH' : bankTransferAmount > 0 ? 'BANK' : undefined),
                ...(checkoutPaymentBreakdown !== undefined ? { payment_breakdown: checkoutPaymentBreakdown } : {}),
                use_surplus_to_pay_debt: useSurplusToPayDebt,
                payment_method: checkoutPaymentMethod,
                ...(requiresCashierShift && activeCashierShift ? { cashierShiftId: activeCashierShift.id } : {}),
                ...(appliedVoucher ? { voucherCode: appliedVoucher.code } : {}),
            };

            const checkoutStartedAt = performance.now();
            const auth = await getAuthInstance();
            const tokenStartedAt = performance.now();
            const idToken = await auth.currentUser?.getIdToken();
            const tokenMs = Math.round(performance.now() - tokenStartedAt);
            const requestStartedAt = performance.now();
            const res = await fetch('/api/pos/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(orderData)
            });
            const requestMs = Math.round(performance.now() - requestStartedAt);

            const data = await res.json();
            const totalCheckoutMs = Math.round(performance.now() - checkoutStartedAt);
            if (totalCheckoutMs > 1500 || data?.debugTiming) {
                console.warn('POS checkout timing', {
                    tokenMs,
                    requestMs,
                    totalCheckoutMs,
                    server: data?.debugTiming,
                });
            }
            if (!res.ok) {
                throw new Error(data.error || 'Lỗi khi thanh toán qua API');
            }

            if (data.warnings && data.warnings.length > 0) {
                for (const warning of data.warnings) {
                    toastWarning(warning);
                }
            }

            if (data.debtOnly) {
                setLastOrder(null);
                setShowReceipt(false);
                toastSuccess('Thu nợ thành công, đã cập nhật lịch sử thanh toán trên đơn cũ!');
            } else {
                setLastOrder({ id: data.orderId, ...orderData, paymentBreakdown: data.paymentBreakdown || checkoutPaymentBreakdown, createdAt: new Date() });
                toastSuccess('Thanh toán thành công!');
                setShowReceipt(true);
            }

            // Reset cart
            setCart([]);
            setCustomerName('');
            setCustomerId('');
            setCustomerPhone('');
            setCustomerZalo('');
            setCustomerFacebook('');
            setCustomerOtherContact('');
            setCustomerPrimaryContactType('phone');
            setCustomerIdentityMode('guest');
            setCustomerMatches([]);
            setPhoneVerificationToken('');
            setVerifiedPhone('');
            setCustomerDebt(0);
            setLinkedRepairs([]);
            setDiscount(0);
            setCashTendered(0);
            setBankTransferAmount(0);
            setBankTransferConfirmed(false);
            setDebtRequested(false);
            setBankTransferReference(createPosPaymentReference(crypto.randomUUID()));
            setPaymentMethod('cash');
            setUseSurplusToPayDebt(false);
            setRepairShipping(null);
            setVoucherCode('');
            setAppliedVoucher(null);
            setVoucherStatus(null);
            if (data.cashierShiftChanged === true) void loadCashierShift();
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
            await loadDefaultProducts();
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

    const customerWorkspace = (
        <PosCustomerWorkspace
            cart={cart}
            customerId={customerId}
            setCustomerId={setCustomerId}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
            customerAddress={customerAddress}
            setCustomerAddress={setCustomerAddress}
            customerZalo={customerZalo}
            setCustomerZalo={setCustomerZalo}
            customerFacebook={customerFacebook}
            setCustomerFacebook={setCustomerFacebook}
            customerOtherContact={customerOtherContact}
            setCustomerOtherContact={setCustomerOtherContact}
            customerPrimaryContactType={customerPrimaryContactType}
            setCustomerPrimaryContactType={setCustomerPrimaryContactType}
            customerIdentityMode={customerIdentityMode}
            customerMatches={customerMatches}
            onSelectCustomer={selectCustomer}
            onClearCustomerSelection={clearCustomerSelection}
            onPhoneChanged={handleCustomerPhoneChanged}
            onPhoneVerified={handlePhoneVerified}
            onZaloContactChanged={handleCustomerZaloChanged}
            customerDebt={customerDebt}
            repairLoading={repairLoading}
            linkedRepairs={linkedRepairs}
            shippingRepair={shippingRepair}
            repairShipping={repairShipping}
            onRepairShippingChange={setRepairShipping}
            payableOrders={payableOrders}
            onLookupCustomer={lookupCustomer}
            onAddRepairToCart={addRepairToCart}
            onAddPayableOrderToCart={addPayableOrderToCart}
            formatPrice={formatPrice}
        />
    );

    const cartPanelProps = {
        cart, setCart, customerName, customerPhone, customerDebt, repairShipping,
        discountDetails, autoDiscountAmount, autoDiscountApplied,
        onApplyAutoDiscount: () => setAutoDiscountApplied(true),
        setDiscount, paymentMethod, setPaymentMethod, discount,
        voucherCode, setVoucherCode, voucherStatus, appliedVoucher,
        setAppliedVoucher, setVoucherStatus, voucherDiscountAmount,
        deposit, paymentBreakdown: paymentSummary.entries,
        cashTendered, setCashTendered, bankTransferAmount, setBankTransferAmount,
        bankTransferConfirmed, setBankTransferConfirmed,
        debtRequested, setDebtRequested, bankTransferReference,
        bankAccounts: paymentBankAccounts,
        useSurplusToPayDebt, setUseSurplusToPayDebt,
        subtotal, total, isProcessing,
        cashierShiftOpen: Boolean(activeCashierShift),
        onCloseMobileCart: () => setShowMobileCart(false),
        onApplyVoucher: handleApplyVoucher,
        onUpdateQuantity: updateQuantity,
        onRemoveFromCart: removeFromCart,
        onRemoveRepairFromCart: removeRepairFromCart,
        onCheckout: handleCheckout,
        formatPrice,
    };

    /* Mobile: combined cart + payment (full-screen sheet) */
    const cartSection = <PosCartPanel {...cartPanelProps} />;
    /* Desktop right column: cart items only */
    const cartItemsSection = <PosCartItemsSection {...cartPanelProps} />;
    /* Desktop bottom full-width: payment controls + totals + checkout */
    const paymentSection = <PosPaymentSection {...cartPanelProps} />;

    const cashierSection = (
        <div className="md:flex-1 md:overflow-y-auto">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Két thu ngân</h2>
                            <p className="text-xs font-medium text-gray-500">
                                {activeCashierShift ? 'Số đầu ca đã khóa, POS tự cập nhật phát sinh.' : 'Nhập số đầu ca một lần để bắt đầu theo dõi két.'}
                            </p>
                        </div>
                        <div className="rounded-full bg-emerald-50 p-2 text-emerald-700">
                            <Banknote size={22} />
                        </div>
                    </div>

                    {cashierLoading ? (
                        <div className="flex min-h-48 items-center justify-center rounded-2xl bg-gray-50">
                            <Loader2 className="animate-spin text-emerald-600" size={28} />
                        </div>
                    ) : activeCashierShift ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">Ca đang mở</div>
                                        <div className="text-sm font-semibold text-emerald-950">
                                            {activeCashierShift.openedByName || 'Nhân viên'}{activeCashierShift.openedAt ? ` - ${formatDateTime(activeCashierShift.openedAt)}` : ''}
                                        </div>
                                    </div>
                                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700 shadow-sm">Đã khóa</span>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Tiền mặt hiện có</div>
                                    <div className="mt-1 text-2xl font-black text-gray-950">{formatPrice(currentCashAmount)}</div>
                                    <div className="mt-2 text-xs font-medium text-gray-500">
                                        Đầu ca {formatPrice(activeCashierShift.openingCashAmount)} + thu POS {formatPrice(activeCashierShift.cashSalesAmount)} − tổng chi tiền mặt {formatPrice(activeCashierShift.cashExpenseAmount || 0)}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                                    <div className="text-xs font-bold uppercase tracking-wide text-blue-600">Chuyển khoản trong ca</div>
                                    <div className="mt-1 text-2xl font-black text-blue-900">{formatPrice(currentBankAmount)}</div>
                                    <div className="mt-2 text-xs font-medium text-blue-600">
                                        Đầu ca {formatPrice(activeCashierShift.openingBankAmount)} + thu POS {formatPrice(activeCashierShift.bankSalesAmount)}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-100 p-3">
                                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">Phát sinh POS</div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <div className="rounded-xl bg-gray-50 p-3">
                                        <div className="text-xs text-gray-500">Tiền mặt</div>
                                        <div className="font-black text-gray-900">{formatPrice(activeCashierShift.cashSalesAmount)}</div>
                                    </div>
                                    <div className="rounded-xl bg-gray-50 p-3">
                                        <div className="text-xs text-gray-500">Chuyển khoản</div>
                                        <div className="font-black text-gray-900">{formatPrice(activeCashierShift.bankSalesAmount)}</div>
                                    </div>
                                    <div className="rounded-xl bg-red-50 p-3">
                                        <div className="text-xs text-red-600">Chi tiền nhập hàng</div>
                                        <div className="font-black text-red-800">-{formatPrice(currentCashInventoryExpenseAmount)}</div>
                                    </div>
                                    <div className="rounded-xl bg-red-50 p-3">
                                        <div className="text-xs text-red-600">Chi ship tiền mặt (trong ca)</div>
                                        <div className="font-black text-red-800">-{formatPrice(currentCashShippingExpenseAmount)}</div>
                                        {currentCashShippingExpenseTodayAmount !== currentCashShippingExpenseAmount && (
                                            <div className="mt-1 text-[11px] text-red-600">Hôm nay: -{formatPrice(currentCashShippingExpenseTodayAmount)}</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <label className="block rounded-2xl border border-gray-100 bg-gray-50 p-3">
                                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">Tiền mặt đầu ca</span>
                                <CurrencyInput
                                    value={openingCashAmount || ''}
                                    onChange={setOpeningCashAmount}
                                    min={0}
                                    className="h-12 w-full rounded-xl border bg-white px-3 text-right text-lg font-black text-gray-950 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                    placeholder="0"
                                />
                            </label>
                            <label className="block rounded-2xl border border-gray-100 bg-gray-50 p-3">
                                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">Chuyển khoản đầu ca</span>
                                <CurrencyInput
                                    value={openingBankAmount || ''}
                                    onChange={setOpeningBankAmount}
                                    min={0}
                                    className="h-12 w-full rounded-xl border bg-white px-3 text-right text-lg font-black text-gray-950 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    placeholder="0"
                                />
                            </label>
                            <div className="rounded-2xl bg-orange-50 p-3">
                                <div className="text-xs font-bold uppercase tracking-wide text-orange-700">Tổng đầu ca</div>
                                <div className="text-2xl font-black text-orange-700">{formatPrice(openingShiftTotal)}</div>
                            </div>
                            <button
                                type="button"
                                onClick={handleOpenCashierShift}
                                disabled={cashierSaving}
                                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {cashierSaving && <Loader2 className="animate-spin" size={16} />}
                                Mở ca và khóa số đầu ca
                            </button>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                    <h2 className="mb-4 text-base font-bold text-gray-900">Chốt ca</h2>
                    <div className="space-y-3">
                        <div className="rounded-xl bg-emerald-50 p-3">
                            <div className="text-xs font-semibold text-emerald-700">Tiền mặt dự kiến</div>
                            <div className="text-xl font-bold text-emerald-900">{formatPrice(currentCashAmount)}</div>
                        </div>
                        <div className="rounded-xl bg-blue-50 p-3">
                            <div className="text-xs font-semibold text-blue-700">Chuyển khoản dự kiến</div>
                            <div className="text-xl font-bold text-blue-900">{formatPrice(currentBankAmount)}</div>
                        </div>
                        <div className="rounded-xl bg-gray-50 p-3">
                            <div className="text-xs font-semibold text-gray-600">Tổng dự kiến</div>
                            <div className="text-2xl font-black text-gray-950">{formatPrice(currentCashAmount + currentBankAmount)}</div>
                        </div>
                        <button
                            type="button"
                            onClick={handleCloseCashierShift}
                            disabled={!activeCashierShift || cashierSaving}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {cashierSaving && <Loader2 className="animate-spin" size={16} />}
                            Chốt ca
                        </button>
                    </div>
                </div>
            </div>
            <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-gray-900">Lịch sử chốt ca</h2>
                        <p className="text-xs font-medium text-gray-500">Các ca đã chốt gần nhất để đối chiếu két.</p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
                        {cashierShiftHistory.length} ca
                    </span>
                </div>

                {cashierLoading ? (
                    <div className="flex min-h-24 items-center justify-center rounded-2xl bg-gray-50">
                        <Loader2 className="animate-spin text-emerald-600" size={24} />
                    </div>
                ) : cashierShiftHistory.length === 0 ? (
                    <div className="rounded-2xl bg-gray-50 p-4 text-center text-sm font-medium text-gray-500">
                        Chưa có ca nào đã chốt.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {cashierShiftHistory.map(shift => {
                            const cashAmount = shift.closingCashAmount ?? shift.expectedCashAmount;
                            const bankAmount = shift.closingBankAmount ?? shift.expectedBankAmount;
                            return (
                                <div key={shift.id} className="rounded-2xl border border-gray-100 p-3">
                                    <div className="mb-3 flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-black text-gray-900">
                                                Ca #{shift.id.slice(-6).toUpperCase()}
                                            </div>
                                            <div className="mt-0.5 text-xs font-medium text-gray-500">
                                                {shift.openedAt ? formatDateTime(shift.openedAt) : 'Không rõ giờ mở'}
                                                {shift.closedAt ? ` - ${formatDateTime(shift.closedAt)}` : ''}
                                            </div>
                                        </div>
                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                                            Đã chốt
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                                        <div className="rounded-xl bg-gray-50 p-2">
                                            <div className="text-[11px] font-bold uppercase text-gray-500">Tiền mặt</div>
                                            <div className="font-black text-gray-900">{formatPrice(cashAmount)}</div>
                                        </div>
                                        <div className="rounded-xl bg-blue-50 p-2">
                                            <div className="text-[11px] font-bold uppercase text-blue-600">Chuyển khoản</div>
                                            <div className="font-black text-blue-900">{formatPrice(bankAmount)}</div>
                                        </div>
                                        <div className="rounded-xl bg-orange-50 p-2">
                                            <div className="text-[11px] font-bold uppercase text-orange-700">Tổng</div>
                                            <div className="font-black text-orange-700">{formatPrice(cashAmount + bankAmount)}</div>
                                        </div>
                                        <div className="rounded-xl bg-gray-50 p-2">
                                            <div className="text-[11px] font-bold uppercase text-gray-500">POS phát sinh</div>
                                            <div className="font-black text-gray-900">{formatPrice(shift.cashSalesAmount + shift.bankSalesAmount)}</div>
                                        </div>
                                    </div>

                                    <div className="mt-3 grid gap-1 text-xs font-medium text-gray-500 sm:grid-cols-2">
                                        <div>Mở: {shift.openedByName || 'Nhân viên'}</div>
                                        <div>Chốt: {shift.closedByName || 'Nhân viên'}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="min-h-[calc(100vh-220px)] p-4 md:h-[calc(100vh-80px)]">
            <div className="flex h-full flex-col gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex w-full gap-2 rounded-2xl border bg-white p-1 shadow-sm sm:w-fit">
                        <button
                            type="button"
                            onClick={() => setPosTab('sales')}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all sm:flex-none ${posTab === 'sales'
                                ? 'bg-orange-500 text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            <ShoppingCart size={16} />
                            Bán hàng
                        </button>
                        <button
                            type="button"
                            onClick={() => setPosTab('cashier')}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all sm:flex-none ${posTab === 'cashier'
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            <Banknote size={16} />
                            Thu ngân
                        </button>
                    </div>
                    <button
                        onClick={() => setShowProductModal(true)}
                        className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 whitespace-nowrap"
                    >
                        <Plus size={15} />
                        Thêm SP Mới
                    </button>
                </div>
                {posTab === 'sales' ? (
                    <div className="flex min-h-0 flex-1 gap-4">
                        {/* ═══ LEFT: Product Grid + Payment Controls ═══ */}
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
                            {/* Search + Category Filter + Quick Add */}
                            <div className="flex flex-wrap sm:flex-nowrap gap-2 sm:gap-3 mb-3">
                                <form
                                    className="flex flex-1 max-w-[50%] min-w-[180px] gap-1.5 sm:gap-2"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        setAppliedSearchQuery(searchQuery.trim());
                                    }}
                                >
                                    <div className="relative flex-1">
                                        <Search className="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                        <input
                                            ref={searchRef}
                                            type="text"
                                            placeholder="Tìm sản phẩm... (F1)"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="w-full pl-7 sm:pl-8 pr-2.5 py-1 sm:py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 bg-white shadow-sm"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="rounded-lg bg-orange-500 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold text-white hover:bg-orange-600 shrink-0"
                                    >
                                        Tìm
                                    </button>
                                </form>
                                <div className="flex gap-1.5 sm:gap-2 shrink-0">
                                    <button
                                        onClick={() => setShowScanner(true)}
                                        className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-gray-900 text-white rounded-xl hover:bg-black shadow-sm font-semibold text-xs sm:text-sm whitespace-nowrap transition-all"
                                    >
                                        <Camera size={15} />
                                        <span>Quét mã</span>
                                    </button>
                                </div>
                            </div>

                            {/* Category Tabs */}
                            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
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

                            {(isLoadingServiceAccessories || serviceAccessorySuggestions.length > 0) && (
                                <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-2.5">
                                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
                                        <Package size={14} /> Phụ kiện gợi ý theo dịch vụ sửa chữa
                                        {isLoadingServiceAccessories && <Loader2 size={13} className="animate-spin" />}
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-0.5">
                                        {serviceAccessorySuggestions.map(product => {
                                            const available = Math.max(0, (product.stock || 0) - (product.held || 0));
                                            return (
                                                <button
                                                    key={product.id}
                                                    type="button"
                                                    onClick={() => addToCart(product)}
                                                    disabled={available <= 0}
                                                    className="min-w-36 rounded-lg border border-emerald-100 bg-white px-2.5 py-2 text-left text-xs hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <p className="line-clamp-1 font-semibold text-gray-800">{product.name}</p>
                                                    <p className="mt-0.5 text-emerald-700">{formatPrice(product.price_promo || product.price_original)} · Tồn {available}</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Product Grid — limited height on desktop */}
                            <div className="md:max-h-[45vh] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-1.5 min-[1500px]:grid-cols-3 min-[1700px]:grid-cols-4">
                                    {filtered.map(product => {
                                        const available = (product.stock || 0) - (product.held || 0);
                                        const outOfStock = available <= 0;
                                        return (
                                            <button
                                                key={product.id}
                                                onClick={() => !outOfStock && addToCart(product)}
                                                disabled={outOfStock}
                                                className={`group relative flex min-h-[56px] items-center gap-1.5 sm:gap-2 rounded-lg border border-gray-100 bg-white p-1.5 sm:p-2 text-left transition-all ${outOfStock
                                                    ? 'opacity-50 cursor-not-allowed'
                                                    : 'hover:shadow-md hover:border-orange-200 active:scale-[0.97]'
                                                    }`}
                                            >
                                                {outOfStock && (
                                                    <div className="absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded-full bg-red-500 px-1 py-0.5 text-[8px] font-bold text-white shadow-sm">
                                                        <AlertTriangle size={9} /> Hết
                                                    </div>
                                                )}
                                                <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-50">
                                                    {((product as unknown as { imageUrl?: string }).imageUrl || product.images?.[0]) ? (
                                                        <Image src={((product as unknown as { imageUrl?: string }).imageUrl || product.images?.[0]) as string} alt={product.name} width={40} height={40} className={`h-full w-full object-cover ${!outOfStock ? 'group-hover:scale-105' : ''} transition-transform`} />
                                                    ) : (
                                                        <Package className="text-gray-300" size={15} />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="line-clamp-2 text-xs font-semibold leading-3.5 text-gray-800">{product.name}</p>
                                                    <p className="mt-0.5 truncate font-mono text-[9px] sm:text-[10px] text-gray-400">{getPrimaryProductCode(product)}</p>
                                                    <div className="mt-0.5 flex flex-wrap items-end justify-between gap-x-1">
                                                        <p className="text-xs font-bold text-orange-600">{formatPrice(product.price_promo || product.price_original)}</p>
                                                        <p className={`text-right text-[9px] sm:text-[10px] font-medium ${outOfStock ? 'text-red-500' : available <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                                                            Tồn: {available}
                                                        </p>
                                                    </div>
                                                </div>
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

                            {/* ═══ Payment Controls (below product grid, left column) ═══ */}
                            <div className="hidden md:block mt-3 rounded-2xl border bg-white shadow-sm">
                                {paymentSection}
                            </div>
                        </div>

                        {/* ═══ RIGHT (Tablet/Laptop md & lg): Single Right Column Stacking Customer + Cart ═══ */}
                        <div className="hidden min-h-0 md:flex xl:hidden md:w-[350px] lg:w-[380px] flex-shrink-0 flex-col gap-2.5 overflow-y-auto">
                            <div className="rounded-2xl border bg-white p-2 shadow-sm">
                                {customerWorkspace}
                            </div>
                            <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-white shadow-sm overflow-hidden">
                                {cartItemsSection}
                            </div>
                        </div>

                        {/* ═══ RIGHT (Large Desktop xl & 2xl): Separate Customer & Cart Columns ═══ */}
                        <div className="hidden min-h-0 xl:flex xl:w-[300px] 2xl:w-[340px] flex-shrink-0 flex-col overflow-y-auto rounded-2xl border bg-white p-2 shadow-sm">
                            {customerWorkspace}
                        </div>
                        <div className="hidden min-h-0 xl:flex xl:w-[340px] 2xl:w-[380px] flex-shrink-0 flex-col overflow-y-auto rounded-2xl border bg-white shadow-sm">
                            <div className="flex min-h-0 flex-1 flex-col">
                                {cartItemsSection}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 gap-4">
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                            {cashierSection}
                        </div>
                    </div>
                )}

            {/* ═══ Mobile: Sticky Bottom Bar ═══ */}
            {posTab === 'sales' && !showMobileCart && (
                <div className="md:hidden fixed left-0 right-0 bottom-[calc(env(safe-area-inset-bottom)+62px)] bg-white/95 backdrop-blur-sm border-t shadow-lg px-3 py-2 z-40">
                    <button onClick={() => setShowMobileCart(true)}
                        className="w-full py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center gap-2 shadow-md shadow-orange-200/50 active:scale-[0.98]">
                        <ShoppingCart size={16} />
                        Giỏ hàng ({cart.reduce((s, c) => s + c.quantity, 0)}) — {formatPrice(total)}
                    </button>
                </div>
            )}

            {/* ═══ Mobile: Full-screen Cart Sheet ═══ */}
            {posTab === 'sales' && showMobileCart && (
                <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
                    <div className="p-3">{customerWorkspace}</div>
                    <div className="flex min-h-0 flex-1 flex-col border-t">
                        {cartSection}
                    </div>
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
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (await handleProductScan(manualScanCode, 'manual')) setManualScanCode('');
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
                                <div id="pos-receipt-thermal" className="px-6 py-4 text-xs space-y-3 max-w-[302px] mx-auto">
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
                                                    <td className="py-1 max-w-[100px] truncate">{getOrderLineDisplayName(item)}</td>
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
                                        {lastOrder.shipping_fee > 0 && (
                                            <div className="flex justify-between text-sky-700"><span>Phí ship</span><span>+{formatPrice(lastOrder.shipping_fee)}</span></div>
                                        )}
                                        <div className="flex justify-between font-bold text-sm border-t pt-1">
                                            <span>TỔNG CỘNG</span>
                                            <span>{formatPrice(lastOrder.total_amount)}</span>
                                        </div>
                                        {lastOrder.deposit_amount > 0 && (
                                            <>
                                                <div className="flex justify-between text-blue-600 mt-1"><span>Khách đã cọc</span><span>{formatPrice(lastOrder.deposit_amount)}</span></div>
                                                {lastOrder.paymentBreakdown?.map((entry, index) => (
                                                    <div key={`${entry.method}-${index}`} className="flex justify-between text-xs text-blue-500"><span>{entry.method === 'CASH' ? 'Tiền mặt' : entry.method === 'BANK' ? 'Chuyển khoản' : entry.method}</span><span>{formatPrice(entry.amount)}</span></div>
                                                ))}
                                                <div className="flex justify-between font-bold text-red-600"><span>CÒN LẠI</span><span>{formatPrice(Math.max(0, lastOrder.total_amount - lastOrder.deposit_amount))}</span></div>
                                            </>
                                        )}
                                        <div className="flex justify-between text-gray-500 pt-1">
                                            <span>HTTT</span>
                                            <span>{formatPaymentMethodLabel(lastOrder.payment_method, lastOrder.paymentBreakdown)}</span>
                                        </div>
                                    </div>
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
                                                        <td>${escapeReceiptHtml(getOrderLineDisplayName(item))}</td>
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
                                                ${lastOrder.shipping_fee > 0 ? `<div class="summary-row"><span>Phí ship:</span><span>+ ${lastOrder.shipping_fee.toLocaleString('vi-VN')} đ</span></div>` : ''}
                                                <div class="summary-row bold" style="font-size: 16px; margin-top: 5px; border-top: 1px dotted #ccc; padding-top: 5px;">
                                                    <span>Tổng thanh toán:</span><span>${lastOrder.total_amount.toLocaleString('vi-VN')} đ</span>
                                                </div>
                                                ${lastOrder.deposit_amount > 0 ? `<div class="summary-row" style="margin-top: 5px;"><span>Đã thanh toán (cọc):</span><span>${lastOrder.deposit_amount.toLocaleString('vi-VN')} đ</span></div>
                                                <div class="summary-row bold" style="color: red; font-size: 16px;"><span>CÒN LẠI:</span><span>${Math.max(0, lastOrder.total_amount - lastOrder.deposit_amount).toLocaleString('vi-VN')} đ</span></div>` : ''}
                                            </div>

                                            <p style="text-align: right; font-style: italic; margin-top: 10px;">Hình thức TT: ${formatPaymentMethodLabel(lastOrder.payment_method, lastOrder.paymentBreakdown)}</p>

                                            <div class="signatures" style="display: flex; justify-content: space-between; margin-top: 30px;">
                                                <div style="flex: 1; text-align: center;">
                                                    <p class="title" style="margin: 0 0 70px 0; font-weight: bold;">Khách hàng</p>
                                                    <p style="color: #666; font-style: italic;">(Ký, ghi rõ họ tên)</p>
                                                </div>
                                                <div style="flex: 1; text-align: center;">
                                                    <p class="title" style="margin: 0 0 70px 0; font-weight: bold;">Người lập phiếu</p>
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
                <div className="fixed inset-0 bg-white z-[100] p-4 hidden print:block max-w-[302px] mx-auto font-mono text-[11px]">
                    <div className="text-center mb-2">
                        <p className="font-bold text-sm">{config.siteName || 'Văn Lành Service'}</p>
                        <p>HÓA ĐƠN BÁN HÀNG</p>
                        <p>{new Date().toLocaleString('vi-VN')} | #{lastOrder.id.slice(-6).toUpperCase()}</p>
                    </div>
                    <hr className="border-t border-dashed border-black" />
                    <p>KH: {lastOrder.customer_info.name}</p>
                    {lastOrder.customer_info.phone && <p>SĐT: {lastOrder.customer_info.phone}</p>}
                    <hr className="border-t border-dashed border-black" />
                    <table className="w-full">
                        <tbody>
                            {lastOrder.items.map((item: OrderLineItem, i: number) => (
                                <tr key={i}>
                                    <td>{getOrderLineDisplayName(item)}</td>
                                    <td className="text-center">x{item.quantity}</td>
                                    <td className="text-right">{formatPrice(item.price * item.quantity)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <hr className="border-t border-dashed border-black" />
                    {lastOrder.shipping_fee > 0 && <p className="text-right">Phí ship: {formatPrice(lastOrder.shipping_fee)}</p>}
                    <p className="text-right font-bold">TỔNG: {formatPrice(lastOrder.total_amount)}</p>
                    <hr className="border-t border-dashed border-black" />
                    <p className="text-center mt-2">Cảm ơn quý khách!</p>
                </div>
            )}

            {/* ═══ Quick Add Product Modal ═══ */}
            {showProductModal && (
                <UniversalProductModal
                    isOpen
                    onClose={() => setShowProductModal(false)}
                    mode="retail"
                    onCreated={reloadProducts}
                    submitLabel="Tạo & Đưa vào POS"
                />
            )}
            </div>
        </div>
    );
}
