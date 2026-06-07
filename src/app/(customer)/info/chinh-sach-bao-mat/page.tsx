'use client';
import { SITE_URL } from "@/lib/constants";

export default function ChinhSachBaoMatPage() {
    const seoTitle = 'Chính sách bảo mật | Văn Lành Service';
    const seoDescription = 'Chính sách bảo mật thông tin khách hàng tại Văn Lành Service: mục đích thu thập, cam kết bảo mật và quyền lợi của khách hàng. Liên hệ hotline khi cần hỗ trợ.';
    const canonicalUrl = `${SITE_URL}/info/chinh-sach-bao-mat`;
    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Chính sách bảo mật thông tin khách hàng',
        description: seoDescription,
        url: canonicalUrl,
        publisher: { '@type': 'Organization', name: 'Văn Lành Service' },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    };
    const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Thông tin', item: `${SITE_URL}/info/chinh-sach-bao-mat` },
            { '@type': 'ListItem', position: 3, name: 'Chính sách bảo mật', item: canonicalUrl },
        ],
    };
    return (
        <article className="prose prose-sm sm:prose max-w-none">
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

            <h1 className="text-2xl font-bold mb-6">Chính sách bảo mật thông tin khách hàng</h1>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">1. Mục đích và phạm vi thu thập thông tin</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Văn Lành Service thu thập thông tin cá nhân của khách hàng nhằm phục vụ cho việc xử lý đơn hàng, cung cấp dịch vụ sửa chữa, bảo hành và hỗ trợ khách hàng. Các thông tin thu thập bao gồm: họ tên, số điện thoại, địa chỉ, email và thông tin thiết bị sửa chữa.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">2. Cam kết bảo mật</h2>
                <ul className="space-y-2 text-sm text-gray-700">
                    <li>🔒 Thông tin cá nhân của khách hàng được bảo mật tuyệt đối theo chính sách bảo mật của Văn Lành Service.</li>
                    <li>🔒 Không sử dụng, không chuyển giao, cung cấp hay tiết lộ cho bên thứ 3 nào về thông tin cá nhân của khách hàng khi không có sự cho phép hoặc đồng ý từ khách hàng.</li>
                    <li>🔒 Trong trường hợp máy chủ lưu trữ thông tin bị hacker tấn công dẫn đến mất dữ liệu cá nhân, Văn Lành Service sẽ có trách nhiệm thông báo vụ việc cho cơ quan chức năng điều tra xử lý kịp thời và thông báo cho khách hàng.</li>
                    <li>🔒 Bảo mật tuyệt đối mọi thông tin giao dịch trực tuyến của khách hàng bao gồm thông tin hóa đơn, chứng từ số hóa tại khu vực dữ liệu an toàn.</li>
                </ul>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">3. Quyền lợi khách hàng</h2>
                <ul className="space-y-2 text-sm text-gray-700">
                    <li>✅ Khách hàng có quyền yêu cầu kiểm tra, cập nhật, điều chỉnh hoặc hủy bỏ thông tin cá nhân của mình.</li>
                    <li>✅ Khách hàng có quyền gửi khiếu nại liên quan đến việc lộ thông tin cá nhân đến Ban quản trị của Văn Lành Service.</li>
                    <li>✅ Khi tiếp nhận phản hồi, Văn Lành Service sẽ xác nhận lại thông tin và phải có trách nhiệm trả lời lý do và hướng dẫn khách hàng khôi phục và bảo mật lại thông tin.</li>
                </ul>
            </section>

            <div className="bg-gray-100 rounded-xl p-5 text-center">
                <p className="text-sm text-gray-600">
                    Liên hệ: <a href="tel:0932242026" className="text-copper font-bold hover:underline">0932.242.026</a>
                    {' | '}<a href="https://vanlanhservice.com.vn" target="_blank" rel="noopener noreferrer" className="text-copper font-bold hover:underline">vanlanhservice.com.vn</a>
                </p>
            </div>
        </article>
    );
}
