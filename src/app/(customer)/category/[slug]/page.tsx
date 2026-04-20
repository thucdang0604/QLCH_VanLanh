import { Metadata } from 'next';
import { fetchCategoryItems } from '../../_lib/server-queries';
import CategoryClient from './CategoryClient';
import { SITE_URL } from "@/lib/constants";

/* ─────────────────────────────────────────────
   Slug → Metadata maps
───────────────────────────────────────────── */
const REPAIR_MAP: Record<string, { label: string; category: string }> = {
    'sua-iphone': { label: 'Sửa chữa iPhone', category: 'Sửa iPhone' },
    'sua-samsung': { label: 'Sửa chữa Samsung', category: 'Sửa Samsung' },
    'sua-oppo': { label: 'Sửa chữa OPPO', category: 'Sửa OPPO' },
    'sua-xiaomi': { label: 'Sửa chữa Xiaomi', category: 'Sửa Xiaomi' },
    'sua-tablet': { label: 'Sửa chữa Tablet', category: 'Sửa Tablet' },
    'sua-laptop': { label: 'Sửa chữa Laptop', category: 'Sửa Laptop' },
    'sua-may-tinh': { label: 'Sửa chữa Máy tính', category: 'Sửa Máy tính' },
    'thay-pin': { label: 'Thay Pin Chính Hãng', category: 'Thay Pin' },
    'ep-kinh': { label: 'Ép Kính – Thay Màn Hình', category: 'Ép Kính' },
};

const PRODUCT_MAP: Record<string, { label: string; category: string }> = {
    'phone': { label: 'Điện thoại', category: 'Điện thoại' },
    'dien-thoai': { label: 'Điện thoại', category: 'Điện thoại' },
    'laptop': { label: 'Laptop', category: 'Laptop' },
    'tablet': { label: 'Tablet', category: 'Tablet' },
    'smartwatch': { label: 'Smartwatch', category: 'Smartwatch' },
    'am-thanh': { label: 'Âm thanh', category: 'Âm thanh' },
    'phu-kien-sp': { label: 'Phụ kiện', category: 'Phụ kiện' },
    'accessory': { label: 'Phụ kiện', category: 'Phụ kiện' },
};

/* ── New top-level slugs (from simplified nav) ── */
const NAV_SLUG_MAP: Record<string, { label: string; condition?: string; isRepair?: boolean; isAccessory?: boolean }> = {
    'may-moi': { label: 'Máy Mới', condition: 'new' },
    'may-cu': { label: 'Máy Cũ Giá Rẻ', condition: 'used' }, // includes like-new
    'sua-chua': { label: 'Sửa Chữa - Bảo Hành', isRepair: true },
    'phu-kien': { label: 'Phụ Kiện', isAccessory: true },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const navInfo = NAV_SLUG_MAP[slug];
    const repairInfo = REPAIR_MAP[slug];
    const productInfo = PRODUCT_MAP[slug];
    const isRepair = navInfo ? !!navInfo.isRepair : !!repairInfo;
    const pageLabel = navInfo?.label ?? repairInfo?.label ?? productInfo?.label ?? 'Danh mục';

    const title = `${pageLabel} | Văn Lành Service - Sửa chữa uy tín tại TP.HCM`;
    const description = isRepair
        ? `Dịch vụ ${pageLabel} chính hãng tại Văn Lành Service. Linh kiện chính hãng, bảo hành trọn đời, xong trong 30 phút. Hotline: 0932.242.026`
        : `Mua ${pageLabel} chính hãng giá tốt tại Văn Lành Service. Bảo hành uy tín, giao hàng nhanh.`;

    return {
        title,
        description,
        alternates: {
            canonical: `${SITE_URL}/category/${slug}`
        }
    };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    const navInfo = NAV_SLUG_MAP[slug];
    const repairInfo = REPAIR_MAP[slug];
    const productInfo = PRODUCT_MAP[slug];
    const isRepair = navInfo ? !!navInfo.isRepair : !!repairInfo;
    const isNavProductSlug = !!navInfo && !navInfo.isRepair;
    const pageLabel = navInfo?.label ?? repairInfo?.label ?? productInfo?.label ?? 'Danh mục';

    // 1. Fetch data from server
    let items = [];
    if (isRepair) {
        items = await fetchCategoryItems(true);
    } else if (isNavProductSlug) {
        items = await fetchCategoryItems(false);
    } else {
        items = await fetchCategoryItems(false, productInfo?.category);
    }

    // 2. Compute schemas
    const seoDescription = isRepair
        ? `Dịch vụ ${pageLabel} chính hãng tại Văn Lành Service. Linh kiện chính hãng, bảo hành trọn đời, xong trong 30 phút. Hotline: 0932.242.026`
        : `Mua ${pageLabel} chính hãng giá tốt tại Văn Lành Service. Bảo hành uy tín, giao hàng nhanh.`;
        
    const schemaData = isRepair ? {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: pageLabel,
        description: seoDescription,
        provider: {
            '@type': 'LocalBusiness',
            name: 'Văn Lành Service',
            telephone: '0932242026',
        },
        areaServed: { '@type': 'City', name: 'Hồ Chí Minh' },
    } : {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: pageLabel,
        description: seoDescription,
    };

    const canonicalUrl = `${SITE_URL}/category/${slug}`;
    const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'Trang chủ',
                item: `${SITE_URL}/`,
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: pageLabel,
                item: canonicalUrl,
            },
        ],
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
            />
            <CategoryClient slug={slug} initialItems={items} />
        </>
    );
}
