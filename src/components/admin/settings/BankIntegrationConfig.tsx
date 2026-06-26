'use client';
/* eslint-disable @next/next/no-img-element -- All <img> in this file use /api/proxy-image (internal proxy) or data-URLs (TOTP QR). next/image requires known width/height and doesn't support data URLs, so native <img> is the correct choice here. */

import { useState, useEffect } from 'react';
import { Loader2, Landmark, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import app from '@/lib/firebase';

type BankAccount = {
    id: string;
    bankId: string;
    accountNo: string;
    accountName: string;
    isDefault: boolean;
};

type BankConfig = {
    adminPhone: string;
    accounts: BankAccount[];
    bankId?: string;
    accountNo?: string;
    accountName?: string;
    totpEnabled?: boolean;
};

type BankOption = {
    id?: string;
    bin: string;
    shortName: string;
    name: string;
    logo?: string;
};

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}



export default function BankIntegrationConfig() {
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState<BankConfig>({
        adminPhone: '',
        accounts: [],
        bankId: '',
        accountNo: '',
        accountName: ''
    });

    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<BankConfig>({
        adminPhone: '',
        accounts: [],
        bankId: '',
        accountNo: '',
        accountName: ''
    });

    const [isProcessing, setIsProcessing] = useState(false);
    const [banks, setBanks] = useState<BankOption[]>([]);

    const [showTotpSetup, setShowTotpSetup] = useState(false);
    const [totpSetupData, setTotpSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
    const [setupToken, setSetupToken] = useState('');
    
    const [showTotpVerify, setShowTotpVerify] = useState(false);
    const [verifyToken, setVerifyToken] = useState('');
    const [verifiedToken, setVerifiedToken] = useState('');

    useEffect(() => {
        loadConfig();
        fetchBanks();
    }, []);

    async function fetchBanks() {
        try {
            const res = await fetch('/api/admin/bank-config/banks');
            const data = await res.json();
            if (data.code === '00') {
                setBanks(data.data);
            }
        } catch (error) {
            console.error('Lỗi lấy danh sách ngân hàng:', error);
        }
    }

    async function loadConfig() {
        try {
            const token = await getAuth(app).currentUser?.getIdToken();
            const res = await fetch('/api/admin/bank-config', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success && data.config) {
                let accounts: BankAccount[] = data.config.accounts || [];
                if (accounts.length === 0 && data.config.bankId) {
                    accounts = [{
                        id: 'default_1',
                        bankId: data.config.bankId,
                        accountNo: data.config.accountNo,
                        accountName: data.config.accountName,
                        isDefault: true
                    }];
                }
                const newConfig: BankConfig = { ...data.config, accounts };
                setConfig(newConfig);
                setEditForm(structuredClone(newConfig));
            }
        } catch (error) {
            console.error('Lỗi tải cấu hình ngân hàng:', error);
        } finally {
            setLoading(false);
        }
    }

    async function startTotpSetup() {
        setIsProcessing(true);
        try {
            const token = await getAuth(app).currentUser?.getIdToken();
            const res = await fetch('/api/admin/bank-config/totp/setup', {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            const data = await res.json();
            if (data.success) {
                setTotpSetupData({ secret: data.secret, qrCodeUrl: data.qrCodeUrl });
                setShowTotpSetup(true);
            } else {
                toast.error(data.error);
            }
        } catch (error) {
            toast.error(errorMessage(error, 'Lỗi thiết lập TOTP'));
        } finally {
            setIsProcessing(false);
        }
    }

    async function verifyTotpSetup() {
        if (!setupToken || setupToken.length !== 6) return toast.error('Vui lòng nhập mã 6 số');
        setIsProcessing(true);
        try {
            const adminToken = await getAuth(app).currentUser?.getIdToken();
            const res = await fetch('/api/admin/bank-config/totp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
                body: JSON.stringify({ token: setupToken, secret: totpSetupData?.secret })
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Thiết lập Authenticator thành công');
                setShowTotpSetup(false);
                setSetupToken('');
                loadConfig();
            } else {
                toast.error(data.error);
            }
        } catch {
            toast.error('Lỗi xác thực TOTP');
        } finally {
            setIsProcessing(false);
        }
    }

    function handleEditClick() {
        if (config.totpEnabled) {
            setShowTotpVerify(true);
        } else {
            toast.error('Vui lòng thiết lập Authenticator trước khi chỉnh sửa cấu hình ngân hàng.');
            startTotpSetup();
        }
    }

    async function verifyTotpForEdit() {
        if (!verifyToken || verifyToken.length !== 6) return toast.error('Vui lòng nhập mã 6 số');
        setIsProcessing(true);
        try {
            const adminToken = await getAuth(app).currentUser?.getIdToken();
            const res = await fetch('/api/admin/bank-config/totp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
                body: JSON.stringify({ token: verifyToken })
            });
            const data = await res.json();
            if (data.success) {
                setVerifiedToken(verifyToken);
                setShowTotpVerify(false);
                setVerifyToken('');
                setIsEditing(true);
            } else {
                toast.error(data.error);
            }
        } catch {
            toast.error('Lỗi xác thực TOTP');
        } finally {
            setIsProcessing(false);
        }
    }

    async function saveConfig() {
        if (!verifiedToken) {
            toast.error('Vui lòng xác thực TOTP trước khi lưu cấu hình ngân hàng.');
            setShowTotpVerify(true);
            return;
        }

        setIsProcessing(true);
        try {
            const adminToken = await getAuth(app).currentUser?.getIdToken();
            if (!adminToken) throw new Error('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.');

            const res = await fetch('/api/admin/bank-config/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({
                    phone: editForm.adminPhone,
                    otpToken: verifiedToken,
                    config: {
                        accounts: editForm.accounts || []
                    }
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Lỗi lưu cấu hình');
            }
            toast.success('Đã lưu cấu hình ngân hàng');
            setIsEditing(false);
            setVerifiedToken('');
            loadConfig();
        } catch (error: unknown) {
            console.error(error);
            toast.error(errorMessage(error, 'Lỗi cập nhật cấu hình'));
        } finally {
            setIsProcessing(false);
        }
    }

    if (loading) {
        return <div className="flex justify-center p-6"><Loader2 className="animate-spin text-orange-500" /></div>;
    }

    return (
        <>
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Landmark size={20} className="text-green-600" />
                    <h2 className="font-semibold text-gray-900">Cấu hình Ngân hàng (VietQR)</h2>
                </div>
                {!isEditing && (
                    <div className="flex gap-2">
                        {!config.totpEnabled && (
                            <button
                                onClick={startTotpSetup}
                                className="px-4 py-1.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg text-sm hover:bg-blue-100 flex items-center gap-2"
                            >
                                <ShieldCheck size={16} /> Thiết lập Authenticator
                            </button>
                        )}
                        <button
                            onClick={handleEditClick}
                            className="px-4 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                        >
                            Chỉnh sửa
                        </button>
                    </div>
                )}
            </div>

            <div className="p-6">
                {!isEditing ? (
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col md:flex-row gap-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                                <div>
                                    <p className="text-sm text-gray-500">SĐT Admin liên hệ</p>
                                    <p className="font-medium mt-1">{config.adminPhone || 'Chưa thiết lập'}</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-medium text-gray-700 border-b pb-2 mb-4">Danh sách tài khoản ngân hàng</h3>
                            {config.accounts && config.accounts.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {config.accounts.map((acc, idx) => (
                                        <div key={acc.id || idx} className={`p-4 border rounded-xl flex flex-col gap-4 ${acc.isDefault ? 'bg-orange-50 border-orange-200' : 'bg-white'}`}>
                                            <div className="flex items-start gap-3">
                                                {/* Logo */}
                                                <div className="shrink-0">
                                                    {banks.find(b => b.bin === acc.bankId || b.shortName === acc.bankId)?.logo ? (
                                                        <img src={`/api/proxy-image?url=${encodeURIComponent(banks.find(b => b.bin === acc.bankId || b.shortName === acc.bankId)?.logo || '')}`} alt="bank" className="h-10 w-auto object-contain bg-white rounded border p-1" />
                                                    ) : (
                                                        <div className="h-10 w-10 bg-gray-100 rounded border flex items-center justify-center"><Landmark size={20} className="text-gray-400" /></div>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <p className="font-medium">{banks.find(b => b.bin === acc.bankId || b.shortName === acc.bankId)?.shortName || acc.bankId}</p>
                                                        {acc.isDefault && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded-full font-medium whitespace-nowrap">Mặc định</span>}
                                                    </div>
                                                    <p className="text-sm font-semibold text-gray-900">{acc.accountNo}</p>
                                                    <p className="text-xs text-gray-500">{acc.accountName}</p>
                                                </div>
                                            </div>
                                            {/* Preview QR */}
                                            <div className="flex justify-center border-t pt-3">
                                                <div className="w-24 h-24 border rounded bg-white p-1 shadow-sm">
                                                    <img 
                                                        src={`/api/proxy-image?url=${encodeURIComponent(`https://img.vietqr.io/image/${banks.find(b => b.bin === acc.bankId || b.shortName === acc.bankId)?.bin || acc.bankId}-${acc.accountNo}-compact2.png?accountName=${encodeURIComponent(acc.accountName || '')}`)}`} 
                                                        alt="QR" 
                                                        className="w-full h-full object-contain"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 bg-gray-50 p-4 rounded-xl text-center border border-dashed">Chưa có tài khoản nào được cấu hình.</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 max-w-xl">
                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-sm text-amber-800 flex gap-2">
                            <ShieldCheck className="shrink-0" size={18} />
                            <span>Cập nhật số điện thoại Admin và cấu hình danh sách tài khoản ngân hàng để hiển thị VietQR. Bạn có thể chọn nhiều tài khoản làm mặc định.</span>
                        </div>

                        <div className="grid gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-700">SĐT Admin liên hệ</label>
                                <input
                                    value={editForm.adminPhone}
                                    onChange={e => setEditForm({ ...editForm, adminPhone: e.target.value })}
                                    placeholder="0987654321"
                                    className="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 disabled:bg-gray-100"
                                />
                            </div>

                            <div className="border-t pt-4 mt-2">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-medium text-gray-700">Tài khoản Ngân hàng</h3>
                                    <button 
                                        onClick={() => {
                                            const newAccounts = [...(editForm.accounts || [])];
                                            newAccounts.push({ id: Date.now().toString(), bankId: '', accountNo: '', accountName: '', isDefault: newAccounts.length === 0 });
                                            setEditForm({ ...editForm, accounts: newAccounts });
                                        }}
                                        className="text-sm text-orange-600 font-medium hover:underline bg-orange-50 px-3 py-1.5 rounded-lg"
                                    >
                                        + Thêm tài khoản
                                    </button>
                                </div>
                                
                                <div className="space-y-4">
                                    {(editForm.accounts || []).map((acc, index) => (
                                        <div key={acc.id} className="p-4 border rounded-xl bg-gray-50 relative shadow-sm">
                                            <button 
                                                title="Xóa tài khoản"
                                                onClick={() => {
                                                    const newAccounts = editForm.accounts.filter((_, i) => i !== index);
                                                    if (acc.isDefault && newAccounts.length > 0) newAccounts[0].isDefault = true;
                                                    setEditForm({ ...editForm, accounts: newAccounts });
                                                }}
                                                className="absolute top-4 right-4 text-gray-400 hover:text-red-500"
                                            >
                                                <X size={18} />
                                            </button>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="md:col-span-2">
                                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer w-fit">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={acc.isDefault}
                                                            onChange={(e) => {
                                                                const newAccounts = [...editForm.accounts];
                                                                newAccounts[index].isDefault = e.target.checked;
                                                                setEditForm({ ...editForm, accounts: newAccounts });
                                                            }}
                                                            className="text-orange-500 focus:ring-orange-500 h-4 w-4 rounded"
                                                        />
                                                        Chọn làm tài khoản nhận thanh toán mặc định
                                                    </label>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-gray-500">Ngân hàng</label>
                                                    <div className="flex gap-2 items-center mt-1">
                                                        {banks.find(b => b.bin === acc.bankId || b.shortName === acc.bankId)?.logo && (
                                                            <img src={`/api/proxy-image?url=${encodeURIComponent(banks.find(b => b.bin === acc.bankId || b.shortName === acc.bankId)?.logo || '')}`} alt="logo" className="h-10 w-auto object-contain bg-white border rounded p-1" />
                                                        )}
                                                        <select
                                                            title="Chọn ngân hàng"
                                                            value={acc.bankId}
                                                            onChange={e => {
                                                                const newAccounts = [...editForm.accounts];
                                                                newAccounts[index].bankId = e.target.value;
                                                                setEditForm({ ...editForm, accounts: newAccounts });
                                                            }}
                                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 text-sm"
                                                        >
                                                            <option value="">-- Chọn ngân hàng --</option>
                                                            {banks.map(b => (
                                                                <option key={b.id} value={b.bin}>{b.shortName} - {b.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-gray-500">Số tài khoản</label>
                                                    <input
                                                        value={acc.accountNo}
                                                        onChange={e => {
                                                            const newAccounts = [...editForm.accounts];
                                                            newAccounts[index].accountNo = e.target.value;
                                                            setEditForm({ ...editForm, accounts: newAccounts });
                                                        }}
                                                        placeholder="Nhập số tài khoản"
                                                        className="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 text-sm"
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="text-xs text-gray-500">Tên tài khoản</label>
                                                    <input
                                                        value={acc.accountName}
                                                        onChange={e => {
                                                            const newAccounts = [...editForm.accounts];
                                                            newAccounts[index].accountName = e.target.value;
                                                            setEditForm({ ...editForm, accounts: newAccounts });
                                                        }}
                                                        placeholder="VD: NGUYEN VAN A"
                                                        className="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20 text-sm uppercase"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!editForm.accounts || editForm.accounts.length === 0) && (
                                        <p className="text-sm text-gray-500 text-center py-6 border border-dashed rounded-xl bg-gray-50">
                                            Chưa có tài khoản nào. Hãy nhấn <b>+ Thêm tài khoản</b>.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-4">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditForm(config);
                                        setVerifiedToken('');
                                    }}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                                >
                                    Hủy
                                </button>
                                
                                <button
                                    onClick={saveConfig}
                                    disabled={isProcessing}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                                >
                                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                    Xác nhận & Lưu
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </section>

        {/* Modal Thiết lập TOTP */}
        {showTotpSetup && totpSetupData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <h3 className="font-medium text-gray-800 flex items-center gap-2">
                            <ShieldCheck size={18} className="text-blue-600" /> Thiết lập Authenticator
                        </h3>
                        <button title="Đóng" onClick={() => setShowTotpSetup(false)} className="text-gray-400 hover:text-gray-600">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-6 flex flex-col items-center">
                        <p className="text-sm text-center text-gray-600 mb-4">
                            Quét mã QR dưới đây bằng ứng dụng Google Authenticator hoặc Authy, sau đó nhập mã 6 số để xác nhận.
                        </p>
                        <div className="border rounded-xl p-2 bg-white shadow-sm mb-4">
                            <img src={totpSetupData?.qrCodeUrl} alt="QR Code" className="w-48 h-48" />
                        </div>
                        <input
                            type="text"
                            maxLength={6}
                            placeholder="Nhập mã 6 số"
                            className="w-full text-center tracking-widest text-lg font-mono px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500/20"
                            value={setupToken}
                            onChange={(e) => setSetupToken(e.target.value.replace(/\D/g, ''))}
                        />
                    </div>
                    <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
                        <button
                            onClick={() => setShowTotpSetup(false)}
                            className="px-4 py-2 border rounded-lg text-sm hover:bg-white"
                        >
                            Hủy
                        </button>
                        <button
                            onClick={verifyTotpSetup}
                            disabled={isProcessing || setupToken.length !== 6}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : 'Xác nhận'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Modal Xác thực TOTP */}
        {showTotpVerify && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white rounded-xl shadow-lg w-full max-w-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <h3 className="font-medium text-gray-800 flex items-center gap-2">
                            <ShieldCheck size={18} className="text-orange-600" /> Xác thực bảo mật
                        </h3>
                        <button title="Đóng" onClick={() => setShowTotpVerify(false)} className="text-gray-400 hover:text-gray-600">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="p-6 flex flex-col items-center">
                        <p className="text-sm text-center text-gray-600 mb-4">
                            Vui lòng nhập mã 6 số từ ứng dụng Authenticator để tiếp tục.
                        </p>
                        <input
                            type="text"
                            maxLength={6}
                            placeholder="Nhập mã 6 số"
                            className="w-full text-center tracking-widest text-lg font-mono px-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500/20"
                            value={verifyToken}
                            onChange={(e) => setVerifyToken(e.target.value.replace(/\D/g, ''))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') verifyTotpForEdit();
                            }}
                        />
                    </div>
                    <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
                        <button
                            onClick={() => setShowTotpVerify(false)}
                            className="px-4 py-2 border rounded-lg text-sm hover:bg-white"
                        >
                            Hủy
                        </button>
                        <button
                            onClick={verifyTotpForEdit}
                            disabled={isProcessing || verifyToken.length !== 6}
                            className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : 'Xác thực'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
