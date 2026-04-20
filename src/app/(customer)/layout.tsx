import { getAdminDb, isAdminAvailable } from "@/lib/firebaseAdmin";
import { ServerConfigProvider } from "@/lib/ConfigContext";
import { DEFAULT_CONFIG, type SiteConfig } from "@/lib/config-defaults";
import CustomerLayoutShell from "./layout.shell";

/**
 * Customer Layout — Server Component
 * 
 * Fetch config 1 lần qua Admin SDK (server-side), truyền xuống client shell.
 * KHÔNG dùng onSnapshot → KHÔNG tạo WebSocket connection cho khách hàng.
 * Config chỉ cập nhật khi admin bấm Lưu → trigger revalidate.
 */

async function getServerConfig(): Promise<SiteConfig> {
    if (!isAdminAvailable()) {
        return DEFAULT_CONFIG;
    }

    try {
        const db = getAdminDb();
        const snapshot = await db.collection('system_config').doc('main_settings').get();

        if (!snapshot.exists) {
            return DEFAULT_CONFIG;
        }

        // Parse data — convert to plain JS (no Firestore Timestamps)
        const data = JSON.parse(JSON.stringify(snapshot.data()));

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
            primaryColor: data.primaryColor || DEFAULT_CONFIG.primaryColor,
            primaryColorDark: data.primaryColorDark || DEFAULT_CONFIG.primaryColorDark,
            primaryColorLight: data.primaryColorLight || DEFAULT_CONFIG.primaryColorLight,
            contact_info: { ...DEFAULT_CONFIG.contact_info, ...(data.contact_info) },
            siteName: data.siteName || DEFAULT_CONFIG.siteName,
            logoUrl: data.logoUrl || DEFAULT_CONFIG.logoUrl,
            headerBg: data.headerBg !== undefined ? data.headerBg : DEFAULT_CONFIG.headerBg,
            topBarText: data.topBarText ?? DEFAULT_CONFIG.topBarText,
            topBarEnabled: data.topBarEnabled ?? DEFAULT_CONFIG.topBarEnabled,
            hero_banners: data.hero_banners || DEFAULT_CONFIG.hero_banners,
            background_config: { ...DEFAULT_CONFIG.background_config, ...(data.background_config) },
            store_branches: data.store_branches || DEFAULT_CONFIG.store_branches,
            homeSections,
            forbiddenWords: data.forbiddenWords || DEFAULT_CONFIG.forbiddenWords,
        };

        return merged;
    } catch (error) {
        console.error('[Customer Layout] Failed to fetch config:', error);
        return DEFAULT_CONFIG;
    }
}

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
        </ServerConfigProvider>
    );
}
