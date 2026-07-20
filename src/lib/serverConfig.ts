import { unstable_cache } from 'next/cache';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import {
    DEFAULT_CONFIG,
    normalizeHomepagePricing,
    normalizeHomepageReviews,
    type HomeSectionItem,
    type HomepageLayoutProfile,
    type SiteConfig,
} from '@/lib/config-defaults';
import {
    CONFIG_METADATA_FIELDS,
    STOREFRONT_CONFIG_DOCUMENTS,
    isFieldStoredInDocument,
} from '@/lib/systemConfig';
import { normalizePublicGeofence } from '@/lib/geofence';

function mergeHomeSections(value: unknown): HomeSectionItem[] {
    if (!Array.isArray(value) || value.length === 0) {
        return DEFAULT_CONFIG.homeSections;
    }

    const storedSections = value as HomeSectionItem[];
    const storedIds = new Set(storedSections.map((section) => section.id));
    const missing = DEFAULT_CONFIG.homeSections.filter((section) => !storedIds.has(section.id));

    if (missing.length === 0) {
        return storedSections;
    }

    const maxOrder = Math.max(...storedSections.map((section) => section.order), 0);
    return [
        ...storedSections,
        ...missing.map((section, index) => ({ ...section, order: maxOrder + index + 1 })),
    ];
}

function normalizeLayoutProfiles(value: unknown): HomepageLayoutProfile[] {
    if (!Array.isArray(value)) return [];

    return value.filter((profile): profile is HomepageLayoutProfile => {
        if (!profile || typeof profile !== 'object') return false;
        const candidate = profile as Partial<HomepageLayoutProfile>;
        return typeof candidate.id === 'string'
            && typeof candidate.name === 'string'
            && Array.isArray(candidate.homeSections);
    });
}

export async function fetchStorefrontConfigData(): Promise<SiteConfig> {
    if (!isAdminAvailable()) {
        return DEFAULT_CONFIG;
    }

    try {
        const db = getAdminDb();
        const refs = STOREFRONT_CONFIG_DOCUMENTS.map((name) => db.collection('system_config').doc(name));
        const snapshots = await db.getAll(...refs);

        const data: Record<string, unknown> = {};
        let legacyLayoutGeofence: unknown;
        snapshots.forEach((snap, index) => {
            if (snap.exists) {
                const snapData = JSON.parse(JSON.stringify(snap.data())) as Record<string, unknown>;
                const documentName = STOREFRONT_CONFIG_DOCUMENTS[index];
                for (const [field, value] of Object.entries(snapData)) {
                    if (CONFIG_METADATA_FIELDS.has(field)) continue;
                    if (isFieldStoredInDocument(field, documentName)) {
                        data[field] = value;
                    }
                }

                // Read only for backwards compatibility while the first save
                // moves legacy public geofence data into its canonical document.
                if (documentName === 'layout_settings') {
                    legacyLayoutGeofence = snapData.geofence;
                }
            }
        });

        if (!Object.hasOwn(data, 'geofence') && legacyLayoutGeofence !== undefined) {
            data.geofence = legacyLayoutGeofence;
        }

        if (Object.keys(data).length === 0) {
            return DEFAULT_CONFIG;
        }

        const layoutProfiles = normalizeLayoutProfiles(data.layoutProfiles);
        const activeLayoutProfileId = typeof data.activeLayoutProfileId === 'string'
            ? data.activeLayoutProfileId
            : undefined;
        const activeProfile = activeLayoutProfileId
            ? layoutProfiles.find((profile) => profile.id === activeLayoutProfileId)
            : undefined;

        return {
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
            // The storefront renders the published snapshot in homeSections. Profiles are a
            // separate draft library, so saving a draft can never alter the live homepage.
            homeSections: mergeHomeSections(data.homeSections),
            layoutProfiles,
            activeLayoutProfileId: activeProfile?.id,
            forbiddenWords: (data.forbiddenWords as string[]) || DEFAULT_CONFIG.forbiddenWords,
            geofence: normalizePublicGeofence(data.geofence),
            headerNav: (data.headerNav as SiteConfig['headerNav']) || DEFAULT_CONFIG.headerNav,
            sidebarMenu: (data.sidebarMenu as SiteConfig['sidebarMenu']) || DEFAULT_CONFIG.sidebarMenu,
            footerServices: (data.footerServices as SiteConfig['footerServices']) || DEFAULT_CONFIG.footerServices,
            homeServiceCategories: (data.homeServiceCategories as SiteConfig['homeServiceCategories']) || DEFAULT_CONFIG.homeServiceCategories,
            taxonomy: (data.taxonomy as SiteConfig['taxonomy']) || DEFAULT_CONFIG.taxonomy,
            bountyMissions: (data.bountyMissions as SiteConfig['bountyMissions']) || DEFAULT_CONFIG.bountyMissions,
            bountyRewardType: (data.bountyRewardType as SiteConfig['bountyRewardType']) || DEFAULT_CONFIG.bountyRewardType,
            bountyRewardValue: (data.bountyRewardValue as number) || DEFAULT_CONFIG.bountyRewardValue,
            bountyRewardMaxDiscount: (data.bountyRewardMaxDiscount as number) || undefined,
            disableImageProxy: (data.disableImageProxy as boolean | undefined) ?? DEFAULT_CONFIG.disableImageProxy,
        };
    } catch (error) {
        console.error('[Server Config] Failed to fetch config:', error);
        return DEFAULT_CONFIG;
    }
}

export const getCachedStorefrontConfig = unstable_cache(
    async () => fetchStorefrontConfigData(),
    ['storefront-config-data'],
    {
        revalidate: 300,
        tags: ['config', 'layout'],
    },
);
