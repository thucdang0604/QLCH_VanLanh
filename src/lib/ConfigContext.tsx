'use client';

import { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { usePathname } from 'next/navigation';
import { db, getAuthInstance } from './firebase';
import {
    CONFIG_METADATA_FIELDS,
    getConfigDocumentsForAdminRoute,
    getConfigDocumentForField,
    isFieldStoredInDocument,
    type SystemConfigDocument,
} from './systemConfig';
import { normalizePublicGeofence } from './geofence';

import {
    type HeroBanner,
    type HomepagePricingCategory,
    type HomepagePricingConfig,
    type HomepageReviewsConfig,
    type PricingIconName,
    type BackgroundConfig,
    type StoreBranch,
    type SectionBackground,
    type HomeSectionItem,
    type HomepageLayoutProfile,
    type LayoutBreakpoint,
    type HomeSectionLayoutOverride,
    type ContactInfo,
    type GeofenceConfig,
    type SiteConfig,
    DEFAULT_CONFIG,
    normalizeHomepagePricing,
    normalizeHomepageReviews
} from './config-defaults';

export type {
    HeroBanner,
    HomepagePricingCategory,
    HomepagePricingConfig,
    HomepageReviewsConfig,
    PricingIconName,
    BackgroundConfig,
    StoreBranch,
    SectionBackground,
    HomeSectionItem,
    HomepageLayoutProfile,
    LayoutBreakpoint,
    HomeSectionLayoutOverride,
    ContactInfo,
    GeofenceConfig,
    SiteConfig
};
export { DEFAULT_CONFIG };

// =========== Context ===========
interface ConfigContextType {
    config: SiteConfig;
    loading: boolean;
    updateConfig: (partial: Partial<SiteConfig>, options?: { reviewPin?: string }) => Promise<void>;
    formatHotline: (raw: string) => string;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

// =========== CSS Injection ===========
function injectCSSVariables(config: SiteConfig) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--primary', config.primaryColor);
    root.style.setProperty('--primary-dark', config.primaryColorDark);
    root.style.setProperty('--primary-light', config.primaryColorLight);
    root.style.setProperty('--copper', config.primaryColor);
    root.style.setProperty('--copper-dark', config.primaryColorDark);
    root.style.setProperty('--copper-light', config.primaryColorLight);
}

// =========== Background Injection ===========
function injectBackground(bg: BackgroundConfig) {
    if (typeof document === 'undefined') return;
    const body = document.body;
    if (bg.is_active) {
        if (bg.type === 'image' && bg.value) {
            body.style.backgroundImage = `url(${bg.value})`;
            body.style.backgroundAttachment = 'fixed';
            body.style.backgroundSize = 'cover';
            body.style.backgroundPosition = 'center';
            body.style.backgroundRepeat = 'no-repeat';
        } else if (bg.type === 'color' && bg.value) {
            body.style.backgroundImage = 'none';
            body.style.backgroundColor = bg.value;
        }
    } else {
        body.style.backgroundImage = 'none';
        body.style.backgroundColor = '';
    }
}

// =========== Local Storage Sync ===========
function injectImageProxyState(disableImageProxy: boolean) {
    if (typeof window === 'undefined') return;
    if (disableImageProxy) {
        localStorage.setItem('disableImageProxy', 'true');
    } else {
        localStorage.removeItem('disableImageProxy');
    }
}

function formatHotline(raw: string) {
    if (!raw) return '';
    if (raw.length === 10) {
        return `${raw.slice(0, 4)}.${raw.slice(4, 7)}.${raw.slice(7)}`;
    }
    return raw;
}

// =========== Helper to recursively remove undefined fields for Firestore compatibility ===========
function cleanUndefined<T>(obj: T): T {
    if (Array.isArray(obj)) {
        return obj.map(cleanUndefined) as T;
    }
    if (obj !== null && typeof obj === 'object') {
        const cleaned: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(obj)) {
            if (val !== undefined) {
                cleaned[key] = cleanUndefined(val);
            }
        }
        return cleaned as T;
    }
    return obj;
}


// =========== Provider ===========
export function ConfigProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [revisions, setRevisions] = useState<Record<SystemConfigDocument, number>>({
        main_settings: 0,
        layout_settings: 0,
        navigation_settings: 0,
        taxonomy_settings: 0,
    });
    const hasCanonicalGeofenceRef = useRef(false);
    const documentNames = useMemo(
        () => getConfigDocumentsForAdminRoute(pathname),
        [pathname],
    );
    const documentNamesKey = documentNames.join('|');

    // Real-time listener on multiple system_config documents
    useEffect(() => {
        const docNames = documentNames;
        let loadedCount = 0;

        const unsubs = docNames.map(docName => {
            return onSnapshot(
                doc(db, 'system_config', docName),
                (snapshot) => {
                    if (snapshot.exists()) {
                        const data = snapshot.data();
                        if (docName === 'main_settings') {
                            hasCanonicalGeofenceRef.current = Object.hasOwn(data, 'geofence');
                        }
                        setConfig(prev => {
                            const next = { ...prev };
                            
                            // Merge data, but only for keys that belong to this docName
                            for (const key of Object.keys(data)) {
                                if (CONFIG_METADATA_FIELDS.has(key)) continue;

                                if (isFieldStoredInDocument(key, docName)) {
                                    (next as Record<string, unknown>)[key] = data[key];
                                }
                            }

                            if (docName === 'layout_settings') {
                                if (!hasCanonicalGeofenceRef.current && Object.hasOwn(data, 'geofence')) {
                                    next.geofence = normalizePublicGeofence(data.geofence);
                                }
                                next.homepagePricing = normalizeHomepagePricing(next.homepagePricing);
                                next.homepageReviews = normalizeHomepageReviews(next.homepageReviews);
                            }

                            // Special logic for homeSections to add missing defaults
                            if (docName === 'layout_settings' && data.homeSections) {
                                const storedIds = new Set((data.homeSections as HomeSectionItem[]).map(s => s.id));
                                const missing = DEFAULT_CONFIG.homeSections.filter(d => !storedIds.has(d.id));
                                if (missing.length > 0) {
                                    const maxOrder = Math.max(...(data.homeSections as HomeSectionItem[]).map(s => s.order), 0);
                                    next.homeSections = [
                                        ...data.homeSections,
                                        ...missing.map((m, i) => ({ ...m, order: maxOrder + 1 + i }))
                                    ];
                                }
                            }

                            // Inject variables after merging
                            injectCSSVariables(next);
                            injectBackground(next.background_config);
                            injectImageProxyState(next.disableImageProxy ?? false);
                            return next;
                        });
                    }

                    setRevisions((previous) => ({
                        ...previous,
                        [docName]: typeof snapshot.data()?.configRevision === 'number'
                            ? snapshot.data()!.configRevision
                            : 0,
                    }));

                    // Count loaded documents to remove loading state
                    loadedCount++;
                    if (loadedCount >= docNames.length) {
                        setLoading(false);
                    }
                },
                (err) => {
                    console.error(`ConfigContext fetch error for ${docName}:`, err);
                    loadedCount++;
                    if (loadedCount >= docNames.length) {
                        setLoading(false);
                    }
                }
            );
        });

        return () => unsubs.forEach(u => u());
    }, [documentNames, documentNamesKey]);

    // Update config in Firestore, split into appropriate documents
    const updateConfig = async (partial: Partial<SiteConfig>, options?: { reviewPin?: string }) => {
        if (loading) {
            throw new Error('Configuration is still loading. Refusing to persist fallback defaults.');
        }

        const cleanedPartial = cleanUndefined(partial);
        if (Object.prototype.hasOwnProperty.call(cleanedPartial, 'taxonomy')) {
            throw new Error('Taxonomy must be changed through the protected taxonomy API.');
        }
        const targetDocuments = new Set<SystemConfigDocument>(
            Object.keys(cleanedPartial).map(getConfigDocumentForField),
        );
        const auth = await getAuthInstance();
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Phiên đăng nhập quản trị không còn hợp lệ.');

        const response = await fetch('/api/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                patch: cleanedPartial,
                expectedRevisions: Object.fromEntries(
                    [...targetDocuments].map((documentName) => [documentName, revisions[documentName]]),
                ),
                ...(options?.reviewPin ? { reviewPin: options.reviewPin } : {}),
            }),
        });
        const result = await response.json().catch(() => ({})) as {
            error?: unknown;
            revisions?: Partial<Record<SystemConfigDocument, number>>;
        };
        if (!response.ok) {
            throw new Error(typeof result.error === 'string' ? result.error : 'Không thể lưu cấu hình.');
        }
        if (result.revisions) {
            setRevisions((previous) => ({ ...previous, ...result.revisions }));
        }
    };

    return (
        <ConfigContext.Provider value={{ config, loading, updateConfig, formatHotline }}>
            {children}
        </ConfigContext.Provider>
    );
}

// =========== Server Config Provider (No onSnapshot — for Customer pages) ===========
export function ServerConfigProvider({ children, initialConfig }: { children: ReactNode; initialConfig: SiteConfig }) {
    // Inject CSS variables on mount & when config updates
    useEffect(() => {
        injectCSSVariables(initialConfig);
        injectBackground(initialConfig.background_config);
        injectImageProxyState(initialConfig.disableImageProxy ?? false);
    }, [initialConfig]);

    // No-op updateConfig — customer pages should never call this
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const updateConfig = async (_partial: Partial<SiteConfig>) => {
        console.warn('updateConfig called in ServerConfigProvider — this is a no-op. Use admin ConfigProvider instead.');
    };

    return (
        <ConfigContext.Provider value={{ config: initialConfig, loading: false, updateConfig, formatHotline }}>
            {children}
        </ConfigContext.Provider>
    );
}

// =========== Preview Config Provider (In-memory only) ===========
// Used by Appearance Studio's isolated storefront preview. Unlike the server
// provider, it deliberately does not inject CSS or backgrounds into the parent
// admin document and it can never write to Firestore.
export function ConfigPreviewProvider({ children, previewConfig }: { children: ReactNode; previewConfig: SiteConfig }) {
    const updateConfig = async () => {
        throw new Error('Preview configuration is read-only. Apply the draft from Appearance Studio to publish it.');
    };

    return (
        <ConfigContext.Provider value={{ config: previewConfig, loading: false, updateConfig, formatHotline }}>
            {children}
        </ConfigContext.Provider>
    );
}

// =========== Hook ===========
export function useConfig() {
    const context = useContext(ConfigContext);
    if (!context) {
        throw new Error('useConfig must be used within a ConfigProvider');
    }
    return context;
}
