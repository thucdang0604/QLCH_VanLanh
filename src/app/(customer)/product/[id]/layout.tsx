import type { Metadata, ResolvingMetadata } from 'next';
import { SITE_URL } from "@/lib/constants";
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';

type DetailData = {
    name?: string;
    description?: string;
    seoDescription?: string;
    imageUrl?: string;
    image?: string;
    images?: string[];
    brand?: string;
    _type: 'product' | 'service';
};

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
    parent: ResolvingMetadata
): Promise<Metadata> {
    const { id } = await params;
    
    let ogImage = `${SITE_URL}/logo.png`;
    const previousImages = (await parent).openGraph?.images || [];
    if (previousImages.length > 0) {
        // Fallback or handle later
    }

    if (!isAdminAvailable() || !id) {
        return { title: 'Sản phẩm | Văn Lành Service' };
    }

    try {
        const db = getAdminDb();
        
        let docRef = db.collection('products').doc(id);
        let snap = await docRef.get();
        let data: DetailData | null = null;

        if (snap.exists) {
            data = { ...(snap.data() as DetailData), _type: 'product' };
        } else {
            docRef = db.collection('services').doc(id);
            snap = await docRef.get();
            if (snap.exists) {
                data = { ...(snap.data() as DetailData), _type: 'service' };
            }
        }

        if (!data) return { title: 'Sản phẩm không tìm thấy | Văn Lành Service' };

        const isService = data._type === 'service';
        const seoTitle = `${data.name} | ${isService ? 'Dịch vụ sửa chữa' : 'Sản phẩm'} tại Văn Lành Service`;
        
        const shortDescription =
            data.seoDescription ||
            data.description ||
            (isService
                ? `Dịch vụ ${data.name} chính hãng, sửa nhanh, bảo hành uy tín tại Văn Lành Service.`
                : `Mua ${data.name} chính hãng, giá tốt, bảo hành uy tín tại Văn Lành Service.`);

        const images = data.images || (data.imageUrl ? [data.imageUrl] : (data.image ? [data.image] : []));
        if (images && images.length > 0) {
            ogImage = images[0];
        }

        return {
            title: seoTitle,
            description: shortDescription.slice(0, 155),
            openGraph: {
                title: seoTitle,
                description: shortDescription.slice(0, 155),
                url: `${SITE_URL}/product/${id}`,
                images: [ogImage, ...previousImages],
                type: 'website',
            },
            twitter: {
                card: 'summary_large_image',
                title: seoTitle,
                description: shortDescription.slice(0, 155),
                images: [ogImage],
            }
        };

    } catch (error) {
        console.error('Error fetching metadata for product', error);
        return { title: 'Sản phẩm | Văn Lành Service' };
    }
}

export default function ProductLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


export const revalidate = false;
