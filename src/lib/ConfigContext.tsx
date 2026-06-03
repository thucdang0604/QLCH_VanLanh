'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { requestRevalidate } from './requestRevalidate';

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
    ContactInfo,
    GeofenceConfig,
    SiteConfig
};
export { DEFAULT_CONFIG };

// =========== Context ===========
interface ConfigContextType {
    config: SiteConfig;
    loading: boolean;
    updateConfig: (partial: Partial<SiteConfig>) => Promise<void>;
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

// =========== Split Config Definitions ===========
const KEY_MAP: Record<string, string> = {
    // taxonomy_settings
    taxonomy: 'taxonomy_settings',
    
    // navigation_settings
    headerNav: 'navigation_settings',
    sidebarMenu: 'navigation_settings',
    footerServices: 'navigation_settings',
    homeServiceCategories: 'navigation_settings',
    
    // layout_settings
    hero_banners: 'layout_settings',
    homeSections: 'layout_settings',
    store_branches: 'layout_settings',
    homepagePricing: 'layout_settings',
    homepageReviews: 'layout_settings',
    background_config: 'layout_settings',
    geofence: 'layout_settings',
};

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
    const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);

    // Real-time listener on multiple system_config documents
    useEffect(() => {
        const docNames = ['main_settings', 'layout_settings', 'navigation_settings', 'taxonomy_settings'];
        let loadedCount = 0;

        const seedDocument = async (docName: string) => {
            let seedData: Record<string, unknown> = {};
            if (docName === 'taxonomy_settings') {
                seedData = { taxonomy: DEFAULT_CONFIG.taxonomy };
            } else if (docName === 'navigation_settings') {
                seedData = {
                    headerNav: DEFAULT_CONFIG.headerNav,
                    sidebarMenu: DEFAULT_CONFIG.sidebarMenu,
                    footerServices: DEFAULT_CONFIG.footerServices,
                    homeServiceCategories: DEFAULT_CONFIG.homeServiceCategories,
                };
            } else if (docName === 'layout_settings') {
                seedData = {
                    hero_banners: DEFAULT_CONFIG.hero_banners,
                    homeSections: DEFAULT_CONFIG.homeSections,
                    store_branches: DEFAULT_CONFIG.store_branches,
                    homepagePricing: DEFAULT_CONFIG.homepagePricing,
                    homepageReviews: DEFAULT_CONFIG.homepageReviews,
                    background_config: DEFAULT_CONFIG.background_config,
                    geofence: DEFAULT_CONFIG.geofence,
                };
            } else if (docName === 'main_settings') {
                seedData = {
                    primaryColor: DEFAULT_CONFIG.primaryColor,
                    primaryColorDark: DEFAULT_CONFIG.primaryColorDark,
                    primaryColorLight: DEFAULT_CONFIG.primaryColorLight,
                    contact_info: DEFAULT_CONFIG.contact_info,
                    siteName: DEFAULT_CONFIG.siteName,
                    logoUrl: DEFAULT_CONFIG.logoUrl,
                    headerBg: DEFAULT_CONFIG.headerBg,
                    topBarText: DEFAULT_CONFIG.topBarText,
                    topBarEnabled: DEFAULT_CONFIG.topBarEnabled,
                    forbiddenWords: DEFAULT_CONFIG.forbiddenWords,
                };
            }
            try {
                await setDoc(doc(db, 'system_config', docName), { ...seedData, updatedAt: serverTimestamp() }, { merge: true });
            } catch (err) {
                console.error(`Error seeding ${docName}:`, err);
            }
        };

        const unsubs = docNames.map(docName => {
            return onSnapshot(
                doc(db, 'system_config', docName),
                (snapshot) => {
                    if (!snapshot.exists()) {
                        // Seed document if it doesn't exist
                        seedDocument(docName);
                    } else {
                        const data = snapshot.data();
                        setConfig(prev => {
                            const next = { ...prev };
                            
                            // Merge data, but only for keys that belong to this docName
                            for (const key of Object.keys(data)) {
                                if (key === 'updatedAt' || key === 'createdAt') continue;
                                
                                const targetDoc = KEY_MAP[key] || 'main_settings';
                                if (targetDoc === docName) {
                                    (next as Record<string, unknown>)[key] = data[key];
                                }
                            }

                            if (docName === 'layout_settings') {
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
    }, []);

    // Update config in Firestore, split into appropriate documents
    const updateConfig = async (partial: Partial<SiteConfig>) => {
        const cleanedPartial = cleanUndefined(partial);
        const updatesByDoc: Record<string, Record<string, unknown>> = {
            main_settings: {},
            layout_settings: {},
            navigation_settings: {},
            taxonomy_settings: {}
        };

        for (const [key, value] of Object.entries(cleanedPartial)) {
            const targetDoc = KEY_MAP[key] || 'main_settings';
            updatesByDoc[targetDoc][key] = value;
        }

        const promises = Object.entries(updatesByDoc).map(([docName, data]) => {
            if (Object.keys(data).length > 0) {
                return setDoc(doc(db, 'system_config', docName), { ...data, updatedAt: serverTimestamp() }, { merge: true });
            }
            return Promise.resolve();
        });

        await Promise.all(promises);
        
        // Keep cache invalidation detached from the admin React tree. Calling a
        // Server Action here can refresh the current admin route after saving.
        void requestRevalidate(['layout'], ['config']);
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

// =========== Hook ===========
export function useConfig() {
    const context = useContext(ConfigContext);
    if (!context) {
        throw new Error('useConfig must be used within a ConfigProvider');
    }
    return context;
}
