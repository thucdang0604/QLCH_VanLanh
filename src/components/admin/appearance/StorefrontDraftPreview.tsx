'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import type { HomeSectionItem, LayoutBreakpoint, SiteConfig } from '@/lib/config-defaults';

type StorefrontDraftPreviewProps = {
    config: SiteConfig;
    homeSections: HomeSectionItem[];
    breakpoint: LayoutBreakpoint;
};

const PREVIEW_VIEWPORTS: Record<LayoutBreakpoint, { width: number; label: string; zoom: number; Icon: typeof Monitor }> = {
    desktop: { width: 1200, label: 'Desktop 1200px', zoom: 0.56, Icon: Monitor },
    tablet: { width: 768, label: 'Tablet 768px', zoom: 0.76, Icon: Tablet },
    mobile: { width: 390, label: 'Mobile 390px', zoom: 1, Icon: Smartphone },
};

const INITIAL_PREVIEW_HEIGHT = 1200;
const MIN_PREVIEW_HEIGHT = 720;
// A storefront can be longer than the old 9,000px ceiling when it has a full
// product grid, articles and reviews. The surrounding canvas scrolls, so this
// guard protects against malformed messages without clipping valid content.
const MAX_PREVIEW_HEIGHT = 30000;

function toPreviewPayload(config: SiteConfig, homeSections: HomeSectionItem[]) {
    // The transport is intentionally JSON-only: the preview receives a safe,
    // immutable snapshot and never shares Firestore objects or write handlers.
    return JSON.parse(JSON.stringify({ ...config, homeSections })) as SiteConfig;
}

export default function StorefrontDraftPreview({ config, homeSections, breakpoint }: StorefrontDraftPreviewProps) {
    const frameRef = useRef<HTMLIFrameElement | null>(null);
    const [frameLoaded, setFrameLoaded] = useState(false);
    const [contentHeight, setContentHeight] = useState(INITIAL_PREVIEW_HEIGHT);
    const viewport = PREVIEW_VIEWPORTS[breakpoint];
    const previewConfig = useMemo(() => toPreviewPayload(config, homeSections), [config, homeSections]);

    const postPreviewConfig = () => {
        frameRef.current?.contentWindow?.postMessage({
            type: 'appearance-preview-config',
            config: previewConfig,
            theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
        }, window.location.origin);
    };

    useEffect(() => {
        if (!frameLoaded) return;
        postPreviewConfig();
    // `postPreviewConfig` closes over the current serializable draft snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameLoaded, previewConfig]);

    useEffect(() => {
        const onMessage = (event: MessageEvent<{ type?: string; height?: number }>) => {
            if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
            if (event.data?.type === 'appearance-preview-ready') {
                postPreviewConfig();
            }
            if (event.data?.type === 'appearance-preview-height' && typeof event.data.height === 'number') {
                const nextHeight = Math.min(Math.max(Math.ceil(event.data.height), MIN_PREVIEW_HEIGHT), MAX_PREVIEW_HEIGHT);
                setContentHeight((currentHeight) => currentHeight === nextHeight ? currentHeight : nextHeight);
            }
        };

        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    // The iframe element is stable for this component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewConfig]);

    const scaledWidth = Math.ceil(viewport.width * viewport.zoom);
    const scaledHeight = Math.ceil(contentHeight * viewport.zoom);
    const ViewportIcon = viewport.Icon;

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700"><ViewportIcon size={14} /> {viewport.label}</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">Live storefront</span>
            </div>
            <div className="max-h-[760px] overflow-auto p-3">
                <div className="mx-auto overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm" style={{ width: scaledWidth, height: scaledHeight }}>
                    <iframe
                        ref={frameRef}
                        src="/appearance-preview"
                        title="Preview storefront từ bản nháp giao diện"
                        onLoad={() => { setFrameLoaded(true); postPreviewConfig(); }}
                        className="pointer-events-none origin-top-left border-0 bg-white"
                        style={{
                            width: viewport.width,
                            height: contentHeight,
                            transform: `scale(${viewport.zoom})`,
                        }}
                    />
                </div>
            </div>
            <p className="border-t border-slate-200 bg-white px-3 py-2 text-[11px] leading-4 text-slate-500">
                Preview dùng đúng Header Navigation, Sidebar Menu, module trang chủ và Footer từ cấu hình hiện tại; chỉ layout draft được thay thế trong bộ nhớ.
            </p>
        </div>
    );
}
