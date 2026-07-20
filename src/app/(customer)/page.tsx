import ClientPage from './page.client';
import { isAdminAvailable, getAdminDb } from '@/lib/firebaseAdmin';
import { DEFAULT_CONFIG, type HeroBanner, type HomeSectionItem, type StoreBranch, type HomeServiceCategory } from '@/lib/config-defaults';
import { getCachedServerConfig } from '@/lib/serverConfig';
import { toPublicProduct, toPublicService } from '@/lib/publicCatalog';

import { unstable_cache } from 'next/cache';

export const revalidate = 300;

/**
 * Dữ liệu config tối thiểu cần thiết cho SSR Homepage.
 * Chỉ lấy những field ảnh hưởng đến LCP và SEO, không lấy toàn bộ config.
 */
export interface SSRHomeConfig {
  hero_banners: HeroBanner[];
  homeSections: HomeSectionItem[];
  siteName: string;
  store_branches: StoreBranch[];
  ssrLatestProducts?: Record<string, unknown>[]; // Cached initial products for FlashSale and Suggested
  homeServiceCategories: HomeServiceCategory[]; 
  ssrArticles?: Record<string, unknown>[]; // Cached articles
  ssrPricingServices?: Record<string, unknown>[]; // Cached pricing services
}

const fetchHomeConfigData = async (): Promise<SSRHomeConfig> => {
  const fallbackConfig = {
    hero_banners: DEFAULT_CONFIG.hero_banners,
    homeSections: DEFAULT_CONFIG.homeSections,
    siteName: DEFAULT_CONFIG.siteName,
    store_branches: DEFAULT_CONFIG.store_branches,
    ssrLatestProducts: [],
    homeServiceCategories: DEFAULT_CONFIG.homeServiceCategories,
  };

  if (!isAdminAvailable()) {
    return fallbackConfig;
  }

  // Dùng unstable_cache kết hợp revalidate: 300 (5 phút). 
  // Cache sẽ được chia sẻ chéo giữa các người dùng.
  // Khi Admin cập nhật, nút "Làm mới Website" sẽ xóa cache tag 'homepage'.
  try {
    const db = getAdminDb();
    // Fetch system_config, products, articles and services in parallel
    const [siteConfig, productsSnapshot, articlesSnapshot, servicesSnapshot] = await Promise.all([
      getCachedServerConfig(),
      db.collection('products')
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(15)
        .get(),
      db.collection('articles')
        .where('status', '==', 'published')
        .orderBy('createdAt', 'desc')
        .limit(4)
        .get(),
      db.collection('services')
        .where('isActive', '==', true)
        .limit(200)
        .get()
    ]);

    // Parse products (convert timestamps to strings)
    const ssrLatestProducts = productsSnapshot.docs.map(doc => toPublicProduct(doc.id, doc.data()));

    // Parse articles
    const rawArticles = articlesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    const ssrArticles = JSON.parse(JSON.stringify(rawArticles));

    // Parse services
    const ssrPricingServices = servicesSnapshot.docs.map(doc => toPublicService(doc.id, doc.data()));

    const rawBanners = Array.isArray(siteConfig.hero_banners) ? siteConfig.hero_banners : [];
    const rawBranches = Array.isArray(siteConfig.store_branches) ? siteConfig.store_branches : DEFAULT_CONFIG.store_branches;
    const rawHomeServiceCategories: HomeServiceCategory[] = Array.isArray(siteConfig.homeServiceCategories) ? siteConfig.homeServiceCategories : DEFAULT_CONFIG.homeServiceCategories;

    const storedSections: HomeSectionItem[] = Array.isArray(siteConfig.homeSections) ? siteConfig.homeSections : [];
    let homeSections = DEFAULT_CONFIG.homeSections;
    if (storedSections.length > 0) {
      const storedIds = new Set(storedSections.map(s => s.id));
      const missing = DEFAULT_CONFIG.homeSections.filter(d => !storedIds.has(d.id));
      if (missing.length === 0) {
        homeSections = storedSections;
      } else {
        const maxOrder = Math.max(...storedSections.map(s => s.order), 0);
        homeSections = [...storedSections, ...missing.map((m, i) => ({ ...m, order: maxOrder + 1 + i }))];
      }
    }

    return {
      hero_banners: rawBanners.length > 0 ? rawBanners : DEFAULT_CONFIG.hero_banners,
      homeSections,
      siteName: siteConfig.siteName || DEFAULT_CONFIG.siteName,
      store_branches: rawBranches,
      ssrLatestProducts,
      homeServiceCategories: rawHomeServiceCategories,
      ssrArticles,
      ssrPricingServices
    };
  } catch (error) {
    console.error("Error fetching Home Config:", error);
    return fallbackConfig;
  }
}

const getHomeConfig = unstable_cache(
  async () => fetchHomeConfigData(),
  ['home-config-data'],
  {
    revalidate: 300,
    tags: ['config', 'homepage', 'layout'] // Also tag with layout so it can be cleared easily
  }
);

export default async function Page() {
  const ssrConfig = await getHomeConfig();
  
  // Preload LCP image: use the direct Firebase URL to bypass proxy delay
  const firstBanner = ssrConfig.hero_banners?.[0];
  const lcpImageUrl = firstBanner?.imageUrl;
  
  return (
    <>
      {lcpImageUrl && (
        <link 
          rel="preload" 
          as="image" 
          href={lcpImageUrl}
          fetchPriority="high"
        />
      )}
      <ClientPage ssrConfig={ssrConfig} />
    </>
  );
}
