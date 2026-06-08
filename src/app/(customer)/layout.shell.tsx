'use client';

import Header from "@/components/layout/Header";
import dynamic from 'next/dynamic';
import { CartProvider } from "@/lib/CartContext";
import { useConfig } from "@/lib/ConfigContext";
import { usePresence } from "@/lib/usePresence";
import { Megaphone, X } from "lucide-react";
import { useState } from "react";
import { getBusinessIdentity } from "@/lib/businessIdentity";

const MobileBottomNav = dynamic(() => import("@/components/layout/MobileBottomNav"), { ssr: false });
const Footer = dynamic(() => import("@/components/layout/Footer"), { ssr: true });
const CartDrawer = dynamic(() => import("@/components/CartDrawer"), { ssr: false });

// Lazy load: ChatWidget & FloatingReviews không cần hiện ngay lúc trang mở
// => giảm initial JS bundle đáng kể trên mobile
const ChatWidget = dynamic(() => import("@/components/ChatWidget"), { ssr: false });
const FloatingReviews = dynamic(() => import("@/components/home/FloatingReviews"), { ssr: false });

function TopBar() {
    const { config } = useConfig();
    const [dismissed, setDismissed] = useState(false);
    if (!config.topBarEnabled || !config.topBarText || dismissed) return null;
    return (
        <div className="w-full bg-orange-500 text-white text-center text-sm py-2 px-4 flex items-center justify-center gap-2 relative">
            <Megaphone size={14} className="flex-shrink-0 opacity-80" />
            <span>{config.topBarText}</span>
            <button
                onClick={() => setDismissed(true)}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-70 hover:opacity-100 transition-opacity"
                aria-label="Đóng"
            >
                <X size={14} />
            </button>
        </div>
    );
}

import firebaseImageLoader from "@/lib/imageLoader";

export default function CustomerLayoutShell({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const { config } = useConfig();
    const identity = getBusinessIdentity(config);
    const bg = config.background_config;

    // Track online presence and visitors
    usePresence();

    // Build background styles for the outer wrapper
    const wrapperStyle: React.CSSProperties = {};
    if (bg.is_active) {
        if (bg.type === 'image' && bg.value) {
            // Apply proxy to background image if it's from Firebase Storage
            const optimizedBg = firebaseImageLoader({ src: bg.value, width: 1920, quality: 75 });
            wrapperStyle.backgroundImage = `url(${optimizedBg})`;
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
        name: identity.siteName,
        description: `${identity.siteName} sửa chữa điện thoại, laptop và thiết bị công nghệ tại TP.HCM. Linh kiện chính hãng, sửa chữa nhanh chóng.`,
        url: identity.siteUrl,
        telephone: identity.mainPhone,
        email: identity.email,
        address: (config.store_branches || []).map(branch => ({
            '@type': 'PostalAddress',
            streetAddress: branch.address,
            addressLocality: 'Hồ Chí Minh',
            addressCountry: 'VN',
        })),
        openingHours: 'Mo-Su 07:30-21:00',
        priceRange: '$$',
        image: identity.logoUrl || `${identity.siteUrl}/logo.png`,
        sameAs: [
            identity.socials.facebookLink,
            identity.socials.zaloLink,
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
                <TopBar />
                <Header />
                <main className="min-h-screen">
                    {children}
                </main>
                <Footer />
                <MobileBottomNav />
                <ChatWidget />
                <FloatingReviews />
                <CartDrawer />
            </div>
        </CartProvider>
    );
}
