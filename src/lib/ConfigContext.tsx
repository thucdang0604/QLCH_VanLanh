'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// =========== Types ===========
export interface HeroBanner {
    id: string;
    imageUrl: string;
    link?: string;
    alt: string;
}

export interface BackgroundConfig {
    type: 'color' | 'image';
    value: string;
    is_active: boolean;
}

export interface StoreBranch {
    id: string;
    name: string;
    address: string;
    phone: string;
    mapLink: string;
}

export interface HomeSectionItem {
    id: string;
    component: 'hero' | 'categories' | 'flash_sale' | 'suggested' | 'booking' | 'articles';
    label: string;
    visible: boolean;
    order: number;
}

export interface ContactInfo {
    main_phone: string;
    email: string;
    zalo_link: string;
    facebook_link: string;
    address: string;
}

export interface SiteConfig {
    // Theme
    primaryColor: string;
    primaryColorDark: string;
    primaryColorLight: string;

    // Contact Info
    contact_info: ContactInfo;

    // Site Identity
    siteName: string;
    logoUrl: string;

    // Top bar
    topBarText: string;
    topBarEnabled: boolean;

    // Hero Banners
    hero_banners: HeroBanner[];

    // Background
    background_config: BackgroundConfig;

    // Store branches
    store_branches: StoreBranch[];

    // Homepage layout
    homeSections: HomeSectionItem[];
}

// =========== Defaults ===========
export const DEFAULT_CONFIG: SiteConfig = {
    primaryColor: '#C8956C',
    primaryColorDark: '#A97B55',
    primaryColorLight: '#E0B894',
    contact_info: {
        main_phone: '0932242026',
        email: 'vanlanh.vn@gmail.com',
        zalo_link: 'https://zalo.me/0932242026',
        facebook_link: 'https://www.facebook.com/vanlanh.vn',
        address: '117 Nguyên Hồng, P. Bình Lợi Trung, Bình Thạnh, TP.HCM',
    },
    siteName: 'Văn Lành Service',
    logoUrl: '',
    topBarText: '',
    topBarEnabled: false,
    hero_banners: [],
    background_config: {
        type: 'color',
        value: '#f9fafb',
        is_active: false,
    },
    store_branches: [
        {
            id: 'bt',
            name: 'Trụ sở chính',
            address: '117 Nguyên Hồng, Phường Bình Lợi Trung, Bình Thạnh, TP.HCM',
            phone: '0932242026',
            mapLink: 'https://maps.app.goo.gl/dqeG4VG2tMgji2zT6',
        },
    ],
    homeSections: [
        { id: 'hero', component: 'hero', label: 'Banner chính', visible: true, order: 0 },
        { id: 'categories', component: 'categories', label: 'Danh mục dịch vụ', visible: true, order: 1 },
        { id: 'flash_sale', component: 'flash_sale', label: 'Flash Sale', visible: true, order: 2 },
        { id: 'suggested', component: 'suggested', label: 'Sản phẩm gợi ý', visible: true, order: 3 },
        { id: 'articles', component: 'articles', label: 'Bài Viết Nổi Bật', visible: true, order: 4 },
        { id: 'booking', component: 'booking', label: 'Đặt lịch sửa chữa', visible: true, order: 5 },
    ],
};

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
                        primaryColor: data.primaryColor || DEFAULT_CONFIG.primaryColor,
                        primaryColorDark: data.primaryColorDark || DEFAULT_CONFIG.primaryColorDark,
                        primaryColorLight: data.primaryColorLight || DEFAULT_CONFIG.primaryColorLight,
                        contact_info: { ...DEFAULT_CONFIG.contact_info, ...(data.contact_info || {}) },
                        siteName: data.siteName || DEFAULT_CONFIG.siteName,
                        logoUrl: data.logoUrl || DEFAULT_CONFIG.logoUrl,
                        topBarText: data.topBarText ?? DEFAULT_CONFIG.topBarText,
                        topBarEnabled: data.topBarEnabled ?? DEFAULT_CONFIG.topBarEnabled,
                        hero_banners: data.hero_banners || DEFAULT_CONFIG.hero_banners,
                        background_config: { ...DEFAULT_CONFIG.background_config, ...(data.background_config || {}) },
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

// =========== Hook ===========
export function useConfig() {
    const context = useContext(ConfigContext);
    if (!context) {
        throw new Error('useConfig must be used within a ConfigProvider');
    }
    return context;
}
