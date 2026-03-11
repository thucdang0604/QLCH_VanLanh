'use client';
export default function ChinhSachBaoHanhPage() {
    const seoTitle = 'Chính sách bảo hành | Văn Lành Service';
    const seoDescription = 'Chính sách bảo hành sửa chữa tại Văn Lành Service: điều kiện bảo hành, lưu ý quan trọng và hotline hỗ trợ. Cam kết hoàn tiền 100% trong 30 ngày nếu không hài lòng.';
    const canonicalUrl = 'https://qlch-vanlanh.web.app/info/chinh-sach-bao-hanh';
    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Chính sách bảo hành',
        description: seoDescription,
        url: canonicalUrl,
        publisher: { '@type': 'Organization', name: 'Văn Lành Service' },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    };
    const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: 'https://qlch-vanlanh.web.app/' },
            { '@type': 'ListItem', position: 2, name: 'Thông tin', item: 'https://qlch-vanlanh.web.app/info/chinh-sach-bao-hanh' },
            { '@type': 'ListItem', position: 3, name: 'Chính sách bảo hành', item: canonicalUrl },
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

            <h1 className="text-2xl font-bold mb-6">Chính sách bảo hành</h1>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">1. Chính sách bảo hành sửa chữa tiêu chuẩn tại Văn Lành Service</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Với một dịch vụ sửa chữa/thay thế thì hệ thống Văn Lành Service sẽ áp dụng một chính sách Bảo hành cụ thể. Tùy theo thiết bị của quý khách mà thời gian bảo hành sửa chữa có thể khác nhau. Và nếu có bất kỳ thắc mắc nào, Quý khách hàng đừng ngần ngại gọi đến hotline <a href="tel:0932242026" className="text-copper font-bold hover:underline">0932.242.026</a> để được tư vấn thêm.
                </p>
                <div className="bg-green-50 border border-green-200 rounded-xl p-5 mt-4">
                    <p className="text-sm text-green-800 font-semibold">
                        🎉 Đặc biệt: Văn Lành Service sẽ <strong>HOÀN TIỀN 100%</strong> trong vòng 30 ngày khi Khách hàng <strong>KHÔNG HÀI LÒNG</strong> về dịch vụ.
                    </p>
                </div>
            </section>

            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">2. Điều kiện bảo hành sửa chữa dịch vụ</h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-3">
                    Quý khách hàng vui lòng đăng xuất tất cả các tài khoản của hãng như iCloud, Samsung Account, MiCloud…, tắt mật khẩu bảo vệ trên màn hình trước khi mang sản phẩm đến bảo hành. Điều này giúp cho các kỹ thuật viên thuận tiện hơn trong việc test máy trước và sau khi sửa chữa.
                </p>
                <p className="text-sm text-gray-700 font-semibold mb-2">Đồng thời các thiết bị cần thỏa các điều kiện sau:</p>
                <ul className="space-y-2 text-sm text-gray-700">
                    <li>❌ Máy không vào nước, ẩm ướt.</li>
                    <li>❌ Không bị rơi vỡ hoặc bị tác động ngoại lực.</li>
                    <li>✅ Tem bảo hành còn nguyên vẹn, không bị rách/dán đè/bị sửa đổi.</li>
                    <li>🔋 Đối với pin: pin không ổn định khi sử dụng, pin ảo (tăng giảm % không đều), tự động tắt nguồn.</li>
                </ul>
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mt-4">
                    <p className="text-sm text-yellow-800">
                        <strong>⚠️ Lưu ý:</strong> Văn Lành Service chỉ bảo hành các phần đã sửa chữa hoặc những linh kiện đã thay thế. Đối với những lỗi phát sinh nằm ngoài phạm vi sửa chữa sẽ KHÔNG được bảo hành.
                    </p>
                </div>
            </section>

            <div className="bg-gray-100 rounded-xl p-5 text-center">
                <p className="text-sm text-gray-600">
                    Mọi thắc mắc về bảo hành, vui lòng liên hệ: <a href="tel:0932242026" className="text-copper font-bold hover:underline">0932.242.026</a>
                    {' '}hoặc truy cập <a href="https://vanlanhservice.com.vn" target="_blank" className="text-copper font-bold hover:underline">vanlanhservice.com.vn</a>
                </p>
            </div>
        </article>
    );
}
