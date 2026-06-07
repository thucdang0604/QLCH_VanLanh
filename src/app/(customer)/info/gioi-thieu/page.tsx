'use client';
import { SITE_URL } from "@/lib/constants";

export default function GioiThieuPage() {
    const seoTitle = 'Giới thiệu | Văn Lành Service';
    const seoDescription = 'Giới thiệu Văn Lành Service – trung tâm sửa chữa điện thoại, laptop và phụ kiện công nghệ uy tín tại TP.HCM. Thông tin hệ thống, dịch vụ, hotline và địa chỉ.';
    const canonicalUrl = `${SITE_URL}/info/gioi-thieu`;
    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: 'Giới thiệu Văn Lành Service',
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
            { '@type': 'ListItem', position: 2, name: 'Thông tin', item: `${SITE_URL}/info/gioi-thieu` },
            { '@type': 'ListItem', position: 3, name: 'Giới thiệu', item: canonicalUrl },
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

            <h1 className="text-2xl font-bold mb-6">Giới Thiệu Văn Lành Service</h1>

            {/* Lịch sử hình thành */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">📜 Lịch sử hình thành</h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Qua hơn 2 năm kinh nghiệm trong thị trường di động tại Việt Nam, chúng tôi nhận thấy nhu cầu tìm kiếm một cửa hàng đủ uy tín về các dịch vụ sửa chữa là rất lớn nhưng trên thị trường vẫn chưa thể đáp ứng được. <strong>Văn Lành Service</strong> ra đời với sự khởi đầu là cửa hàng hoạt động trên các quận trung tâm Thành phố Hồ Chí Minh.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed mt-2">
                    Văn Lành Service luôn nỗ lực thể hiện sự chuyên nghiệp nhất có thể cùng sự <strong>Tận Tâm</strong> phục vụ khách hàng, lấy khách hàng làm trung tâm. Hệ thống mong muốn thực hiện những dịch vụ sửa chữa với trách nhiệm cao nhất, đi cùng sự cam kết và lòng trung thực tuyệt đối trong quá trình làm việc.
                </p>
            </section>

            {/* Mục tiêu và sứ mệnh */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">🎯 Mục tiêu và sứ mệnh</h2>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 space-y-3">
                    <div>
                        <h3 className="font-semibold text-gray-800 mb-1">Mục tiêu:</h3>
                        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                            <li>Trở thành Hệ thống chuyên Sửa chữa các thiết bị công nghệ như Điện thoại di động, Máy tính bảng, Laptop, Apple Watch,… lớn nhất và uy tín nhất tại TP.HCM.</li>
                            <li>Trở thành Trung tâm bảo hành toàn diện cho các đối tác là những chuỗi hệ thống bán lẻ thiết bị công nghệ trên cả nước.</li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-800 mb-1">Sứ mệnh:</h3>
                        <p className="text-sm text-gray-700">Mang lại sự thoải mái, cảm giác an tâm và vui vẻ khi Khách hàng nghĩ về Ngành dịch vụ sửa chữa.</p>
                    </div>
                </div>
            </section>

            {/* Nguồn lực */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">💪 Nguồn lực</h2>
                <ul className="space-y-2 text-sm text-gray-700">
                    <li>✅ Đội ngũ nhân viên tư vấn am hiểu công nghệ, tận tâm phục vụ cùng các kỹ thuật viên trình độ cao — từ Trung Cấp, Cao Đẳng, Đại Học đến Chuyên Viên Điện Tử Viễn Thông.</li>
                    <li>✅ Nguồn linh kiện – phụ kiện chất lượng, đa dạng và uy tín, đảm bảo nguồn gốc xuất xứ.</li>
                    <li>✅ Không gian thoáng mát, nội thất được nâng cấp, phục vụ Tận Tâm để Quý khách thoải mái nhất.</li>
                    <li>✅ Trang thiết bị sửa chữa hiện đại, công nghệ tiên tiến nhất — xử lý từ lỗi đơn giản đến phức tạp.</li>
                    <li>✅ Phòng ép kính chân không hiện đại — thay thế màn hình, mặt kính chất lượng và nhanh chóng.</li>
                    <li>✅ Nguồn cung ứng linh phụ kiện chính hãng dồi dào — luôn sẵn sàng phục vụ sửa chữa lấy ngay.</li>
                </ul>
            </section>

            {/* Các dịch vụ */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">🔧 Các dịch vụ</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                        'Sửa chữa iPhone', 'Sửa chữa iPad', 'Sửa chữa Tablet', 'Sửa chữa MacBook',
                        'Sửa chữa iMac, Mac mini, Mac Pro', 'Sửa chữa Laptop', 'Sửa chữa Apple Watch', 'Sửa chữa Airpods',
                        'Sửa chữa điện thoại Android (Samsung, Xiaomi, Oppo, Sony, LG...)',
                        'Thay cảm ứng, mặt kính điện thoại, tablet',
                        'Thay màn hình, thay vỏ và linh kiện khác',
                        'Sửa chữa phần cứng, sửa/thay mainboard',
                        'Repair BOOT, EMMC, Unbrick smartphone',
                        'Unlock Smartphone tất cả Nhà Mạng',
                        'Xử lý iCloud, Passcode, DRM, Google Account, Samsung Account, MiCloud...',
                    ].map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="text-copper mt-0.5">•</span> {s}
                        </div>
                    ))}
                </div>
                <h3 className="font-semibold text-gray-800 mt-4 mb-2">Phụ kiện công nghệ:</h3>
                <p className="text-sm text-gray-600">Ốp lưng, Cáp sạc, Củ sạc, Pin sạc dự phòng, Tai nghe Bluetooth/có dây, Loa nghe nhạc, Kính cường lực, Miếng dán màn hình...</p>
            </section>

            {/* Hệ thống quản lý */}
            <section className="mb-8">
                <h2 className="text-lg font-bold text-gray-900 mb-3">🏪 Hệ thống</h2>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
                    <h3 className="font-bold text-gray-900 mb-2">Trụ sở chính</h3>
                    <p className="text-sm text-gray-600 mb-1">📍 117 Nguyên Hồng, Phường Bình Lợi Trung, Bình Thạnh, TP.HCM</p>
                    <p className="text-sm text-gray-600 mb-1">📞 Hotline: <a href="tel:0932242026" className="text-copper font-bold hover:underline">0932.242.026</a></p>
                    <p className="text-sm text-gray-600 mb-1">📞 Bán hàng: <a href="tel:0975242026" className="text-copper font-bold hover:underline">0975.242.026</a> – <a href="tel:0981242026" className="text-copper font-bold hover:underline">0981.242.026</a></p>
                    <p className="text-sm text-gray-600">🕘 Giờ làm việc: 7h30 – 21h00 (Thứ 2 – Chủ Nhật)</p>
                </div>
                <div className="mt-4 rounded-xl overflow-hidden border border-gray-200">
                    <iframe
                        src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=117+Nguy%C3%AAn+H%E1%BB%93ng,+B%C3%ACnh+Th%E1%BA%A1nh,+TP.HCM&zoom=16"
                        width="100%"
                        height="300"
                        style={{ border: 0 }}
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        title="Văn Lành Service - Google Maps"
                    />
                    <a
                        href="https://maps.app.goo.gl/oHjSM6ztw4ExyfwJA"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 py-3 bg-gray-50 text-copper font-semibold text-sm hover:bg-orange-50 transition-colors"
                    >
                        📍 Mở Google Maps — Chỉ đường
                    </a>
                </div>
            </section>

            {/* CTA */}
            <div className="bg-gray-900 rounded-xl p-6 text-center text-white">
                <h2 className="text-lg font-bold mb-2">Liên hệ ngay để được tư vấn!</h2>
                <p className="text-gray-400 text-sm mb-4">Đội ngũ chăm sóc khách hàng luôn sẵn sàng hỗ trợ bạn</p>
                <div className="flex flex-wrap justify-center gap-3">
                    <a href="tel:0932242026" className="px-6 py-3 bg-copper text-white font-semibold rounded-lg hover:bg-copper-dark transition-colors">
                        📞 Gọi: 0932.242.026
                    </a>
                    <a href="https://zalo.me/0932242026" target="_blank" rel="noopener noreferrer" className="px-6 py-3 border border-gray-600 text-white font-semibold rounded-lg hover:border-copper hover:text-copper transition-colors">
                        💬 Chat Zalo
                    </a>
                </div>
            </div>
        </article>
    );
}
