'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs, DocumentData, type QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Link from "next/link";
import ServiceCard from "@/components/home/ServiceCard";

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

export default function SuggestedSection({ ssrLatestProducts = [] }: { ssrLatestProducts?: Record<string, unknown>[] }) {
  const [suggestedBrand, setSuggestedBrand] = useState<string>('Tất cả');
  // Initialize with SSR data if available
  const [suggestedProducts, setSuggestedProducts] = useState<(DocumentData & { id: string })[]>(ssrLatestProducts.slice(0, 10) as (DocumentData & { id: string })[]);
  const [suggestedLoading, setSuggestedLoading] = useState(!ssrLatestProducts.length);

  useEffect(() => {
    let isMounted = true;
    const fetchSuggested = async () => {
      // If "Tất cả", rely on SSR data unless empty
      if (suggestedBrand === 'Tất cả' && ssrLatestProducts && ssrLatestProducts.length > 0) {
        setSuggestedProducts(ssrLatestProducts.slice(0, 10) as (DocumentData & { id: string })[]);
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
