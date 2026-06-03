'use client';

import Link from 'next/link';
import { Phone, MapPin, Clock, Wrench, Shield, ChevronRight } from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';

const policies = [
    { name: 'Chính sách bảo hành', href: '/info/chinh-sach-bao-hanh' },
    { name: 'Chính sách mua hàng & giao nhận', href: '/info/chinh-sach-mua-hang' },
    { name: 'Chính sách đổi trả', href: '/info/chinh-sach-doi-tra' },
    { name: 'Chính sách trả góp', href: '/info/tra-gop' },
    { name: 'Chính sách bảo mật', href: '/info/chinh-sach-bao-mat' },
    { name: 'Điều khoản dịch vụ', href: '/info/dieu-khoan-dich-vu' },
];

const aboutLinks = [
    { name: 'Giới thiệu', href: '/info/gioi-thieu' },
    { name: 'Bài Viết Nổi Bật', href: '/tin-tuc' },
    { name: 'Đào tạo học viên', href: '/dao-tao-hoc-vien' },
    { name: 'Liên hệ', href: '/lien-he' },
];

export default function Footer() {
    const { config, formatHotline } = useConfig();
    const branches = config.store_branches || [];
    const mainPhone = config.contact_info?.main_phone || branches[0]?.phone || '0932242026';

    return (
        <footer className="py-2 mb-16 md:mb-0">
            <div className="max-w-[1200px] mx-auto px-2 md:px-4">
                <div className="bg-gray-900 text-gray-300 rounded-xl shadow-lg overflow-hidden">
                    {/* Main Footer */}
                    <div className="px-6 py-12">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                            {/* Column 1: Stores — Dynamic from config */}
                            <div>
                                <h3 className="text-white font-bold text-base mb-4 flex items-center gap-2">
                                    <MapPin size={18} className="text-copper" />
                                    Hệ thống cửa hàng
                                </h3>
                                <div className="space-y-4">
                                    {branches.map((branch) => (
                                        <div key={branch.id} className="border-l-2 border-copper/30 pl-3">
                                            <span className="block text-white font-medium text-sm mb-1">{branch.name}</span>
                                            <span className="block text-xs text-gray-300 mb-1">{branch.address}</span>
                                            <a
                                                href={`tel:${branch.phone}`}
                                                className="text-copper-light text-sm font-medium hover:text-white transition-colors"
                                            >
                                                <Phone size={12} className="inline mr-1" />
                                                {formatHotline(branch.phone)}
                                            </a>
                                            <a
                                                href={`${branch.mapLink}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block mt-1 text-copper-light text-sm font-medium hover:text-white transition-colors"
                                            >
                                                <MapPin size={15} className="inline mr-1" />
                                                Xem bản đồ
                                            </a>
                                        </div>
                                    ))}
                                    {branches.length === 0 && (
                                        <p className="text-xs text-gray-500">Chưa có thông tin chi nhánh</p>
                                    )}
                                    <div className="flex items-center gap-2 text-xs text-gray-300 mt-3">
                                        <Clock size={14} />
                                        <span>Giờ làm việc: 9h - 21h tất cả các ngày</span>
                                    </div>
                                </div>
                            </div>

                            {/* Column 2: Policies */}
                            <div>
                                <h3 className="text-white font-bold text-base mb-4 flex items-center gap-2">
                                    <Shield size={18} className="text-copper" />
                                    Chính sách
                                </h3>
                                <ul className="space-y-2.5">
                                    {policies.map((policy) => (
                                        <li key={policy.name}>
                                            <Link href={policy.href} className="text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-1.5">
                                                <ChevronRight size={12} /> {policy.name}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Column 3: Services */}
                            <div>
                                <h3 className="text-white font-bold text-base mb-4 flex items-center gap-2">
                                    <Wrench size={18} className="text-copper" />
                                    Dịch vụ sửa chữa
                                </h3>
                                <ul className="space-y-2.5">
                                    {(config.footerServices || [])
                                        .filter(s => s.visible)
                                        .sort((a, b) => a.order - b.order)
                                        .map((service) => (
                                        <li key={service.name}>
                                            <Link href={`/category/${service.slug}`} className="text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-1.5">
                                                <ChevronRight size={12} /> {service.name}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Column 4: About */}
                            <div>
                                <h3 className="text-white font-bold text-base mb-4">Về Văn Lành</h3>
                                <ul className="space-y-2.5 mb-6">
                                    {aboutLinks.map((link) => (
                                        <li key={link.name}>
                                            <Link href={link.href} className="text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-1.5">
                                                <ChevronRight size={12} /> {link.name}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="w-10 h-10 bg-copper rounded-lg flex items-center justify-center">
                                        <Wrench size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <span className="text-white font-bold block">VĂN LÀNH</span>
                                        <span className="text-copper-light text-xs tracking-wider">SERVICE</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Bar */}
                    <div className="border-t border-gray-800">
                        <div className="px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
                            <span>© 2026 Văn Lành Service. All rights reserved.</span>
                            <span>Hotline: <a href={`tel:${mainPhone}`} className="text-copper-light hover:text-white">{formatHotline(mainPhone)}</a></span>
                        </div>
                    </div>
                </div>{/* end bg-gray-900 rounded */}
            </div>{/* end max-w Container */}
        </footer>
    );
}
