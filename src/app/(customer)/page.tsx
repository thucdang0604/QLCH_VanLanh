'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useConfig } from '@/lib/ConfigContext';
import HeroSection from "@/components/home/HeroSection";
import FlashSale from "@/components/home/FlashSale";
import BookingSection from "@/components/home/BookingSection";
import ArticleBlock from "@/components/home/ArticleBlock";
import ServiceCard from "@/components/home/ServiceCard";
import Link from "next/link";

const serviceCategories = [
  { icon: "📱", name: "Sửa iPhone", slug: "sua-iphone", count: "200+ dịch vụ" },
  { icon: "📱", name: "Sửa Samsung", slug: "sua-samsung", count: "150+ dịch vụ" },
  { icon: "🔋", name: "Thay Pin", slug: "thay-pin", count: "100+ dịch vụ" },
  { icon: "🪟", name: "Ép Kính", slug: "ep-kinh", count: "80+ dịch vụ" },
  { icon: "💻", name: "Sửa Laptop", slug: "sua-laptop", count: "120+ dịch vụ" },
  { icon: "🎧", name: "Phụ Kiện", slug: "phu-kien", count: "300+ sản phẩm" },
];

const suggestedTabs = ['Tất cả', 'iPhone', 'Samsung', 'Xiaomi', 'Oppo'];

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
const SECTION_COMPONENTS: Record<string, React.FC<any>> = {
  hero: HeroSection,
  flash_sale: FlashSale,
  booking: BookingSection,
};

function CategoriesSection() {
  return (
    <section className="py-2">
      <div className="max-w-[1200px] mx-auto px-2 md:px-4">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
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
                <span className="text-[10px] text-gray-400 mt-0.5">{cat.count}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SuggestedSection() {
  const [suggestedBrand, setSuggestedBrand] = useState('Tất cả');
  const [suggestedProducts, setSuggestedProducts] = useState<(DocumentData & { id: string })[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);

  const fetchSuggested = useCallback((brand: string) => {
    setSuggestedLoading(true);
    const constraints: any[] = [
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc'),
      limit(10),
    ];
    if (brand !== 'Tất cả') {
      constraints.push(where('brand', '==', brand));
    }
    const q = query(collection(db, 'products'), ...constraints);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSuggestedProducts(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setSuggestedLoading(false);
    }, () => setSuggestedLoading(false));
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsub = fetchSuggested(suggestedBrand);
    return () => { if (unsub) unsub(); };
  }, [suggestedBrand, fetchSuggested]);

  return (
    <section className="py-2">
      <div className="max-w-[1200px] mx-auto px-2 md:px-4">
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-dark">Sản phẩm gợi ý</h2>
            <Link href="/category/all" className="text-sm text-copper hover:text-copper-dark font-medium">Xem tất cả →</Link>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-4">
            {suggestedTabs.map((brand) => (
              <button
                key={brand}
                onClick={() => setSuggestedBrand(brand)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${suggestedBrand === brand ? 'bg-copper text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {brand}
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
export default function Home() {
  const { config } = useConfig();

  // Basic SEO for homepage
  const seoTitle = `${config.siteName || 'Văn Lành Service'} | Sửa điện thoại, laptop & phụ kiện chính hãng tại TP.HCM`;
  const seoDescription =
    'Trung tâm sửa chữa điện thoại, laptop, máy tính bảng và phụ kiện chính hãng Văn Lành Service tại TP.HCM. Sửa nhanh, bảo hành uy tín, linh kiện chuẩn, hỗ trợ trả góp.';

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: config.siteName || 'Văn Lành Service',
    url: 'https://qlch-vanlanh.web.app',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://qlch-vanlanh.web.app/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };

  // Sort visible sections by order
  const visibleSections = [...config.homeSections]
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
        return <Component key={section.id} />;
      })}
    </>
  );
}
