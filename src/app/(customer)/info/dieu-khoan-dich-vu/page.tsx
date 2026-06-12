'use client';

import { SITE_URL } from "@/lib/constants";
import { useConfig } from "@/lib/ConfigContext";
import { getBusinessIdentity } from "@/lib/businessIdentity";

export default function DieuKhoanDichVuPage() {
    const { config } = useConfig();
    const identity = getBusinessIdentity(config);
    const seoTitle = `Điều khoản dịch vụ | ${identity.siteName}`;
    const seoDescription = `Điều khoản sử dụng website, dịch vụ tư vấn, sửa chữa và mua bán tại ${identity.siteName}.`;
    const canonicalUrl = `${SITE_URL}/info/dieu-khoan-dich-vu`;
    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Điều khoản dịch vụ',
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

            <h1 className="text-2xl font-bold mb-6">Điều khoản dịch vụ</h1>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">1. Phạm vi áp dụng</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Khi truy cập website hoặc sử dụng các kênh tư vấn của {identity.siteName}, khách hàng đồng ý tuân thủ các điều khoản về đặt lịch, mua hàng, sửa chữa, bảo hành và trao đổi thông tin được công bố trên website.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">2. Thông tin dịch vụ và báo giá</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Thông tin sản phẩm, linh kiện, dịch vụ và giá bán được cập nhật theo từng thời điểm. Trong trường hợp có sai sót hiển thị hoặc thay đổi từ nhà cung cấp, {identity.siteName} sẽ thông báo lại cho khách hàng trước khi xác nhận giao dịch.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">3. Tài khoản và thông tin liên hệ</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Khách hàng chịu trách nhiệm về tính chính xác của thông tin liên hệ khi đặt hàng, đặt lịch sửa chữa hoặc gửi yêu cầu hỗ trợ. {identity.siteName} sử dụng thông tin này để xác nhận, xử lý và chăm sóc sau dịch vụ.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">4. Giới hạn trách nhiệm</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    {identity.siteName} nỗ lực duy trì website hoạt động ổn định và thông tin chính xác. Tuy nhiên, website có thể tạm ngưng hoặc thay đổi nội dung khi bảo trì, nâng cấp hệ thống hoặc xử lý sự cố kỹ thuật.
                </p>
            </section>

            <div className="bg-gray-100 rounded-xl p-5 text-center">
                <p className="text-sm text-gray-600">
                    Cần hỗ trợ về điều khoản dịch vụ? Liên hệ: <a href={`tel:${identity.mainPhone}`} className="text-copper font-bold hover:underline">{identity.formattedPhone}</a>
                </p>
            </div>
        </article>
    );
}
