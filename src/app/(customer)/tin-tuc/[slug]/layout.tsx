import type { Metadata, ResolvingMetadata } from 'next';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { SITE_URL } from "@/lib/constants";

type ArticleData = {
    title?: string;
    content?: string;
    excerpt?: string;
    thumbnail?: string;
};

export async function generateMetadata(
    { params }: { params: Promise<{ slug: string }> },
    parent: ResolvingMetadata
): Promise<Metadata> {
    const { slug } = await params;
    
    let ogImage = `${SITE_URL}/logo.png`;
    const previousImages = (await parent).openGraph?.images || [];

    if (!isAdminAvailable() || !slug) {
        return { title: 'Bài viết | Văn Lành Service' };
    }

    try {
        const db = getAdminDb();
        const docRef = db.collection('articles').doc(slug);
        const snap = await docRef.get();
        let data: ArticleData | null = null;

        if (snap.exists) {
            data = snap.data() as ArticleData;
        }

        if (!data) return { title: 'Bài viết không tìm thấy | Văn Lành Service' };

        const seoTitle = `${data.title || 'Bài viết'} | Văn Lành Service`;
        
        const plainContent = (data.content || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
            
        const descriptionSource = data.excerpt || plainContent || data.title || 'Bài viết';
        const seoDescription = descriptionSource.slice(0, 155);

        if (data.thumbnail) {
            ogImage = data.thumbnail;
        }

        return {
            title: seoTitle,
            description: seoDescription,
            alternates: {
                canonical: `${SITE_URL}/tin-tuc/${slug}`,
            },
            openGraph: {
                title: seoTitle,
                description: seoDescription,
                url: `${SITE_URL}/tin-tuc/${slug}`,
                images: [ogImage, ...previousImages],
                type: 'article',
            },
            twitter: {
                card: 'summary_large_image',
                title: seoTitle,
                description: seoDescription,
                images: [ogImage],
            }
        };

    } catch (error) {
        console.error('Error fetching metadata for article', error);
        return { title: 'Bài viết | Văn Lành Service' };
    }
}

export default function ArticleLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


export const revalidate = false;
