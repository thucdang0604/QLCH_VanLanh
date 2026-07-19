'use client';

import { useEffect, useMemo, useState } from 'react';
import { Megaphone } from 'lucide-react';
import CustomerHome from '@/app/(customer)/page.client';
import type { SSRHomeConfig } from '@/app/(customer)/page';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import { CartProvider } from '@/lib/CartContext';
import { ConfigPreviewProvider } from '@/lib/ConfigContext';
import { DEFAULT_CONFIG, type SiteConfig } from '@/lib/config-defaults';

type PreviewMessage = {
    type?: string;
    config?: SiteConfig;
    theme?: 'light' | 'dark';
};

function PreviewTopBar({ config }: { config: SiteConfig }) {
    if (!config.topBarEnabled || !config.topBarText) return null;
    return (
        <div className="flex w-full items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-center text-sm text-white">
            <Megaphone size={14} className="shrink-0 opacity-80" />
            <span>{config.topBarText}</span>
        </div>
    );
}

function getBackgroundStyle(config: SiteConfig): React.CSSProperties {
    const background = config.background_config;
    if (!background.is_active || !background.value) return {};

    if (background.type === 'image') {
        return {
            backgroundImage: `url(${background.value})`,
            backgroundAttachment: 'fixed',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
        };
    }

    return background.type === 'color' ? { backgroundColor: background.value } : {};
}

function CustomerStorefrontPreview({ config }: { config: SiteConfig }) {
    const ssrConfig = useMemo<SSRHomeConfig>(() => ({
        hero_banners: config.hero_banners,
        homeSections: config.homeSections,
        siteName: config.siteName,
        store_branches: config.store_branches,
        // Live components fetch their normal data after the canvas mounts. Empty
        // arrays make the first draft paint deterministic without persisting data.
        ssrLatestProducts: [],
        homeServiceCategories: config.homeServiceCategories,
        ssrArticles: [],
        ssrPricingServices: [],
    }), [config]);

    const backgroundStyle = getBackgroundStyle(config);
    const colorVariables = {
        '--primary': config.primaryColor,
        '--primary-dark': config.primaryColorDark,
        '--primary-light': config.primaryColorLight,
        '--copper': config.primaryColor,
        '--copper-dark': config.primaryColorDark,
        '--copper-light': config.primaryColorLight,
    } as React.CSSProperties;

    return (
        <ConfigPreviewProvider previewConfig={config}>
            <CartProvider>
                <div id="appearance-preview-root" className="theme-page-background min-h-screen w-full" style={{ ...colorVariables, ...backgroundStyle }}>
                    <PreviewTopBar config={config} />
                    <Header />
                    <main className="min-h-screen">
                        <CustomerHome ssrConfig={ssrConfig} />
                    </main>
                    <Footer />
                    <MobileBottomNav />
                </div>
            </CartProvider>
        </ConfigPreviewProvider>
    );
}

export default function AppearancePreviewPage() {
    const [previewConfig, setPreviewConfig] = useState<SiteConfig | null>(null);

    useEffect(() => {
        const receivePreviewConfig = (event: MessageEvent<PreviewMessage>) => {
            if (event.origin !== window.location.origin || event.source !== window.parent) return;
            if (event.data?.type !== 'appearance-preview-config' || !event.data.config || !Array.isArray(event.data.config.homeSections)) return;

            setPreviewConfig(event.data.config);
            const theme = event.data.theme === 'dark' ? 'dark' : 'light';
            document.documentElement.dataset.theme = theme;
            document.documentElement.style.colorScheme = theme;
        };

        window.addEventListener('message', receivePreviewConfig);
        window.parent.postMessage({ type: 'appearance-preview-ready' }, window.location.origin);
        return () => window.removeEventListener('message', receivePreviewConfig);
    }, []);

    useEffect(() => {
        if (!previewConfig) return;

        const contentRoot = document.getElementById('appearance-preview-root');
        if (!contentRoot) return;

        const reportHeight = () => {
            // documentElement.scrollHeight includes the iframe viewport itself.
            // Feeding that value back into the iframe height creates a growth
            // loop: the viewport becomes taller, then the reported height does
            // too. Measure the real storefront root instead.
            const height = Math.ceil(contentRoot.getBoundingClientRect().height);
            if (!Number.isFinite(height) || height <= 0) return;
            window.parent.postMessage({ type: 'appearance-preview-height', height }, window.location.origin);
        };
        const observer = new ResizeObserver(reportHeight);
        observer.observe(contentRoot);
        reportHeight();
        return () => observer.disconnect();
    }, [previewConfig]);

    if (!previewConfig) {
        return <div className="grid min-h-screen place-items-center bg-slate-100 p-6 text-sm text-slate-500">Đang kết nối bản nháp giao diện…</div>;
    }

    return <CustomerStorefrontPreview config={previewConfig || DEFAULT_CONFIG} />;
}
