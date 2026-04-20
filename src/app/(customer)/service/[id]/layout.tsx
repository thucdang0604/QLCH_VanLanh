import type { Metadata, ResolvingMetadata } from 'next';
import { getAdminDb, isAdminAvailable } from "@/lib/firebaseAdmin";
import { SITE_URL } from "@/lib/constants";

type ServiceData = {
    name?: string;
    description?: string;
    seoDescription?: string;
    imageUrl?: string;
    image?: string;
    images?: string[];
};

export async function generateMetadata(
    { params }: { params: Promise<{ id: string }> },
    parent: ResolvingMetadata
): Promise<Metadata> {
    const { id } = await params;
    
    let ogImage = `${SITE_URL}/logo.png`;
    const previousImages = (await parent).openGraph?.images || [];

    if (!isAdminAvailable() || !id) {
        return { title: 'Dịch vụ | Văn Lành Service' };
    }

    try {
        const db = getAdminDb();
        const docRef = db.collection('services').doc(id);
        const snap = await docRef.get();
        let data: ServiceData | null = null;

        if (snap.exists) {
            data = snap.data() as ServiceData;
        }

        if (!data) return { title: 'Dịch vụ sửa chữa không tìm thấy | Văn Lành Service' };

        const seoTitle = `${data.name} | Dịch vụ sửa chữa tại Văn Lành Service`;
        
        const shortDescription =
            data.seoDescription ||
            data.description ||
            `Dịch vụ ${data.name} chính hãng, sửa nhanh, bảo hành uy tín tại Văn Lành Service.`;

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
                url: `${SITE_URL}/service/${id}`,
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
        console.error('Error fetching metadata for service', error);
        return { title: 'Dịch vụ sửa chữa | Văn Lành Service' };
    }
}

export default function ServiceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


export const revalidate = false;
