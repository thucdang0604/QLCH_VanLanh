'use client';
import { SITE_URL } from "@/lib/constants";
import { useConfig } from "@/lib/ConfigContext";
import { getBusinessIdentity } from "@/lib/businessIdentity";

export default function ChinhSachMuaHangPage() {
    const { config, formatHotline } = useConfig();
    const identity = getBusinessIdentity(config);
    const branches = config.store_branches || [];
    const mainPhone = identity.mainPhone;
    const seoTitle = `Chính sách mua hàng & giao nhận | ${identity.siteName}`;
    const seoDescription = `Chính sách mua hàng từ xa, khu vực giao hàng toàn quốc, giá cả và hỗ trợ đặt hàng tại ${identity.siteName}.${mainPhone ? ` Hotline: ${identity.formattedPhone}.` : ''}`;
    const canonicalUrl = `${SITE_URL}/info/chinh-sach-mua-hang`;
    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Chính sách mua hàng & giao nhận',
        description: seoDescription,
        url: canonicalUrl,
        publisher: { '@type': 'Organization', name: identity.siteName },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    };
    const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: 'Thông tin', item: `${SITE_URL}/info/chinh-sach-mua-hang` },
            { '@type': 'ListItem', position: 3, name: 'Chính sách mua hàng', item: canonicalUrl },
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

            <h1 className="text-2xl font-bold mb-6">Chính sách mua hàng</h1>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">1. Mua hàng từ xa</h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-3">
                    Không cần trực tiếp đến cửa hàng, khách hàng có thể lựa chọn cách mua hàng online. Gọi điện thoại đến tổng đài thời gian từ 7h30–21h00 (cả CN & ngày lễ) để đặt hàng, nhân viên {identity.siteName} luôn sẵn sàng phục vụ, tư vấn và hỗ trợ quý khách mua được sản phẩm ưng ý.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {branches.map((branch) => (
                        <div key={branch.id} className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                            <h3 className="font-semibold text-gray-800 text-sm mb-1">🏪 {branch.name}</h3>
                            <p className="text-xs text-gray-600">{branch.address}</p>
                            <p className="text-xs text-gray-600">📞 <a href={`tel:${branch.phone}`} className="text-copper font-bold">{formatHotline(branch.phone)}</a></p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">2. Khu vực giao hàng</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    {identity.siteName} giao hàng <strong>toàn quốc</strong> đối với các sản phẩm do chính {identity.domain} phân phối.
                </p>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">3. Giá cả</h2>
                <ul className="space-y-2 text-sm text-gray-700">
                    <li>• Giá cả sản phẩm được niêm yết tại {identity.domain} là giá bán cuối cùng đã bao gồm thuế GTGT (VAT).</li>
                    <li>• Giá cả của sản phẩm có thể thay đổi tùy thời điểm và chương trình khuyến mãi kèm theo.</li>
                    <li>• Phí vận chuyển hoặc Phí thực hiện đơn hàng sẽ được áp dụng thêm nếu có, và sẽ được hiển thị rõ tại trang Thanh toán.</li>
                    <li>• Nếu phát hiện lỗi về giá, chúng tôi sẽ thông báo cho quý khách trong thời gian sớm nhất có thể và gửi lựa chọn xác nhận lại đơn hàng với giá chính xác hoặc hủy đơn hàng.</li>
                </ul>
            </section>

            <div className="bg-gray-100 rounded-xl p-5 text-center">
                <p className="text-sm text-gray-600">
                    Cần hỗ trợ mua hàng? Gọi ngay: {mainPhone ? <a href={`tel:${mainPhone}`} className="text-copper font-bold hover:underline">{identity.formattedPhone || formatHotline(mainPhone)}</a> : 'Đang cập nhật'}
                </p>
            </div>
        </article>
    );
}
