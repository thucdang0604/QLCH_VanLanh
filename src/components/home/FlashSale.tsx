'use client';

import { useState, useEffect, useCallback } from 'react';
import { Zap } from 'lucide-react';
import ServiceCard from './ServiceCard';
import { filterFlashSaleProducts } from '@/lib/flashSale';

const brandTabs = [
    { label: 'Tất cả', value: 'Tất cả' },
    { label: 'iPhone', value: 'Apple' },
    { label: 'Samsung', value: 'Samsung' },
    { label: 'Xiaomi', value: 'Xiaomi' },
    { label: 'Oppo', value: 'OPPO' },
];

function SkeletonCard() {
    return (
        <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
            <div className="aspect-[4/3] bg-gray-200 skeleton-wave" />
            <div className="p-3 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full skeleton-wave" />
                <div className="h-4 bg-gray-200 rounded w-3/4 skeleton-wave" />
                <div className="flex gap-1 mt-2">
                    <div className="h-5 w-16 bg-gray-200 rounded skeleton-wave" />
                    <div className="h-5 w-14 bg-gray-200 rounded skeleton-wave" />
                </div>
                <div className="h-5 bg-gray-200 rounded w-1/2 mt-2 skeleton-wave" />
            </div>
        </div>
    );
}

const textValue = (value: unknown) => typeof value === 'string' ? value : '';
const numberValue = (value: unknown) => typeof value === 'number' ? value : undefined;
const tagList = (value: unknown) => Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === 'string')
    : [];

export default function FlashSale({ ssrLatestProducts = [] }: { ssrLatestProducts?: Record<string, unknown>[] }) {
    const [activeBrand, setActiveBrand] = useState<string>(brandTabs[0].value);
    const [products, setProducts] = useState<Record<string, unknown>[]>(
        ssrLatestProducts.length > 0 ? filterFlashSaleProducts(ssrLatestProducts) : []
    );
    const [loading, setLoading] = useState(ssrLatestProducts.length === 0);

    const fetchProducts = useCallback(async (brand: string) => {
        if (brand === brandTabs[0].value && ssrLatestProducts.length > 0) {
            setProducts(filterFlashSaleProducts(ssrLatestProducts));
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: '10' });
            if (brand !== brandTabs[0].value) {
                params.set('brand', brand);
            }

            const res = await fetch(`/api/products?${params.toString()}`);
            if (!res.ok) throw new Error(`Products API failed with ${res.status}`);
            const data = await res.json() as { products?: Record<string, unknown>[] };
            const items = Array.isArray(data.products) ? data.products : [];
            setProducts(filterFlashSaleProducts(items));
        } catch (err) {
            console.error('FlashSale fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [ssrLatestProducts]);

    useEffect(() => {
        fetchProducts(activeBrand);
    }, [activeBrand, fetchProducts]);

    return (
        <section className="py-2">
            <div className="mx-auto max-w-[1080px] px-2 md:px-4">
                <div className="home-section-card rounded-xl border border-gray-100 p-3 shadow-sm sm:p-4" style={{ backgroundColor: 'var(--card-bg, white)' }}>
                    <div className="mb-3 flex items-center gap-2">
                        <Zap size={20} className="fill-accent text-accent" />
                        <h2 className="text-xl font-bold text-dark">Flash Sale</h2>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
                        {brandTabs.map((tab) => (
                            <button
                                key={tab.value}
                                onClick={() => setActiveBrand(tab.value)}
                                className={`rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all ${
                                    activeBrand === tab.value
                                        ? 'bg-dark text-white shadow-md'
                                        : 'bg-white text-gray-600 border border-gray-200 hover:border-copper hover:text-copper'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="home-layout-grid grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
                            {[...Array(10)].map((_, i) => (
                                <SkeletonCard key={i} />
                            ))}
                        </div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <p className="text-lg">Chưa có sản phẩm nào</p>
                            <p className="text-sm mt-1">Thử chọn danh mục khác</p>
                        </div>
                    ) : (
                        <div className="home-layout-grid grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
                            {products.map((product) => (
                                <ServiceCard
                                    key={String(product.id)}
                                    id={String(product.id || '')}
                                    name={textValue(product.name) || textValue(product.title)}
                                    image={textValue(product.image) || textValue(product.imageUrl)}
                                    price={numberValue(product.price)}
                                    price_original={numberValue(product.price_original)}
                                    price_promo={numberValue(product.price_promo)}
                                    warranty_text={textValue(product.warranty_text)}
                                    repair_time={textValue(product.repair_time)}
                                    tags={tagList(product.tags)}
                                    rating={numberValue(product.rating)}
                                    reviewCount={numberValue(product.reviewCount)}
                                    isFlashSale={product.isFlashSale === true}
                                    compact
                                />
                            ))}
                        </div>
                    )}

                    <div className="mt-4 text-center">
                        <a href="/flash-sale" className="inline-flex rounded-lg border border-dark px-5 py-2 text-sm font-semibold text-dark transition-all hover:bg-dark hover:text-white">
                            Xem tất cả Flash Sale
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
}
