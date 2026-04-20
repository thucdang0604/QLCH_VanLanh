import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';

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

    const seoTitle = `${pageLabel} | Văn Lành Service - Sửa chữa uy tín tại TP.HCM`;
    const seoDescription = isRepair
        ? `Dịch vụ ${pageLabel} chính hãng tại Văn Lành Service. Linh kiện chính hãng, bảo hành trọn đời, xong trong 30 phút. Hotline: 0932.242.026`
        : `Mua ${pageLabel} chính hãng giá tốt tại Văn Lành Service. Bảo hành uy tín, giao hàng nhanh.`;

    const canonicalUrl = `${SITE_URL}/category/${slug}`;
    
    return {
        title: seoTitle,
        description: seoDescription,
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            title: seoTitle,
            description: seoDescription,
            url: canonicalUrl,
            type: 'website',
            siteName: 'Văn Lành Service',
        },
        twitter: {
            card: 'summary_large_image',
            title: seoTitle,
            description: seoDescription,
        },
    };
}

export default function CategoryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


export const revalidate = false;
