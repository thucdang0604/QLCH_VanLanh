import { MetadataRoute } from 'next';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { SITE_URL } from '@/lib/constants';
import { fetchDynamicCategories, fetchCategoryItems } from '@/app/(customer)/_lib/server-queries';

const STATIC_NAV_SLUGS = ['may-moi', 'may-cu', 'sua-chua', 'phu-kien'];

export const revalidate = 86400; // Cache sitemap for 24 hours

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

    // Fetch items for dynamic pruning and subsequent product/service URL generation
    const allServices = await fetchCategoryItems(true);
    const allProducts = await fetchCategoryItems(false);

    // 2. Category Pages (Static + Dynamic Pruned)
    const dynamicCategories = await fetchDynamicCategories();
    const validDynamicSlugs: string[] = [];
    
    for (const cat of dynamicCategories as Record<string, unknown>[]) {
        if (!cat.keywords || !Array.isArray(cat.keywords) || cat.keywords.length === 0) {
            if (typeof cat.slug === 'string') {
                validDynamicSlugs.push(cat.slug); // If no keywords, assume it's valid
            }
            continue;
        }

        const isRepair = cat.type === 'repair';
        const itemsToFilter = isRepair ? allServices : allProducts;
        
        const hasItems = itemsToFilter.some((item: Record<string, unknown>) => {
            const searchStr = `${item.name || ''} ${item.device_model || ''} ${item.category || ''} ${item.description || ''} ${Array.isArray(item.tags) ? item.tags.join(' ') : ''}`.toLowerCase();
            return (cat.keywords as string[]).some((kw: string) => searchStr.includes(kw.toLowerCase()));
        });

        if (hasItems && typeof cat.slug === 'string') {
            validDynamicSlugs.push(cat.slug);
        }
    }

    const combinedSlugs = Array.from(new Set([...STATIC_NAV_SLUGS, ...validDynamicSlugs]));

    const categoryPages: MetadataRoute.Sitemap = combinedSlugs.map(slug => ({
        url: `${SITE_URL}/category/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.9,
    }));

    // 3. Dynamic Products
    const productPages: MetadataRoute.Sitemap = allProducts.map((item: Record<string, unknown>) => ({
        url: `${SITE_URL}/product/${item.id}`,
        lastModified: item.updatedAt ? new Date(item.updatedAt as string | number) : (item.createdAt ? new Date(item.createdAt as string | number) : new Date()),
        changeFrequency: 'weekly',
        priority: 0.8,
    }));

    // 4. Dynamic Services
    const servicePages: MetadataRoute.Sitemap = allServices.map((item: Record<string, unknown>) => ({
        url: `${SITE_URL}/service/${item.id}`,
        lastModified: item.updatedAt ? new Date(item.updatedAt as string | number) : (item.createdAt ? new Date(item.createdAt as string | number) : new Date()),
        changeFrequency: 'weekly',
        priority: 0.8,
    }));

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
