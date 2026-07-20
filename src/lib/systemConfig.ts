import type { SiteConfig } from '@/lib/config-defaults';

/**
 * Single source of truth for the public system_config schema.  Both browser
 * listeners and server readers must use this registry so a field cannot be
 * written to one document and read from another.
 */
export const SYSTEM_CONFIG_DOCUMENTS = [
    'main_settings',
    'layout_settings',
    'navigation_settings',
    'taxonomy_settings',
] as const;

export type SystemConfigDocument = typeof SYSTEM_CONFIG_DOCUMENTS[number];
export type ConfigField = keyof SiteConfig;

const TAXONOMY_ADMIN_ROUTE_PREFIXES = [
    '/admin/appearance',
    '/admin/initial-data',
    '/admin/inventory',
    '/admin/parts',
    '/admin/pos',
    '/admin/products',
    '/admin/repairs',
    '/admin/services',
    '/admin/settings',
    '/admin/vouchers',
] as const;

const CONFIG_FIELD_DOCUMENTS: Partial<Record<ConfigField, SystemConfigDocument>> = {
    taxonomy: 'taxonomy_settings',

    headerNav: 'navigation_settings',
    sidebarMenu: 'navigation_settings',
    footerServices: 'navigation_settings',
    homeServiceCategories: 'navigation_settings',

    hero_banners: 'layout_settings',
    homeSections: 'layout_settings',
    layoutProfiles: 'layout_settings',
    activeLayoutProfileId: 'layout_settings',
    store_branches: 'layout_settings',
    homepagePricing: 'layout_settings',
    homepageReviews: 'layout_settings',
    background_config: 'layout_settings',
};

export const CONFIG_METADATA_FIELDS = new Set([
    'createdAt',
    'updatedAt',
    'updatedBy',
    'configRevision',
]);

const CONFIG_FIELD_NAMES = new Set<ConfigField>([
    'primaryColor', 'primaryColorDark', 'primaryColorLight', 'contact_info',
    'siteName', 'logoUrl', 'headerBg', 'topBarText', 'topBarEnabled',
    'hero_banners', 'background_config', 'store_branches', 'homeSections',
    'layoutProfiles', 'activeLayoutProfileId', 'homepagePricing', 'homepageReviews',
    'forbiddenWords', 'geofence', 'bountyMissions', 'bountyRewardType',
    'bountyRewardValue', 'bountyRewardMaxDiscount', 'headerNav', 'sidebarMenu',
    'footerServices', 'homeServiceCategories', 'taxonomy', 'disableImageProxy',
]);

export function isConfigField(value: string): value is ConfigField {
    return CONFIG_FIELD_NAMES.has(value as ConfigField);
}

export function getConfigDocumentForField(field: string): SystemConfigDocument {
    return CONFIG_FIELD_DOCUMENTS[field as ConfigField] ?? 'main_settings';
}

export function isFieldStoredInDocument(field: string, documentName: SystemConfigDocument): boolean {
    return isConfigField(field) && getConfigDocumentForField(field) === documentName;
}

/**
 * taxonomy_settings is currently the largest public configuration document.
 * Keep its realtime listener off lightweight admin routes, while subscribing
 * before a screen that renders taxonomy selectors or the storefront preview.
 */
export function getConfigDocumentsForAdminRoute(pathname: string | null): SystemConfigDocument[] {
    const needsTaxonomy = TAXONOMY_ADMIN_ROUTE_PREFIXES.some((prefix) => (
        pathname === prefix || pathname?.startsWith(`${prefix}/`)
    ));
    return needsTaxonomy
        ? [...SYSTEM_CONFIG_DOCUMENTS]
        : SYSTEM_CONFIG_DOCUMENTS.filter((documentName) => documentName !== 'taxonomy_settings');
}

export function splitConfigPatch(patch: Record<string, unknown>): Record<SystemConfigDocument, Record<string, unknown>> {
    const grouped: Record<SystemConfigDocument, Record<string, unknown>> = {
        main_settings: {},
        layout_settings: {},
        navigation_settings: {},
        taxonomy_settings: {},
    };

    for (const [field, value] of Object.entries(patch)) {
        if (!isConfigField(field)) {
            throw new Error(`Unsupported system configuration field: ${field}`);
        }
        grouped[getConfigDocumentForField(field)][field] = value;
    }

    return grouped;
}
