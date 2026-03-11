'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home, Info, Shield, Truck, CreditCard, Lock, RotateCcw, Menu, X } from 'lucide-react';
import { useState } from 'react';

const infoPages = [
    { href: '/info/gioi-thieu', label: 'Giới thiệu', icon: <Info size={16} /> },
    { href: '/info/chinh-sach-bao-hanh', label: 'Chính sách bảo hành', icon: <Shield size={16} /> },
    { href: '/info/chinh-sach-mua-hang', label: 'Chính sách mua hàng & giao nhận', icon: <Truck size={16} /> },
    { href: '/info/tra-gop', label: 'Chính sách trả góp', icon: <CreditCard size={16} /> },
    { href: '/info/chinh-sach-bao-mat', label: 'Chính sách bảo mật', icon: <Lock size={16} /> },
    { href: '/info/chinh-sach-doi-tra', label: 'Chính sách đổi trả', icon: <RotateCcw size={16} /> },
];

export default function InfoLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const activeLabel = infoPages.find(p => pathname === p.href)?.label || 'Thông tin';

    return (
        <div className="min-h-screen">
            {/* Breadcrumb */}
            <div className="max-w-[1200px] mx-auto px-2 md:px-4 pt-4">
                <nav className="flex items-center gap-2 text-sm text-gray-500 bg-white rounded-lg px-4 py-3 shadow-sm">
                    <Link href="/" className="hover:text-copper transition-colors flex items-center gap-1">
                        <Home size={14} />
                        Trang chủ
                    </Link>
                    <ChevronRight size={14} />
                    <span className="text-gray-400">Thông tin</span>
                    <ChevronRight size={14} />
                    <span className="text-gray-800 font-medium">{activeLabel}</span>
                </nav>
            </div>

            <div className="max-w-[1200px] mx-auto px-2 md:px-4 py-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* Mobile Menu Toggle */}
                    <div className="lg:hidden">
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border shadow-sm"
                        >
                            <span className="text-sm font-medium text-gray-700">📄 {activeLabel}</span>
                            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                        {mobileMenuOpen && (
                            <div className="mt-2 bg-white rounded-xl border shadow-lg overflow-hidden animate-[fadeIn_0.2s_ease]">
                                {infoPages.map((page) => (
                                    <Link
                                        key={page.href}
                                        href={page.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`flex items-center gap-3 px-4 py-3 text-sm border-b last:border-b-0 transition-colors ${pathname === page.href
                                            ? 'bg-orange-50 text-copper font-semibold border-l-4 border-l-copper'
                                            : 'text-gray-600 hover:bg-gray-50'
                                            }`}
                                    >
                                        <span className={pathname === page.href ? 'text-copper' : 'text-gray-400'}>{page.icon}</span>
                                        {page.label}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Desktop Sidebar */}
                    <aside className="hidden lg:block w-72 flex-shrink-0">
                        <div className="bg-white rounded-xl border shadow-sm sticky top-24 overflow-hidden">
                            <div className="px-5 py-4 bg-gray-900 text-white">
                                <h2 className="font-bold text-base">📋 Thông tin & Chính sách</h2>
                                <p className="text-xs text-gray-400 mt-1">Văn Lành Service</p>
                            </div>
                            <nav className="py-2">
                                {infoPages.map((page) => (
                                    <Link
                                        key={page.href}
                                        href={page.href}
                                        className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors border-l-4 ${pathname === page.href
                                            ? 'border-l-copper bg-orange-50 text-copper font-semibold'
                                            : 'border-l-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                                            }`}
                                    >
                                        <span className={pathname === page.href ? 'text-copper' : 'text-gray-400'}>{page.icon}</span>
                                        {page.label}
                                    </Link>
                                ))}
                            </nav>
                        </div>
                    </aside>

                    {/* Content Area */}
                    <main className="flex-1 min-w-0">
                        <div className="bg-white rounded-xl border shadow-sm p-6 lg:p-8">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
