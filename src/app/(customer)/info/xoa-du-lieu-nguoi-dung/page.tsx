'use client';

import { SITE_URL } from "@/lib/constants";
import { useConfig } from "@/lib/ConfigContext";
import { getBusinessIdentity } from "@/lib/businessIdentity";

export default function XoaDuLieuNguoiDungPage() {
    const { config } = useConfig();
    const identity = getBusinessIdentity(config);
    const seoTitle = `Hướng dẫn xóa dữ liệu người dùng | ${identity.siteName}`;
    const seoDescription = `Hướng dẫn khách hàng yêu cầu xóa dữ liệu cá nhân đã cung cấp cho ${identity.siteName}.`;
    const canonicalUrl = `${SITE_URL}/info/xoa-du-lieu-nguoi-dung`;
    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Hướng dẫn xóa dữ liệu người dùng',
        description: seoDescription,
        url: canonicalUrl,
        publisher: { '@type': 'Organization', name: identity.siteName },
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
                    Khách hàng có thể yêu cầu {identity.siteName} xóa hoặc ẩn các dữ liệu cá nhân đã cung cấp qua website, live chat, Facebook Messenger, Zalo OA hoặc các kênh hỗ trợ khác, trừ những dữ liệu cần lưu giữ theo nghĩa vụ kế toán, bảo hành hoặc quy định pháp luật.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">2. Cách gửi yêu cầu</h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-3">
                    Gửi yêu cầu xóa dữ liệu đến {identity.siteName} bằng một trong các cách sau:
                </p>
                <ul className="space-y-2 text-sm text-gray-700">
                    <li>Gọi hotline: <a href={`tel:${identity.mainPhone}`} className="text-copper font-bold hover:underline">{identity.formattedPhone}</a></li>
                    <li>Nhắn tin qua kênh Facebook/Zalo chính thức của {identity.siteName}.</li>
                    <li>Cung cấp số điện thoại, email hoặc tài khoản đã dùng để liên hệ để chúng tôi xác minh yêu cầu.</li>
                </ul>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">3. Thời gian xử lý</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Sau khi xác minh chủ thể dữ liệu, {identity.siteName} sẽ xử lý yêu cầu trong thời gian hợp lý và phản hồi kết quả qua kênh khách hàng đã sử dụng để liên hệ.
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
