'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { collection, query, where, getDocs, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ServiceCard from '@/components/home/ServiceCard';
import { Search, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

function SkeletonCard() {
    return (
        <div className="bg-white rounded-xl overflow-hidden border border-gray-100 animate-pulse">
            <div className="aspect-square bg-gray-200 skeleton-wave" />
            <div className="p-3 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full skeleton-wave" />
                <div className="h-4 bg-gray-200 rounded w-3/4 skeleton-wave" />
                <div className="h-5 bg-gray-200 rounded w-1/2 mt-2 skeleton-wave" />
            </div>
        </div>
    );
}

function SearchResults() {
    const searchParams = useSearchParams();
    const searchQuery = searchParams.get('q') || '';
    const canonicalUrl = `https://qlch-vanlanh.web.app/search${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ''}`;
    const seoTitle = searchQuery ? `Tìm kiếm: "${searchQuery}" | Văn Lành Service` : 'Tìm kiếm | Văn Lành Service';
    const seoDescription = searchQuery
        ? `Kết quả tìm kiếm cho "${searchQuery}" tại Văn Lành Service.`
        : 'Tìm kiếm sản phẩm và dịch vụ tại Văn Lành Service.';
    const [results, setResults] = useState<(DocumentData & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setResults([]);
            setLoading(false);
            return;
        }

        const fetchResults = async () => {
            setLoading(true);
            try {
                // Fetch both products and services and filter client-side for keywords
                const [productsSnap, servicesSnap] = await Promise.all([
                    getDocs(query(collection(db, 'products'), where('status', '==', 'active'))),
                    getDocs(query(collection(db, 'services'), where('isActive', '!=', false)))
                ]);

                const keyword = searchQuery.toLowerCase();

                const products = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const services = servicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const combined = [...products, ...services].filter((item: any) => {
                    const name = (item.name || item.title || '').toLowerCase();
                    const category = (item.category || '').toLowerCase();
                    const brand = (item.brand || '').toLowerCase();
                    const description = (item.description || '').toLowerCase();
                    return name.includes(keyword) || category.includes(keyword) || brand.includes(keyword) || description.includes(keyword);
                });

                setResults(combined);
            } catch (error) {
                console.error('Search error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchResults();
    }, [searchQuery]);

    return (
        <div className="max-w-[1200px] mx-auto px-2 md:px-4 py-2">
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
                {/* SEO (noindex for internal search) */}
                <title>{seoTitle}</title>
                <meta name="description" content={seoDescription} />
                <meta name="robots" content="noindex,follow" />
                <link rel="canonical" href={canonicalUrl} />

                {/* Back + Title */}
                <div className="flex items-center gap-3 mb-6">
                    <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <ArrowLeft size={20} className="text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-dark">Kết quả tìm kiếm</h1>
                        {searchQuery && (
                            <p className="text-sm text-gray-500">
                                Từ khóa: &quot;<span className="text-copper font-medium">{searchQuery}</span>&quot;
                                {!loading && ` • ${results.length} kết quả`}
                            </p>
                        )}
                    </div>
                </div>

                {/* Results */}
                {loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                        {[...Array(10)].map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                ) : results.length === 0 ? (
                    <div className="text-center py-16">
                        <Search size={48} className="text-gray-300 mx-auto mb-4" />
                        <p className="text-lg text-gray-500">Không tìm thấy kết quả</p>
                        <p className="text-sm text-gray-400 mt-1">Thử từ khóa khác hoặc duyệt danh mục</p>
                        <Link href="/" className="mt-4 inline-block px-6 py-2 bg-copper text-white rounded-lg hover:bg-copper-dark transition-colors">
                            Về trang chủ
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                        {results.map((item) => (
                            <Link
                                key={item.id}
                                href={`/product/${item.id}`}
                                className="block"
                            >
                                <ServiceCard
                                    id={item.id}
                                    name={item.name || item.title || ''}
                                    image={item.image || item.imageUrl || ''}
                                    price={item.price}
                                    price_original={item.price_original}
                                    price_promo={item.price_promo}
                                    warranty_text={item.warranty_text}
                                    repair_time={item.repair_time}
                                    tags={item.tags || []}
                                    rating={item.rating}
                                    reviewCount={item.reviewCount}
                                    isFlashSale={item.isFlashSale}
                                />
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense fallback={
            <div className="max-w-[1200px] mx-auto px-2 md:px-4 py-2">
                <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                        {[...Array(10)].map((_, i) => <SkeletonCard key={i} />)}
                    </div>
                </div>
            </div>
        }>
            <SearchResults />
        </Suspense>
    );
}
