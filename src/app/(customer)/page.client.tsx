'use client';

/* eslint-disable @next/next/no-img-element */
import { useConfig } from '@/lib/ConfigContext';
import HeroSection from "@/components/home/HeroSection";

import dynamic from "next/dynamic";
import { SITE_URL } from "@/lib/constants";
import type { SSRHomeConfig } from './page';
import type { HeroBanner, StoreBranch } from '@/lib/ConfigContext';


// ===== Dynamic section components map =====
const FlashSale = dynamic(() => import("@/components/home/FlashSale"), { ssr: false, loading: () => <div className="h-[200px] bg-white animate-pulse rounded-xl container mx-auto mt-4"></div> });
const BookingSection = dynamic(() => import("@/components/home/BookingSection"), { ssr: false, loading: () => <div className="h-[300px] bg-white animate-pulse rounded-xl container mx-auto mt-4"></div> });
const ArticleBlock = dynamic(() => import("@/components/home/ArticleBlock"), { ssr: false, loading: () => <div className="h-[400px] bg-white animate-pulse rounded-xl container mx-auto mt-4"></div> });
const SuggestedSection = dynamic(() => import("@/components/home/SuggestedSection"), { ssr: false, loading: () => <div className="h-[400px] bg-white animate-pulse rounded-xl container mx-auto mt-4"></div> });
const PricingSection = dynamic(() => import("@/components/home/PricingSection"), { ssr: false, loading: () => <div className="h-[300px] bg-white animate-pulse rounded-xl container mx-auto mt-4"></div> });
const GoogleReviewsSection = dynamic(() => import("@/components/home/GoogleReviewsSection"), { ssr: false, loading: () => <div className="h-[300px] bg-white animate-pulse rounded-xl container mx-auto mt-4"></div> });
import CategoriesSection from "@/components/home/CategoriesSection";

const SECTION_COMPONENTS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  hero: HeroSection,
  flash_sale: FlashSale,
  booking: BookingSection,
  categories: CategoriesSection,
  suggested: SuggestedSection,
  pricing_table: PricingSection,
  google_reviews: GoogleReviewsSection,
  articles: ArticleBlock,
};


// ===== Main Homepage =====
export default function Home({ ssrConfig }: { ssrConfig: SSRHomeConfig }) {
  const { config, loading: configLoading } = useConfig();

  // Sử dụng dữ liệu SSR làm giá trị ban đầu, client config sẽ ghi đè khi sẵn sàng
  const heroBanners: HeroBanner[] = configLoading ? ssrConfig.hero_banners : (config.hero_banners || ssrConfig.hero_banners);
  const homeSections = configLoading ? ssrConfig.homeSections : config.homeSections;
  const siteName = configLoading ? ssrConfig.siteName : (config.siteName || ssrConfig.siteName);
  const storeBranches: StoreBranch[] = configLoading ? ssrConfig.store_branches : (config.store_branches || ssrConfig.store_branches);

  // Basic SEO for homepage
  const seoTitle = `${siteName || 'Văn Lành Service'} | Sửa điện thoại, laptop & phụ kiện chính hãng tại TP.HCM`;
  const seoDescription =
    'Trung tâm sửa chữa điện thoại, laptop, máy tính bảng và phụ kiện chính hãng Văn Lành Service tại TP.HCM. Sửa nhanh, bảo hành uy tín, linh kiện chuẩn, hỗ trợ trả góp.';

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName || 'Văn Lành Service',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  // Sort visible sections by order
  const resolvedSections = Array.isArray(homeSections) ? homeSections : (ssrConfig?.homeSections || []);
  const visibleSections = [...resolvedSections]
    .filter(s => s.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      {/* SEO for Homepage */}
      <title>{seoTitle}</title>
      <meta name="description" content={seoDescription} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />

      {visibleSections.map((section, index) => {
        const Component = SECTION_COMPONENTS[section.component];
        if (!Component) return null;

        const bg = section.sectionBg;
        const hasBg = bg && bg.type !== 'none';

        // Build wrapper style
        const wrapperStyle: React.CSSProperties = {};
        if (hasBg) {
          if (bg.type === 'color' && bg.color) {
            wrapperStyle.backgroundColor = bg.color;
          } else if (bg.type === 'image' && bg.imageUrl) {
            wrapperStyle.backgroundImage = `url(${bg.imageUrl})`;
            wrapperStyle.backgroundSize = bg.size === 'repeat' ? 'auto' : (bg.size || 'cover');
            wrapperStyle.backgroundRepeat = bg.size === 'repeat' ? 'repeat' : 'no-repeat';
            wrapperStyle.backgroundPosition = 'center';
          }
        }

        return (
          <div
            key={section.id}
            className="relative"
            style={{
              zIndex: visibleSections.length - index,
              ...wrapperStyle,
              ...(bg?.cardBg ? { '--card-bg': bg.cardBg } as React.CSSProperties : {}),
              ...(bg?.outerBg ? { '--outer-bg': bg.outerBg } as React.CSSProperties : {}),
            }}
          >
            {/* Background image opacity overlay */}
            {hasBg && bg.type === 'image' && bg.imageUrl && typeof bg.opacity === 'number' && bg.opacity < 100 && (
              <div
                className="absolute inset-0 bg-white pointer-events-none"
                style={{ opacity: 1 - (bg.opacity / 100) }}
              />
            )}
            {/* Frame overlay */}
            {hasBg && bg.frameUrl && (
              <img
                src={bg.frameUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-fill pointer-events-none z-10"
              />
            )}
            <div className="relative z-[1]">
              <Component
                {...(section.component === 'hero' ? { initialBanners: heroBanners, storeBranches } : {})}
                {...(section.component === 'flash_sale' || section.component === 'suggested' ? { ssrLatestProducts: ssrConfig.ssrLatestProducts } : {})}
                {...(section.component === 'categories' ? { ssrHomeServiceCategories: ssrConfig.homeServiceCategories } : {})}
                {...(section.component === 'pricing_table' ? { ssrPricingServices: ssrConfig.ssrPricingServices } : {})}
                {...(section.component === 'articles' ? { ssrArticles: ssrConfig.ssrArticles } : {})}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
