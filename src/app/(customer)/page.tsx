import ClientPage from './page.client';
import { isAdminAvailable, getAdminDb } from '@/lib/firebaseAdmin';
import { DEFAULT_CONFIG, type HeroBanner, type HomeSectionItem, type StoreBranch } from '@/lib/config-defaults';

export const dynamic = 'force-dynamic';

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
  homeServiceCategories: any[]; 
}

async function getHomeConfig(): Promise<SSRHomeConfig> {
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

  // Fetch trực tiếp từ Firestore thay vì dùng unstable_cache.
  // Lý do: Trên môi trường Serverless (Firebase/Cloud Run), Next.js data cache (.next/cache) 
  // bị cô lập giữa các instance. Việc dùng unstable_cache kết hợp revalidateTag sẽ chỉ xoá 
  // cache trên 1 instance nhận request, các instance khác vẫn phục vụ data cũ.
  // Đọc trực tiếp Firestore (Admin SDK) đảm bảo 100% realtime và đồng nhất trên mọi domain (fixphone.vn).
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
    const rawHomeServiceCategories = Array.isArray(data.homeServiceCategories) ? data.homeServiceCategories : DEFAULT_CONFIG.homeServiceCategories;

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
      homeServiceCategories: rawHomeServiceCategories,
    };
  } catch (error) {
    console.error("Error fetching Home Config:", error);
    return fallbackConfig;
  }
}

export default async function Page() {
  const ssrConfig = await getHomeConfig();
  
  // Preload LCP image: custom image loader can't auto-generate preload links,
  // so we manually inject it server-side for immediate browser discovery.
  const firstBanner = ssrConfig.hero_banners?.[0];
  const lcpImageUrl = firstBanner?.imageUrl;
  // Build the same wsrv.nl proxy URL that imageLoader will produce for the LCP image
  const preloadUrl = lcpImageUrl?.includes('firebasestorage.googleapis.com')
    ? `https://wsrv.nl/?url=${encodeURIComponent(lcpImageUrl)}&w=867&output=webp&q=60&fit=cover`
    : lcpImageUrl;
  
  return (
    <>
      {preloadUrl && (
        <link 
          rel="preload" 
          as="image" 
          href={preloadUrl}
          // @ts-ignore — fetchPriority on link is valid HTML but React types lag
          fetchPriority="high"
        />
      )}
      <ClientPage ssrConfig={ssrConfig} />
    </>
  );
}
