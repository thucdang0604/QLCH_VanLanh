'use client';

import Link from 'next/link';
import { GraduationCap, CheckCircle2, Phone, MapPin, Clock, ChevronRight } from 'lucide-react';
import { useConfig } from '@/lib/ConfigContext';
import { SITE_URL } from "@/lib/constants";

export default function DaoTaoHocVienPage() {
    const { config, formatHotline } = useConfig();
    const branches = config.store_branches || [];
    const mainPhone = config.contact_info?.main_phone || branches[0]?.phone || '0932242026';

    const seoTitle = 'Đào tạo học viên sửa chữa | Văn Lành Service';
    const seoDescription =
        'Chương trình đào tạo học viên sửa chữa điện thoại, laptop, tablet tại Văn Lành Service (TP.HCM). Lộ trình thực hành, kèm 1-1, định hướng nghề nghiệp, hỗ trợ thực tập.';
    const canonicalUrl = `${SITE_URL}/dao-tao-hoc-vien`;

    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Đào tạo học viên sửa chữa tại Văn Lành Service',
        description: seoDescription,
        url: canonicalUrl,
        publisher: { '@type': 'Organization', name: config.siteName || 'Văn Lành Service' },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    };

    const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Đào tạo học viên', item: canonicalUrl },
        ],
    };

    return (
        <div className="py-4 sm:py-8">
            {/* SEO */}
            <title>{seoTitle}</title>
            <meta name="description" content={seoDescription} />
            <link rel="canonical" href={canonicalUrl} />
            <meta property="og:type" content="article" />
            <meta property="og:title" content={seoTitle} />
            <meta property="og:description" content={seoDescription} />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="twitter:card" content="summary_large_image" />
            <meta property="twitter:title" content={seoTitle} />
            <meta property="twitter:description" content={seoDescription} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />

            <div className="max-w-[1200px] mx-auto px-2 md:px-4">
                <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6">
                    <div className="max-w-2xl">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                            <GraduationCap size={28} className="text-orange-500" />
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                            Đào tạo học viên sửa chữa
                        </h1>
                        <p className="text-sm sm:text-base text-gray-600 mt-2">
                            Nếu bạn muốn theo nghề sửa chữa thiết bị công nghệ, Văn Lành Service có chương trình đào tạo
                            tập trung thực hành, kèm sát và định hướng công việc.
                        </p>
                    </div>

                    {/* Highlights */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mt-6">
                        {[
                            { title: 'Thực hành là chính', desc: 'Cầm máy làm thật, quy trình bài bản, lỗi thường gặp & case thực tế.' },
                            { title: 'Kèm 1-1 theo lộ trình', desc: 'Học theo năng lực, có bài kiểm tra/đánh giá theo từng chặng.' },
                            { title: 'Định hướng nghề nghiệp', desc: 'Tư vấn lộ trình lên KTV, hỗ trợ thực tập/cơ hội làm việc khi phù hợp.' },
                        ].map((it) => (
                            <div key={it.title} className="bg-gray-50 rounded-2xl border border-gray-100 p-4">
                                <p className="font-semibold text-gray-900">{it.title}</p>
                                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{it.desc}</p>
                            </div>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                            <div className="rounded-2xl border border-gray-100 bg-white">
                                <div className="p-4 sm:p-5 border-b border-gray-100">
                                    <h2 className="text-lg font-bold text-gray-900">Nội dung đào tạo</h2>
                                    <p className="text-sm text-gray-600 mt-1">
                                        Lộ trình có thể thay đổi theo trình độ đầu vào và mục tiêu (điện thoại/tablet/laptop).
                                    </p>
                                </div>
                                <div className="p-4 sm:p-5 space-y-4">
                                    <div>
                                        <p className="font-semibold text-gray-900">1) Nền tảng & dụng cụ</p>
                                        <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
                                            {[
                                                'An toàn điện, ESD, thao tác tháo lắp chuẩn',
                                                'Nhận diện linh kiện, sơ đồ khối, đo kiểm cơ bản',
                                                'Kỹ năng sử dụng dụng cụ & máy móc (khò, hàn, đồng hồ đo...)',
                                            ].map((t) => (
                                                <li key={t} className="flex gap-2">
                                                    <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
                                                    <span>{t}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div>
                                        <p className="font-semibold text-gray-900">2) Sửa chữa phần cứng phổ biến</p>
                                        <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
                                            {[
                                                'Thay màn hình, pin, cổng sạc, camera, loa/mic',
                                                'Xử lý lỗi nguồn, sạc, nóng máy, chập chờn',
                                                'Lỗi cảm ứng, sóng, wifi/bluetooth, mất âm',
                                            ].map((t) => (
                                                <li key={t} className="flex gap-2">
                                                    <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
                                                    <span>{t}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div>
                                        <p className="font-semibold text-gray-900">3) Sửa chữa phần mềm</p>
                                        <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
                                            {[
                                                'Quy trình kiểm tra, sao lưu dữ liệu, update/restore',
                                                'Xử lý lỗi treo logo, bootloop, lỗi app, lỗi hệ thống cơ bản',
                                                'Tối ưu hiệu năng, reset đúng quy trình, test sau sửa',
                                            ].map((t) => (
                                                <li key={t} className="flex gap-2">
                                                    <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
                                                    <span>{t}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
                                        <p className="font-semibold text-gray-900">Học phí & thời gian</p>
                                        <p className="text-sm text-gray-700 mt-1 leading-relaxed">
                                            Bạn liên hệ hotline để được tư vấn lộ trình phù hợp (cơ bản/nâng cao), thời gian học và
                                            chi phí theo mục tiêu học.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:p-5">
                                <h2 className="text-lg font-bold text-gray-900">Cách đăng ký</h2>
                                <ol className="mt-3 space-y-2 text-sm text-gray-700">
                                    {[
                                        'Gọi hotline hoặc nhắn Zalo để đặt lịch tư vấn.',
                                        'Trao đổi mục tiêu học và lịch học mong muốn.',
                                        'Đến cửa hàng tham quan lớp/khu kỹ thuật và bắt đầu lộ trình.',
                                    ].map((t, i) => (
                                        <li key={t} className="flex gap-3">
                                            <span className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-700 shrink-0">
                                                {i + 1}
                                            </span>
                                            <span className="leading-relaxed">{t}</span>
                                        </li>
                                    ))}
                                </ol>
                                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                                    <a
                                        href={`tel:${mainPhone}`}
                                        className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold hover:shadow-lg hover:shadow-orange-500/30 transition-all active:scale-[0.99]"
                                    >
                                        <Phone size={16} />
                                        Gọi {formatHotline(mainPhone)}
                                    </a>
                                    <Link
                                        href="/info/gioi-thieu"
                                        className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
                                    >
                                        <MapPin size={16} />
                                        Xem địa chỉ cửa hàng
                                        <ChevronRight size={16} />
                                    </Link>
                                </div>
                            </div>
                        </div>

                        {/* Sidebar */}
                        <aside className="lg:col-span-1">
                            <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:p-5 sticky top-24">
                                <h3 className="font-bold text-gray-900">Thông tin nhanh</h3>
                                <div className="mt-3 space-y-2 text-sm text-gray-700">
                                    <div className="flex items-start gap-2">
                                        <Clock size={16} className="text-orange-500 mt-0.5" />
                                        <span>Giờ làm việc: 7h30 – 21h00 (Thứ 2 – CN)</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <Phone size={16} className="text-orange-500 mt-0.5" />
                                        <span>Hotline tư vấn: {formatHotline(mainPhone)}</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <MapPin size={16} className="text-orange-500 mt-0.5" />
                                        <span>
                                            {branches[0]?.address || '117 Nguyên Hồng, Bình Thạnh, TP.HCM'}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                                    Lưu ý: chương trình tập trung thực hành. Bạn nên mang theo laptop cá nhân (nếu có) để ghi chú
                                    và theo dõi tài liệu.
                                </p>
                            </div>
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    );
}

