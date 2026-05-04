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
    <section className="py-4">
      <div className="max-w-[1200px] mx-auto px-2 md:px-4">
        <div className="rounded-2xl shadow-lg p-4 sm:p-6 lg:p-8" style={{ backgroundColor: 'var(--card-bg, white)' }}>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-dark tracking-tight mb-6 sm:mb-8 text-center sm:text-left">
            Danh mục dịch vụ
          </h2>
          <div className="grid grid-cols-2 min-[400px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-5">
            {visibleCategories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className="group flex flex-col items-center p-4 sm:p-5 bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-copper/40 hover:-translate-y-1.5 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-copper to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 mb-3 sm:mb-4 rounded-full bg-gray-50 group-hover:bg-copper/10 flex items-center justify-center transition-colors duration-300">
                  {cat.icon && (cat.icon.startsWith('http') || cat.icon.startsWith('/')) ? (
                    <div className="relative w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16">
                      <Image 
                        src={cat.icon} 
                        alt={cat.name} 
                        fill
                        sizes="64px"
                        className="object-contain group-hover:scale-110 transition-transform duration-300" 
                      />
                    </div>
                  ) : (
                    <span className="text-4xl sm:text-5xl lg:text-6xl group-hover:scale-110 transition-transform duration-300">{cat.icon}</span>
                  )}
                </div>
                
                <span className="text-sm sm:text-base font-bold text-dark text-center leading-snug group-hover:text-copper transition-colors line-clamp-2 min-h-[2.5rem] flex items-center justify-center">
                  {cat.name}
                </span>
                
                <span className="text-[10px] sm:text-xs text-gray-600 mt-2 font-medium bg-gray-100 group-hover:bg-copper/5 group-hover:text-copper px-2.5 py-1 rounded-full transition-colors">
                  {cat.count || 0} dịch vụ
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
