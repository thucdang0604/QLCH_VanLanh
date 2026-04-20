import { MetadataRoute } from 'next';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { SITE_URL } from '@/lib/constants';

const CATEGORY_SLUGS = [
    'sua-iphone', 'sua-samsung', 'sua-oppo', 'sua-xiaomi', 'sua-tablet', 'sua-laptop', 'sua-may-tinh', 'thay-pin', 'ep-kinh',
    'phone', 'dien-thoai', 'laptop', 'tablet', 'smartwatch', 'am-thanh', 'phu-kien-sp', 'accessory',
    'may-moi', 'may-cu', 'sua-chua', 'phu-kien'
];

export const revalidate = false;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const db = getAdminDb();
    
    // 1. Static Pages
    const staticPages: MetadataRoute.Sitemap = [
        { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
        { url: `${SITE_URL}/dao-tao-hoc-vien`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
        { url: `${SITE_URL}/tin-tuc`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
        { url: `${SITE_URL}/info/gioi-thieu`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
        { url: `${SITE_URL}/info/chinh-sach-bao-hanh`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
        { url: `${SITE_URL}/info/chinh-sach-bao-mat`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
        { url: `${SITE_URL}/info/chinh-sach-doi-tra`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
        { url: `${SITE_URL}/info/chinh-sach-mua-hang`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
        { url: `${SITE_URL}/info/tra-gop`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    ];

    // 2. Category Pages
    const categoryPages: MetadataRoute.Sitemap = CATEGORY_SLUGS.map(slug => ({
        url: `${SITE_URL}/category/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.9,
    }));

    // 3. Dynamic Products
    let productPages: MetadataRoute.Sitemap = [];
    try {
        const prodSnap = await db.collection('products').where('status', '==', 'active').get();
        productPages = prodSnap.docs.map(doc => ({
            url: `${SITE_URL}/product/${doc.id}`,
            lastModified: doc.data().updatedAt?.toDate() || doc.data().createdAt?.toDate() || new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        }));
    } catch (e) {
        console.error('Sitemap - Error fetching products:', e);
    }

    // 4. Dynamic Services
    let servicePages: MetadataRoute.Sitemap = [];
    try {
        const serviceSnap = await db.collection('services').get();
        servicePages = serviceSnap.docs
            .filter(doc => doc.data().isActive !== false) // Default to active unless explicitly false
            .map(doc => ({
                url: `${SITE_URL}/service/${doc.id}`,
                lastModified: doc.data().updatedAt?.toDate() || doc.data().createdAt?.toDate() || new Date(),
                changeFrequency: 'weekly',
                priority: 0.8,
            }));
    } catch (e) {
        console.error('Sitemap - Error fetching services:', e);
    }

    // 5. Dynamic Articles/News
    let articlePages: MetadataRoute.Sitemap = [];
    try {
        const docRef = await db.collection('articles').where('status', '==', 'published').get();
        articlePages = docRef.docs.map(doc => {
            const data = doc.data();
            const slugOrId = data.slug || doc.id;
            return {
                url: `${SITE_URL}/tin-tuc/${slugOrId}`,
                lastModified: data.updatedAt?.toDate() || data.createdAt?.toDate() || new Date(),
                changeFrequency: 'monthly',
                priority: 0.7,
            };
        });
    } catch (e) {
        console.error('Sitemap - Error fetching articles:', e);
    }

    return [
        ...staticPages,
        ...categoryPages,
        ...productPages,
        ...servicePages,
        ...articlePages,
    ];
}
