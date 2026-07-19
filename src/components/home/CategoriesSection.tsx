'use client';

import Link from "next/link";
import Image from "next/image";
import { useConfig } from '@/lib/ConfigContext';
import { DEFAULT_CONFIG, type HomeServiceCategory } from '@/lib/config-defaults';

export default function CategoriesSection({ ssrHomeServiceCategories }: { ssrHomeServiceCategories?: HomeServiceCategory[] }) {
  const { config, loading } = useConfig();
  
  // Use SSR data initially, then switch to client config when loaded
  const categories = loading 
    ? (ssrHomeServiceCategories || DEFAULT_CONFIG.homeServiceCategories) 
    : (config.homeServiceCategories || ssrHomeServiceCategories || DEFAULT_CONFIG.homeServiceCategories);
    
  const visibleCategories = categories.filter(cat => cat.visible !== false);

  if (!loading && visibleCategories.length === 0) return null;

  return (
    <section className="py-2">
      <div className="mx-auto max-w-[1080px] px-2 md:px-4">
        <div className="home-section-card rounded-xl border border-gray-100 p-3 shadow-sm sm:p-4 lg:p-5" style={{ backgroundColor: 'var(--card-bg, white)' }}>
          <h2 className="mb-4 text-center text-lg font-extrabold tracking-tight text-dark sm:mb-5 sm:text-left sm:text-xl lg:text-2xl">
            Danh mục dịch vụ
          </h2>
          <div className="home-layout-grid grid grid-cols-2 gap-2 min-[400px]:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-6">
            {visibleCategories.map((cat) => (
              <Link
                key={cat.id}
                href={cat.isCustomLink ? cat.slug : `/category/${cat.slug}`}
                className="group relative flex flex-col items-center overflow-hidden rounded-xl border border-gray-100 bg-white p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-copper/40 hover:shadow-md sm:p-3.5"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-copper to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 transition-colors duration-300 group-hover:bg-copper/10 sm:mb-2.5 sm:h-14 sm:w-14 lg:h-16 lg:w-16">
                  {cat.icon && (cat.icon.startsWith('http') || cat.icon.startsWith('/')) ? (
                    <div className="relative h-8 w-8 sm:h-9 sm:w-9 lg:h-10 lg:w-10">
                      <Image 
                        src={cat.icon} 
                        alt={cat.name} 
                        fill
                        sizes="40px"
                        className="object-contain group-hover:scale-110 transition-transform duration-300" 
                      />
                    </div>
                  ) : (
                    <span className="text-3xl transition-transform duration-300 group-hover:scale-110 sm:text-4xl lg:text-5xl">{cat.icon}</span>
                  )}
                </div>
                
                <span className="flex min-h-[2.25rem] items-center justify-center text-center text-xs font-bold leading-snug text-dark transition-colors group-hover:text-copper sm:text-sm">
                  {cat.name}
                </span>
                
                <span className="mt-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 transition-colors group-hover:bg-copper/5 group-hover:text-copper sm:text-xs">
                  {cat.count || 'Đang cập nhật'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
