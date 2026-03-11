'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Battery,
    Smartphone,
    Monitor,
    Laptop,
    Wrench,
    Shield,
    RefreshCw,
    Cpu,
    LucideIcon
} from 'lucide-react';
import { ServiceCardSkeleton } from '../ui/Skeleton';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Service {
    id: string;
    name: string;
    description: string;
    price: string;
    imageUrl?: string;
    icon?: string;
    isActive?: boolean;
}

// Icon mapping
const iconMap: Record<string, LucideIcon> = {
    Battery,
    Smartphone,
    Monitor,
    Laptop,
    Wrench,
    Shield,
    RefreshCw,
    Cpu,
};

// Demo fallback services
const demoServices = [
    { id: 'thay-pin', name: 'Thay Pin', description: 'Pin chính hãng, bảo hành 12 tháng', icon: 'Battery', price: 'Từ 350.000đ', color: 'from-green-500 to-emerald-600', bgColor: 'bg-green-50' },
    { id: 'ep-kinh', name: 'Ép Kính', description: 'Kính cường lực cao cấp', icon: 'Smartphone', price: 'Từ 200.000đ', color: 'from-blue-500 to-cyan-600', bgColor: 'bg-blue-50' },
    { id: 'thay-man-hinh', name: 'Thay Màn Hình', description: 'Màn hình zin, đổi trả 30 ngày', icon: 'Monitor', price: 'Từ 800.000đ', color: 'from-purple-500 to-violet-600', bgColor: 'bg-purple-50' },
    { id: 'sua-macbook', name: 'Sửa MacBook', description: 'Chuyên sửa lỗi phần cứng, phần mềm', icon: 'Laptop', price: 'Báo giá', color: 'from-gray-600 to-gray-800', bgColor: 'bg-gray-100' },
    { id: 'sua-chua-tong-quat', name: 'Sửa Chữa Tổng Quát', description: 'Khắc phục mọi lỗi điện thoại', icon: 'Wrench', price: 'Từ 100.000đ', color: 'from-orange-500 to-red-500', bgColor: 'bg-orange-50' },
    { id: 'bao-hanh-mo-rong', name: 'Bảo Hành Mở Rộng', description: 'Gói bảo hành VIP lên đến 24 tháng', icon: 'Shield', price: 'Từ 500.000đ', color: 'from-indigo-500 to-blue-600', bgColor: 'bg-indigo-50' },
    { id: 'trade-in', name: 'Thu Cũ Đổi Mới', description: 'Định giá cao, đổi nhanh trong 15 phút', icon: 'RefreshCw', price: 'Miễn phí', color: 'from-teal-500 to-green-500', bgColor: 'bg-teal-50' },
    { id: 'nang-cap-cpu', name: 'Nâng Cấp Linh Kiện', description: 'RAM, SSD, CPU cho laptop', icon: 'Cpu', price: 'Báo giá', color: 'from-pink-500 to-rose-600', bgColor: 'bg-pink-50' },
];

// Color palette for services
const colorPalette = [
    { color: 'from-green-500 to-emerald-600', bgColor: 'bg-green-50' },
    { color: 'from-blue-500 to-cyan-600', bgColor: 'bg-blue-50' },
    { color: 'from-purple-500 to-violet-600', bgColor: 'bg-purple-50' },
    { color: 'from-gray-600 to-gray-800', bgColor: 'bg-gray-100' },
    { color: 'from-orange-500 to-red-500', bgColor: 'bg-orange-50' },
    { color: 'from-indigo-500 to-blue-600', bgColor: 'bg-indigo-50' },
    { color: 'from-teal-500 to-green-500', bgColor: 'bg-teal-50' },
    { color: 'from-pink-500 to-rose-600', bgColor: 'bg-pink-50' },
];

export default function ServiceBlock() {
    const [services, setServices] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Query mới nhất - hiển thị dịch vụ mới nhất lên đầu (limit 12)
        const q = query(
            collection(db, 'services'),
            orderBy('createdAt', 'desc'),
            limit(12)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                if (snapshot.empty) {
                    setServices(demoServices);
                } else {
                    const all = snapshot.docs.map((doc, index) => {
                        const data = doc.data();
                        const colors = colorPalette[index % colorPalette.length];
                        return { id: doc.id, ...data, icon: data.icon || 'Wrench', ...colors };
                    });
                    // Client-side: lọc active nếu trường tồn tại
                    const active = all.filter(s => (s as any).isActive !== false);
                    setServices(active.length > 0 ? active : demoServices);
                }
                setIsLoading(false);
            },
            (error) => {
                console.error('Services fetch error:', error);
                setServices(demoServices);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    return (
        <section className="container mx-auto px-4 py-8">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">
                        Dịch Vụ Văn Lành
                    </h2>
                    <p className="text-gray-500 mt-1">
                        Sửa chữa uy tín - Bảo hành dài hạn
                    </p>
                </div>
                <Link
                    href="/services"
                    className="text-orange-600 hover:text-orange-700 font-medium text-sm transition-colors"
                >
                    Xem tất cả →
                </Link>
            </div>

            {/* Services Grid */}
            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <ServiceCardSkeleton key={i} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    {services.map((service) => {
                        const IconComponent = iconMap[service.icon] || Wrench;
                        return (
                            <Link
                                key={service.id}
                                href={`/product/${service.id}`}
                                className="group bg-white rounded-xl p-4 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1"
                            >
                                {/* Icon */}
                                <div className={`w-14 h-14 ${service.bgColor} rounded-xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform`}>
                                    <div className={`w-8 h-8 bg-gradient-to-br ${service.color} rounded-lg flex items-center justify-center`}>
                                        <IconComponent size={18} className="text-white" />
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="text-center">
                                    <h3 className="font-semibold text-gray-800 text-sm mb-1 group-hover:text-orange-600 transition-colors">
                                        {service.name}
                                    </h3>
                                    <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                                        {service.description}
                                    </p>
                                    <p className="text-xs font-bold text-orange-600">
                                        {service.price}
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}

            {/* CTA Banner */}
            <div className="mt-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-6 md:p-8 text-white">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                        <h3 className="text-xl md:text-2xl font-bold mb-2">
                            Cần sửa chữa gấp? Liên hệ ngay!
                        </h3>
                        <p className="text-white/90">
                            Nhận báo giá miễn phí trong 5 phút - Bảo hành tận tâm
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <a
                            href="tel:18002097"
                            className="px-6 py-3 bg-white text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors"
                        >
                            📞 1800 2097
                        </a>
                        <Link
                            href="/services/booking"
                            className="px-6 py-3 bg-white/20 backdrop-blur-sm text-white font-bold rounded-xl hover:bg-white/30 transition-colors"
                        >
                            Đặt lịch sửa
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
