'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, limit, getDocs, DocumentData, type QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useConfig } from '@/lib/ConfigContext';
import HeroSection from "@/components/home/HeroSection";
import ServiceCard from "@/components/home/ServiceCard";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SITE_URL } from "@/lib/constants";
import type { SSRHomeConfig } from './page';
import type { HeroBanner, StoreBranch } from '@/lib/ConfigContext';

const serviceCategories = [
  { icon: "📱", name: "Sửa iPhone", slug: "sua-iphone", count: "200+ dịch vụ" },
  { icon: "📱", name: "Sửa Samsung", slug: "sua-samsung", count: "150+ dịch vụ" },
  { icon: "📟", name: "Sửa Tablet", slug: "sua-tablet", count: "80+ dịch vụ" },
  { icon: "🔋", name: "Thay Pin", slug: "thay-pin", count: "100+ dịch vụ" },
  { icon: "🪟", name: "Thay Mặt Kính", slug: "thay-mat-kinh", count: "80+ dịch vụ" },
  { icon: "💻", name: "Sửa Macbook", slug: "sua-macbook", count: "120+ dịch vụ" },
  { icon: "🎧", name: "Phụ Kiện", slug: "phu-kien", count: "300+ sản phẩm" },
  { icon: "🍎", name: "Sửa Apple Watch", slug: "sua-apple-watch", count: "10+ dịch vụ" },
];

// Tab cấu hình: label hiển thị vs giá trị lưu trong Firestore
const suggestedTabs = [
  { label: 'Tất cả', value: 'Tất cả' },
  { label: 'iPhone', value: 'Apple' },   // iPhone ≈ brand Apple trong DB
  { label: 'Samsung', value: 'Samsung' },
  { label: 'Xiaomi', value: 'Xiaomi' },
  { label: 'Oppo', value: 'OPPO' },      // chuẩn hoá theo brand trong admin
];

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-100 animate-pulse">
      <div className="aspect-square bg-gray-200" />
      <div className="p-3 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-5 bg-gray-200 rounded w-1/2 mt-2" />
      </div>
    </div>
  );
}

// ===== Dynamic section components map =====
const FlashSale = dynamic(() => import("@/components/home/FlashSale"), { loading: () => <div className="h-[200px] bg-white animate-pulse rounded-xl container mx-auto mt-4"></div> });
const BookingSection = dynamic(() => import("@/components/home/BookingSection"), { ssr: false, loading: () => <div className="h-[300px] bg-white animate-pulse rounded-xl container mx-auto mt-4"></div> });
const ArticleBlock = dynamic(() => import("@/components/home/ArticleBlock"), { ssr: false, loading: () => <div className="h-[400px] bg-white animate-pulse rounded-xl container mx-auto mt-4"></div> });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SECTION_COMPONENTS: Record<string, React.ComponentType<any>> = {
  hero: HeroSection,
  flash_sale: FlashSale,
  booking: BookingSection,
};

function CategoriesSection() {
  return (
    <section className="py-2">
      <div className="max-w-[1200px] mx-auto px-2 md:px-4">
        <div className="rounded-xl shadow-lg p-4 sm:p-6" style={{ backgroundColor: 'var(--card-bg, white)' }}>
          <h2 className="text-xl font-bold text-dark mb-5">Danh mục dịch vụ</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {serviceCategories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="group flex flex-col items-center p-4 bg-gray-50 rounded-xl hover:bg-copper/5 hover:shadow-md transition-all border border-transparent hover:border-copper/20"
              >
                <span className="text-3xl mb-2 group-hover:scale-110 transition-transform">{cat.icon}</span>
                <span className="text-sm font-semibold text-dark text-center">{cat.name}</span>
                <span className="text-[10px] text-gray-500 mt-0.5">{cat.count}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SuggestedSection({ ssrLatestProducts = [] }: { ssrLatestProducts?: any[] }) {
  const [suggestedBrand, setSuggestedBrand] = useState<string>('Tất cả');
  // Initialize with SSR data if available
  const [suggestedProducts, setSuggestedProducts] = useState<(DocumentData & { id: string })[]>(ssrLatestProducts.slice(0, 10));
  const [suggestedLoading, setSuggestedLoading] = useState(!ssrLatestProducts.length);

  useEffect(() => {
    let isMounted = true;
    const fetchSuggested = async () => {
      // If "Tất cả", rely on SSR data unless empty
      if (suggestedBrand === 'Tất cả' && ssrLatestProducts && ssrLatestProducts.length > 0) {
        setSuggestedProducts(ssrLatestProducts.slice(0, 10));
        setSuggestedLoading(false);
        return;
      }

      setSuggestedLoading(true);
      try {
        const constraints: QueryConstraint[] = [
          where('status', '==', 'active'),
          orderBy('createdAt', 'desc'),
          limit(10),
        ];
        if (suggestedBrand !== 'Tất cả') {
          constraints.push(where('brand', '==', suggestedBrand));
        }
        const q = query(collection(db, 'products'), ...constraints);
        const snapshot = await getDocs(q);
        if (isMounted) {
          setSuggestedProducts(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        }
      } catch (error) {
        console.error("Error fetching suggested:", error);
      } finally {
        if (isMounted) setSuggestedLoading(false);
      }
    };

    fetchSuggested();
    return () => { isMounted = false; };
  }, [suggestedBrand, ssrLatestProducts]);

  return (
    <section className="py-2">
      <div className="max-w-[1200px] mx-auto px-2 md:px-4">
        <div className="rounded-xl shadow-lg p-4 sm:p-6" style={{ backgroundColor: 'var(--card-bg, white)' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-dark">Sản phẩm gợi ý</h2>
            <Link href="/category/all" className="text-sm text-copper hover:text-copper-dark font-medium">Xem tất cả →</Link>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-4">
            {suggestedTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSuggestedBrand(tab.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  suggestedBrand === tab.value
                    ? 'bg-copper text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {suggestedLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {[...Array(10)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : suggestedProducts.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg">Chưa có sản phẩm nào</p>
              <p className="text-sm mt-1">Thử chọn danh mục khác</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {suggestedProducts.map((product) => (
                <ServiceCard
                  key={product.id}
                  id={product.id}
                  name={product.name || product.title || ''}
                  image={product.image || product.imageUrl || ''}
                  price={product.price}
                  price_original={product.price_original}
                  price_promo={product.price_promo}
                  warranty_text={product.warranty_text}
                  repair_time={product.repair_time}
                  tags={product.tags || []}
                  rating={product.rating}
                  reviewCount={product.reviewCount}
                  isFlashSale={product.isFlashSale}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Register non-imported section components
SECTION_COMPONENTS['categories'] = CategoriesSection;
SECTION_COMPONENTS['suggested'] = SuggestedSection;
SECTION_COMPONENTS['articles'] = ArticleBlock;

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

      {visibleSections.map((section) => {
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
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
