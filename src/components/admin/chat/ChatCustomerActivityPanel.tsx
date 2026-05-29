'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight, ClipboardList, Loader2, ShoppingBag, UserRound, Wrench, X } from 'lucide-react';
import { useCustomerActivity } from '@/lib/useCustomerActivity';
import type { ChatProfileRoom } from '@/components/admin/chat/ChatCustomerProfileModal';

interface Props {
    room: ChatProfileRoom;
    canViewOrders: boolean;
    canViewRepairs: boolean;
    onLinkCustomer: () => void;
    onClose?: () => void;
}

const orderLabels: Record<string, string> = {
    Pending: 'Chờ xử lý',
    Confirmed: 'Đã xác nhận',
    Shipping: 'Đang giao',
};

function formatPrice(amount: number): string {
    return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`;
}

function formatDate(value: unknown): string {
    if (!value) return '—';
    const timestamp = value as { toDate?: () => Date };
    const date = typeof timestamp.toDate === 'function'
        ? timestamp.toDate()
        : new Date(value as string | number | Date);
    return date.toLocaleDateString('vi-VN');
}

export default function ChatCustomerActivityPanel({
    room,
    canViewOrders,
    canViewRepairs,
    onLinkCustomer,
    onClose,
}: Props) {
    const router = useRouter();
    const linkedPhone = room.customerPhone || room.phone || room.customerId;
    const activity = useCustomerActivity({
        phone: linkedPhone,
        enabled: !!linkedPhone,
        includeOrders: canViewOrders,
        includeRepairs: canViewRepairs,
    });

    const navigateTo = (url: string) => {
        onClose?.();
        router.push(url);
    };

    return (
        <div className="flex h-full w-full flex-col bg-white">
            <div className="flex items-center justify-between border-b p-4">
                <div className="flex items-center gap-2">
                    <ClipboardList size={18} className="text-orange-600" />
                    <h3 className="text-sm font-semibold text-gray-900">Tác vụ đang mở</h3>
                </div>
                {onClose && (
                    <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Đóng tác vụ">
                        <X size={18} />
                    </button>
                )}
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
                {!activity.hasLinkedPhone ? (
                    <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm text-gray-600">
                        <p>Chưa liên kết khách hàng với hội thoại này.</p>
                        <button
                            type="button"
                            onClick={onLinkCustomer}
                            className="flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 font-medium text-white"
                        >
                            <UserRound size={16} />
                            Nhập hồ sơ khách
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="rounded-lg bg-gray-50 p-3">
                            <p className="truncate text-sm font-medium text-gray-900">{room.customerName || room.displayName}</p>
                            <p className="mt-1 font-mono text-xs text-gray-500">{activity.normalizedPhone}</p>
                        </div>

                        {!canViewOrders && !canViewRepairs && (
                            <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                                Cần quyền đơn hàng hoặc sửa chữa để xem tác vụ nghiệp vụ.
                            </p>
                        )}

                        {canViewOrders && (
                            <section>
                                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-800">
                                    <ShoppingBag size={15} />
                                    Đơn hàng
                                </div>
                                {activity.loadingOrders ? (
                                    <Loader2 className="mx-auto my-5 animate-spin text-gray-400" size={19} />
                                ) : activity.orderError ? (
                                    <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{activity.orderError}</p>
                                ) : activity.openOrders.length === 0 ? (
                                    <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">Không có đơn đang xử lý.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {activity.openOrders.map(order => (
                                            <button
                                                key={order.id}
                                                type="button"
                                                onClick={() => navigateTo(`/admin/orders?orderId=${encodeURIComponent(order.id)}`)}
                                                className="w-full rounded-lg border p-3 text-left hover:border-orange-200 hover:bg-orange-50"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-gray-900">#{order.id.slice(-6).toUpperCase()}</p>
                                                        <p className="mt-1 text-xs text-gray-500">{orderLabels[order.status] || order.status} · {formatDate(order.createdAt)}</p>
                                                    </div>
                                                    <ChevronRight size={15} className="mt-1 shrink-0 text-gray-400" />
                                                </div>
                                                <p className="mt-2 text-sm font-semibold text-gray-900">{formatPrice(order.totalAmount)}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        {canViewRepairs && (
                            <section>
                                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-800">
                                    <Wrench size={15} />
                                    Sửa chữa / bảo hành
                                </div>
                                {activity.loadingRepairs ? (
                                    <Loader2 className="mx-auto my-5 animate-spin text-gray-400" size={19} />
                                ) : activity.repairError ? (
                                    <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{activity.repairError}</p>
                                ) : activity.openRepairs.length === 0 ? (
                                    <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">Không có phiếu đang xử lý.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {activity.openRepairs.map(repair => (
                                            <button
                                                key={repair.id}
                                                type="button"
                                                onClick={() => navigateTo(`/admin/repairs?ticketId=${encodeURIComponent(repair.id)}`)}
                                                className="w-full rounded-lg border p-3 text-left hover:border-orange-200 hover:bg-orange-50"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-xs font-semibold text-gray-900">{repair.deviceModel}</p>
                                                        <p className="mt-1 text-xs text-gray-500">{repair.statusLabel} · {formatDate(repair.createdAt)}</p>
                                                    </div>
                                                    <ChevronRight size={15} className="mt-1 shrink-0 text-gray-400" />
                                                </div>
                                                <p className="mt-2 text-xs font-medium text-gray-700">#{repair.id.slice(-6).toUpperCase()} · {formatPrice(repair.amount)}</p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
