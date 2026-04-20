import ClientPage from './page.client';
import { isAdminAvailable, getAdminDb } from '@/lib/firebaseAdmin';
import { DEFAULT_CONFIG, type HeroBanner, type HomeSectionItem, type StoreBranch } from '@/lib/config-defaults';

export const revalidate = false;

/**
 * Dữ liệu config tối thiểu cần thiết cho SSR Homepage.
 * Chỉ lấy những field ảnh hưởng đến LCP và SEO, không lấy toàn bộ config.
 */
export interface SSRHomeConfig {
  hero_banners: HeroBanner[];
  homeSections: HomeSectionItem[];
  siteName: string;
  store_branches: StoreBranch[];
  ssrLatestProducts?: any[]; // Cached initial products for FlashSale and Suggested
}

async function getHomeConfig(): Promise<SSRHomeConfig> {
  const fallbackConfig = {
    hero_banners: DEFAULT_CONFIG.hero_banners,
    homeSections: DEFAULT_CONFIG.homeSections,
    siteName: DEFAULT_CONFIG.siteName,
    store_branches: DEFAULT_CONFIG.store_branches,
    ssrLatestProducts: [],
  };

  if (!isAdminAvailable()) {
    return fallbackConfig;
  }

  try {
    const db = getAdminDb();
    const configDoc = db.collection('system_config').doc('main_settings');
    
    // Fetch system_config and 15 latest products in parallel
    const [configSnapshot, productsSnapshot] = await Promise.all([
      configDoc.get(),
      db.collection('products')
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(15)
        .get()
    ]);

    // Parse products (convert timestamps to strings)
    const rawProducts = productsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    const ssrLatestProducts = JSON.parse(JSON.stringify(rawProducts));

    if (!configSnapshot.exists) {
      return {
        ...fallbackConfig,
        ssrLatestProducts
      };
    }

    const data = JSON.parse(JSON.stringify(configSnapshot.data()!));

    const rawBanners = Array.isArray(data.hero_banners) ? data.hero_banners : [];
    const rawBranches = Array.isArray(data.store_branches) ? data.store_branches : DEFAULT_CONFIG.store_branches;

    const storedSections: HomeSectionItem[] = Array.isArray(data.homeSections) ? data.homeSections : [];
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
      siteName: data.siteName || DEFAULT_CONFIG.siteName,
      store_branches: rawBranches,
      ssrLatestProducts,
    };
  } catch (error) {
    console.error('[SSR] Failed to fetch home config:', error);
    return fallbackConfig;
  }
}

export default async function Page() {
  const ssrConfig = await getHomeConfig();
  return <ClientPage ssrConfig={ssrConfig} />;
}
