'use client';
import { SITE_URL } from "@/lib/constants";

export default function TraGopPage() {
    const seoTitle = 'Trả góp | Văn Lành Service';
    const seoDescription = 'Hướng dẫn mua hàng trả góp tại Văn Lành Service: thủ tục, giấy tờ, điều kiện trả trước và các hình thức trả góp (công ty tài chính, ngân hàng, paylater).';
    const canonicalUrl = `${SITE_URL}/info/tra-gop`;
    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Mua hàng trả góp',
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
            { '@type': 'ListItem', position: 2, name: 'Thông tin', item: `${SITE_URL}/info/tra-gop` },
            { '@type': 'ListItem', position: 3, name: 'Trả góp', item: canonicalUrl },
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

            <h1 className="text-2xl font-bold mb-6">Mua hàng trả góp</h1>

            <p className="text-sm text-gray-700 leading-relaxed mb-6">
                Mua hàng trả góp được đánh giá là phương thức mua sắm thông minh, tiện lợi và đơn giản. Chỉ với một khoản trả trước rất ít và mỗi tháng chi trả một mức chi phí hợp lý.
            </p>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">Thủ tục mua trả góp</h2>
                <div className="space-y-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <h3 className="font-semibold text-blue-800 text-sm mb-1">Đối tượng</h3>
                        <p className="text-sm text-blue-700">Tất cả công dân Việt Nam trong độ tuổi từ 20 – 60 tuổi</p>
                    </div>
                    <h3 className="font-semibold text-gray-800">Điều kiện trả trước:</h3>
                    <ul className="space-y-1 text-sm text-gray-700">
                        <li>• Sản phẩm Apple: Trả trước <strong>50%</strong> giá trị khoản vay</li>
                        <li>• Khoản vay dưới 7 triệu: Trả trước <strong>20%</strong></li>
                        <li>• Khoản vay từ 7 – 13 triệu: Trả trước <strong>30%</strong></li>
                        <li>• Khoản vay từ 13 triệu trở lên: Trả trước <strong>40%</strong></li>
                    </ul>
                    <h3 className="font-semibold text-gray-800">Giấy tờ cần thiết:</h3>
                    <ul className="space-y-1 text-sm text-gray-700">
                        <li>• Khoản vay dưới 10 triệu: CMND + Bằng lái xe</li>
                        <li>• Khoản vay trên 10 triệu: CMND + Hộ khẩu</li>
                    </ul>
                    <ul className="space-y-1 text-sm text-gray-700 mt-2">
                        <li>⏱️ Thời gian duyệt hồ sơ: <strong>10 – 30 phút</strong></li>
                        <li>📊 Lãi suất thấp nhất: <strong>0.96%/tháng</strong> (theo dư nợ giảm dần)</li>
                        <li>💳 Kỳ hạn: 6 – 9 – 12 tháng</li>
                        <li>🏦 Thanh toán: Tại Văn Lành Service hoặc chi nhánh Đông Á, Sacombank, BIDV</li>
                    </ul>
                </div>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">Các hình thức trả góp</h2>
                <div className="space-y-4">
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                        <h3 className="font-bold text-gray-800 text-sm mb-2">🏢 Trả góp qua Công ty tài chính (FE Credit, Home Credit, HD Saison)</h3>
                        <ul className="text-xs text-gray-600 space-y-1">
                            <li>• Thủ tục đơn giản: CMND + Sổ hộ khẩu/GPLX</li>
                            <li>• Không cần thẻ tín dụng, không phải đến ngân hàng</li>
                            <li>• Thời gian xét duyệt: 10-30 phút</li>
                            <li>• Áp dụng: điện thoại, iPad, Macbook</li>
                        </ul>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                        <h3 className="font-bold text-gray-800 text-sm mb-2">🏦 Trả góp 0% qua Ngân hàng</h3>
                        <ul className="text-xs text-gray-600 space-y-1">
                            <li>• Trả góp 0% lãi suất — Không cần xét duyệt</li>
                            <li>• Không cần chứng minh thu nhập, không cần CMND/GPLX</li>
                            <li>• Ngân hàng: Sacombank, VP Bank, Shinhan Bank, Eximbank, VIB, HSBC, Techcombank, Vietinbank…</li>
                        </ul>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                        <h3 className="font-bold text-gray-800 text-sm mb-2">📱 Trả góp 0% qua Paylater</h3>
                        <ul className="text-xs text-gray-600 space-y-1">
                            <li>• Chỉ cần CMND + hình selfie</li>
                            <li>• Trả góp 0% trong 3 tháng đầu</li>
                            <li>• Chu kì 12 tháng, từ tháng 4: lãi suất 1.52%/tháng + phí 2.38%</li>
                        </ul>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <h3 className="font-bold text-gray-800 text-sm mb-2">💳 Trả góp 0% qua MPOS / Alepay Online</h3>
                        <ul className="text-xs text-gray-600 space-y-1">
                            <li>• Thanh toán online, không cần đến cửa hàng</li>
                            <li>• Trả góp 0%, thanh toán an toàn</li>
                            <li>• Áp dụng nhiều ngân hàng: Sacombank, VP Bank, Shinhan Bank, Eximbank, VIB…</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">Câu hỏi thường gặp</h2>
                <div className="space-y-3">
                    {[
                        { q: 'Tôi không có hộ khẩu ở TP.HCM có thể mua trả góp được không?', a: 'Dịch vụ trả góp tại Văn Lành Service hỗ trợ khách hàng có hộ khẩu/KT3 ở 63 tỉnh thành trên cả nước.' },
                        { q: 'Bản sao Hộ khẩu có làm hồ sơ được không?', a: 'Bạn có thể dùng bản sao để làm hồ sơ, tuy nhiên khi có kết quả phải mang bản gốc để nhận máy.' },
                        { q: 'Mua trả góp có nhận được khuyến mãi không?', a: 'Mọi chương trình khuyến mãi đang áp dụng cho khách mua tại cửa hàng cũng áp dụng khi mua trả góp.' },
                    ].map((faq, i) => (
                        <div key={i} className="border border-gray-200 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-gray-800 mb-1">{faq.q}</h4>
                            <p className="text-xs text-gray-600">{faq.a}</p>
                        </div>
                    ))}
                </div>
            </section>

            <div className="bg-gray-100 rounded-xl p-5 text-center">
                <p className="text-sm text-gray-600">
                    Tư vấn trả góp: <a href="tel:0932242026" className="text-copper font-bold hover:underline">0932.242.026</a>
                </p>
            </div>
        </article>
    );
}
