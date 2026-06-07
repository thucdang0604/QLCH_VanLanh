'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, ShoppingBag, Calendar, MessageSquare, X, Activity, DollarSign, ArrowDownToLine, FileText, Check } from 'lucide-react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from 'next/link';
import type { AdminBadgeCounts, ActivityItem } from '@/lib/useAdminBadges';

interface NotifItem {
    type: 'order' | 'appointment' | 'chat';
    count: number;
    label: string;
    href: string;
    icon: typeof Bell;
    color: string;
}

const activityIcons: Record<string, { icon: typeof Bell; color: string }> = {
    order: { icon: DollarSign, color: 'text-green-600 bg-green-50' },
    import: { icon: ArrowDownToLine, color: 'text-blue-600 bg-blue-50' },
    article: { icon: FileText, color: 'text-purple-600 bg-purple-50' },
    login: { icon: Activity, color: 'text-gray-600 bg-gray-50' },
    other: { icon: Bell, color: 'text-orange-600 bg-orange-50' },
};

const formatPrice = (n: number) => n.toLocaleString('vi-VN') + 'đ';
const formatTime = (ts: unknown) => {
    if (!ts) return '';
    const maybe = ts as { toDate?: () => Date };
    const d = typeof maybe?.toDate === 'function' ? maybe.toDate() : new Date(ts as string | number | Date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'Vừa xong';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

interface NotificationBellProps {
    badges: AdminBadgeCounts;
    activities: ActivityItem[];
}

export default function NotificationBell({ badges, activities }: NotificationBellProps) {
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeTab, setActiveTab] = useState<'summary' | 'activities'>('summary');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const markAsRead = async (activityId: string) => {
        try {
            await updateDoc(doc(db, 'activities', activityId), { read: true });
        } catch (err) {
            console.error('Mark read error:', err);
        }
    };

    const markAllRead = async () => {
        for (const a of activities) {
            try { await updateDoc(doc(db, 'activities', a.id), { read: true }); } catch { }
        }
    };

    const total = badges.orders + badges.appointments + badges.chats + activities.length;

    const summaryItems: NotifItem[] = [
        { type: 'order', count: badges.orders, label: 'Đơn hàng chờ xử lý', href: '/admin/orders', icon: ShoppingBag, color: 'text-orange-500 bg-orange-50' },
        { type: 'appointment', count: badges.appointments, label: 'Lịch hẹn chờ duyệt', href: '/admin/appointments', icon: Calendar, color: 'text-blue-500 bg-blue-50' },
        { type: 'chat', count: badges.chats, label: 'Tin nhắn chưa đọc', href: '/admin/chat', icon: MessageSquare, color: 'text-green-500 bg-green-50' },
    ];

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
                <Bell size={20} />
                {total > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
                        {total > 99 ? '99+' : total}
                    </span>
                )}
            </button>

            {showDropdown && (
                <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-2xl border z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                        <h3 className="font-semibold text-gray-800 text-sm">Thông báo</h3>
                        <div className="flex items-center gap-2">
                            {activities.length > 0 && (
                                <button title="Đọc tất cả" onClick={markAllRead} className="text-xs text-orange-600 hover:underline">
                                    Đọc tất cả
                                </button>
                            )}
                            <button title="Đóng" onClick={() => setShowDropdown(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b">
                        <button title="Tổng quan" onClick={() => setActiveTab('summary')}
                            className={`flex-1 py-2 text-xs font-medium transition-all ${activeTab === 'summary' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-500'}`}>
                            Tổng quan ({badges.orders + badges.appointments + badges.chats})
                        </button>
                        <button title="Hoạt động" onClick={() => setActiveTab('activities')}
                            className={`flex-1 py-2 text-xs font-medium transition-all ${activeTab === 'activities' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-500'}`}>
                            Hoạt động ({activities.length})
                        </button>
                    </div>

                    {activeTab === 'summary' && (
                        <>
                            {summaryItems.filter(i => i.count > 0).length === 0 ? (
                                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                                    <Bell size={32} className="mx-auto mb-2 opacity-40" />
                                    <p>Không có thông báo mới</p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {summaryItems.filter(i => i.count > 0).map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <Link key={item.type} href={item.href}
                                                title={item.label}
                                                onClick={() => setShowDropdown(false)}
                                                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.color}`}>
                                                    <Icon size={18} />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-gray-800">{item.label}</p>
                                                    <p className="text-xs text-gray-500">{item.count} mục cần xử lý</p>
                                                </div>
                                                <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">
                                                    {item.count}
                                                </span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'activities' && (
                        <div className="max-h-80 overflow-y-auto">
                            {activities.length === 0 ? (
                                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                                    <Activity size={32} className="mx-auto mb-2 opacity-40" />
                                    <p>Chưa có hoạt động mới</p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {activities.slice(0, 20).map((act) => {
                                        const iconCfg = activityIcons[act.type] || activityIcons.other;
                                        const Icon = iconCfg.icon;
                                        return (
                                            <div key={act.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconCfg.color}`}>
                                                    <Icon size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-gray-800">{act.message}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[10px] text-gray-400">{formatTime(act.createdAt)}</span>
                                                        {act.amount && act.amount > 0 && (
                                                            <span className="text-[10px] font-medium text-green-600">{formatPrice(act.amount)}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button title="Đánh dấu đã đọc" onClick={() => markAsRead(act.id)}
                                                    className="p-1 text-gray-300 hover:text-green-500 transition-colors flex-shrink-0">
                                                    <Check size={14} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
