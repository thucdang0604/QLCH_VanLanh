// =========== Types ===========
export interface HeroBanner {
    id: string;
    imageUrl: string;
    width?: number;
    height?: number;
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

export interface SectionBackground {
    type: 'none' | 'color' | 'image';
    color?: string;
    imageUrl?: string;
    opacity?: number;
    size?: 'cover' | 'contain' | 'repeat';
    frameUrl?: string;
    cardBg?: string;    // inner card background (replaces bg-white)
    outerBg?: string;   // outer card background (replaces bg-dark etc.)
}

export interface HomeSectionItem {
    id: string;
    component: 'hero' | 'categories' | 'flash_sale' | 'suggested' | 'booking' | 'articles';
    label: string;
    visible: boolean;
    order: number;
    sectionBg?: SectionBackground;
}

export interface ContactInfo {
    main_phone: string;
    email: string;
    zalo_link: string;
    facebook_link: string;
    address: string;
}

export interface GeofenceConfig {
    enabled: boolean;
    lat: number;
    lng: number;
    radiusMeters: number;
    pin: string;
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
    headerBg?: string;  // header background color

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

    // Article comments
    forbiddenWords: string[];

    // Geofence for reviews
    geofence: GeofenceConfig;
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
    headerBg: '',
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
    forbiddenWords: ['đm', 'vl', 'cl', 'địt', 'lồn', 'cặc', 'chó'],
    geofence: {
        enabled: false,
        lat: 10.8078,
        lng: 106.7000,
        radiusMeters: 500,
        pin: '2026',
    },
};
