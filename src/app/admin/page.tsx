'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import {
    Package,
    ShoppingCart,
    Users,
    Activity,
    Wrench,
    DollarSign,
    Loader2
} from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import { db, rtdb } from '@/lib/firebase';
import type { Order, RepairTicket } from '@/lib/types';

interface DashboardStats {
    revenue: number;
    ordersCount: number;
    repairsCount: number;
    productsSold: number;
    visitors: number;
    onlineUsers: number;
}

export default function AdminDashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [stats, setStats] = useState<DashboardStats>({
        revenue: 0,
        ordersCount: 0,
        repairsCount: 0,
        productsSold: 0,
        visitors: 0,
        onlineUsers: 0
    });
    const [loadingStats, setLoadingStats] = useState(true);

    // Staff cannot see Dashboard — redirect to repairs
    useEffect(() => {
        if (!authLoading && user?.role === 'staff') {
            router.replace('/admin/repairs');
        }
    }, [user, authLoading, router]);

    // Fetch Today's Data
    useEffect(() => {
        if (!user || user.role === 'staff') return;

        let isMounted = true;

        const fetchTodayData = async () => {
            try {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const dateNum = String(now.getDate()).padStart(2, '0');

                const todayStr = `${year}-${month}-${dateNum}`;
                const startOfToday = new Date(year, now.getMonth(), now.getDate(), 0, 0, 0);
                const endOfToday = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59, 999);

                // 1. Fetch Orders
                const ordersRef = collection(db, 'orders');
                const qOrders = query(
                    ordersRef,
                    where('createdAt', '>=', startOfToday),
                    where('createdAt', '<=', endOfToday)
                );
                const ordersSnapshot = await getDocs(qOrders);

                let dailyRevenue = 0;
                let dailyOrdersCount = 0;
                let dailyProductsSold = 0;

                ordersSnapshot.forEach((docSnap) => {
                    const data = docSnap.data() as Partial<Order>;
                    dailyOrdersCount++;
                    if (data.status !== 'Cancelled') {
                        dailyRevenue += (data.total_amount || 0);
                        if (data.items) {
                            (data.items as Array<Partial<{ quantity: number }>>).forEach((item) => {
                                dailyProductsSold += (item.quantity || 0);
                            });
                        }
                    }
                });

                // 2. Fetch Repairs
                const repairsRef = collection(db, 'repairs');
                const qRepairs = query(
                    repairsRef,
                    where('createdAt', '>=', startOfToday),
                    where('createdAt', '<=', endOfToday)
                );
                const repairsSnapshot = await getDocs(qRepairs);

                let dailyRepairsCount = 0;

                repairsSnapshot.forEach((docSnap) => {
                    const data = docSnap.data() as Partial<RepairTicket>;
                    dailyRepairsCount++;
                    // Add to revenue if ticket is completed successfully
                    if (data.status === 'done') {
                        dailyRevenue += (data.payment?.amount || 0);
                    }
                });

                // 3. Fetch Analytics/Visitors
                const analyticsDoc = await getDoc(doc(db, 'analytics', todayStr));
                const dailyVisitors = analyticsDoc.exists() ? (analyticsDoc.data().visitors || 0) : 0;

                if (isMounted) {
                    setStats(prev => ({
                        ...prev,
                        revenue: dailyRevenue,
                        ordersCount: dailyOrdersCount,
                        repairsCount: dailyRepairsCount,
                        productsSold: dailyProductsSold,
                        visitors: dailyVisitors
                    }));
                    setLoadingStats(false);
                }
            } catch (err) {
                console.error("Error fetching today's data:", err);
                if (isMounted) setLoadingStats(false);
            }
        };

        fetchTodayData();

        // 4. Listen to Realtime DB for Online Users
        const onlineUsersRef = ref(rtdb, 'online_users');
        const unsubscribeOnline = onValue(onlineUsersRef, (snapshot) => {
            const data = snapshot.val();
            const count = data ? Object.keys(data).length : 0;
            if (isMounted) {
                setStats(prev => ({ ...prev, onlineUsers: count }));
            }
        });

        return () => {
            isMounted = false;
            unsubscribeOnline();
        };
    }, [user]);

    if (authLoading || user?.role === 'staff') return null;

    const cards = [
        {
            name: 'Doanh thu hôm nay',
            value: stats.revenue.toLocaleString('vi-VN') + 'đ',
            icon: DollarSign,
            color: 'bg-green-500',
            bgIcon: 'bg-green-100',
            iconColor: 'text-green-600'
        },
        {
            name: 'Đơn hàng mới',
            value: stats.ordersCount,
            icon: ShoppingCart,
            color: 'bg-orange-500',
            bgIcon: 'bg-orange-100',
            iconColor: 'text-orange-600'
        },
        {
            name: 'Phiếu sửa chữa',
            value: stats.repairsCount,
            icon: Wrench,
            color: 'bg-blue-500',
            bgIcon: 'bg-blue-100',
            iconColor: 'text-blue-600'
        },
        {
            name: 'Sản phẩm đã bán',
            value: stats.productsSold,
            icon: Package,
            color: 'bg-indigo-500',
            bgIcon: 'bg-indigo-100',
            iconColor: 'text-indigo-600'
        },
        {
            name: 'Lượt truy cập',
            value: stats.visitors,
            icon: Users,
            color: 'bg-gray-500',
            bgIcon: 'bg-gray-100',
            iconColor: 'text-gray-600'
        },
        {
            name: 'Đang Online',
            value: stats.onlineUsers,
            icon: Activity,
            color: 'bg-emerald-500',
            bgIcon: 'bg-emerald-100',
            iconColor: 'text-emerald-600',
            isPulse: true
        },
    ];

    return (
        <div className="space-y-6">
            {/* Page Title */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-500">Thống kê hoạt động kinh doanh trong ngày hôm nay</p>
            </div>

            {loadingStats ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="animate-spin text-orange-500" size={32} />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    {cards.map((stat) => (
                        <div key={stat.name} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden group">
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <div className={`w-10 h-10 ${stat.bgIcon} rounded-lg flex items-center justify-center`}>
                                        <stat.icon size={20} className={stat.iconColor} />
                                    </div>
                                    {stat.isPulse && stats.onlineUsers > 0 && (
                                        <span className="relative flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                                    <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                                </div>
                            </div>
                            <div className={`absolute bottom-0 left-0 h-1 w-full ${stat.color} transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
                        </div>
                    ))}
                </div>
            )}

            {/* Quick Actions Note */}
            <div className="bg-orange-50 rounded-xl p-4 border border-orange-100 flex items-start gap-3">
                <div className="bg-orange-100 p-2 rounded-lg text-orange-600 mt-0.5">
                    <Activity size={18} />
                </div>
                <div>
                    <h3 className="text-orange-900 font-semibold text-sm">Real-time Analytics Enabled</h3>
                    <p className="text-orange-700 text-xs mt-1">Dữ liệu &quot;Đang Online&quot; được cập nhật theo thời gian thực mỗi khi có khách hàng truy cập website. Các chỉ số khác tự động làm mới khi tải lại trang.</p>
                </div>
            </div>
        </div>
    );
}
