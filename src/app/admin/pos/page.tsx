'use client';


import dynamic from 'next/dynamic';
import { useState, useEffect, useRef, useCallback } from 'react';
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
import type { Product, TaxonomyNode } from '@/lib/types';
import type { ContactMethod, ContactMethodType } from '@/lib/types/contact';

import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import { DEFAULT_CONFIG } from '@/lib/config-defaults';
import { PART_CATEGORY, isPartCategory } from '@/lib/constants';
import { fetchActiveDiscountRules, calculateAccessoryDiscounts } from '@/lib/discountRuleUtils';
import { consumeChatWorkflowHandoff } from '@/lib/chatWorkflowHandoff';
import { extractProductCodeFromScan, getPrimaryProductCode, getProductScanCandidates, productCodeSearchText } from '@/lib/productCodes';
import { PRODUCT_STATUS, isProductSellable } from '@/lib/productLifecycle';
import { generateSearchKeywords } from '@/lib/utils';
import { extractZaloQrIdentity } from '@/lib/zaloContactCardImport';
import { PosCartPanel } from '@/features/pos/PosCartPanel';
import type { AppliedVoucher, CartItem, DiscountDetail, LastOrderData, OrderLineItem, PayableOrderInfo, RepairTicketInfo, VoucherStatus } from '@/features/pos/posTypes';
import CurrencyInput from '@/components/admin/CurrencyInput';

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
const POS_DEFAULT_PRODUCT_LIMIT = 120;
const POS_SEARCH_PRODUCT_LIMIT = 60;
const POS_LEGACY_SCAN_FALLBACK_LIMIT = 500;
type PosProduct = Product & { id: string };
type PosTab = 'sales' | 'cashier';

function getProductCategoryPathIds(product: Product) {
    if (Array.isArray(product.categoryIds) && product.categoryIds.length > 0) {
        return product.categoryIds.filter(Boolean);
    }

    const category = typeof product.category === 'string' ? product.category : '';
    const segments = category.split('/').filter(Boolean);
    return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

function findTaxonomyNodeById(nodes: TaxonomyNode[], id: string): TaxonomyNode | null {
    for (const node of nodes) {
        if (node.id === id || node.slug === id) return node;
        const child = findTaxonomyNodeById(node.children || [], id);
        if (child) return child;
    }
    return null;
}

function resolveTaxonomyWarranty(nodes: TaxonomyNode[], categoryPathIds: string[]): Product['warrantyType'] | null {
    let currentNodes = nodes;
    let lastFound: Product['warrantyType'] | null = null;

    for (const categoryPathId of categoryPathIds) {
        const slug = categoryPathId.split('/').pop();
        const node = currentNodes.find((candidate) => candidate.id === categoryPathId || candidate.slug === slug)
            || findTaxonomyNodeById(nodes, categoryPathId);
        if (!node) break;
        if (node.warrantyType && node.warrantyType !== 'none') lastFound = node.warrantyType;
        else if (node.warrantyType === 'none') lastFound = null;
        currentNodes = node.children || [];
    }

    return lastFound;
}

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
                label: typeof item.label === 'string' ? item.label : '',
                estimatedPrice: Number(item.estimatedPrice || 0),
                categoryPath: toStringArray(item.categoryPath),
                serviceName: typeof item.serviceName === 'string' ? item.serviceName : '',
            };
        }) : [],
    };
}

function firstContactValue(methods: ContactMethod[] | undefined, type: ContactMethodType) {
    return methods?.find(method => method.type === type)?.value || '';
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

    const resolveWarranty = useCallback((product: Product) => {
        if (product.warrantyType && product.warrantyType !== 'none') {
            return product.warrantyType;
        }
        if (product.warrantyType === 'none') return 'none';

        return resolveTaxonomyWarranty(config?.taxonomy?.retail || [], getProductCategoryPathIds(product)) || 'none';
    }, [config?.taxonomy?.retail]);

    // Products
    const [products, setProducts] = useState<PosProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');

    // Cart
    const [cart, setCart] = useState<CartItem[]>([]);
    const [customerId, setCustomerId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerZalo, setCustomerZalo] = useState('');
    const [customerFacebook, setCustomerFacebook] = useState('');
    const [customerOtherContact, setCustomerOtherContact] = useState('');
    const [customerPrimaryContactType, setCustomerPrimaryContactType] = useState<ContactMethodType>('phone');
    const [customerDebt, setCustomerDebt] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [depositPaymentMethod, setDepositPaymentMethod] = useState('cash');
    const [discount, setDiscount] = useState(0);
    const [deposit, setDeposit] = useState(0);
    const [shippingFee, setShippingFee] = useState(0);
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
            || (showReceipt && lastOrder?.payment_method === 'BANK');
        if (needsBankConfig) void loadBankConfig();
    }, [lastOrder?.payment_method, loadBankConfig, paymentMethod, showReceipt]);

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

    useEffect(() => {
        if (chatPrefillApplied.current || searchParams.get('source') !== 'chat') return;
        const handoff = consumeChatWorkflowHandoff(searchParams);
        if (!handoff) return;
        setCustomerId(handoff.customerId || '');
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
        setCustomerZalo(firstContactValue(contactMethods, 'zalo'));
        setCustomerFacebook(firstContactValue(contactMethods, 'facebook'));
        setCustomerOtherContact(firstContactValue(contactMethods, 'other') || String(data.primaryContactValue || ''));
        setCustomerPrimaryContactType((data.primaryContactType as ContactMethodType) || contactMethods.find(method => method.isPrimary)?.type || 'phone');
        setCustomerDebt(Number(data.totalDebt || 0));
    };

    // Lookup repair/order debt by customer id first, then legacy phone fallback.
    const lookupRepairByPhone = async (lookupValue: string) => {
        const rawKeyword = lookupValue.trim();
        const zaloQr = extractZaloQrIdentity(rawKeyword);
        const keyword = zaloQr?.profileUrl || rawKeyword;
        if (!keyword || keyword.length < 3) {
            setLinkedRepairs([]);
            setPayableOrders([]);
            setAutoDiscountAmount(0);
            setDiscountDetails([]);
            setCustomerDebt(0);
            return;
        }
        setRepairLoading(true);
        try {
            const normalizedPhone = zaloQr ? '' : keyword.replace(/[^0-9]/g, '');
            const currentCustomerId = customerId.trim();
            const lookupMatchesCurrentCustomerId = Boolean(currentCustomerId)
                && currentCustomerId.toLowerCase() === keyword.toLowerCase();
            let resolvedCustomerId = '';
            const { doc, getDoc } = await import('firebase/firestore');
            const isSafeDocumentId = (value: string) => Boolean(value)
                && !/[\/\\#?\[\]]/.test(value)
                && value.length <= 120;

            const docCandidates = Array.from(new Set([
                lookupMatchesCurrentCustomerId ? currentCustomerId : '',
                normalizedPhone,
                keyword,
                zaloQr?.externalId,
            ].filter((value): value is string => Boolean(value))))
                .filter(isSafeDocumentId);
            for (const candidate of docCandidates) {
                const custSnap = await getDoc(doc(db, 'customers', candidate));
                if (!custSnap.exists()) continue;
                resolvedCustomerId = custSnap.id;
                applyCustomerSnapshot(custSnap.id, custSnap.data());
                break;
            }

            if (!resolvedCustomerId && keyword.length >= 3) {
                const searchKeywords = Array.from(new Set([
                    keyword.toLowerCase(),
                    zaloQr?.externalId?.toLowerCase(),
                    generateSearchKeywords(keyword)[0] || keyword.toLowerCase(),
                ].filter(Boolean)));
                for (const searchKeyword of searchKeywords) {
                    const customerSnap = await getDocs(query(collection(db, 'customers'), where('searchKeywords', 'array-contains', searchKeyword), limit(1)));
                    const found = customerSnap.docs[0];
                    if (!found) continue;
                    resolvedCustomerId = found.id;
                    applyCustomerSnapshot(found.id, found.data());
                    break;
                }
            }

            if (!resolvedCustomerId) {
                setCustomerId('');
                setCustomerDebt(0);
            }

            const repairDocs = new Map<string, Record<string, unknown> & { id: string }>();
            const orderDocs = new Map<string, Record<string, unknown> & { id: string }>();
            const queryPairs: Promise<void>[] = [];
            const addRepairsFromSnap = async (repairQuery: ReturnType<typeof query>) => {
                const snap = await getDocs(repairQuery);
                snap.docs.forEach(d => {
                    const data = d.data() as Record<string, unknown>;
                    repairDocs.set(d.id, { id: d.id, ...data });
                });
            };
            const addOrdersFromSnap = async (ordersQuery: ReturnType<typeof query>) => {
                const ordersSnap = await getDocs(ordersQuery);
                ordersSnap.docs.forEach(d => {
                    const data = d.data() as Record<string, unknown>;
                    orderDocs.set(d.id, { id: d.id, ...data });
                });
            };

            if (resolvedCustomerId) {
                queryPairs.push(addRepairsFromSnap(query(collection(db, 'repairs'), where('customer.id', '==', resolvedCustomerId), fbOrderBy('createdAt', 'desc'), limit(20))));
                queryPairs.push(addOrdersFromSnap(query(collection(db, 'orders'), where('customer_info.customerId', '==', resolvedCustomerId), limit(20))));
            }
            if (normalizedPhone) {
                queryPairs.push(addRepairsFromSnap(query(collection(db, 'repairs'), where('customer.phone', '==', keyword), fbOrderBy('createdAt', 'desc'), limit(20))));
                queryPairs.push(addOrdersFromSnap(query(collection(db, 'orders'), where('customer_info.phone', '==', keyword), limit(20))));
            }
            await Promise.all(queryPairs);

            const repairs = Array.from(repairDocs.values())
                .filter(d => {
                    const payment = (d.payment || {}) as Record<string, unknown>;
                    const ps = payment.status;
                    return !ps || ps === 'unpaid' || ps === 'partial';
                })
                .sort((a, b) => {
                    const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
                    const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
                    return tb - ta;
                })
                .map(d => mapRepairTicketInfo(d.id, d, normalizedPhone || keyword));
            setLinkedRepairs(repairs);
            const firstRepair = repairs[0];
            if (!resolvedCustomerId && firstRepair) {
                if (firstRepair.customerName) setCustomerName(firstRepair.customerName);
                if (firstRepair.customerPhone) setCustomerPhone(firstRepair.customerPhone);
            }
            const orders = Array.from(orderDocs.values())
                .sort((a, b) => {
                    const ta = (a.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
                    const tb = (b.createdAt as { toMillis?: () => number })?.toMillis?.() || 0;
                    return tb - ta;
                })
                .map(orderDoc => mapPayableOrderInfo(orderDoc.id, orderDoc))
                .filter((order): order is PayableOrderInfo => Boolean(order));
            setPayableOrders(orders);
        } catch (err) {
            console.error('Repair/Customer lookup failed:', err);
        }
        setRepairLoading(false);
    };

    // Auto-calculate discount when cart or linked repair changes
    useEffect(() => {
        if (linkedRepairs.length === 0 || cart.length === 0) {
            setAutoDiscountAmount(0);
            setDiscountDetails([]);
            return;
        }
        (async () => {
            try {
                const rules = await fetchActiveDiscountRules();
                if (rules.length === 0) return;

                let allParts: { productName: string; partType?: string; unitPriceAtUse?: number; categoryIds?: string[] }[] = [];
                linkedRepairs.forEach(r => {
                    allParts = [...allParts, ...r.parts];
                });
                const repairContexts = linkedRepairs.map(repair => ({
                    serviceName: repair.serviceName,
                    categoryPath: repair.categoryPath,
                    issues: repair.issues,
                }));

                if (allParts.length === 0 && repairContexts.every(repair =>
                    !repair.serviceName && !repair.categoryPath?.length && (!repair.issues || repair.issues.length === 0)
                )) return;

                const results = calculateAccessoryDiscounts(
                    allParts,
                    cart.map(c => {
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
                setAutoDiscountAmount(totalDisc);
                setDiscountDetails(results);
            } catch { /* rules not configured yet */ }
        })();
    }, [linkedRepairs, cart, products]);

    const searchRef = useRef<HTMLInputElement>(null);

    const filterPosProducts = useCallback((data: PosProduct[], options?: { includeOutOfStock?: boolean }) => {
        return data.filter(p => {
            if (p.status !== PRODUCT_STATUS.ACTIVE || p.isProposed === true) return false;
            if (!options?.includeOutOfStock && !isProductSellable(p)) return false;
            if (isPartCategory(p.category, p.categoryIds)) return true;
            if (p.categoryIds && p.categoryIds.length > 0) {
                return RETAIL_CATEGORY_IDS.includes(p.categoryIds[0]);
            }
            return p.category !== 'Dịch vụ sửa chữa' && p.category !== 'service';
        });
    }, []);

    const mergeProducts = useCallback((nextProducts: PosProduct[], options?: { includeOutOfStock?: boolean }) => {
        const sellableProducts = filterPosProducts(nextProducts, options);
        setProducts(prev => {
            const merged = new Map(prev.map(product => [product.id, product]));
            sellableProducts.forEach(product => merged.set(product.id, product));
            return Array.from(merged.values());
        });
    }, [filterPosProducts]);

    const loadDefaultProducts = useCallback(async () => {
        const snap = await getDocs(query(
            collection(db, 'products'),
            fbOrderBy('createdAt', 'desc'),
            limit(POS_DEFAULT_PRODUCT_LIMIT),
        ));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PosProduct));
        setProducts(filterPosProducts(data));
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
        const normalizedSearch = searchQuery.trim();
        if (normalizedSearch.length === 0) return;
        if (normalizedSearch.length < 2) return;

        const timeoutId = window.setTimeout(async () => {
            try {
                const normalizedQuery = normalizedSearch.toLowerCase();
                const keyword = generateSearchKeywords(normalizedSearch)[0] || normalizedSearch.toLowerCase();
                const keywordSnap = await getDocs(query(
                    collection(db, 'products'),
                    where('searchKeywords', 'array-contains', keyword),
                    limit(POS_SEARCH_PRODUCT_LIMIT),
                ));

                const fallbackSnap = await getDocs(query(
                    collection(db, 'products'),
                    fbOrderBy('createdAt', 'desc'),
                    limit(POS_SEARCH_PRODUCT_LIMIT),
                ));

                const candidates = new Map<string, PosProduct>();
                keywordSnap.docs.forEach(d => candidates.set(d.id, { id: d.id, ...d.data() } as PosProduct));
                fallbackSnap.docs.forEach(d => {
                    const product = { id: d.id, ...d.data() } as PosProduct;
                    const searchKeywords = (product as { searchKeywords?: unknown }).searchKeywords;
                    const haystack = [
                        product.name,
                        product.id,
                        productCodeSearchText(product),
                        ...(Array.isArray(searchKeywords) ? searchKeywords : []),
                    ].join(' ').toLowerCase();
                    if (haystack.includes(normalizedQuery)) {
                        candidates.set(product.id, product);
                    }
                });

                mergeProducts(Array.from(candidates.values()), { includeOutOfStock: true });
            } catch (err) {
                console.error('Failed to search POS products:', err);
            }
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [loadDefaultProducts, mergeProducts, searchQuery]);

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

        const laborCost = repair.paymentLaborCost > 0
            ? repair.paymentLaborCost
            : Math.max(0, (repair.issues || []).reduce((sum, i) => sum + (Number(i.estimatedPrice) || 0), 0));

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

    const updatePrice = async (cartItemId: string, newPrice: number) => {
        const item = cart.find(c => c.cartItemId === cartItemId);
        if (item?.isRepairTicket || item?.isOrderPayment) return;
        if (item && (item.costPrice || 0) > 0 && newPrice < (item.costPrice || 0) && newPrice > 0) {
            if (!await appConfirm(`Giá bán (${newPrice.toLocaleString('vi-VN')}đ) thấp hơn giá vốn (${(item.costPrice || 0).toLocaleString('vi-VN')}đ). Bạn sẽ lỗ ${((item.costPrice || 0) - newPrice).toLocaleString('vi-VN')}đ/sp. Tiếp tục?`, { title: 'Xác nhận bán dưới giá vốn', confirmText: 'Tiếp tục', destructive: true })) {
                return;
            }
        }
        setCart(prev =>
            prev.map(c => c.cartItemId === cartItemId ? { ...c, sellingPrice: newPrice } : c)
        );
    };

    const removeFromCart = (cartItemId: string) => {
        setCart(prev => prev.filter(c => c.cartItemId !== cartItemId));
    };

    const subtotal = cart.reduce((sum, c) => sum + c.sellingPrice * c.quantity, 0);
    const orderPaymentSubtotal = cart
        .filter(c => c.isOrderPayment)
        .reduce((sum, c) => sum + c.sellingPrice * c.quantity, 0);
    const discountableSubtotal = Math.max(0, subtotal - orderPaymentSubtotal);
    const effectiveDiscount = Math.min(discount, discountableSubtotal);

    // Calculate voucher discount automatically based on subtotal
    const voucherDiscountAmount = appliedVoucher ? (
        appliedVoucher.type === 'fixed'
            ? Math.min(appliedVoucher.value, Math.max(0, discountableSubtotal - effectiveDiscount))
            : Math.min(Math.round(discountableSubtotal * appliedVoucher.value / 100), appliedVoucher.maxDiscount || Infinity, Math.max(0, discountableSubtotal - effectiveDiscount))
    ) : 0;

    const total = Math.max(0, subtotal - effectiveDiscount - voucherDiscountAmount + (shippingFee || 0));

    const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';
    const activeCashierShift = cashierShift?.status === 'open' ? cashierShift : null;
    const currentCashAmount = activeCashierShift
        ? activeCashierShift.openingCashAmount + activeCashierShift.cashSalesAmount
        : openingCashAmount;
    const currentBankAmount = activeCashierShift
        ? activeCashierShift.openingBankAmount + activeCashierShift.bankSalesAmount
        : openingBankAmount;
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

    // Auto-switch between debt and immediate payment based on the amount entered.
    useEffect(() => {
        if (deposit > 0 && deposit < total && paymentMethod !== 'debt') {
            if (['cash', 'bank', 'momo'].includes(paymentMethod)) {
                setDepositPaymentMethod(paymentMethod);
            }
            setPaymentMethod('debt');
            toastWarning('Số tiền khách trả nhỏ hơn tổng tiền. Hệ thống tự động chuyển sang hình thức Ghi nợ.');
        }
        if (deposit >= total && paymentMethod === 'debt') {
            setPaymentMethod(depositPaymentMethod);
        }
    }, [deposit, total, paymentMethod, depositPaymentMethod]);

    // ── Checkout ──
    const handleCheckout = async () => {
        if (cart.length === 0) return;

        const receivedPaymentMethod = paymentMethod === 'debt' && deposit > 0
            ? depositPaymentMethod
            : paymentMethod;
        const requiresCashierShift = ['cash', 'bank', 'momo'].includes(receivedPaymentMethod)
            && total > 0;
        if (requiresCashierShift && !activeCashierShift) {
            setPosTab('cashier');
            toastError('Chưa mở ca thu ngân. Vui lòng mở ca ở tab Thu ngân trước khi thanh toán tiền mặt, chuyển khoản hoặc ví.');
            return;
        }

        // Validation for debt/partial payments
        const isDebtPayment = paymentMethod === 'debt' || (deposit > 0 && deposit < total);
        if (isDebtPayment) {
            const phoneClean = customerPhone.trim();
            const hasDebtContact = Boolean(customerId.trim() || phoneClean || customerZalo.trim() || customerFacebook.trim() || customerOtherContact.trim());
            if (!hasDebtContact) {
                toastError('Đơn hàng ghi nợ hoặc thanh toán thiếu bắt buộc phải có Mã KH, SĐT, Zalo, Facebook hoặc liên hệ khác.');
                return;
            }
            const digits = phoneClean.replace(/[^0-9]/g, '');
            if (phoneClean && (digits.length < 9 || digits.length > 11)) {
                toastError('Số điện thoại khách hàng không hợp lệ (yêu cầu từ 9 đến 11 chữ số).');
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
                    zalo: customerZalo.trim(),
                    facebook: customerFacebook.trim(),
                    otherContact: customerOtherContact.trim(),
                    primaryContactType: customerPrimaryContactType,
                },
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
                shipping_fee: shippingFee,
                deposit_amount: deposit,
                deposit_payment_method: paymentMethod === 'debt' && deposit > 0
                    ? (depositPaymentMethod === 'cash' ? 'CASH' : depositPaymentMethod === 'bank' ? 'BANK' : 'MOMO')
                    : undefined,
                use_surplus_to_pay_debt: useSurplusToPayDebt,
                payment_method: paymentMethod === 'cash' ? 'CASH' : paymentMethod === 'bank' ? 'BANK' : paymentMethod === 'installment' ? 'INSTALLMENT' : paymentMethod === 'debt' ? 'DEBT' : 'MOMO',
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
                setLastOrder({ id: data.orderId, ...orderData, createdAt: new Date() });
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
            setCustomerDebt(0);
            setLinkedRepairs([]);
            setDiscount(0);
            setDeposit(0);
            setDepositPaymentMethod('cash');
            setUseSurplusToPayDebt(false);
            setShippingFee(0);
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

    const cartSection = (
        <PosCartPanel
            cart={cart}
            setCart={setCart}
            products={products}
            customerId={customerId}
            setCustomerId={setCustomerId}
            customerName={customerName}
            setCustomerName={setCustomerName}
            customerPhone={customerPhone}
            setCustomerPhone={setCustomerPhone}
            customerZalo={customerZalo}
            setCustomerZalo={setCustomerZalo}
            customerFacebook={customerFacebook}
            setCustomerFacebook={setCustomerFacebook}
            customerOtherContact={customerOtherContact}
            setCustomerOtherContact={setCustomerOtherContact}
            customerPrimaryContactType={customerPrimaryContactType}
            setCustomerPrimaryContactType={setCustomerPrimaryContactType}
            customerDebt={customerDebt}
            repairLoading={repairLoading}
            linkedRepairs={linkedRepairs}
            payableOrders={payableOrders}
            discountDetails={discountDetails}
            autoDiscountAmount={autoDiscountAmount}
            setDiscount={setDiscount}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            depositPaymentMethod={depositPaymentMethod}
            setDepositPaymentMethod={setDepositPaymentMethod}
            discount={effectiveDiscount}
            voucherCode={voucherCode}
            setVoucherCode={setVoucherCode}
            voucherStatus={voucherStatus}
            appliedVoucher={appliedVoucher}
            setAppliedVoucher={setAppliedVoucher}
            setVoucherStatus={setVoucherStatus}
            voucherDiscountAmount={voucherDiscountAmount}
            deposit={deposit}
            setDeposit={setDeposit}
            useSurplusToPayDebt={useSurplusToPayDebt}
            setUseSurplusToPayDebt={setUseSurplusToPayDebt}
            subtotal={subtotal}
            total={total}
            isProcessing={isProcessing}
            cashierShiftOpen={Boolean(activeCashierShift)}
            onCloseMobileCart={() => setShowMobileCart(false)}
            onLookupRepairByPhone={lookupRepairByPhone}
            onAddRepairToCart={addRepairToCart}
            onAddPayableOrderToCart={addPayableOrderToCart}
            onApplyVoucher={handleApplyVoucher}
            onUpdateQuantity={updateQuantity}
            onUpdatePrice={updatePrice}
            onRemoveFromCart={removeFromCart}
            onCheckout={handleCheckout}
            formatPrice={formatPrice}
        />
    );

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
                                        Đầu ca {formatPrice(activeCashierShift.openingCashAmount)} + POS {formatPrice(activeCashierShift.cashSalesAmount)}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3">
                                    <div className="text-xs font-bold uppercase tracking-wide text-blue-600">Chuyển khoản trong ca</div>
                                    <div className="mt-1 text-2xl font-black text-blue-900">{formatPrice(currentBankAmount)}</div>
                                    <div className="mt-2 text-xs font-medium text-blue-600">
                                        Đầu ca {formatPrice(activeCashierShift.openingBankAmount)} + POS {formatPrice(activeCashierShift.bankSalesAmount)}
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
        <div className="min-h-[calc(100vh-220px)] md:h-[calc(100vh-80px)] flex gap-4 p-4">
            {/* ═══ LEFT: Product Grid ═══ */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="mb-4 flex w-full gap-2 rounded-2xl border bg-white p-1 shadow-sm sm:w-fit">
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
                {posTab === 'sales' ? (
                    <>
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
                <div className="md:flex-1 md:overflow-y-auto">
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
                    </>
                ) : cashierSection}
            </div>

            {/* ═══ RIGHT: Cart & Checkout (Desktop) ═══ */}
            {posTab === 'sales' && (
                <div className="hidden md:flex w-[380px] flex-shrink-0 bg-white rounded-2xl border shadow-sm flex-col">
                    {cartSection}
                </div>
            )}

            {/* ═══ Mobile: Sticky Bottom Bar ═══ */}
            {posTab === 'sales' && !showMobileCart && (
                <div className="md:hidden fixed left-0 right-0 bottom-[calc(env(safe-area-inset-bottom)+76px)] bg-white border-t shadow-lg px-4 py-3 z-40">
                    <button onClick={() => setShowMobileCart(true)}
                        className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 flex items-center justify-center gap-2 shadow-lg shadow-orange-200/50 active:scale-[0.98]">
                        <ShoppingCart size={18} />
                        Giỏ hàng ({cart.reduce((s, c) => s + c.quantity, 0)}) — {formatPrice(total)}
                    </button>
                </div>
            )}

            {/* ═══ Mobile: Full-screen Cart Sheet ═══ */}
            {posTab === 'sales' && showMobileCart && (
                <div className="md:hidden fixed inset-0 bg-white z-50 flex flex-col pb-[env(safe-area-inset-bottom)]">
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
                                            <span>{lastOrder.payment_method === 'CASH' ? 'Tiền mặt' : lastOrder.payment_method === 'INSTALLMENT' ? 'Trả góp' : lastOrder.payment_method === 'DEBT' ? 'Ghi nợ' : 'Chuyển khoản/MoMo'}</span>
                                        </div>
                                    </div>
                                    {lastOrder.payment_method === 'BANK' && bankConfig && (
                                        (() => {
                                            const defaultAccs: BankAccountConfig[] = bankConfig.accounts?.filter((account) => account.isDefault) || [];
                                            if (defaultAccs.length === 0 && bankConfig.bankId && bankConfig.accountNo) {
                                                defaultAccs.push({
                                                    bankId: bankConfig.bankId,
                                                    accountNo: bankConfig.accountNo,
                                                    accountName: bankConfig.accountName || '',
                                                });
                                            }
                                            if (defaultAccs.length === 0) return null;
                                            return (
                                                <div className="flex flex-col items-center mt-2 pb-2 border-t border-dashed pt-2">
                                                    <p className="font-bold text-center mb-1">QUÉT MÃ CHUYỂN KHOẢN</p>
                                                    <div className="flex flex-wrap justify-center gap-2">
                                                        {defaultAccs.map((acc, idx) => (
                                                            <div key={idx} className="flex flex-col items-center">
                                                                <Image
                                                                    src={`https://img.vietqr.io/image/${acc.bankId}-${acc.accountNo}-compact2.png?amount=${Math.max(0, lastOrder.total_amount - lastOrder.deposit_amount)}&addInfo=${lastOrder.id.slice(-6)}&accountName=${encodeURIComponent(acc.accountName || '')}`}
                                                                    alt="VietQR"
                                                                    width={128}
                                                                    height={128}
                                                                    unoptimized
                                                                    className="w-32 h-32 object-contain mx-auto"
                                                                />
                                                                <span className="text-[9px] mt-1 text-gray-600">{acc.bankId}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()
                                    )}
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
                                                <div class="summary-row bold" style="font-size: 16px; margin-top: 5px; border-top: 1px dotted #ccc; padding-top: 5px;">
                                                    <span>Tổng thanh toán:</span><span>${lastOrder.total_amount.toLocaleString('vi-VN')} đ</span>
                                                </div>
                                                ${lastOrder.deposit_amount > 0 ? `<div class="summary-row" style="margin-top: 5px;"><span>Đã thanh toán (cọc):</span><span>${lastOrder.deposit_amount.toLocaleString('vi-VN')} đ</span></div>
                                                <div class="summary-row bold" style="color: red; font-size: 16px;"><span>CÒN LẠI:</span><span>${Math.max(0, lastOrder.total_amount - lastOrder.deposit_amount).toLocaleString('vi-VN')} đ</span></div>` : ''}
                                            </div>

                                            <p style="text-align: right; font-style: italic; margin-top: 10px;">Hình thức TT: ${lastOrder.payment_method === 'CASH' ? 'Tiền mặt' : lastOrder.payment_method === 'INSTALLMENT' ? 'Trả góp' : lastOrder.payment_method === 'DEBT' ? 'Ghi nợ' : 'Chuyển khoản / Momo'}</p>

                                            <div class="signatures" style="display: flex; justify-content: space-between; margin-top: 30px;">
                                                <div style="flex: 1; text-align: center;">
                                                    ${lastOrder.payment_method === 'BANK' && bankConfig ? (() => {
                                            const defaultAccs: BankAccountConfig[] = bankConfig.accounts?.filter((account) => account.isDefault) || [];
                                            if (defaultAccs.length === 0 && bankConfig.bankId && bankConfig.accountNo) {
                                                defaultAccs.push({
                                                    bankId: bankConfig.bankId,
                                                    accountNo: bankConfig.accountNo,
                                                    accountName: bankConfig.accountName || '',
                                                });
                                            }
                                            if (defaultAccs.length === 0) return '';
                                            return `
                                                            <p style="font-weight: bold; margin-bottom: 5px;">QUÉT MÃ CHUYỂN KHOẢN</p>
                                                            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                                                                ${defaultAccs.map((acc) => `
                                                                    <div style="text-align: center;">
                                                                        <img src="https://img.vietqr.io/image/${acc.bankId}-${acc.accountNo}-compact2.png?amount=${Math.max(0, lastOrder.total_amount - lastOrder.deposit_amount)}&addInfo=${lastOrder.id.slice(-6)}&accountName=${encodeURIComponent(acc.accountName || '')}" style="width: 140px; height: 140px; object-fit: contain; border: 1px solid #ccc; border-radius: 8px; padding: 5px;" />
                                                                        <div style="font-size: 11px; color: #555; margin-top: 2px;">${acc.bankId}</div>
                                                                    </div>
                                                                `).join('')}
                                                            </div>
                                                        `;
                                        })() : ''}
                                                </div>
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
    );
}
