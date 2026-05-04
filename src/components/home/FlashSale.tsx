'use client';

import { useState, useEffect, useCallback } from 'react';
import { Zap } from 'lucide-react';
import { collection, query, where, orderBy, limit, getDocs, type QueryConstraint, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ServiceCard from './ServiceCard';

// Tab cấu hình: label hiển thị vs giá trị brand trong DB
const brandTabs = [
    { label: 'Tất cả', value: 'Tất cả' },
    { label: 'iPhone', value: 'Apple' },
    { label: 'Samsung', value: 'Samsung' },
    { label: 'Xiaomi', value: 'Xiaomi' },
    { label: 'Oppo', value: 'OPPO' },
];

// Skeleton card for loading state
function SkeletonCard() {
    return (
        <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
            <div className="aspect-square bg-gray-200 skeleton-wave" />
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

export default function FlashSale({ ssrLatestProducts = [] }: { ssrLatestProducts?: any[] }) {
    const [activeBrand, setActiveBrand] = useState<string>('Tất cả');
    
    // Helper function to filter flash sale items
    const filterFlashSaleItems = useCallback((items: any[]) => {
        return items.filter((p) => {
            const item = p as Partial<{
                isFlashSale: boolean;
                price_promo: number;
                price_original: number;
                price: number;
            }>;
            if (item.isFlashSale) return true;
            if (item.price_promo && item.price_original) {
                return ((item.price_original - item.price_promo) / item.price_original) * 100 >= 10;
            }
            if (item.price_promo && item.price) {
                return ((item.price - item.price_promo) / item.price) * 100 >= 10;
            }
            return true;
        });
    }, []);

    // Initialize with SSR data if available
    const [products, setProducts] = useState<(DocumentData & { id: string })[]>(
        ssrLatestProducts.length > 0 ? filterFlashSaleItems(ssrLatestProducts) : []
    );
    const [loading, setLoading] = useState(ssrLatestProducts.length === 0);

    // Fetch products from Firestore with brand filter
    const fetchProducts = useCallback(async (brand: string) => {
        // Use SSR data for 'Tất cả' on initial load or subsequent clicks if it exists
        if (brand === 'Tất cả' && ssrLatestProducts.length > 0) {
            setProducts(filterFlashSaleItems(ssrLatestProducts));
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const constraints: QueryConstraint[] = [
                where('status', '==', 'active'),
                orderBy('createdAt', 'desc'),
                limit(10),
            ];

            if (brand !== 'Tất cả') {
                constraints.push(where('brand', '==', brand));
            }

            const q = query(collection(db, 'products'), ...constraints);
            const snapshot = await getDocs(q);
            
            const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
            setProducts(filterFlashSaleItems(items));
        } catch (err) {
            console.error('FlashSale fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [ssrLatestProducts, filterFlashSaleItems]);

    useEffect(() => {
        let isMounted = true;
        fetchProducts(activeBrand).then(() => {
            if (!isMounted) return;
        });
        return () => { isMounted = false; };
    }, [activeBrand, fetchProducts]);

    const handleTabChange = (brand: string) => {
        setActiveBrand(brand);
    };



    return (
        <section className="py-2">
            <div className="max-w-[1200px] mx-auto px-2 md:px-4">
                <div className="rounded-xl shadow-lg p-4 sm:p-6" style={{ backgroundColor: 'var(--card-bg, white)' }}>
                    {/* Header Row */}
                    <div className="flex items-center gap-2 mb-6">
                        <Zap size={24} className="text-accent fill-accent" />
                        <h2 className="text-2xl font-bold text-dark">Flash Sale</h2>
                    </div>

                    {/* Brand Tabs */}
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-4">
                        {brandTabs.map((tab) => (
                            <button
                                key={tab.value}
                                onClick={() => handleTabChange(tab.value)}
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                                    activeBrand === tab.value
                                        ? 'bg-dark text-white shadow-md'
                                        : 'bg-white text-gray-600 border border-gray-200 hover:border-copper hover:text-copper'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Grid: Skeleton or Data */}
                    {loading ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
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
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                            {products.map((product) => (
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

                    {/* View All */}
                    <div className="text-center mt-6">
                        <button className="px-8 py-2.5 border-2 border-dark text-dark font-semibold rounded-lg hover:bg-dark hover:text-white transition-all">
                            Xem tất cả Flash Sale
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
