import { getAdminDb, isAdminAvailable } from "@/lib/firebaseAdmin";
import { ServerConfigProvider } from "@/lib/ConfigContext";
import {
    DEFAULT_CONFIG,
    normalizeHomepagePricing,
    normalizeHomepageReviews,
    type SiteConfig
} from "@/lib/config-defaults";
import { unstable_cache } from 'next/cache';
import CustomerLayoutShell from "./layout.shell";

export const revalidate = 300;

/**
 * Customer Layout — Server Component
 * 
 * Fetch config 1 lần qua Admin SDK (server-side), truyền xuống client shell.
 * KHÔNG dùng onSnapshot → KHÔNG tạo WebSocket connection cho khách hàng.
 * Config chỉ cập nhật khi admin bấm Lưu → trigger revalidate.
 */

const fetchServerConfigData = async (): Promise<SiteConfig> => {
    if (!isAdminAvailable()) {
        return DEFAULT_CONFIG;
    }

    try {
        const db = getAdminDb();
        const docNames = ['main_settings', 'layout_settings', 'navigation_settings', 'taxonomy_settings'];
        const refs = docNames.map(name => db.collection('system_config').doc(name));
        const snapshots = await db.getAll(...refs);

        let data: Record<string, unknown> = {};
        snapshots.forEach(snap => {
            if (snap.exists) {
                // Parse data — convert to plain JS (no Firestore Timestamps)
                const snapData = JSON.parse(JSON.stringify(snap.data()));
                data = { ...data, ...snapData };
            }
        });

        if (Object.keys(data).length === 0) {
            return DEFAULT_CONFIG;
        }

        const storedSections = Array.isArray(data.homeSections) ? data.homeSections : [];
        let homeSections = DEFAULT_CONFIG.homeSections;
        if (storedSections.length > 0) {
            const storedIds = new Set(storedSections.map((s: { id: string }) => s.id));
            const missing = DEFAULT_CONFIG.homeSections.filter(d => !storedIds.has(d.id));
            if (missing.length === 0) {
                homeSections = storedSections;
            } else {
                const maxOrder = Math.max(...storedSections.map((s: { order: number }) => s.order), 0);
                homeSections = [...storedSections, ...missing.map((m, i) => ({ ...m, order: maxOrder + 1 + i }))];
            }
        }

        const merged: SiteConfig = {
            ...DEFAULT_CONFIG,
            primaryColor: (data.primaryColor as string) || DEFAULT_CONFIG.primaryColor,
            primaryColorDark: (data.primaryColorDark as string) || DEFAULT_CONFIG.primaryColorDark,
            primaryColorLight: (data.primaryColorLight as string) || DEFAULT_CONFIG.primaryColorLight,
            contact_info: { ...DEFAULT_CONFIG.contact_info, ...(data.contact_info as Record<string, unknown> | undefined) },
            siteName: (data.siteName as string) || DEFAULT_CONFIG.siteName,
            logoUrl: (data.logoUrl as string) || DEFAULT_CONFIG.logoUrl,
            headerBg: data.headerBg !== undefined ? (data.headerBg as string) : DEFAULT_CONFIG.headerBg,
            topBarText: (data.topBarText as string) ?? DEFAULT_CONFIG.topBarText,
            topBarEnabled: (data.topBarEnabled as boolean) ?? DEFAULT_CONFIG.topBarEnabled,
            hero_banners: (data.hero_banners as SiteConfig['hero_banners']) || DEFAULT_CONFIG.hero_banners,
            background_config: { ...DEFAULT_CONFIG.background_config, ...(data.background_config as Record<string, unknown> | undefined) },
            store_branches: (data.store_branches as SiteConfig['store_branches']) || DEFAULT_CONFIG.store_branches,
            homepagePricing: normalizeHomepagePricing(data.homepagePricing),
            homepageReviews: normalizeHomepageReviews(data.homepageReviews),
            homeSections,
            forbiddenWords: (data.forbiddenWords as string[]) || DEFAULT_CONFIG.forbiddenWords,
            geofence: { ...DEFAULT_CONFIG.geofence, ...(data.geofence as Record<string, unknown> | undefined) },
            headerNav: (data.headerNav as SiteConfig['headerNav']) || DEFAULT_CONFIG.headerNav,
            sidebarMenu: (data.sidebarMenu as SiteConfig['sidebarMenu']) || DEFAULT_CONFIG.sidebarMenu,
            footerServices: (data.footerServices as SiteConfig['footerServices']) || DEFAULT_CONFIG.footerServices,
            homeServiceCategories: (data.homeServiceCategories as SiteConfig['homeServiceCategories']) || DEFAULT_CONFIG.homeServiceCategories,
            taxonomy: (data.taxonomy as SiteConfig['taxonomy']) || DEFAULT_CONFIG.taxonomy,
            bountyMissions: (data.bountyMissions as SiteConfig['bountyMissions']) || DEFAULT_CONFIG.bountyMissions,
            bountyRewardType: (data.bountyRewardType as SiteConfig['bountyRewardType']) || DEFAULT_CONFIG.bountyRewardType,
            bountyRewardValue: (data.bountyRewardValue as number) || DEFAULT_CONFIG.bountyRewardValue,
            bountyRewardMaxDiscount: (data.bountyRewardMaxDiscount as number) || undefined,
        };

        return merged;

    } catch (error) {
        console.error('[Customer Layout] Failed to fetch config:', error);
        return DEFAULT_CONFIG;
    }
}

const getServerConfig = unstable_cache(
    async () => fetchServerConfigData(),
    ['layout-config-data'],
    {
        revalidate: 300,
        tags: ['layout']
    }
);

import MissionsWidget from "@/components/MissionsWidget";

export default async function CustomerLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const config = await getServerConfig();

    return (
        <ServerConfigProvider initialConfig={config}>
            <CustomerLayoutShell>
                {children}
            </CustomerLayoutShell>
            <MissionsWidget />
        </ServerConfigProvider>
    );
}
