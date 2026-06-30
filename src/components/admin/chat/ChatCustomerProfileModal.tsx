'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Save, ShoppingCart, UserRound, Wrench } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { getAuthInstance } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { buildHandoffUrl } from '@/lib/chatWorkflowHandoff';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import type { ChatChannel } from '@/lib/chatChannels';

export interface ChatProfileRoom {
    odId: string;
    displayName: string;
    channel: ChatChannel;
    sourceLabel: string;
    phone?: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
}

interface StoredCustomer {
    phone: string;
    name: string;
    totalOrders?: number;
    totalRepairs?: number;
    totalSpent?: number;
}

interface Props {
    isOpen: boolean;
    room: ChatProfileRoom | null;
    onClose: () => void;
}

function normalizePhone(value: string): string {
    return value.replace(/[^0-9]/g, '');
}

async function getChatApiToken(): Promise<string> {
    const auth = await getAuthInstance();
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
        throw new Error('Phiên đăng nhập quản trị không hợp lệ.');
    }
    return token;
}

export default function ChatCustomerProfileModal({ isOpen, room, onClose }: Props) {
    const router = useRouter();
    const { user } = useAuth();
    const canCreateRepair = user?.role === 'admin' || !!user?.permissions?.includes('manage_repairs');
    const canCreateOrder = user?.role === 'admin' || !!user?.permissions?.includes('manage_orders');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [storedCustomer, setStoredCustomer] = useState<StoredCustomer | null>(null);
    const [loadingCustomer, setLoadingCustomer] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen || !room) return;
        const nextPhone = normalizePhone(room.customerPhone || room.phone || room.customerId || '');
        setName(room.customerName || room.displayName || '');
        setPhone(nextPhone);
        setStoredCustomer(null);

        if (nextPhone.length < 9) return;
        let cancelled = false;
        setLoadingCustomer(true);
        void (async () => {
            try {
                const token = await getChatApiToken();
                const response = await fetch(
                    `/api/admin/chat/rooms/${encodeURIComponent(room.odId)}/customer?phone=${encodeURIComponent(nextPhone)}`,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                const data = await response.json().catch(() => ({})) as {
                    error?: string;
                    customer?: StoredCustomer | null;
                };
                if (!response.ok) {
                    throw new Error(data.error || 'Không tải được hồ sơ khách hàng.');
                }
                if (!cancelled && data.customer) {
                    setStoredCustomer(data.customer);
                    setName(data.customer.name || room.displayName);
                }
            } catch (error) {
                console.error('Chat customer lookup failed:', error);
                if (!cancelled) toastError('Không tải được hồ sơ khách hàng.');
            } finally {
                if (!cancelled) setLoadingCustomer(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isOpen, room]);

    const saveCustomer = async (): Promise<{ name: string; phone: string } | null> => {
        if (!room) return null;
        const normalizedPhone = normalizePhone(phone);
        const normalizedName = name.trim();

        if (normalizedName.length < 2) {
            toastError('Cần nhập tên khách hàng.');
            return null;
        }
        if (normalizedName.length > 100) {
            toastError('Tên khách hàng không được vượt quá 100 ký tự.');
            return null;
        }
        if (normalizedPhone.length < 9 || normalizedPhone.length > 15) {
            toastError('Số điện thoại không hợp lệ.');
            return null;
        }

        setSaving(true);
        try {
            const token = await getChatApiToken();
            const response = await fetch(`/api/admin/chat/rooms/${encodeURIComponent(room.odId)}/customer`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ name: normalizedName, phone: normalizedPhone }),
            });
            const data = await response.json().catch(() => ({})) as {
                error?: string;
                customer?: StoredCustomer | null;
                roomLinked?: boolean;
            };
            if (!response.ok) {
                throw new Error(data.error || 'Không lưu được thông tin khách hàng.');
            }
            setStoredCustomer(data.customer || {
                phone: normalizedPhone,
                name: normalizedName,
                totalOrders: 0,
                totalRepairs: 0,
                totalSpent: 0,
            });
            if (data.roomLinked === false) {
                toastWarning('Đã lưu hồ sơ khách hàng, nhưng chưa liên kết được với hội thoại. Hãy thử lưu lại sau.');
            } else {
                toastSuccess('Đã lưu và liên kết khách hàng với hội thoại.');
            }
            return { name: normalizedName, phone: normalizedPhone };
        } catch (error) {
            console.error('Chat customer save failed:', error);
            toastError('Không lưu được thông tin khách hàng.');
            return null;
        } finally {
            setSaving(false);
        }
    };

    const startWorkflow = async (path: '/admin/repairs' | '/admin/pos') => {
        if (!room) return;
        const customer = await saveCustomer();
        if (!customer) return;
        // BUG-CHAT-001: pass handoff data via URL query params (tab-isolated)
        const handoffUrl = buildHandoffUrl(path, {
            roomId: room.odId,
            customerName: customer.name,
            customerPhone: customer.phone,
        });
        router.push(handoffUrl);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Hồ sơ khách hàng" size="md">
            {room && (
                <div className="p-5 space-y-5">
                    <div className="flex items-center gap-3 border-b pb-4">
                        <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
                            <UserRound size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{room.displayName}</p>
                            <p className="text-xs text-gray-500">{room.sourceLabel}</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="block">
                            <span className="text-sm font-medium text-gray-700">Tên khách hàng</span>
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                placeholder="Nhập tên khách"
                                maxLength={100}
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-medium text-gray-700">Số điện thoại</span>
                            <div className="relative mt-1">
                                <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={phone}
                                    onChange={(event) => setPhone(event.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    placeholder="Nhập số điện thoại"
                                    inputMode="tel"
                                />
                            </div>
                        </label>
                    </div>

                    {loadingCustomer ? (
                        <p className="text-sm text-gray-500">Đang tải dữ liệu khách hàng...</p>
                    ) : storedCustomer && (canCreateRepair || canCreateOrder) ? (
                        <div className={`border-t pt-4 grid gap-3 text-center ${canCreateOrder && canCreateRepair ? 'grid-cols-3' : canCreateOrder ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {canCreateRepair && (
                                <div>
                                    <p className="text-lg font-semibold text-gray-900">{storedCustomer.totalRepairs || 0}</p>
                                    <p className="text-xs text-gray-500">Sửa chữa</p>
                                </div>
                            )}
                            {canCreateOrder && (
                                <>
                                    <div>
                                        <p className="text-lg font-semibold text-gray-900">{storedCustomer.totalOrders || 0}</p>
                                        <p className="text-xs text-gray-500">Đơn hàng</p>
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900">
                                            {Number(storedCustomer.totalSpent || 0).toLocaleString('vi-VN')}
                                        </p>
                                        <p className="text-xs text-gray-500">Đã chi</p>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : storedCustomer ? (
                        <p className="text-sm text-gray-500 border-t pt-4">Hồ sơ khách hàng đã được liên kết.</p>
                    ) : (
                        <p className="text-sm text-gray-500 border-t pt-4">
                            Chưa có hồ sơ CRM. Lưu tên và số điện thoại để tạo khách hàng.
                        </p>
                    )}

                    <div className="flex gap-2 border-t pt-4">
                        <button
                            type="button"
                            onClick={() => void saveCustomer()}
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                            <Save size={16} />
                            {saving ? 'Đang lưu...' : 'Lưu khách'}
                        </button>
                    </div>
                    {(canCreateRepair || canCreateOrder) && (
                        <div className={`grid gap-2 ${canCreateRepair && canCreateOrder ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {canCreateRepair && (
                                <button
                                    type="button"
                                    onClick={() => void startWorkflow('/admin/repairs')}
                                    disabled={saving}
                                    className="flex items-center justify-center gap-2 px-3 py-2 border border-orange-200 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-50 disabled:opacity-50"
                                >
                                    <Wrench size={16} />
                                    Tạo sửa chữa
                                </button>
                            )}
                            {canCreateOrder && (
                                <button
                                    type="button"
                                    onClick={() => void startWorkflow('/admin/pos')}
                                    disabled={saving}
                                    className="flex items-center justify-center gap-2 px-3 py-2 border border-blue-200 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50 disabled:opacity-50"
                                >
                                    <ShoppingCart size={16} />
                                    Tạo bán lẻ
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
