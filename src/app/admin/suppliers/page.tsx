'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, orderBy, updateDoc, doc, serverTimestamp, where, limit, setDoc } from 'firebase/firestore';
import { getDocs } from '@/lib/firestoreLogger';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { Building2, Plus, Search, Phone, Mail, MapPin, CreditCard, Edit2, ChevronDown, ChevronUp, ArrowDownToLine, ArrowUpFromLine, X, Filter, Tags, Clock3 } from 'lucide-react';
import { toast } from 'sonner';
import CurrencyInput from '@/components/admin/CurrencyInput';
import type { Supplier, SupplierTransaction } from '@/lib/types';
import { buildContactMethods, buildContactSearchKeywords, getPrimaryContact, hasProfileContact } from '@/lib/contactIdentity';
import type { ContactMethodType } from '@/lib/types/contact';
import { reserveSupplierDocumentId } from '@/lib/supplierDocumentIds';

// ── Format helpers ──
const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';
const fmtDate = (d: unknown) => {
    if (!d) return '';
    const ts = typeof (d as { toDate?: () => Date }).toDate === 'function' ? (d as { toDate: () => Date }).toDate() : new Date(d as string);
    return ts.toLocaleDateString('vi-VN');
};

// ── Supplier Form Modal ──

function firstSupplierContactValue(supplier: Supplier, type: ContactMethodType) {
    return supplier.contactMethods?.find(method => method.type === type)?.value || '';
}

function supplierPrimaryContactLabel(supplier: Supplier) {
    const primary = supplier.contactMethods?.find(method => method.isPrimary) || supplier.contactMethods?.[0];
    return supplier.primaryContactValue || primary?.value || supplier.phone || '';
}

function SupplierModal({ supplier, onClose, onSave }: {
    supplier: Supplier | null;
    onClose: () => void;
    onSave: (data: Partial<Supplier>) => Promise<void>;
}) {
    const [form, setForm] = useState({
        code: supplier?.code || '',
        name: supplier?.name || '',
        phone: supplier?.phone || '',
        primaryContactType: supplier?.primaryContactType || supplier?.contactMethods?.find(method => method.isPrimary)?.type || (supplier?.phone ? 'phone' : 'zalo') as ContactMethodType,
        zalo: firstSupplierContactValue(supplier || {} as Supplier, 'zalo'),
        facebook: firstSupplierContactValue(supplier || {} as Supplier, 'facebook'),
        otherContact: firstSupplierContactValue(supplier || {} as Supplier, 'other'),
        email: supplier?.email || '',
        address: supplier?.address || '',
        taxCode: supplier?.taxCode || '',
        bankAccount: supplier?.bankAccount || '',
        bankName: supplier?.bankName || '',
        contactPerson: supplier?.contactPerson || '',
        companyName: supplier?.companyName || '',
        supplierType: supplier?.supplierType || '',
        website: supplier?.website || '',
        paymentTermsDays: supplier?.paymentTermsDays?.toString() || '',
        assignedOwner: supplier?.assignedOwner || '',
        tags: supplier?.tags?.join(', ') || '',
        note: supplier?.note || '',
    });
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!form.name.trim()) { toast.error('Vui lòng nhập tên NCC'); return; }
        if (form.phone.trim() && !/^0?\d{9,11}$/.test(form.phone.trim().replace(/[^\d]/g, ''))) {
            toast.error('SĐT NCC không hợp lệ'); return;
        }
        const contactInput = {
            name: form.name,
            phone: form.phone,
            zalo: form.zalo,
            facebook: form.facebook,
            email: form.email,
            address: form.address,
            note: form.note,
            other: form.otherContact,
            primaryType: form.primaryContactType,
            source: 'manual' as const,
        };
        const contactMethods = buildContactMethods(contactInput);
        const hasBusinessIdentity = [form.code, form.taxCode, form.bankAccount, form.companyName, form.contactPerson].some(value => Boolean(value.trim()));
        if (!hasProfileContact(contactMethods) && !hasBusinessIdentity) {
            toast.error('Vui lòng nhập ít nhất một kênh liên hệ, mã NCC, MST, tài khoản ngân hàng hoặc người liên hệ');
            return;
        }
        const primaryContact = getPrimaryContact(contactMethods);
        setSaving(true);
        try {
            await onSave({
                ...form,
                phone: form.phone.trim().replace(/[^\d]/g, ''),
                primaryPhone: form.phone.trim().replace(/[^\d]/g, ''),
                primaryContactType: primaryContact?.type || undefined,
                primaryContactValue: primaryContact?.value || '',
                contactMethods,
                searchKeywords: buildContactSearchKeywords(contactInput, contactMethods),
                code: form.code.trim(),
                paymentTermsDays: Number(form.paymentTermsDays) || 0,
                tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
                isActive: true,
            });
            onClose();
        } catch { toast.error('Lỗi khi lưu'); }
        setSaving(false);
    };

    const fields: { key: keyof typeof form; label: string; type?: string }[] = [
        { key: 'code', label: 'Mã NCC' },
        { key: 'name', label: 'Tên nhà cung cấp *' },
        { key: 'companyName', label: 'Tên công ty / pháp nhân' },
        { key: 'supplierType', label: 'Phân loại NCC' },
        { key: 'contactPerson', label: 'Người liên hệ' },
        { key: 'phone', label: 'Số điện thoại' },
        { key: 'zalo', label: 'Zalo' },
        { key: 'facebook', label: 'Facebook/Messenger' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'otherContact', label: 'Liên hệ khác' },
        { key: 'website', label: 'Website' },
        { key: 'address', label: 'Địa chỉ' },
        { key: 'taxCode', label: 'Mã số thuế' },
        { key: 'bankAccount', label: 'Số tài khoản' },
        { key: 'bankName', label: 'Ngân hàng' },
        { key: 'paymentTermsDays', label: 'Hạn thanh toán (ngày)' },
        { key: 'assignedOwner', label: 'Nhân sự phụ trách' },
        { key: 'tags', label: 'Tags (phân cách bằng dấu phẩy)' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b">
                    <h2 className="text-lg font-bold">{supplier ? 'Sửa NCC' : 'Thêm nhà cung cấp'}</h2>
                    <button title="Đóng" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div>
                        <label className="text-sm text-gray-600 mb-1 block">Kênh liên hệ chính</label>
                        <select
                            title="Kênh liên hệ chính"
                            value={form.primaryContactType}
                            onChange={e => setForm(prev => ({ ...prev, primaryContactType: e.target.value as ContactMethodType }))}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white"
                        >
                            <option value="phone">SĐT</option>
                            <option value="zalo">Zalo</option>
                            <option value="facebook">Facebook</option>
                            <option value="email">Email</option>
                            <option value="address">Địa chỉ</option>
                            <option value="other">Khác</option>
                            <option value="note">Ghi chú</option>
                        </select>
                    </div>
                    {fields.map(f => (
                        <div key={f.key}>
                            <label className="text-sm text-gray-600 mb-1 block">{f.label}</label>
                            <input
                                title={f.label}
                                type={f.type || 'text'}
                                value={form[f.key]}
                                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                            />
                        </div>
                    ))}
                    <div>
                        <label className="text-sm text-gray-600 mb-1 block">Ghi chú</label>
                        <textarea
                            title="Ghi chú"
                            value={form.note}
                            onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                            rows={2}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2 p-5 border-t">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
                    <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium">
                        {saving ? 'Đang lưu...' : 'Lưu'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Payment Modal ──
function PaymentModal({ supplier, onClose, onPay }: {
    supplier: Supplier;
    onClose: () => void;
    onPay: (amount: number, method: string, note: string) => Promise<void>;
}) {
    const [amount, setAmount] = useState(0);
    const [method, setMethod] = useState('Tiền mặt');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const handlePay = async () => {
        if (!amount || amount <= 0) { toast.error('Nhập số tiền hợp lệ'); return; }
        if (amount > supplier.totalDebt) { toast.error('Số tiền vượt quá công nợ'); return; }
        setSaving(true);
        try { await onPay(amount, method, note); onClose(); }
        catch { toast.error('Lỗi thanh toán'); }
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between p-5 border-b">
                    <h2 className="text-lg font-bold">Thanh toán công nợ</h2>
                    <button title="Đóng" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div className="bg-orange-50 rounded-lg p-3 text-sm">
                        <span className="text-gray-600">Công nợ hiện tại:</span>
                        <span className="ml-2 font-bold text-orange-600">{fmt(supplier.totalDebt)}</span>
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 mb-1 block">Số tiền thanh toán *</label>
                        <CurrencyInput value={amount} onChange={setAmount}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" placeholder="0" />
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 mb-1 block">Phương thức</label>
                        <select title="Phương thức" value={method} onChange={e => setMethod(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none">
                            <option>Tiền mặt</option><option>Chuyển khoản</option><option>Khác</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 mb-1 block">Ghi chú</label>
                        <input title="Ghi chú" type="text" value={note} onChange={e => setNote(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 p-5 border-t">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
                    <button onClick={handlePay} disabled={saving} className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                        {saving ? 'Đang xử lý...' : 'Thanh toán'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ──
function SupplierDetailDrawer({
    supplier,
    transactions,
    loadingTx,
    onClose,
    onEdit,
    onPay,
    formatPrice,
}: {
    supplier: (Supplier & { id: string }) | null;
    transactions: SupplierTransaction[];
    loadingTx: boolean;
    onClose: () => void;
    onEdit: (supplier: Supplier & { id: string }) => void;
    onPay: (supplier: Supplier & { id: string }) => void;
    formatPrice: (value: number) => string;
}) {
    if (!supplier) return null;
    const debt = Number(supplier.totalDebt || 0);
    const infoRows = [
        ['Mã NCC', supplier.code || supplier.id],
        ['Công ty', supplier.companyName],
        ['Người liên hệ', supplier.contactPerson],
        ['Liên hệ chính', supplierPrimaryContactLabel(supplier)],
        ['Số điện thoại', supplier.phone],
        ['Zalo', firstSupplierContactValue(supplier, 'zalo')],
        ['Facebook', firstSupplierContactValue(supplier, 'facebook')],
        ['Liên hệ khác', firstSupplierContactValue(supplier, 'other')],
        ['Email', supplier.email],
        ['Website', supplier.website],
        ['Địa chỉ', supplier.address],
        ['Mã số thuế', supplier.taxCode],
        ['Ngân hàng', supplier.bankName],
        ['Số tài khoản', supplier.bankAccount],
        ['Hạn thanh toán', supplier.paymentTermsDays ? `${supplier.paymentTermsDays} ngày` : ''],
        ['Phụ trách', supplier.assignedOwner],
    ].filter(([, value]) => Boolean(value));

    return (
        <div className="fixed inset-0 z-50 bg-black/30">
            <div className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b p-5">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold text-gray-900">{supplier.name}</h2>
                            {supplier.supplierType && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{supplier.supplierType}</span>}
                            {!supplier.isActive && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">Ngừng HĐ</span>}
                        </div>
                        <p className="mt-1 text-sm text-gray-500">Hồ sơ nhà cung cấp, công nợ và lịch sử giao dịch</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Đóng" aria-label="Đóng">
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border bg-gray-50 p-4">
                            <p className="text-xs font-medium text-gray-500">Công nợ</p>
                            <p className={`mt-1 text-lg font-bold ${debt > 0 ? 'text-red-600' : debt < 0 ? 'text-green-600' : 'text-gray-700'}`}>
                                {debt > 0 ? formatPrice(debt) : debt < 0 ? `Dư ${formatPrice(Math.abs(debt))}` : 'Hết nợ'}
                            </p>
                        </div>
                        <div className="rounded-xl border bg-gray-50 p-4">
                            <p className="text-xs font-medium text-gray-500">Tags</p>
                            <p className="mt-1 text-lg font-bold text-gray-800">{supplier.tags?.length || 0}</p>
                        </div>
                        <div className="rounded-xl border bg-gray-50 p-4">
                            <p className="text-xs font-medium text-gray-500">Giao dịch tải</p>
                            <p className="mt-1 text-lg font-bold text-gray-800">{transactions.length}</p>
                        </div>
                    </div>
                    {supplier.tags && supplier.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {supplier.tags.map(tag => (
                                <span key={tag} className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{tag}</span>
                            ))}
                        </div>
                    )}
                    <div className="rounded-xl border">
                        <div className="border-b px-4 py-3">
                            <h3 className="font-semibold text-gray-900">Thông tin chi tiết</h3>
                        </div>
                        <div className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
                            {infoRows.length === 0 ? (
                                <p className="text-sm text-gray-400">Chưa có thông tin mở rộng.</p>
                            ) : infoRows.map(([label, value]) => (
                                <div key={label}>
                                    <p className="text-xs font-medium uppercase text-gray-400">{label}</p>
                                    <p className="mt-0.5 text-sm font-medium text-gray-800">{value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    {supplier.note && (
                        <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
                            <p className="text-xs font-semibold uppercase text-orange-500">Ghi chú</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-orange-900">{supplier.note}</p>
                        </div>
                    )}
                    <div className="rounded-xl border">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <h3 className="font-semibold text-gray-900">Lịch sử giao dịch</h3>
                            <span className="text-xs text-gray-400">Tải khi mở hồ sơ</span>
                        </div>
                        <div className="max-h-72 overflow-y-auto p-4">
                            {loadingTx ? (
                                <p className="text-sm text-gray-400">Đang tải...</p>
                            ) : transactions.length === 0 ? (
                                <p className="text-sm text-gray-400">Chưa có giao dịch nào.</p>
                            ) : (
                                <div className="space-y-2">
                                    {transactions.map(tx => (
                                        <div key={tx.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                                            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tx.type === 'IMPORT' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                                                {tx.type === 'IMPORT' ? <ArrowDownToLine size={16} /> : <ArrowUpFromLine size={16} />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-gray-800">{tx.type === 'IMPORT' ? 'Nhập hàng' : 'Thanh toán'}</p>
                                                <p className="truncate text-xs text-gray-500">{tx.note || tx.paymentMethod || 'Không ghi chú'}</p>
                                            </div>
                                            <div className={`text-right font-bold ${tx.type === 'IMPORT' ? 'text-red-600' : 'text-green-600'}`}>
                                                {tx.type === 'IMPORT' ? '+' : '-'}{formatPrice(tx.amount)}
                                                <p className="text-[11px] font-normal text-gray-400">{fmtDate(tx.createdAt)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t p-4">
                    {debt > 0 && (
                        <button type="button" onClick={() => onPay(supplier)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
                            Thanh toán công nợ
                        </button>
                    )}
                    <button type="button" onClick={() => onEdit(supplier)} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
                        Sửa hồ sơ
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SuppliersPage() {
    useAuth();
    const [suppliers, setSuppliers] = useState<(Supplier & { id: string })[]>([]);
    const [search, setSearch] = useState('');
    const [supplierTypeFilter, setSupplierTypeFilter] = useState('');
    const [tagFilter, setTagFilter] = useState('');
    const [debtOnly, setDebtOnly] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<(Supplier & { id: string }) | null>(null);
    const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);
    const [loadingTx, setLoadingTx] = useState(false);
    const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);

    const loadSuppliers = useCallback(async () => {
        const q = query(collection(db, 'suppliers'), orderBy('createdAt', 'desc'), limit(200));
        const snap = await getDocs(q);
        setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier & { id: string })));
    }, []);

    useEffect(() => {
        loadSuppliers().catch(error => console.error('Failed to load suppliers:', error));
    }, [loadSuppliers]);

    // Load transactions when expanded
    const loadTransactions = useCallback(async (supplierId: string) => {
        setLoadingTx(true);
        const q = query(collection(db, 'supplier_transactions'), where('supplierId', '==', supplierId), orderBy('createdAt', 'desc'), limit(100));
        const snap = await getDocs(q);
        setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierTransaction)));
        setLoadingTx(false);
    }, []);

    const toggleExpand = (id: string) => {
        if (expandedId === id) { setExpandedId(null); return; }
        setExpandedId(id);
        loadTransactions(id);
    };

    const openDetail = (supplier: Supplier & { id: string }) => {
        setSelectedSupplier(supplier);
        setExpandedId(supplier.id);
        loadTransactions(supplier.id);
    };

    // Save supplier (add/edit)
    const handleSave = async (data: Partial<Supplier>) => {
        if (editSupplier) {
            await updateDoc(doc(db, 'suppliers', editSupplier.id), { ...data, updatedAt: serverTimestamp() });
            toast.success('Đã cập nhật NCC');
        } else {
            const supplierId = await reserveSupplierDocumentId(data);
            await setDoc(doc(db, 'suppliers', supplierId), {
                ...data,
                id: supplierId,
                code: data.code || supplierId,
                totalDebt: 0,
                isActive: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            toast.success('Đã thêm NCC mới');
        }
        await loadSuppliers();
    };

    // Pay debt
    const handlePay = async (supplier: Supplier, amount: number, method: string, note: string) => {
        const auth = await (await import('@/lib/firebase')).getAuthInstance();
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) throw new Error('Missing admin auth token');

        const res = await fetch('/api/admin/suppliers/pay-debt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
                supplierId: supplier.id,
                amount,
                paymentMethod: method,
                note,
                idempotencyKey: crypto.randomUUID(),
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to pay supplier debt');
        toast.success(`Da thanh toan ${fmt(amount)} cho ${supplier.name}`);
        await loadSuppliers();
        if (expandedId === supplier.id) loadTransactions(supplier.id);
    };

    const availableTags = useMemo(() => {
        const tagSet = new Set<string>();
        suppliers.forEach(supplier => supplier.tags?.forEach(tag => tagSet.add(tag)));
        return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'vi'));
    }, [suppliers]);

    const supplierTypes = useMemo(() => {
        const typeSet = new Set<string>();
        suppliers.forEach(supplier => {
            if (supplier.supplierType) typeSet.add(supplier.supplierType);
        });
        return Array.from(typeSet).sort((a, b) => a.localeCompare(b, 'vi'));
    }, [suppliers]);

    const filtered = suppliers.filter(s => {
        const queryText = search.toLowerCase();
        const matchesSearch = !queryText
            || s.id.toLowerCase().includes(queryText)
            || s.code?.toLowerCase().includes(queryText)
            || s.name.toLowerCase().includes(queryText)
            || s.phone?.includes(search)
            || s.primaryContactValue?.toLowerCase().includes(queryText)
            || s.searchKeywords?.some(keyword => keyword.toLowerCase().includes(queryText))
            || s.contactMethods?.some(method => method.value.toLowerCase().includes(queryText) || method.normalizedValue?.toLowerCase().includes(queryText))
            || s.contactPerson?.toLowerCase().includes(queryText)
            || s.companyName?.toLowerCase().includes(queryText)
            || s.taxCode?.toLowerCase().includes(queryText)
            || s.tags?.some(tag => tag.toLowerCase().includes(queryText));
        if (!matchesSearch) return false;
        if (supplierTypeFilter && s.supplierType !== supplierTypeFilter) return false;
        if (tagFilter && !s.tags?.includes(tagFilter)) return false;
        if (debtOnly && Number(s.totalDebt || 0) <= 0) return false;
        return true;
    });

    const totalDebt = suppliers.reduce((sum, s) => sum + (s.totalDebt || 0), 0);
    const stats = {
        total: suppliers.length,
        active: suppliers.filter(s => s.isActive !== false).length,
        debt: suppliers.filter(s => Number(s.totalDebt || 0) > 0).length,
        tags: availableTags.length,
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="flex items-center gap-3 rounded-xl border bg-white p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600"><Building2 size={20} /></div>
                    <div><p className="text-xs text-gray-500">Tổng NCC</p><p className="text-lg font-bold text-gray-800">{stats.total}</p></div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border bg-white p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600"><Clock3 size={20} /></div>
                    <div><p className="text-xs text-gray-500">Đang hoạt động</p><p className="text-lg font-bold text-gray-800">{stats.active}</p></div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border bg-white p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600"><CreditCard size={20} /></div>
                    <div><p className="text-xs text-gray-500">Có công nợ</p><p className="text-lg font-bold text-gray-800">{stats.debt}</p></div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border bg-white p-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-600"><Tags size={20} /></div>
                    <div><p className="text-xs text-gray-500">Tags</p><p className="text-lg font-bold text-gray-800">{stats.tags}</p></div>
                </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row">
                <select title="Lọc loại NCC" value={supplierTypeFilter} onChange={event => setSupplierTypeFilter(event.target.value)} className="h-8 rounded-xl border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Tất cả loại NCC</option>
                    {supplierTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
                <select title="Lọc tag" value={tagFilter} onChange={event => setTagFilter(event.target.value)} className="h-8 rounded-xl border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                    <option value="">Tất cả tags</option>
                    {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                </select>
                <button
                    type="button"
                    onClick={() => setDebtOnly(value => !value)}
                    className={`inline-flex h-8 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold ${debtOnly ? 'border-red-200 bg-red-50 text-red-600' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                    <Filter size={16} />
                    Có công nợ
                </button>
            </div>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Building2 className="text-orange-500" size={28} /> Nhà cung cấp
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">{suppliers.length} NCC · Tổng công nợ: <span className="font-bold text-orange-600">{fmt(totalDebt)}</span></p>
                </div>
                <button onClick={() => { setEditSupplier(null); setShowModal(true); }}
                    className="flex items-center gap-2 bg-orange-500 text-white px-3 py-1.5 text-xs rounded-xl hover:bg-orange-600 font-medium">
                    <Plus size={18} /> Thêm NCC
                </button>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Tìm tên, mã NCC, Zalo/Facebook, SĐT, MST..." value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 h-8 text-sm border rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none" />
            </div>

            {/* List */}
            <div className="space-y-3">
                {filtered.map(s => (
                    <div key={s.id} onClick={() => openDetail(s)} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:border-orange-200 hover:shadow-md transition-all">
                        <div className="p-4 flex items-start gap-4">
                            <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center shrink-0">
                                <Building2 size={24} className="text-orange-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-bold text-gray-900 truncate">{s.name}</h3>
                                    {s.supplierType && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{s.supplierType}</span>}
                                    {(s.code || s.id) && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{s.code || s.id}</span>}
                                    {!s.isActive && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Ngưng HĐ</span>}
                                </div>
                                {(s.companyName || s.contactPerson || s.paymentTermsDays || s.assignedOwner) && (
                                    <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                                        {s.companyName && <span>Công ty: <b>{s.companyName}</b></span>}
                                        {s.contactPerson && <span>Liên hệ: <b>{s.contactPerson}</b></span>}
                                        {!!s.paymentTermsDays && <span>Hạn TT: <b>{s.paymentTermsDays} ngày</b></span>}
                                        {s.assignedOwner && <span>Phụ trách: <b>{s.assignedOwner}</b></span>}
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                                    {s.phone && <span className="flex items-center gap-1"><Phone size={12} />{s.phone}</span>}
                                    {!s.phone && supplierPrimaryContactLabel(s) && <span className="flex items-center gap-1"><Phone size={12} />{supplierPrimaryContactLabel(s)}</span>}
                                    {firstSupplierContactValue(s, 'zalo') && <span>Zalo: {firstSupplierContactValue(s, 'zalo')}</span>}
                                    {firstSupplierContactValue(s, 'facebook') && <span>Facebook: {firstSupplierContactValue(s, 'facebook')}</span>}
                                    {s.email && <span className="flex items-center gap-1"><Mail size={12} />{s.email}</span>}
                                    {s.website && <span>{s.website}</span>}
                                    {s.address && <span className="flex items-center gap-1"><MapPin size={12} />{s.address}</span>}
                                    {s.taxCode && <span>MST: {s.taxCode}</span>}
                                    {s.bankAccount && <span className="flex items-center gap-1"><CreditCard size={12} />{s.bankAccount} - {s.bankName}</span>}
                                </div>
                                {s.tags && s.tags.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {s.tags.map(tag => (
                                            <span key={tag} className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{tag}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="text-right shrink-0 space-y-1">
                                <div className={`text-sm font-bold ${(s.totalDebt || 0) > 0 ? 'text-red-600' : (s.totalDebt || 0) < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                                    {(s.totalDebt || 0) > 0 ? `Nợ: ${fmt(s.totalDebt)}` : (s.totalDebt || 0) < 0 ? `Dư: ${fmt(Math.abs(s.totalDebt))}` : 'Hết nợ'}
                                </div>
                                <div className="flex gap-1" onClick={event => event.stopPropagation()}>
                                    {(s.totalDebt || 0) > 0 && (
                                        <button title="Thanh toán" onClick={() => setPaySupplier(s)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100">Thanh toán</button>
                                    )}
                                    <button title="Chỉnh sửa" onClick={() => { setEditSupplier(s); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                                        <Edit2 size={14} />
                                    </button>
                                    <button title="Mở rộng" onClick={() => toggleExpand(s.id)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                                        {expandedId === s.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Transaction History */}
                        {expandedId === s.id && (
                            <div className="border-t bg-gray-50 p-4">
                                <h4 className="text-sm font-bold text-gray-700 mb-3">Lịch sử giao dịch</h4>
                                {loadingTx ? (
                                    <p className="text-sm text-gray-400">Đang tải...</p>
                                ) : transactions.length === 0 ? (
                                    <p className="text-sm text-gray-400">Chưa có giao dịch nào</p>
                                ) : (
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                        {transactions.map(tx => (
                                            <div key={tx.id} className="flex items-center gap-3 bg-white rounded-lg p-2.5 text-sm">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === 'IMPORT' ? 'bg-blue-50' : 'bg-green-50'}`}>
                                                    {tx.type === 'IMPORT' ? <ArrowDownToLine size={16} className="text-blue-500" /> : <ArrowUpFromLine size={16} className="text-green-500" />}
                                                </div>
                                                <div className="flex-1">
                                                    <span className="font-medium">{tx.type === 'IMPORT' ? 'Nhập hàng' : 'Thanh toán'}</span>
                                                    {tx.note && <span className="text-gray-400 ml-2">· {tx.note}</span>}
                                                </div>
                                                <div className={`font-bold ${tx.type === 'IMPORT' ? 'text-red-600' : 'text-green-600'}`}>
                                                    {tx.type === 'IMPORT' ? '+' : '-'}{fmt(tx.amount)}
                                                </div>
                                                <span className="text-xs text-gray-400 w-20 text-right">{fmtDate(tx.createdAt)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="text-center py-16 bg-white rounded-xl">
                        <Building2 size={48} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500">{search ? 'Không tìm thấy NCC phù hợp' : 'Chưa có nhà cung cấp nào'}</p>
                    </div>
                )}
            </div>

            {/* Modals */}
            <SupplierDetailDrawer
                supplier={selectedSupplier}
                transactions={transactions}
                loadingTx={loadingTx}
                onClose={() => setSelectedSupplier(null)}
                onEdit={(supplier) => { setEditSupplier(supplier); setShowModal(true); }}
                onPay={(supplier) => setPaySupplier(supplier)}
                formatPrice={fmt}
            />
            {showModal && <SupplierModal supplier={editSupplier} onClose={() => setShowModal(false)} onSave={handleSave} />}
            {paySupplier && <PaymentModal supplier={paySupplier} onClose={() => setPaySupplier(null)} onPay={(a, m, n) => handlePay(paySupplier, a, m, n)} />}
        </div>
    );
}
