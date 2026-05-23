'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { Building2, Plus, Search, Phone, Mail, MapPin, CreditCard, Edit2, ChevronDown, ChevronUp, ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react';
import { toast } from 'sonner';
import CurrencyInput from '@/components/admin/CurrencyInput';
import type { Supplier, SupplierTransaction } from '@/lib/types';

// ── Format helpers ──
const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';
const fmtDate = (d: unknown) => {
    if (!d) return '';
    const ts = typeof (d as { toDate?: () => Date }).toDate === 'function' ? (d as { toDate: () => Date }).toDate() : new Date(d as string);
    return ts.toLocaleDateString('vi-VN');
};

// ── Supplier Form Modal ──
function SupplierModal({ supplier, onClose, onSave }: {
    supplier: Supplier | null;
    onClose: () => void;
    onSave: (data: Partial<Supplier>) => Promise<void>;
}) {
    const [form, setForm] = useState({
        name: supplier?.name || '',
        phone: supplier?.phone || '',
        email: supplier?.email || '',
        address: supplier?.address || '',
        taxCode: supplier?.taxCode || '',
        bankAccount: supplier?.bankAccount || '',
        bankName: supplier?.bankName || '',
        contactPerson: supplier?.contactPerson || '',
        note: supplier?.note || '',
    });
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!form.name.trim()) { toast.error('Vui lòng nhập tên NCC'); return; }
        setSaving(true);
        try {
            await onSave({ ...form, isActive: true });
            onClose();
        } catch { toast.error('Lỗi khi lưu'); }
        setSaving(false);
    };

    const fields: { key: keyof typeof form; label: string; type?: string }[] = [
        { key: 'name', label: 'Tên nhà cung cấp *' },
        { key: 'contactPerson', label: 'Người liên hệ' },
        { key: 'phone', label: 'Số điện thoại' },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'address', label: 'Địa chỉ' },
        { key: 'taxCode', label: 'Mã số thuế' },
        { key: 'bankAccount', label: 'Số tài khoản' },
        { key: 'bankName', label: 'Ngân hàng' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b">
                    <h2 className="text-lg font-bold">{supplier ? 'Sửa NCC' : 'Thêm nhà cung cấp'}</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
                <div className="p-5 space-y-3">
                    {fields.map(f => (
                        <div key={f.key}>
                            <label className="text-sm text-gray-600 mb-1 block">{f.label}</label>
                            <input
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
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
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
                        <select value={method} onChange={e => setMethod(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none">
                            <option>Tiền mặt</option><option>Chuyển khoản</option><option>Khác</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-gray-600 mb-1 block">Ghi chú</label>
                        <input type="text" value={note} onChange={e => setNote(e.target.value)}
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
export default function SuppliersPage() {
    const { user } = useAuth();
    const [suppliers, setSuppliers] = useState<(Supplier & { id: string })[]>([]);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);
    const [loadingTx, setLoadingTx] = useState(false);
    const [paySupplier, setPaySupplier] = useState<Supplier | null>(null);

    // Listen suppliers
    useEffect(() => {
        const q = query(collection(db, 'suppliers'), orderBy('createdAt', 'desc'));
        return onSnapshot(q, snap => {
            setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier & { id: string })));
        });
    }, []);

    // Load transactions when expanded
    const loadTransactions = useCallback(async (supplierId: string) => {
        setLoadingTx(true);
        const q = query(collection(db, 'supplier_transactions'), where('supplierId', '==', supplierId), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierTransaction)));
        setLoadingTx(false);
    }, []);

    const toggleExpand = (id: string) => {
        if (expandedId === id) { setExpandedId(null); return; }
        setExpandedId(id);
        loadTransactions(id);
    };

    // Save supplier (add/edit)
    const handleSave = async (data: Partial<Supplier>) => {
        if (editSupplier) {
            await updateDoc(doc(db, 'suppliers', editSupplier.id), { ...data, updatedAt: serverTimestamp() });
            toast.success('Đã cập nhật NCC');
        } else {
            await addDoc(collection(db, 'suppliers'), { ...data, totalDebt: 0, isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
            toast.success('Đã thêm NCC mới');
        }
    };

    // Pay debt
    const handlePay = async (supplier: Supplier, amount: number, method: string, note: string) => {
        // Create transaction
        await addDoc(collection(db, 'supplier_transactions'), {
            supplierId: supplier.id,
            supplierName: supplier.name,
            type: 'PAYMENT',
            amount,
            paymentMethod: method,
            note,
            createdBy: user?.uid || '',
            createdByName: user?.displayName || '',
            createdAt: serverTimestamp(),
        });
        // Update totalDebt
        await updateDoc(doc(db, 'suppliers', supplier.id), {
            totalDebt: (supplier.totalDebt || 0) - amount,
            updatedAt: serverTimestamp(),
        });
        toast.success(`Đã thanh toán ${fmt(amount)} cho ${supplier.name}`);
        if (expandedId === supplier.id) loadTransactions(supplier.id);
    };

    const filtered = suppliers.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.phone?.includes(search) ||
        s.contactPerson?.toLowerCase().includes(search.toLowerCase())
    );

    const totalDebt = suppliers.reduce((sum, s) => sum + (s.totalDebt || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Building2 className="text-orange-500" size={28} /> Nhà cung cấp
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">{suppliers.length} NCC · Tổng công nợ: <span className="font-bold text-orange-600">{fmt(totalDebt)}</span></p>
                </div>
                <button onClick={() => { setEditSupplier(null); setShowModal(true); }}
                    className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-xl hover:bg-orange-600 font-medium text-sm">
                    <Plus size={18} /> Thêm NCC
                </button>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Tìm tên, SĐT, người liên hệ..." value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none" />
            </div>

            {/* List */}
            <div className="space-y-3">
                {filtered.map(s => (
                    <div key={s.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 flex items-start gap-4">
                            <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center shrink-0">
                                <Building2 size={24} className="text-orange-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-bold text-gray-900 truncate">{s.name}</h3>
                                    {!s.isActive && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Ngưng HĐ</span>}
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                                    {s.phone && <span className="flex items-center gap-1"><Phone size={12} />{s.phone}</span>}
                                    {s.email && <span className="flex items-center gap-1"><Mail size={12} />{s.email}</span>}
                                    {s.address && <span className="flex items-center gap-1"><MapPin size={12} />{s.address}</span>}
                                    {s.bankAccount && <span className="flex items-center gap-1"><CreditCard size={12} />{s.bankAccount} - {s.bankName}</span>}
                                </div>
                            </div>
                            <div className="text-right shrink-0 space-y-1">
                                <div className={`text-sm font-bold ${(s.totalDebt || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {(s.totalDebt || 0) > 0 ? `Nợ: ${fmt(s.totalDebt)}` : 'Hết nợ'}
                                </div>
                                <div className="flex gap-1">
                                    {(s.totalDebt || 0) > 0 && (
                                        <button onClick={() => setPaySupplier(s)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-100">Thanh toán</button>
                                    )}
                                    <button onClick={() => { setEditSupplier(s); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                                        <Edit2 size={14} />
                                    </button>
                                    <button onClick={() => toggleExpand(s.id)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
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
            {showModal && <SupplierModal supplier={editSupplier} onClose={() => setShowModal(false)} onSave={handleSave} />}
            {paySupplier && <PaymentModal supplier={paySupplier} onClose={() => setPaySupplier(null)} onPay={(a, m, n) => handlePay(paySupplier, a, m, n)} />}
        </div>
    );
}
