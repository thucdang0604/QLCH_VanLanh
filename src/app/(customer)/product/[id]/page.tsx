import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Package } from 'lucide-react';
import { SITE_URL } from "@/lib/constants";
import { fetchDetailItem } from '../../_lib/server-queries';
import ProductDetailClient from './ProductDetailClient';

export const revalidate = 30;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const data = await fetchDetailItem(id, 'products');

    if (!data) {
        return { title: 'Không tìm thấy sản phẩm' };
    }

    const shortDescription = data.seoDescription || data.description || `Mua ${data.name} chính hãng, giá tốt, bảo hành uy tín tại Văn Lành Service.`;

    return {
        title: `${data.name} | Sản phẩm tại Văn Lành Service`,
        description: shortDescription,
        openGraph: {
            title: `${data.name} | Sản phẩm tại Văn Lành Service`,
            description: shortDescription,
            images: data.images?.[0] || data.imageUrl || data.image || '',
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

    const isService = data._type === 'service';
    const images = data.images || (data.imageUrl ? [data.imageUrl] : (data.image ? [data.image] : []));
    const originalPrice = data.price_original || (typeof data.price === 'number' ? data.price : 0);
    const promoPrice = data.price_promo || 0;
    const displayPrice = promoPrice > 0 ? promoPrice : (originalPrice > 0 ? originalPrice : 0);

    const shortDescription = data.seoDescription || data.description || `Mua ${data.name} chính hãng, giá tốt, bảo hành uy tín tại Văn Lành Service.`;
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
            availability: data.stock && data.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
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
                    <Link href={`/category/${normalizeSlug(data.category ?? 'san-pham')}`} className="hover:text-orange-600">
                        {data.category || 'Sản phẩm'}
                    </Link>
                    <ChevronRight size={14} />
                    <span className="text-gray-800 font-medium line-clamp-1">{data.name}</span>
                </nav>

                <ProductDetailClient data={data} />

                {/* Specs Table */}
                {data.specs && Object.keys(data.specs).length > 0 && (
                    <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span>
                            Thông số kỹ thuật
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-1">
                            {Object.entries(data.specs).map(([key, value]: [string, any]) => (
                                <div key={key} className="flex border-b border-gray-50 py-3.5 group hover:bg-gray-50 transition-colors px-2 rounded-lg">
                                    <span className="w-1/3 text-gray-500 text-sm font-medium uppercase tracking-tight">{key}</span>
                                    <span className="w-2/3 text-gray-800 text-sm font-semibold">{String(value ?? '')}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Detailed Description */}
                {(data.content || data.description) && (
                    <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span>
                            Chi tiết sản phẩm
                        </h2>
                        <div className="prose prose-orange max-w-none text-gray-600 leading-relaxed">
                            {data.content ? (
                                <div dangerouslySetInnerHTML={{ __html: data.content }} />
                            ) : (
                                <p className="whitespace-pre-line">{data.description}</p>
                            )}
                        </div>
                    </div>
                )}
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
