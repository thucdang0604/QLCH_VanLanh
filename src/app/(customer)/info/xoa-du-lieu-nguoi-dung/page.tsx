'use client';

import { SITE_URL } from "@/lib/constants";

export default function XoaDuLieuNguoiDungPage() {
    const seoTitle = 'Hướng dẫn xóa dữ liệu người dùng | Văn Lành Service';
    const seoDescription = 'Hướng dẫn khách hàng yêu cầu xóa dữ liệu cá nhân đã cung cấp cho Văn Lành Service.';
    const canonicalUrl = `${SITE_URL}/info/xoa-du-lieu-nguoi-dung`;
    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Hướng dẫn xóa dữ liệu người dùng',
        description: seoDescription,
        url: canonicalUrl,
        publisher: { '@type': 'Organization', name: 'Văn Lành Service' },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    };

    return (
        <article className="prose prose-sm sm:prose max-w-none">
            <title>{seoTitle}</title>
            <meta name="description" content={seoDescription} />
            <link rel="canonical" href={canonicalUrl} />
            <meta property="og:type" content="article" />
            <meta property="og:title" content={seoTitle} />
            <meta property="og:description" content={seoDescription} />
            <meta property="og:url" content={canonicalUrl} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

            <h1 className="text-2xl font-bold mb-6">Hướng dẫn xóa dữ liệu người dùng</h1>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">1. Quyền yêu cầu xóa dữ liệu</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Khách hàng có thể yêu cầu Văn Lành Service xóa hoặc ẩn các dữ liệu cá nhân đã cung cấp qua website, live chat, Facebook Messenger, Zalo OA hoặc các kênh hỗ trợ khác, trừ những dữ liệu cần lưu giữ theo nghĩa vụ kế toán, bảo hành hoặc quy định pháp luật.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">2. Cách gửi yêu cầu</h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-3">
                    Gửi yêu cầu xóa dữ liệu đến Văn Lành Service bằng một trong các cách sau:
                </p>
                <ul className="space-y-2 text-sm text-gray-700">
                    <li>Gọi hotline: <a href="tel:0932242026" className="text-copper font-bold hover:underline">0932.242.026</a></li>
                    <li>Nhắn tin qua kênh Facebook/Zalo chính thức của Văn Lành Service.</li>
                    <li>Cung cấp số điện thoại, email hoặc tài khoản đã dùng để liên hệ để chúng tôi xác minh yêu cầu.</li>
                </ul>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">3. Thời gian xử lý</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Sau khi xác minh chủ thể dữ liệu, Văn Lành Service sẽ xử lý yêu cầu trong thời gian hợp lý và phản hồi kết quả qua kênh khách hàng đã sử dụng để liên hệ.
                </p>
            </section>

            <div className="bg-gray-100 rounded-xl p-5 text-center">
                <p className="text-sm text-gray-600">
                    URL dùng cho Meta Data Deletion: <span className="font-semibold text-gray-900">{canonicalUrl}</span>
                </p>
            </div>
        </article>
    );
}
