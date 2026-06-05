import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Package } from 'lucide-react';
import { SITE_URL } from "@/lib/constants";
import { sanitizeHtml } from '@/lib/sanitizeHtml';
import { fetchDetailItem, fetchProductVariants, fetchProductReviews, fetchRelatedItems } from '../../_lib/server-queries';
import ProductDetailClient, { ProductReviews, type ProductData } from './ProductDetailClient';
import Image from 'next/image';

export const revalidate = 30;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const data = await fetchDetailItem(id, 'products');

    if (!data) {
        return { title: 'Không tìm thấy sản phẩm' };
    }

    const shortDescription = String(data.seoDescription || data.description || `Mua ${data.name} chính hãng, giá tốt, bảo hành uy tín tại Văn Lành Service.`);
    const imageUrl = ((data.images as string[])?.[0] || data.imageUrl || data.image || '') as string;

    return {
        title: `${data.name} | Sản phẩm tại Văn Lành Service`,
        description: shortDescription,
        openGraph: {
            title: `${data.name} | Sản phẩm tại Văn Lành Service`,
            description: shortDescription,
            images: imageUrl,
        }
    };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    let data = await fetchDetailItem(id, 'products');
    
    // Fallback just in case they visit a service URL using the product route 
    // Usually shouldn't happen but the original code had a fallback
    if (!data) {
        data = await fetchDetailItem(id, 'services');
        if (data) {
            data._type = 'service';
        }
    } else {
        data._type = 'product';
    }

    // Fetch variants + reviews in parallel
    const seriesId = data ? String(data.seriesId || '') : '';
    const [variants, reviews, related] = await Promise.all([
        seriesId ? fetchProductVariants(seriesId, data?.id || id) : Promise.resolve([]),
        data?._type === 'product' ? fetchProductReviews(data?.id || id) : Promise.resolve([]),
        fetchRelatedItems()
    ]);

    if (!data) {
        return (
            <div className="max-w-[1200px] mx-auto px-2 md:px-4 py-2">
                <div className="bg-white rounded-xl shadow-sm py-20 text-center">
                    <Package size={64} className="mx-auto text-gray-300 mb-4" />
                    <h1 className="text-2xl font-bold text-gray-800">Không tìm thấy sản phẩm</h1>
                    <p className="text-gray-500 mt-2">Sản phẩm này không tồn tại hoặc đã bị xóa.</p>
                    <Link href="/" className="mt-6 inline-block px-8 py-3 bg-orange-600 text-white rounded-xl font-bold">
                        Về trang chủ
                    </Link>
                </div>
            </div>
        );
    }


    const images = data.images || (data.imageUrl ? [data.imageUrl] : (data.image ? [data.image] : []));
    const originalPrice = Number(data.price_original || (typeof data.price === 'number' ? data.price : 0));
    const promoPrice = Number(data.price_promo || 0);
    const displayPrice = promoPrice > 0 ? promoPrice : (originalPrice > 0 ? originalPrice : 0);

    const shortDescription = String(data.seoDescription || data.description || `Mua ${data.name} chính hãng, giá tốt, bảo hành uy tín tại Văn Lành Service.`);
    const url = `${SITE_URL}/product/${data.id}`;

    const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: data.name,
        image: images,
        description: shortDescription,
        brand: data.brand || undefined,
        sku: data.sku || undefined,
        offers: {
            '@type': 'Offer',
            url,
            priceCurrency: 'VND',
            price: displayPrice || undefined,
            availability: data.stock && (data.stock as number) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        },
        aggregateRating: data.rating
            ? {
                '@type': 'AggregateRating',
                ratingValue: data.rating,
                reviewCount: data.reviewCount || 1,
            }
            : undefined,
    };

    return (
        <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
            <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
                />

                {/* Breadcrumb */}
                <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Link href="/" className="hover:text-orange-600">Trang chủ</Link>
                    <ChevronRight size={14} />
                    <Link href={`/category/${normalizeSlug(String(data.category ?? 'san-pham'))}`} className="hover:text-orange-600">
                        {String(data.category || 'Sản phẩm')}
                    </Link>
                    <ChevronRight size={14} />
                    <span className="text-gray-800 font-medium line-clamp-1">{String(data.name ?? '')}</span>
                </nav>

                <ProductDetailClient data={data as unknown as ProductData} variants={variants} />

                {/* Specs Table */}
                {!!(data.specs) && Object.keys(data.specs as Record<string, unknown>).length > 0 && (
                    <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span>
                            Thông số kỹ thuật
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
                            {Object.entries(data.specs as Record<string, unknown>).map(([key, value]: [string, unknown]) => (
                                <div key={key} className="flex border-b border-gray-50 py-3.5 group hover:bg-gray-50 transition-colors px-2 rounded-lg">
                                    <span className="w-1/3 text-gray-500 text-sm font-medium uppercase tracking-tight">{key}</span>
                                    <span className="w-2/3 text-gray-800 text-sm font-semibold">{String(value ?? '')}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Detailed Description */}
                {!!(data.content || data.description) && (
                    <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span>
                            Chi tiết sản phẩm
                        </h2>
                        <div className="prose prose-orange max-w-none text-gray-600 leading-relaxed">
                            {data.content ? (
                                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(data.content)) }} />
                            ) : (
                                <p className="whitespace-pre-line">{String(data.description ?? '')}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Related Items */}
                {(related.services.length > 0 || related.accessories.length > 0) && (
                    <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span>
                            Có thể bạn quan tâm
                        </h2>
                        
                        {related.services.length > 0 && (
                            <div className="mb-6 border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Dịch vụ sửa chữa</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {related.services.map((item) => (
                                        <Link key={item.id} href={`/product/${item.slug || item.id}`} className="group bg-white rounded-xl border border-gray-100 p-3 hover:border-orange-300 hover:shadow-md transition-all flex flex-col h-full">
                                            {item.imageUrl && (
                                                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-50 mb-3">
                                                    <Image src={item.imageUrl} alt={item.name} fill className="object-cover group-hover:scale-105 transition-transform" />
                                                </div>
                                            )}
                                            <h4 className="font-semibold text-sm text-gray-800 line-clamp-2 mb-2 group-hover:text-orange-600 transition-colors">{item.name}</h4>
                                            <div className="mt-auto pt-2">
                                                <p className="text-red-600 font-bold text-sm">
                                                    {item.price_promo ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price_promo).replace('₫', 'đ') : 
                                                    (item.price_original ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price_original).replace('₫', 'đ') : 'Liên hệ')}
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}

                        {related.accessories.length > 0 && (
                            <div className="pt-2">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Phụ kiện khuyến nghị</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {related.accessories.map((item) => (
                                        <Link key={item.id} href={`/product/${item.slug || item.id}`} className="group bg-white rounded-xl border border-gray-100 p-3 hover:border-orange-300 hover:shadow-md transition-all flex flex-col h-full">
                                            {item.imageUrl && (
                                                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-50 mb-3">
                                                    <Image src={item.imageUrl} alt={item.name} fill className="object-cover group-hover:scale-105 transition-transform" />
                                                </div>
                                            )}
                                            <h4 className="font-semibold text-sm text-gray-800 line-clamp-2 mb-2 group-hover:text-orange-600 transition-colors">{item.name}</h4>
                                            <div className="mt-auto pt-2">
                                                <p className="text-red-600 font-bold text-sm">
                                                    {item.price_promo ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price_promo).replace('₫', 'đ') : 
                                                    (item.price_original ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.price_original).replace('₫', 'đ') : 'Liên hệ')}
                                                </p>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Reviews */}
                <ProductReviews data={data as unknown as ProductData} reviews={reviews} />
            </div>
        </div>
    );
}

function normalizeSlug(cat: string) {
    if (!cat) return 'unknown';
    const map: Record<string, string> = {
        'iPhone': 'sua-iphone',
        'Samsung': 'sua-samsung',
        'Điện thoại': 'phone',
        'Laptop': 'laptop',
        'Sửa iPhone': 'sua-iphone',
        'Thay Pin': 'thay-pin',
        'Ép Kính': 'ep-kinh'
    };
    return map[cat] || cat.toLowerCase().replace(/\s+/g, '-');
}
