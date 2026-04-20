'use client';
import { SITE_URL } from "@/lib/constants";

export default function ChinhSachDoiTraPage() {
    const seoTitle = 'Chính sách đổi trả | Văn Lành Service';
    const seoDescription = 'Chính sách đổi trả hàng tại Văn Lành Service: điều kiện đổi trả máy/phụ kiện, lưu ý về dữ liệu và hotline hỗ trợ. Vui lòng đọc kỹ trước khi đổi trả.';
    const canonicalUrl = `${SITE_URL}/info/chinh-sach-doi-tra`;
    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Chính sách đổi trả hàng',
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
            { '@type': 'ListItem', position: 2, name: 'Thông tin', item: `${SITE_URL}/info/chinh-sach-doi-tra` },
            { '@type': 'ListItem', position: 3, name: 'Chính sách đổi trả', item: canonicalUrl },
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

            <h1 className="text-2xl font-bold mb-6">Chính sách đổi trả hàng</h1>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">Điều kiện đổi trả</h2>
                <ol className="space-y-2 text-sm text-gray-700 list-decimal list-inside">
                    <li>Máy không bị trầy xước ở màn hình. Vỏ, thân máy không trầy xước và phụ kiện không trầy xước (nếu đổi nguyên bộ).</li>
                    <li>Vỏ hộp còn đầy đủ, không bẩn, rách, móp, vẽ/viết lên vỏ hộp, IMEI vỏ hộp trùng IMEI trên máy.</li>
                    <li>Phụ kiện đi kèm máy lỗi không cũ, hỏng, chập cháy, ngấm chất lỏng, còn nguyên tem.</li>
                    <li>Có phiếu bảo hành (nếu có), hóa đơn và đầy đủ phụ kiện đi kèm (nếu đổi khác chủng loại).</li>
                    <li>Còn quà khuyến mại (nếu có) với máy đổi khác chủng loại. Không phải hoàn trả sim khuyến mại.</li>
                    <li>iPhone/iPad/Apple Watch lỗi khi đổi phải thoát tài khoản iCloud, mật khẩu giới hạn, mật khẩu khóa màn hình.</li>
                    <li>Máy Samsung phải thoát tài khoản Samsung Account. Máy Xiaomi phải thoát Mi Account.</li>
                </ol>
            </section>

            <section className="mb-8">
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
                    <h3 className="font-bold text-yellow-800 mb-2">⚠️ Lưu ý về dữ liệu trên các thiết bị</h3>
                    <p className="text-sm text-yellow-800">
                        Quý khách hàng vui lòng chủ động tự sao lưu dữ liệu. Chúng tôi hoàn toàn ý thức được tầm quan trọng của dữ liệu của khách hàng và luôn cố gắng hết sức để hỗ trợ – hướng dẫn khách hàng trong việc sao lưu dữ liệu. Tuy nhiên, cửa hàng <strong>không chịu trách nhiệm</strong> về việc mất bất cứ dữ liệu trong mọi trường hợp.
                    </p>
                </div>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">Điều kiện áp dụng phụ kiện</h2>
                <ul className="space-y-2 text-sm text-gray-700">
                    <li>✅ Sản phẩm bị lỗi do nhà sản xuất và đủ điều kiện bảo hành.</li>
                    <li>✅ Sản phẩm có Phiếu/Thẻ bảo hành đi kèm (nếu có) và nguyên tem bảo hành.</li>
                    <li>✅ Có hóa đơn tài chính kèm sản phẩm. Thời hạn đổi tính từ ngày trên hóa đơn.</li>
                </ul>
                <p className="text-sm text-gray-600 mt-3 italic">
                    Lưu ý: Sản phẩm được đổi mới tiếp tục được hưởng chính sách đổi, bảo hành với thời gian còn lại của sản phẩm lỗi. Hàng tặng kèm/khuyến mại không áp dụng chính sách bảo hành, đổi trả.
                </p>
            </section>

            <div className="bg-gray-100 rounded-xl p-5 text-center">
                <p className="text-sm text-gray-600">
                    Hỗ trợ đổi trả: <a href="tel:0932242026" className="text-copper font-bold hover:underline">0932.242.026</a>
                </p>
            </div>
        </article>
    );
}
