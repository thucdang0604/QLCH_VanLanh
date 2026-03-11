'use client';

import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import ChatWidget from "@/components/ChatWidget";
import FloatingReviews from "@/components/home/FloatingReviews";
import { CartProvider } from "@/lib/CartContext";
import { useConfig } from "@/lib/ConfigContext";
import { usePresence } from "@/lib/usePresence";

export default function CustomerLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const { config } = useConfig();
    const bg = config.background_config;

    // Track online presence and visitors
    usePresence();

    // Build background styles for the outer wrapper
    const wrapperStyle: React.CSSProperties = {};
    if (bg.is_active) {
        if (bg.type === 'image' && bg.value) {
            wrapperStyle.backgroundImage = `url(${bg.value})`;
            wrapperStyle.backgroundAttachment = 'fixed';
            wrapperStyle.backgroundSize = 'cover';
            wrapperStyle.backgroundPosition = 'center';
            wrapperStyle.backgroundRepeat = 'no-repeat';
        } else if (bg.type === 'color' && bg.value) {
            wrapperStyle.backgroundColor = bg.value;
        }
    }

    // LocalBusiness Schema for SEO
    const localBusinessSchema = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: config.siteName || 'Văn Lành Service',
        description: 'Trung tâm sửa chữa điện thoại, laptop & thiết bị công nghệ uy tín tại TP.HCM. CÔNG TY TNHH VIỄN THÔNG VĂN LÀNH SERVICE. Linh kiện chính hãng, sửa chữa nhanh chóng.',
        url: 'https://vanlanhservice.com.vn',
        telephone: config.contact_info?.main_phone || '0932242026',
        email: config.contact_info?.email || 'vanlanh.vn@gmail.com',
        address: (config.store_branches || []).map(branch => ({
            '@type': 'PostalAddress',
            streetAddress: branch.address,
            addressLocality: 'Hồ Chí Minh',
            addressCountry: 'VN',
        })),
        openingHours: 'Mo-Su 07:30-21:00',
        priceRange: '$$',
        image: 'https://vanlanhservice.com.vn/logo.png',
        sameAs: [
            config.contact_info?.facebook_link || '',
            config.contact_info?.zalo_link || '',
        ].filter(Boolean),
    };

    return (
        <CartProvider>
            <div className="min-h-screen w-full" style={wrapperStyle}>
                {/* SEO: LocalBusiness Schema */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
                />
                <Header />
                <main className="min-h-screen">
                    {children}
                </main>
                <Footer />
                <MobileBottomNav />
                <ChatWidget />
                <FloatingReviews />
            </div>
        </CartProvider>
    );
}
