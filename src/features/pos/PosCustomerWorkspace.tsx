import { useEffect, useRef, useState } from 'react';
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import { AlertTriangle, Camera, ChevronDown, MessageCircle, Phone, Receipt, Search, Square, User, Wrench } from 'lucide-react';
import type { ContactMethodType } from '@/lib/types/contact';
import { extractZaloQrIdentity } from '@/lib/zaloContactCardImport';
import { normalizeVietnamPhone } from '@/lib/phone';
import type { PosCustomerIdentityMode, PosCustomerSearchMatch } from '@/lib/posCustomerIdentity';
import { RepairShippingPanel } from './RepairShippingPanel';
import type { CartItem, PayableOrderInfo, RepairShippingDraft, RepairTicketInfo } from './posTypes';

type PosCustomerContactType = Extract<ContactMethodType, 'phone' | 'zalo' | 'facebook' | 'other'>;

const customerContactOptions: Array<{ type: PosCustomerContactType; label: string }> = [
    { type: 'phone', label: 'SĐT' },
    { type: 'zalo', label: 'Zalo' },
    { type: 'facebook', label: 'Facebook' },
    { type: 'other', label: 'Liên hệ khác' },
];

interface PosCustomerWorkspaceProps {
    cart: CartItem[];
    customerId: string;
    setCustomerId: (value: string) => void;
    customerName: string;
    setCustomerName: (value: string) => void;
    customerPhone: string;
    setCustomerPhone: (value: string) => void;
    customerAddress?: string;
    setCustomerAddress?: (value: string) => void;
    customerZalo: string;
    setCustomerZalo: (value: string) => void;
    customerFacebook: string;
    setCustomerFacebook: (value: string) => void;
    customerOtherContact: string;
    setCustomerOtherContact: (value: string) => void;
    customerPrimaryContactType: ContactMethodType;
    setCustomerPrimaryContactType: (value: ContactMethodType) => void;
    customerIdentityMode: PosCustomerIdentityMode;
    customerMatches: PosCustomerSearchMatch[];
    onSelectCustomer: (customerId: string) => void;
    onClearCustomerSelection: () => void;
    onPhoneChanged: (value: string) => void;
    onPhoneVerified: (phone: string, token: string) => void;
    onZaloContactChanged: (value: string) => void;
    customerDebt: number;
    repairLoading: boolean;
    linkedRepairs: RepairTicketInfo[];
    shippingRepair: RepairTicketInfo | null;
    repairShipping: RepairShippingDraft | null;
    onRepairShippingChange: (value: RepairShippingDraft | null) => void;
    payableOrders: PayableOrderInfo[];
    onLookupCustomer: (value: string) => void;
    onAddRepairToCart: (repair: RepairTicketInfo) => void;
    onAddPayableOrderToCart: (order: PayableOrderInfo) => void;
    formatPrice: (value: number) => string;
}

export function PosCustomerWorkspace({
    cart,
    customerId,
    setCustomerId,
    customerName,
    setCustomerName,
    customerPhone,
    setCustomerPhone,
    customerAddress = '',
    setCustomerAddress,
    customerZalo,
    setCustomerZalo,
    customerFacebook,
    setCustomerFacebook,
    customerOtherContact,
    setCustomerOtherContact,
    customerPrimaryContactType,
    setCustomerPrimaryContactType,
    customerIdentityMode,
    customerMatches,
    onSelectCustomer,
    onClearCustomerSelection,
    onPhoneChanged,
    onPhoneVerified,
    onZaloContactChanged,
    customerDebt,
    repairLoading,
    linkedRepairs,
    shippingRepair,
    repairShipping,
    onRepairShippingChange,
    payableOrders,
    onLookupCustomer,
    onAddRepairToCart,
    onAddPayableOrderToCart,
    formatPrice,
}: PosCustomerWorkspaceProps) {
    const [customerLookupQuery, setCustomerLookupQuery] = useState('');
    const [showExtraContacts, setShowExtraContacts] = useState(false);
    const [showRepairActions, setShowRepairActions] = useState(true);
    const [showDebtActions, setShowDebtActions] = useState(false);
    const [customerQrScanning, setCustomerQrScanning] = useState(false);
    const [phoneVerificationStep, setPhoneVerificationStep] = useState<'idle' | 'otp'>('idle');
    const [phoneVerificationCode, setPhoneVerificationCode] = useState('');
    const [phoneVerificationError, setPhoneVerificationError] = useState('');
    const [phoneVerificationLoading, setPhoneVerificationLoading] = useState(false);
    const customerQrVideoRef = useRef<HTMLVideoElement>(null);
    const customerQrControlsRef = useRef<{ stop: () => void } | null>(null);
    const phoneConfirmationRef = useRef<ConfirmationResult | null>(null);
    const phoneRecaptchaRef = useRef<RecaptchaVerifier | null>(null);

    const contactValues: Record<PosCustomerContactType, string> = {
        phone: customerPhone,
        zalo: customerZalo,
        facebook: customerFacebook,
        other: customerOtherContact,
    };
    const primaryContactOption = customerContactOptions.find(option => option.type === customerPrimaryContactType)
        ?? customerContactOptions[0];
    const primaryContactValue = contactValues[primaryContactOption.type].trim();
    const hasCustomer = Boolean(customerId.trim() || customerName.trim() || primaryContactValue);
    const isExistingCustomer = customerIdentityMode === 'existing';
    const isPhoneVerified = customerIdentityMode === 'verified_phone';
    const isZaloContact = customerIdentityMode === 'zalo_contact';
    const identityLabel = isExistingCustomer
        ? 'Hồ sơ đã chọn'
        : isPhoneVerified
            ? 'SĐT đã xác minh'
            : isZaloContact
                ? 'Danh thiếp Zalo'
                : 'Khách lẻ';

    const runCustomerLookup = (rawValue = customerLookupQuery) => {
        const value = rawValue.trim();
        if (value) onLookupCustomer(value);
    };
    const clearPhoneRecaptcha = () => {
        try { phoneRecaptchaRef.current?.clear(); } catch {}
        phoneRecaptchaRef.current = null;
    };
    const applyZaloContactValue = (value: string) => {
        setCustomerZalo(value);
        onZaloContactChanged(value);
        setCustomerPrimaryContactType('zalo');
    };
    const sendPhoneVerification = async () => {
        const normalizedPhone = normalizeVietnamPhone(customerPhone);
        if (!normalizedPhone) {
            setPhoneVerificationError('Nhập SĐT Việt Nam hợp lệ trước khi xác minh.');
            return;
        }

        setPhoneVerificationLoading(true);
        setPhoneVerificationError('');
        try {
            const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
            const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
            const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
            const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
            if (!apiKey || !authDomain || !projectId || !appId) {
                throw new Error('Thiếu cấu hình Firebase để xác minh SĐT.');
            }
            const config = { apiKey, authDomain, projectId, appId };

            const [{ getApps, initializeApp }, { getAuth, RecaptchaVerifier, signInWithPhoneNumber }] = await Promise.all([
                import('firebase/app'),
                import('firebase/auth'),
            ]);
            const appName = 'pos-phone-verification';
            const verificationApp = getApps().find(app => app.name === appName)
                || initializeApp(config, appName);
            const auth = getAuth(verificationApp);
            const container = document.getElementById('pos-phone-verification-recaptcha');
            if (!container) throw new Error('Không thể khởi tạo xác minh SĐT.');

            clearPhoneRecaptcha();
            container.innerHTML = '';
            const verifier = new RecaptchaVerifier(auth, container, {
                size: 'normal',
                'expired-callback': () => setPhoneVerificationError('reCAPTCHA đã hết hạn. Vui lòng xác minh lại.'),
            });
            phoneRecaptchaRef.current = verifier;
            phoneConfirmationRef.current = await signInWithPhoneNumber(auth, normalizedPhone.e164, verifier);
            setPhoneVerificationCode('');
            setPhoneVerificationStep('otp');
        } catch (error) {
            console.error('POS phone verification send error:', error);
            clearPhoneRecaptcha();
            setPhoneVerificationError(error instanceof Error ? error.message : 'Không thể gửi mã OTP. Vui lòng thử lại.');
        } finally {
            setPhoneVerificationLoading(false);
        }
    };
    const confirmPhoneVerification = async () => {
        const confirmation = phoneConfirmationRef.current;
        const normalizedPhone = normalizeVietnamPhone(customerPhone);
        if (!confirmation || !normalizedPhone) {
            setPhoneVerificationError('Phiên xác minh đã hết hạn. Vui lòng gửi lại mã OTP.');
            return;
        }
        if (!/^\d{6}$/.test(phoneVerificationCode)) {
            setPhoneVerificationError('Mã OTP phải gồm 6 chữ số.');
            return;
        }

        setPhoneVerificationLoading(true);
        setPhoneVerificationError('');
        try {
            const credential = await confirmation.confirm(phoneVerificationCode);
            const token = await credential.user.getIdToken();
            onPhoneVerified(normalizedPhone.local, token);
            phoneConfirmationRef.current = null;
            clearPhoneRecaptcha();
            setPhoneVerificationStep('idle');
            setPhoneVerificationCode('');
        } catch (error) {
            console.error('POS phone verification confirm error:', error);
            setPhoneVerificationError('Mã OTP không đúng hoặc đã hết hạn. Vui lòng thử lại.');
        } finally {
            setPhoneVerificationLoading(false);
        }
    };
    const stopCustomerQrScanner = () => {
        customerQrControlsRef.current?.stop();
        customerQrControlsRef.current = null;
        setCustomerQrScanning(false);
    };
    const applyCustomerQrText = (rawText: string) => {
        const zalo = extractZaloQrIdentity(rawText);
        const lookupValue = zalo?.profileUrl || rawText.trim();
        if (!lookupValue) return false;
        setCustomerLookupQuery(lookupValue);
        if (zalo) {
            applyZaloContactValue(zalo.profileUrl);
        }
        onLookupCustomer(lookupValue);
        return true;
    };
    const startCustomerQrScanner = async () => {
        if (!customerQrVideoRef.current) return;
        setCustomerQrScanning(true);
        try {
            const { BrowserQRCodeReader } = await import('@zxing/browser');
            const reader = new BrowserQRCodeReader();
            const controls = await reader.decodeFromVideoDevice(
                undefined,
                customerQrVideoRef.current,
                (result) => {
                    if (result && applyCustomerQrText(result.getText())) stopCustomerQrScanner();
                },
            );
            customerQrControlsRef.current = controls;
        } catch (error) {
            console.error('POS customer QR scanner error:', error);
            stopCustomerQrScanner();
        }
    };

    useEffect(() => () => {
        stopCustomerQrScanner();
        clearPhoneRecaptcha();
    }, []);

    const hasRetailProducts = cart.some(item => !item.isRepairTicket && !item.isOrderPayment);
    const shouldShowRepairActions = linkedRepairs.length > 0 || Boolean(shippingRepair) || hasRetailProducts;
    const shouldShowActions = shouldShowRepairActions || payableOrders.length > 0;

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
            {/* ═══ Customer Info & Search (Top - natural height) ═══ */}
            <div className="shrink-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-gray-100 px-2.5 py-1.5 shrink-0 text-xs">
                    <div className="flex items-center gap-1 text-xs font-bold text-gray-900">
                        <User className="text-orange-500" size={14} /> Khách hàng
                    </div>
                    <span className={`max-w-[200px] truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${hasCustomer ? 'bg-orange-50 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                        {hasCustomer ? identityLabel : 'Chưa chọn khách'}
                    </span>
                    {isExistingCustomer && <button type="button" onClick={onClearCustomerSelection} className="text-[11px] font-semibold text-orange-700 underline underline-offset-2 hover:text-orange-900">Bỏ chọn</button>}
                    {customerDebt > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700"><AlertTriangle size={11} /> Nợ {formatPrice(customerDebt)}</span>}
                    {repairLoading && <span className="animate-pulse text-[11px] text-gray-400">Đang tra cứu…</span>}
                </div>

                <div className="flex flex-col gap-1.5 p-1.5 text-xs">
                    <div className="relative w-full">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tra cứu khách cũ: SĐT, tên, mã KH, Zalo"
                            value={customerLookupQuery}
                            onChange={event => setCustomerLookupQuery(event.target.value)}
                            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); runCustomerLookup(); } }}
                            className="w-full rounded-lg border py-1 pl-7 pr-14 text-xs focus:ring-2 focus:ring-orange-500/20"
                        />
                        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => runCustomerLookup()} className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-orange-600" aria-label="Tìm khách" title="Tìm khách"><Search size={13} /></button>
                        <button type="button" onMouseDown={event => event.preventDefault()} onClick={customerQrScanning ? stopCustomerQrScanner : startCustomerQrScanner} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-sky-600" aria-label={customerQrScanning ? 'Dừng quét QR khách' : 'Quét QR khách'} title={customerQrScanning ? 'Dừng quét QR khách' : 'Quét QR khách'}>{customerQrScanning ? <Square size={13} /> : <Camera size={13} />}</button>
                    </div>

                    <div className="grid grid-cols-[1fr_1fr_auto] gap-1 items-center">
                        <div className="relative min-w-0">
                            <User size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" placeholder="Tên người mua (khách lẻ)" value={customerName} readOnly={isExistingCustomer} onChange={event => setCustomerName(event.target.value)} className="w-full rounded-lg border py-1 pl-6 pr-1 text-xs focus:ring-2 focus:ring-orange-500/20 read-only:bg-gray-50" />
                        </div>
                        <div className="relative min-w-0">
                            <Phone size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" placeholder="SĐT" value={customerPhone} readOnly={isExistingCustomer} onChange={event => { const value = event.target.value.replace(/[^0-9]/g, ''); setCustomerPhone(value); onPhoneChanged(value); phoneConfirmationRef.current = null; clearPhoneRecaptcha(); setPhoneVerificationStep('idle'); setPhoneVerificationCode(''); setPhoneVerificationError(''); setCustomerPrimaryContactType('phone'); }} className="w-full rounded-lg border py-1 pl-6 pr-1 text-xs focus:ring-2 focus:ring-orange-500/20 read-only:bg-gray-50" />
                        </div>
                        <button type="button" onClick={() => setShowExtraContacts(previous => !previous)} className="inline-flex items-center justify-center gap-0.5 rounded-lg bg-gray-50 px-1.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:text-orange-600">
                            Khác <ChevronDown size={12} className={`transition-transform ${showExtraContacts ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                {customerMatches.length > 0 && <div className="border-t border-gray-100 bg-slate-50 px-2 py-1.5">
                    <p className="mb-1 text-[11px] font-semibold text-slate-600">Kết quả chỉ để đối chiếu — bấm chọn đúng khách.</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                        {customerMatches.map(match => <button key={match.id} type="button" onClick={() => onSelectCustomer(match.id)} className="flex min-w-0 items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-left text-xs hover:border-orange-300 hover:bg-orange-50">
                            <span className="min-w-0"><strong className="block truncate text-slate-900">{match.name || 'Chưa có tên'}</strong><span className="block truncate text-slate-500">{match.primaryContactLabel || match.phone || `Mã ${match.id}`}</span></span>
                            {match.totalDebt > 0 && <span className="shrink-0 font-semibold text-red-600">Nợ {formatPrice(match.totalDebt)}</span>}
                        </button>)}
                    </div>
                </div>}

                {!isExistingCustomer && <div className={`border-t px-2 py-1 text-xs ${isPhoneVerified ? 'border-emerald-100 bg-emerald-50/60' : isZaloContact ? 'border-sky-100 bg-sky-50/60' : 'border-amber-100 bg-amber-50/60'}`}>
                    {isPhoneVerified ? <p className="font-semibold text-emerald-700 text-[11px]">SĐT đã xác minh bằng OTP.</p> : isZaloContact ? <p className="font-semibold text-sky-700 text-[11px]">Đã nhận diện danh thiếp Zalo.</p> : <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]"><p className="text-amber-800">xác minh SĐT bằng OTP.</p><button type="button" onClick={sendPhoneVerification} disabled={phoneVerificationLoading || !customerPhone.trim()} className="rounded-md border border-amber-300 bg-white px-1.5 py-0.5 font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-50">{phoneVerificationLoading ? 'Đang gửi…' : 'Xác minh SĐT'}</button></div>}
                    {!isPhoneVerified && !isZaloContact && phoneVerificationStep === 'otp' && <div className="mt-1 flex flex-wrap items-start gap-1">
                        <input type="text" inputMode="numeric" maxLength={6} value={phoneVerificationCode} onChange={event => setPhoneVerificationCode(event.target.value.replace(/\D/g, ''))} placeholder="Mã OTP 6 số" className="w-28 rounded-md border bg-white px-1.5 py-1 text-xs" />
                        <button type="button" onClick={confirmPhoneVerification} disabled={phoneVerificationLoading} className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50">Xác nhận</button>
                        <button type="button" onClick={sendPhoneVerification} disabled={phoneVerificationLoading} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50">Gửi lại</button>
                    </div>}
                    {!isPhoneVerified && !isZaloContact && <div id="pos-phone-verification-recaptcha" className={phoneVerificationStep === 'otp' ? 'mt-1' : ''} />}
                    {phoneVerificationError && <p className="mt-1 font-medium text-red-600 text-[11px]">{phoneVerificationError}</p>}
                </div>}

                <video ref={customerQrVideoRef} muted playsInline className={`mx-2 mb-2 w-[min(440px,calc(100%-1rem))] rounded-lg border border-sky-200 bg-black ${customerQrScanning ? 'block' : 'hidden'}`} />
                {showExtraContacts && (
                    <div className="grid gap-1.5 border-t border-gray-100 bg-gray-50/70 p-1.5 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                        <div className="relative"><MessageCircle size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Danh thiếp Zalo" value={customerZalo} readOnly={isExistingCustomer} onChange={event => applyZaloContactValue(event.target.value)} className="w-full rounded-lg border bg-white py-1 pl-7 pr-1.5 text-xs read-only:bg-gray-100" /></div>
                        <div className="relative"><MessageCircle size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Facebook" value={customerFacebook} readOnly={isExistingCustomer} onChange={event => { setCustomerFacebook(event.target.value); if (!customerPhone.trim() && !customerZalo.trim()) setCustomerPrimaryContactType('facebook'); }} className="w-full rounded-lg border bg-white py-1 pl-7 pr-1.5 text-xs read-only:bg-gray-100" /></div>
                        <input type="text" placeholder="Mã KH" value={customerId} readOnly={isExistingCustomer} onChange={event => setCustomerId(event.target.value)} onBlur={() => { if (!isExistingCustomer && customerId.trim()) runCustomerLookup(customerId); }} className="w-full rounded-lg border bg-white px-2 py-1 text-xs read-only:bg-gray-100" />
                        <input type="text" placeholder="Liên hệ khác" value={customerOtherContact} readOnly={isExistingCustomer} onChange={event => { setCustomerOtherContact(event.target.value); if (!customerPhone.trim() && !customerZalo.trim() && !customerFacebook.trim()) setCustomerPrimaryContactType('other'); }} className="w-full rounded-lg border bg-white px-2 py-1 text-xs read-only:bg-gray-100" />
                    </div>
                )}
            </div>

            {/* ═══ Sửa chữa & Giao hàng (Immediately below Customer Info) ═══ */}
            <div className="flex-1 min-h-0 overflow-y-auto border-t border-gray-100 bg-gray-50/70 p-1.5 space-y-1.5">
                <div className="rounded-lg border border-blue-100 bg-white p-1.5">
                    <button type="button" onClick={() => setShowRepairActions(previous => !previous)} className="flex w-full items-center justify-between gap-2 text-left text-xs font-bold text-blue-800">
                        <span className="flex items-center gap-1.5"><Wrench size={14} /> Sửa chữa & Giao hàng {linkedRepairs.length > 0 ? `(${linkedRepairs.length})` : ''}</span>
                        <ChevronDown size={14} className={`transition-transform ${showRepairActions ? 'rotate-180' : ''}`} />
                    </button>
                    {showRepairActions && (
                        <div className="mt-1.5 space-y-1.5">
                            {linkedRepairs.length > 0 && <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                                {linkedRepairs.map(repair => {
                                    const isInCart = cart.some(item => item.repairTicketId === repair.id);
                                    return <div key={repair.id} className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50/40 px-2 py-1 text-xs"><div className="min-w-0 flex-1"><p className="truncate font-bold text-blue-800">Phiếu #{repair.id.slice(-6)} · {repair.deviceModel || 'Thiết bị sửa chữa'}</p><p className="text-blue-600 text-[11px]">Cần thu {formatPrice(repair.paymentAmount)}</p></div><button type="button" onClick={() => { onAddRepairToCart(repair); setShowRepairActions(true); }} disabled={isInCart} className="shrink-0 rounded-md bg-blue-600 px-2 py-0.5 font-bold text-white text-xs disabled:bg-blue-200">{isInCart ? 'Đã chọn' : 'Thanh toán'}</button></div>;
                                })}
                            </div>}
                            <RepairShippingPanel
                                repair={shippingRepair}
                                value={repairShipping}
                                onChange={onRepairShippingChange}
                                formatPrice={formatPrice}
                                hasRetailProducts={hasRetailProducts}
                                customerName={customerName}
                                customerPhone={customerPhone}
                                customerAddress={customerAddress}
                                customerId={customerId}
                            />
                        </div>
                    )}
                </div>

                {payableOrders.length > 0 && (
                    <div className="rounded-lg border border-amber-100 bg-white p-1.5">
                        <button type="button" onClick={() => setShowDebtActions(previous => !previous)} className="flex w-full items-center justify-between gap-2 text-left text-xs font-bold text-amber-800">
                            <span className="flex items-center gap-1.5"><Receipt size={14} /> Công nợ cần thu ({payableOrders.length})</span>
                            <ChevronDown size={14} className={`transition-transform ${showDebtActions ? 'rotate-180' : ''}`} />
                        </button>
                        {showDebtActions && <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto pr-1">
                            {payableOrders.map(order => {
                                const isInCart = cart.some(item => item.orderPaymentId === order.id);
                                const title = order.isShippingAdvance ? 'Ship ứng hộ' : `Đơn #${order.id.slice(-6)}`;
                                const detail = order.isShippingAdvance ? `Thu hồi ship phiếu #${order.shippingAdvanceRepairTicketId?.slice(-6) || '—'}` : `${order.status} · ${order.createdAtLabel}`;
                                return <div key={order.id} className="flex items-center gap-2 rounded-md border border-amber-100 bg-amber-50/40 px-2 py-1 text-xs"><div className="min-w-0 flex-1"><p className="truncate font-bold text-amber-900">{title}</p><p className="truncate text-amber-700 text-[11px]">{detail} · {formatPrice(order.remainingAmount)}</p></div><button type="button" onClick={() => onAddPayableOrderToCart(order)} disabled={isInCart} className="shrink-0 rounded-md bg-amber-600 px-2 py-0.5 font-bold text-white text-xs disabled:bg-amber-200">{isInCart ? 'Đã chọn' : 'Thu nợ'}</button></div>;
                            })}
                        </div>}
                    </div>
                )}
            </div>
        </section>
    );
}
