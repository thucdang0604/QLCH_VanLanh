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

export interface BountyMission {
    id: 'facebook' | 'tiktok' | 'youtube';
    url: string;
    isActive: boolean;
}

export interface StoreBranch {
    id: string;
    name: string;
    address: string;
    phone: string;
    mapLink: string;
}

export type PricingIconName = 'smartphone' | 'tablet' | 'laptop' | 'watch';

export interface HomepagePricingCategory {
    id: string;
    label: string;
    icon: PricingIconName;
    keywords: string[];
    maxItems: number;
}

export interface HomepagePricingConfig {
    title: string;
    highlightedTitle: string;
    subtitle: string;
    ctaLabel: string;
    ctaHref: string;
    categories: HomepagePricingCategory[];
}

export interface HomepageReviewsConfig {
    eyebrow: string;
    title: string;
    googlePlaceId: string;
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
    component: 'hero' | 'categories' | 'flash_sale' | 'suggested' | 'booking' | 'articles' | 'pricing_table' | 'google_reviews';
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

// Navigation types (Menu Builder)
export interface NavItem {
    id: string;
    label: string;
    slug: string;       // → href = /category/{slug} OR custom url if isCustomLink is true
    isCustomLink?: boolean;
    iconName: string;   // Lucide icon name (see icon-map.ts)
    order: number;
    visible: boolean;
    taxonomyRef?: string; // ID of linked taxonomy node (e.g. "dien-thoai/iphone")
    filterType?: 'repair' | 'new' | 'likenew' | 'accessory'; // Condition filter cho sản phẩm bán lẻ
}

export interface SidebarMenuItem {
    id: string;
    name: string;
    slug: string;
    isCustomLink?: boolean;
    iconName: string;
    order: number;
    visible: boolean;
    subGroups: Array<{ group: string; items: string[] }>;
    taxonomyRef?: string; // ID of linked taxonomy node
}

export interface FooterServiceLink {
    id: string;
    name: string;
    slug: string;       // → href = /category/{slug} OR custom
    isCustomLink?: boolean;
    order: number;
    visible: boolean;
    taxonomyRef?: string; // ID of linked taxonomy node
}

export interface HomeServiceCategory {
    id: string;
    name: string;
    slug: string;
    isCustomLink?: boolean;
    icon: string;
    count: string;
    order: number;
    visible: boolean;
    taxonomyRef?: string; // ID of linked taxonomy node
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
    homepagePricing: HomepagePricingConfig;
    homepageReviews: HomepageReviewsConfig;

    // Article comments
    forbiddenWords: string[];

    // Geofence for reviews
    geofence: GeofenceConfig;

    // Bounty Missions
    bountyMissions: BountyMission[];
    bountyRewardType: 'fixed' | 'percentage'; // Loại giảm: cố định hoặc %
    bountyRewardValue: number;                 // Giá trị giảm (VNĐ hoặc %)
    bountyRewardMaxDiscount?: number;           // Giới hạn tối đa (chỉ dùng khi type=percentage)

    // Navigation (Menu Builder)
    headerNav: NavItem[];
    sidebarMenu: SidebarMenuItem[];
    footerServices: FooterServiceLink[];
    homeServiceCategories: HomeServiceCategory[];

    // Hierarchical Taxonomy
    taxonomy: {
        retail: import('./types').TaxonomyNode[];
        service: import('./types').TaxonomyNode[];
        component: import('./types').TaxonomyNode[];
    };

    // System Toggles
    disableImageProxy?: boolean;
}

// =========== Defaults ===========
export const DEFAULT_CONFIG: SiteConfig = {
    primaryColor: '#5A6A7A',
    primaryColorDark: '#3C4C5C',
    primaryColorLight: '#8296AA',
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
        { id: 'pricing-table', component: 'pricing_table', label: 'Bảng giá sửa chữa', visible: true, order: 5 },
        { id: 'google-reviews', component: 'google_reviews', label: 'Đánh giá khách hàng', visible: true, order: 6 },
        { id: 'booking', component: 'booking', label: 'Đặt lịch sửa chữa', visible: true, order: 7 },
    ],
    homepagePricing: {
        title: 'Bảng Giá',
        highlightedTitle: 'Sửa Chữa',
        subtitle: 'Minh bạch, rõ ràng, linh kiện chính hãng',
        ctaLabel: 'Xem tất cả bảng giá',
        ctaHref: '/category/sua-chua',
        categories: [
            {
                id: 'iphone',
                label: 'iPhone',
                icon: 'smartphone',
                keywords: ['iphone'],
                maxItems: 6,
            },
            {
                id: 'ipad',
                label: 'iPad',
                icon: 'tablet',
                keywords: ['ipad'],
                maxItems: 6,
            },
            {
                id: 'macbook',
                label: 'MacBook',
                icon: 'laptop',
                keywords: ['macbook'],
                maxItems: 6,
            },
            {
                id: 'watch',
                label: 'Apple Watch',
                icon: 'watch',
                keywords: ['apple watch', 'watch'],
                maxItems: 6,
            },
        ],
    },
    homepageReviews: {
        eyebrow: 'Đánh Giá Từ Khách Hàng',
        title: 'Khách Hàng Nói Gì Về Chúng Tôi',
        googlePlaceId: 'ChIJmWqqJWcpdTERqc7cx-jP2E4',
    },
    forbiddenWords: ['đm', 'vl', 'cl', 'địt', 'lồn', 'cặc', 'chó'],
    geofence: {
        enabled: false,
        lat: 10.8078,
        lng: 106.7000,
        radiusMeters: 500,
        pin: '2026',
    },
    bountyMissions: [
        { id: 'facebook', url: 'https://www.facebook.com/vanlanh.vn', isActive: true },
        { id: 'tiktok', url: 'https://www.tiktok.com/@vanlanh.vn', isActive: true },
        { id: 'youtube', url: 'https://www.youtube.com/@vanlanh', isActive: false },
    ],
    bountyRewardType: 'fixed',
    bountyRewardValue: 50000,
    disableImageProxy: false,

    // Navigation defaults (mirrors current hardcoded menus)
    headerNav: [
        { id: 'hn1', label: 'Sửa chữa - Bảo hành', slug: 'sua-chua', iconName: 'Wrench', order: 0, visible: true, filterType: 'repair' as const },
        { id: 'hn2', label: 'Sửa iPad', slug: 'sua-ipad', iconName: 'Tablet', order: 1, visible: true },
        { id: 'hn3', label: 'Máy mới', slug: 'may-moi', iconName: 'Smartphone', order: 2, visible: true, filterType: 'new' as const },
        { id: 'hn4', label: 'Máy cũ giá rẻ', slug: 'may-cu', iconName: 'Monitor', order: 3, visible: true, filterType: 'likenew' as const },
        { id: 'hn5', label: 'Phụ kiện', slug: 'phu-kien', iconName: 'Headphones', order: 4, visible: true, filterType: 'accessory' as const },
    ],
    sidebarMenu: [
        { id: 'sb1', name: 'Sửa iPhone', slug: 'sua-iphone', iconName: 'Smartphone', order: 0, visible: true, subGroups: [
            { group: 'Dòng máy', items: ['iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16', 'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15', 'iPhone 14 Pro Max', 'iPhone 14', 'iPhone 13', 'iPhone 12', 'iPhone 11'] },
            { group: 'Dịch vụ phổ biến', items: ['Thay màn hình iPhone', 'Thay pin iPhone', 'Ép kính iPhone', 'Sửa loa iPhone', 'Thay camera iPhone'] },
        ]},
        { id: 'sb2', name: 'Sửa Samsung', slug: 'sua-samsung', iconName: 'Smartphone', order: 1, visible: true, subGroups: [
            { group: 'Dòng máy', items: ['Galaxy S25 Ultra', 'Galaxy S24 Ultra', 'Galaxy S24', 'Galaxy S23 Ultra', 'Galaxy Z Fold6', 'Galaxy Z Flip6', 'Galaxy A55', 'Galaxy A35', 'Galaxy A15'] },
            { group: 'Dịch vụ phổ biến', items: ['Thay màn hình Samsung', 'Thay pin Samsung', 'Ép kính Samsung', 'Sửa sọc màn hình'] },
        ]},
        { id: 'sb3', name: 'Thay Pin', slug: 'thay-pin', iconName: 'Battery', order: 2, visible: true, subGroups: [
            { group: 'Thay pin theo hãng', items: ['Pin iPhone chính hãng', 'Pin Samsung chính hãng', 'Pin OPPO', 'Pin Xiaomi', 'Pin Vivo', 'Pin Realme'] },
            { group: 'Cam kết', items: ['Bảo hành trọn đời', 'Pin dung lượng chuẩn', 'Thay trong 30 phút'] },
        ]},
        { id: 'sb4', name: 'Ép Kính', slug: 'ep-kinh', iconName: 'Monitor', order: 3, visible: true, subGroups: [
            { group: 'Ép kính theo hãng', items: ['Ép kính iPhone', 'Ép kính Samsung', 'Ép kính OPPO', 'Ép kính Xiaomi'] },
            { group: 'Cam kết', items: ['Kính cường lực cao cấp', 'Bảo hành 12 tháng', 'Xong trong 45 phút'] },
        ]},
        { id: 'sb5', name: 'Sửa Laptop', slug: 'sua-laptop', iconName: 'Laptop', order: 4, visible: true, subGroups: [
            { group: 'Hãng máy', items: ['MacBook Pro', 'MacBook Air', 'Dell XPS / Inspiron', 'HP Pavilion / EliteBook', 'Lenovo ThinkPad / IdeaPad', 'Asus VivoBook / ZenBook', 'MSI Gaming'] },
            { group: 'Dịch vụ', items: ['Thay màn hình laptop', 'Thay bàn phím laptop', 'Vệ sinh laptop', 'Nâng cấp SSD/RAM'] },
        ]},
        { id: 'sb6', name: 'Sửa Apple Watch', slug: 'sua-apple-watch', iconName: 'Watch', order: 5, visible: true, subGroups: [
            { group: 'Dòng máy', items: ['Apple Watch Ultra 2', 'Apple Watch Series 10', 'Apple Watch Series 9', 'Apple Watch SE'] },
            { group: 'Dịch vụ', items: ['Thay màn hình Apple Watch', 'Thay pin Apple Watch', 'Sửa nút Digital Crown'] },
        ]},
        { id: 'sb7', name: 'Sửa iPad', slug: 'sua-ipad', iconName: 'Tablet', order: 6, visible: true, subGroups: [
            { group: 'Dòng máy', items: ['iPad Pro', 'iPad Air', 'iPad Mini', 'iPad'] },
            { group: 'Dịch vụ', items: ['Thay màn hình iPad', 'Thay pin iPad', 'Sửa nút Digital Crown'] },
        ]},
        { id: 'sb8', name: 'Sửa Máy tính', slug: 'sua-may-tinh', iconName: 'Cpu', order: 7, visible: true, subGroups: [
            { group: 'Dịch vụ', items: ['Cài đặt Windows/macOS', 'Diệt virus - Phần mềm', 'Cứu dữ liệu', 'Lắp ráp PC theo yêu cầu'] },
        ]},
    ],
    footerServices: [
        { id: 'fs1', name: 'Sửa chữa Điện thoại', slug: 'sua-iphone', order: 0, visible: true },
        { id: 'fs2', name: 'Sửa chữa Laptop', slug: 'sua-laptop', order: 1, visible: true },
        { id: 'fs3', name: 'Thay Pin điện thoại', slug: 'thay-pin', order: 2, visible: true },
        { id: 'fs4', name: 'Ép kính điện thoại', slug: 'ep-kinh', order: 3, visible: true },
        { id: 'fs5', name: 'Phụ kiện chính hãng', slug: 'phu-kien', order: 4, visible: true },
    ],
    homeServiceCategories: [
        { id: 'hc1', icon: "📱", name: "Sửa iPhone", slug: "sua-iphone", count: "200+ dịch vụ", order: 0, visible: true },
        { id: 'hc2', icon: "📱", name: "Sửa Samsung", slug: "sua-samsung", count: "150+ dịch vụ", order: 1, visible: true },
        { id: 'hc3', icon: "📟", name: "Sửa Tablet", slug: "sua-tablet", count: "80+ dịch vụ", order: 2, visible: true },
        { id: 'hc4', icon: "🔋", name: "Thay Pin", slug: "thay-pin", count: "100+ dịch vụ", order: 3, visible: true },
        { id: 'hc5', icon: "🪟", name: "Thay Mặt Kính", slug: "thay-mat-kinh", count: "80+ dịch vụ", order: 4, visible: true },
        { id: 'hc6', icon: "💻", name: "Sửa Macbook", slug: "sua-macbook", count: "120+ dịch vụ", order: 5, visible: true },
        { id: 'hc7', icon: "🎧", name: "Phụ Kiện", slug: "phu-kien", count: "300+ sản phẩm", order: 6, visible: true },
        { id: 'hc8', icon: "🍎", name: "Sửa Apple Watch", slug: "sua-apple-watch", count: "10+ dịch vụ", order: 7, visible: true },
    ],
    taxonomy: {
        retail: [
            {
                id: "dien-thoai",
                name: "Điện thoại",
                slug: "dien-thoai",
                icon: "Smartphone",
                seoKeywords: "điện thoại, mua điện thoại, điện thoại chính hãng, điện thoại giá rẻ, smartphone",
                seoDescription: "Chuyên cung cấp các dòng điện thoại thông minh chính hãng từ Apple, Samsung, Oppo. Mua điện thoại giá tốt, bảo hành uy tín tại Văn Lành.",
                children: [
                    {
                        id: "dien-thoai/iphone",
                        name: "iPhone",
                        slug: "iphone",
                        seoKeywords: "iphone, điện thoại iphone, mua iphone, iphone chính hãng vn/a, apple iphone",
                        seoDescription: "Mua điện thoại iPhone chính hãng VN/A giá tốt nhất. Hỗ trợ trả góp 0%, bảo hành 12 tháng tại hệ thống Văn Lành.",
                        children: [
                            {
                                id: "dien-thoai/iphone/iphone-16-series",
                                name: "iPhone 16 Series",
                                slug: "iphone-16-series",
                                seoKeywords: "iphone 16, iphone 16 pro, iphone 16 pro max, iphone 16 plus, mua iphone 16",
                                seoDescription: "Sở hữu ngay siêu phẩm iPhone 16 Series mới nhất từ Apple với nhiều ưu đãi hấp dẫn, giá cạnh tranh nhất thị trường."
                            },
                            {
                                id: "dien-thoai/iphone/iphone-15-series",
                                name: "iPhone 15 Series",
                                slug: "iphone-15-series",
                                seoKeywords: "iphone 15, iphone 15 pro max, giá iphone 15",
                                seoDescription: "Mua điện thoại iPhone 15, 15 Pro, 15 Pro Max chính hãng giá giảm sâu."
                            },
                            {
                                id: "dien-thoai/iphone/iphone-cu-likenew",
                                name: "iPhone Cũ Like New",
                                slug: "iphone-cu-likenew",
                                seoKeywords: "iphone cũ, iphone likenew, iphone 99, mua iphone cũ giá rẻ, iphone cũ uy tín",
                                seoDescription: "Chuyên bán điện thoại iPhone cũ, Like New 99% nguyên bản chưa qua sửa chữa, bảo hành dài hạn 1 đổi 1."
                            }
                        ]
                    },
                    {
                        id: "dien-thoai/samsung",
                        name: "Samsung",
                        slug: "samsung",
                        seoKeywords: "samsung, điện thoại samsung, galaxy s, galaxy z fold, galaxy z flip, điện thoại samsung giá rẻ",
                        seoDescription: "Khám phá các dòng điện thoại Samsung Galaxy chính hãng, thiết kế đột phá, cấu hình mạnh mẽ, camera đỉnh cao.",
                        children: [
                            {
                                id: "dien-thoai/samsung/galaxy-s",
                                name: "Galaxy S Series",
                                slug: "galaxy-s",
                                seoKeywords: "samsung galaxy s24 ultra, galaxy s24, galaxy s23",
                                seoDescription: "Dòng Galaxy S cao cấp tích hợp AI thông minh, mang đến trải nghiệm tuyệt đỉnh."
                            },
                            {
                                id: "dien-thoai/samsung/galaxy-z",
                                name: "Galaxy Z Series",
                                slug: "galaxy-z",
                                seoKeywords: "samsung galaxy z fold6, galaxy z flip6, điện thoại màn hình gập",
                                seoDescription: "Dòng điện thoại màn hình gập Galaxy Z Fold và Z Flip dẫn đầu xu hướng công nghệ."
                            }
                        ]
                    }
                ]
            },
            {
                id: "may-tinh-bang",
                name: "Máy tính bảng",
                slug: "may-tinh-bang",
                icon: "Tablet",
                seoKeywords: "máy tính bảng, tablet, mua máy tính bảng",
                seoDescription: "Các loại máy tính bảng iPad, Samsung Galaxy Tab phục vụ học tập, làm việc và giải trí với giá cả hợp lý.",
                children: [
                    {
                        id: "may-tinh-bang/ipad",
                        name: "iPad",
                        slug: "ipad",
                        seoKeywords: "ipad, ipad pro, ipad air, ipad gen 10, mua ipad",
                        seoDescription: "Mua iPad chính hãng Apple với đủ mọi dòng: iPad Pro M4, iPad Air, iPad Gen đa dạng cấu hình."
                    }
                ]
            },
            {
                id: "laptop",
                name: "Laptop",
                slug: "laptop",
                icon: "Laptop",
                seoKeywords: "laptop, máy tính xách tay, mua laptop, laptop sinh viên, laptop văn phòng, laptop gaming",
                seoDescription: "Chuyên bán laptop chính hãng Dell, HP, Asus, MacBook. Cung cấp máy tính xách tay giá rẻ cho sinh viên, dân văn phòng.",
                children: [
                    {
                        id: "laptop/macbook",
                        name: "MacBook",
                        slug: "macbook",
                        seoKeywords: "macbook, macbook pro, macbook air, macbook m3, macbook m2, mua macbook",
                        seoDescription: "Laptop MacBook chính hãng Apple. Thiết kế sang trọng, hiệu năng vượt trội với chip M series thế hệ mới."
                    },
                    {
                        id: "laptop/laptop-windows",
                        name: "Laptop Windows",
                        slug: "laptop-windows",
                        seoKeywords: "laptop dell, laptop hp, laptop asus, laptop lenovo, laptop gaming",
                        seoDescription: "Laptop chạy hệ điều hành Windows từ các hãng nổi tiếng phục vụ đa nhu cầu từ văn phòng đến chơi game đồ họa."
                    }
                ]
            },
            {
                id: "phu-kien",
                name: "Phụ kiện",
                slug: "phu-kien",
                icon: "Headphones",
                seoKeywords: "phụ kiện điện thoại, cáp sạc, ốp lưng, sạc dự phòng, tai nghe bluetooth, phụ kiện chính hãng",
                seoDescription: "Thế giới phụ kiện chính hãng cho điện thoại, laptop: cáp sạc nhanh, tai nghe chống ồn, pin dự phòng, bao da ốp lưng.",
                children: [
                    {
                        id: "phu-kien/cap-sac",
                        name: "Cáp sạc, củ sạc",
                        slug: "cap-sac",
                        seoKeywords: "cáp sạc iphone, củ sạc nhanh, sạc anker, sạc ugreen, cáp type c",
                        seoDescription: "Các loại cáp sạc, củ sạc nhanh chính hãng Anker, Ugreen, Baseus an toàn cho thiết bị của bạn."
                    },
                    {
                        id: "phu-kien/tai-nghe",
                        name: "Tai nghe",
                        slug: "tai-nghe",
                        seoKeywords: "tai nghe bluetooth, tai nghe không dây, airpods, airpods pro, tai nghe jbl",
                        seoDescription: "Tai nghe không dây, tai nghe Bluetooth chính hãng âm thanh chất lượng cao, chống ồn chủ động."
                    },
                    {
                        id: "phu-kien/op-lung",
                        name: "Ốp lưng, bao da",
                        slug: "op-lung",
                        seoKeywords: "ốp lưng iphone, ốp lưng chống sốc, bao da ipad, ốp lưng đẹp",
                        seoDescription: "Bảo vệ điện thoại của bạn với các mẫu ốp lưng chống sốc, bao da thời trang và cao cấp."
                    },
                    {
                        id: "phu-kien/pin-du-phong",
                        name: "Pin sạc dự phòng",
                        slug: "pin-du-phong",
                        seoKeywords: "pin dự phòng, sạc dự phòng 10000mah, sạc dự phòng 20000mah, sạc dự phòng không dây",
                        seoDescription: "Pin sạc dự phòng dung lượng cao chính hãng, nhỏ gọn tiện lợi mang theo mọi lúc mọi nơi."
                    }
                ]
            },
            {
                id: "dong-ho-thong-minh",
                name: "Đồng hồ thông minh",
                slug: "dong-ho-thong-minh",
                icon: "Watch",
                seoKeywords: "đồng hồ thông minh, smartwatch, apple watch, đồng hồ thể thao",
                seoDescription: "Mua đồng hồ thông minh, Apple Watch giúp theo dõi sức khỏe, nghe gọi tiện lợi với mức giá ưu đãi.",
                children: [
                    {
                        id: "dong-ho-thong-minh/apple-watch",
                        name: "Apple Watch",
                        slug: "apple-watch",
                        seoKeywords: "apple watch, apple watch series 10, apple watch ultra 2, apple watch se",
                        seoDescription: "Khám phá các dòng Apple Watch Series 10, Ultra 2, SE với thiết kế sành điệu và tính năng sức khỏe tiên tiến."
                    }
                ]
            }
        ],
        service: [
            {
                id: "sua-chua-dien-thoai",
                name: "Sửa chữa Điện thoại",
                slug: "sua-chua-dien-thoai",
                icon: "Smartphone",
                seoKeywords: "sửa điện thoại, sửa chữa điện thoại, sửa iphone, sửa samsung",
                seoDescription: "Dịch vụ sửa chữa điện thoại chuyên nghiệp, uy tín. Xử lý triệt để các lỗi phần cứng, phần mềm trên iPhone, Samsung, Oppo.",
                children: [
                    {
                        id: "sua-chua-dien-thoai/sua-iphone",
                        name: "Sửa iPhone",
                        slug: "sua-iphone",
                        seoKeywords: "sửa iphone, thay pin iphone, thay màn hình iphone, ép kính iphone",
                        seoDescription: "Chuyên sửa chữa các dòng iPhone từ cũ đến mới nhất. Linh kiện chính hãng, bảo hành dài hạn."
                    },
                    {
                        id: "sua-chua-dien-thoai/sua-samsung",
                        name: "Sửa Samsung",
                        slug: "sua-samsung",
                        seoKeywords: "sửa samsung, thay pin samsung, ép kính samsung, sửa lỗi màn hình",
                        seoDescription: "Khắc phục sự cố trên điện thoại Samsung Galaxy nhanh chóng, chất lượng đảm bảo."
                    }
                ]
            },
            {
                id: "sua-chua-may-tinh-bang",
                name: "Sửa Máy tính bảng",
                slug: "sua-chua-may-tinh-bang",
                icon: "Tablet",
                seoKeywords: "sửa máy tính bảng, sửa ipad, thay pin ipad, thay màn hình ipad",
                seoDescription: "Dịch vụ sửa chữa máy tính bảng, iPad tận tâm, giá cả minh bạch.",
                children: [
                    {
                        id: "sua-chua-may-tinh-bang/sua-ipad",
                        name: "Sửa iPad",
                        slug: "sua-ipad",
                        seoKeywords: "sửa ipad, thay kính ipad, thay màn hình ipad, sửa nguồn ipad",
                        seoDescription: "Sửa chữa iPad tất cả các thế hệ, cam kết không tráo linh kiện."
                    }
                ]
            },
            {
                id: "sua-chua-laptop",
                name: "Sửa Laptop",
                slug: "sua-chua-laptop",
                icon: "Laptop",
                seoKeywords: "sửa laptop, sửa macbook, thay bàn phím laptop, nâng cấp ssd",
                seoDescription: "Bảo dưỡng, nâng cấp và sửa chữa laptop các hãng Dell, HP, Asus, MacBook chuyên nghiệp.",
                children: [
                    {
                        id: "sua-chua-laptop/sua-macbook",
                        name: "Sửa MacBook",
                        slug: "sua-macbook",
                        seoKeywords: "sửa macbook, thay pin macbook, thay màn hình macbook, sửa nguồn macbook",
                        seoDescription: "Chuyên trị các bệnh khó trên MacBook Pro, MacBook Air. Linh kiện chuẩn Apple."
                    },
                    {
                        id: "sua-chua-laptop/sua-laptop-windows",
                        name: "Sửa Laptop Windows",
                        slug: "sua-laptop-windows",
                        seoKeywords: "sửa laptop windows, sửa laptop dell, vệ sinh laptop, nâng cấp ram",
                        seoDescription: "Sửa chữa, cài đặt phần mềm và nâng cấp phần cứng cho laptop Windows."
                    }
                ]
            },
            {
                id: "sua-apple-watch",
                name: "Sửa Apple Watch",
                slug: "sua-apple-watch",
                icon: "Watch",
                seoKeywords: "sửa apple watch, thay kính apple watch, thay pin apple watch",
                seoDescription: "Dịch vụ sửa chữa đồng hồ thông minh Apple Watch nhanh gọn, uy tín."
            },
            {
                id: "dich-vu-pho-bien",
                name: "Dịch vụ phổ biến",
                slug: "dich-vu-pho-bien",
                icon: "Wrench",
                seoKeywords: "thay pin, ép kính, thay màn hình, vệ sinh máy",
                seoDescription: "Các dịch vụ sửa chữa nhanh được yêu cầu nhiều nhất.",
                children: [
                    {
                        id: "dich-vu-pho-bien/thay-pin",
                        name: "Thay Pin",
                        slug: "thay-pin",
                        seoKeywords: "thay pin điện thoại, thay pin iphone chính hãng, thay pin bảo hành",
                        seoDescription: "Thay pin điện thoại lấy ngay trong 15 phút, bảo hành lên đến 12 tháng."
                    },
                    {
                        id: "dich-vu-pho-bien/ep-kinh",
                        name: "Ép Kính",
                        slug: "ep-kinh",
                        seoKeywords: "ép kính điện thoại, thay mặt kính, ép kính iphone",
                        seoDescription: "Ép kính công nghệ chân không hiện đại, giúp màn hình sáng đẹp như mới."
                    },
                    {
                        id: "dich-vu-pho-bien/thay-man-hinh",
                        name: "Thay Màn Hình",
                        slug: "thay-man-hinh",
                        seoKeywords: "thay màn hình điện thoại, thay màn hình iphone zin",
                        seoDescription: "Thay màn hình nguyên bộ chính hãng, màu sắc hiển thị sắc nét."
                    }
                ]
            }
        ],
        component: [
            {
                id: "linh-kien-dien-thoai",
                name: "Linh kiện Điện thoại",
                slug: "linh-kien-dien-thoai",
                icon: "Cpu",
                seoKeywords: "linh kiện điện thoại, màn hình điện thoại, pin điện thoại",
                seoDescription: "Cung cấp sỉ lẻ linh kiện điện thoại các hãng Apple, Samsung, Xiaomi.",
                children: [
                    {
                        id: "linh-kien-dien-thoai/man-hinh",
                        name: "Màn hình",
                        slug: "man-hinh",
                        seoKeywords: "màn hình iphone, màn hình samsung, màn zin tháo máy",
                        seoDescription: "Màn hình linh kiện, màn zin tháo máy chất lượng cao."
                    },
                    {
                        id: "linh-kien-dien-thoai/pin",
                        name: "Pin",
                        slug: "pin",
                        seoKeywords: "pin linh kiện, pin pisen, pin dung lượng cao",
                        seoDescription: "Pin chuẩn, pin dung lượng cao từ các thương hiệu uy tín như Pisen, Energizer."
                    },
                    {
                        id: "linh-kien-dien-thoai/vo-lung-suon",
                        name: "Vỏ - Lưng - Sườn",
                        slug: "vo-lung-suon",
                        seoKeywords: "thay vỏ iphone, lưng kính samsung, độ vỏ",
                        seoDescription: "Vỏ máy, mặt lưng kính màu sắc chuẩn, khít như zin."
                    }
                ]
            },
            {
                id: "linh-kien-laptop",
                name: "Linh kiện Laptop",
                slug: "linh-kien-laptop",
                icon: "Cpu",
                seoKeywords: "linh kiện laptop, ram laptop, ổ cứng ssd",
                seoDescription: "Các loại linh kiện thay thế, nâng cấp cho laptop.",
                children: [
                    {
                        id: "linh-kien-laptop/ban-phim",
                        name: "Bàn phím",
                        slug: "ban-phim",
                        seoKeywords: "bàn phím laptop, thay phím macbook",
                        seoDescription: "Bàn phím thay thế cho các dòng laptop Dell, Asus, MacBook."
                    },
                    {
                        id: "linh-kien-laptop/pin-laptop",
                        name: "Pin Laptop",
                        slug: "pin-laptop",
                        seoKeywords: "pin laptop dell, pin macbook",
                        seoDescription: "Pin laptop chính hãng, cell pin chất lượng cao."
                    },
                    {
                        id: "linh-kien-laptop/ram-ssd",
                        name: "RAM & SSD",
                        slug: "ram-ssd",
                        seoKeywords: "nâng cấp ram, ssd nvme",
                        seoDescription: "Nâng cấp tốc độ máy tính với RAM và SSD chuẩn mới nhất."
                    }
                ]
            },
            {
                id: "linh-kien-ipad",
                name: "Linh kiện Máy tính bảng",
                slug: "linh-kien-ipad",
                icon: "Cpu",
                seoKeywords: "linh kiện ipad, màn hình ipad",
                seoDescription: "Cung cấp linh kiện dành riêng cho máy tính bảng, iPad.",
                children: [
                    {
                        id: "linh-kien-ipad/man-hinh-cam-ung",
                        name: "Màn hình & Cảm ứng",
                        slug: "man-hinh-cam-ung",
                        seoKeywords: "cảm ứng ipad, màn hình ipad zin",
                        seoDescription: "Kính cảm ứng và cụm màn hình hiển thị cho iPad, Galaxy Tab."
                    }
                ]
            }
        ],
    },
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPricingIcon(value: unknown): value is PricingIconName {
    return value === 'smartphone' || value === 'tablet' || value === 'laptop' || value === 'watch';
}

export function normalizeHomepagePricing(value: unknown): HomepagePricingConfig {
    if (!isRecord(value)) return DEFAULT_CONFIG.homepagePricing;

    const defaults = DEFAULT_CONFIG.homepagePricing;
    const storedCategories = Array.isArray(value.categories) ? value.categories : defaults.categories;
    const defaultById = new Map(defaults.categories.map(category => [category.id, category]));
    const categories = storedCategories
        .filter(isRecord)
        .map((category, index) => {
            const id = typeof category.id === 'string' && category.id.trim() ? category.id.trim() : `pricing-category-${index + 1}`;
            const fallback = defaultById.get(id);
            const label = typeof category.label === 'string' && category.label.trim() ? category.label.trim() : fallback?.label || id;
            const keywords = Array.isArray(category.keywords)
                ? category.keywords.filter((keyword): keyword is string => typeof keyword === 'string' && !!keyword.trim()).map(keyword => keyword.trim())
                : fallback?.keywords || [id, label];
            const maxItems = typeof category.maxItems === 'number' && Number.isFinite(category.maxItems)
                ? Math.min(20, Math.max(1, Math.round(category.maxItems)))
                : fallback?.maxItems || 6;

            return {
                id,
                label,
                icon: isPricingIcon(category.icon) ? category.icon : fallback?.icon || 'smartphone',
                keywords,
                maxItems,
            };
        });

    return {
        title: typeof value.title === 'string' ? value.title : defaults.title,
        highlightedTitle: typeof value.highlightedTitle === 'string' ? value.highlightedTitle : defaults.highlightedTitle,
        subtitle: typeof value.subtitle === 'string' ? value.subtitle : defaults.subtitle,
        ctaLabel: typeof value.ctaLabel === 'string' ? value.ctaLabel : defaults.ctaLabel,
        ctaHref: typeof value.ctaHref === 'string' ? value.ctaHref : defaults.ctaHref,
        categories: categories.length > 0 ? categories : defaults.categories,
    };
}

export function normalizeHomepageReviews(value: unknown): HomepageReviewsConfig {
    if (!isRecord(value)) return DEFAULT_CONFIG.homepageReviews;

    const defaults = DEFAULT_CONFIG.homepageReviews;
    return {
        eyebrow: typeof value.eyebrow === 'string' ? value.eyebrow : defaults.eyebrow,
        title: typeof value.title === 'string' ? value.title : defaults.title,
        googlePlaceId: typeof value.googlePlaceId === 'string' ? value.googlePlaceId.trim() : defaults.googlePlaceId,
    };
}
