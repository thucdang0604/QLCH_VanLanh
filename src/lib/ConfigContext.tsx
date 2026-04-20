'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { triggerRevalidate } from './revalidate';

import {
    type HeroBanner,
    type BackgroundConfig,
    type StoreBranch,
    type SectionBackground,
    type HomeSectionItem,
    type ContactInfo,
    type GeofenceConfig,
    type SiteConfig,
    DEFAULT_CONFIG
} from './config-defaults';

export type {
    HeroBanner,
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

// =========== Provider ===========
export function ConfigProvider({ children }: { children: ReactNode }) {
    const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);

    // Real-time listener on system_config/main_settings
    useEffect(() => {
        const docRef = doc(db, 'system_config', 'main_settings');

        const unsubscribe = onSnapshot(
            docRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const merged: SiteConfig = {
                        ...DEFAULT_CONFIG, // Start with all defaults
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
                        homeSections: (() => {
                            const stored: HomeSectionItem[] = data.homeSections || [];
                            if (stored.length === 0) return DEFAULT_CONFIG.homeSections;
                            // Auto-add any new sections from DEFAULT_CONFIG that are missing in Firestore
                            const storedIds = new Set(stored.map(s => s.id));
                            const missing = DEFAULT_CONFIG.homeSections.filter(d => !storedIds.has(d.id));
                            if (missing.length === 0) return stored;
                            const maxOrder = Math.max(...stored.map(s => s.order), 0);
                            return [...stored, ...missing.map((m, i) => ({ ...m, order: maxOrder + 1 + i }))];
                        })(),
                        forbiddenWords: data.forbiddenWords || DEFAULT_CONFIG.forbiddenWords,
                        geofence: { ...DEFAULT_CONFIG.geofence, ...(data.geofence) },
                    };
                    setConfig(merged);
                    injectCSSVariables(merged);
                    injectBackground(merged.background_config);
                } else {
                    injectCSSVariables(DEFAULT_CONFIG);
                }
                setLoading(false);
            },
            (err) => {
                console.error('ConfigContext fetch error:', err);
                injectCSSVariables(DEFAULT_CONFIG);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    // Update config in Firestore
    const updateConfig = async (partial: Partial<SiteConfig>) => {
        const docRef = doc(db, 'system_config', 'main_settings');
        await setDoc(docRef, { ...partial, updatedAt: serverTimestamp() }, { merge: true });
        
        // Trigger global layout revalidation to apply config changes (colors, header, layout)
        triggerRevalidate(['layout']).catch(err => console.error('Config revalidation error:', err));
    };

    // Format raw phone number for display
    const formatHotline = (raw: string) => {
        if (!raw) return '';
        if (raw.length === 10) {
            return `${raw.slice(0, 2)}.${raw.slice(2, 6)}.${raw.slice(6)}`;
        }
        return raw;
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
    }, [initialConfig]);

    // No-op updateConfig — customer pages should never call this
    const updateConfig = async (_partial: Partial<SiteConfig>) => {
        console.warn('updateConfig called in ServerConfigProvider — this is a no-op. Use admin ConfigProvider instead.');
    };

    const formatHotline = (raw: string) => {
        if (!raw) return '';
        if (raw.length === 10) {
            return `${raw.slice(0, 2)}.${raw.slice(2, 6)}.${raw.slice(6)}`;
        }
        return raw;
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
