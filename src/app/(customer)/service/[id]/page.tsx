import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Wrench } from 'lucide-react';
import { SITE_URL } from "@/lib/constants";
import { fetchDetailItem } from '../../_lib/server-queries';
import ServiceDetailClient, { type ServiceData } from './ServiceDetailClient';

export const revalidate = 30;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    const data = await fetchDetailItem(id, 'services');

    if (!data) {
        return { title: 'Không tìm thấy dịch vụ' };
    }

    const shortDescription = String(data.seoDescription || data.description || `Dịch vụ ${data.name} chính hãng, sửa nhanh, bảo hành uy tín tại Văn Lành Service.`);

    return {
        title: `${data.name} | Dịch vụ sửa chữa tại Văn Lành Service`,
        description: shortDescription,
        openGraph: {
            title: `${data.name} | Dịch vụ sửa chữa tại Văn Lành Service`,
            description: shortDescription,
            images: String(data.image || data.imageUrl || ''),
        }
    };
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    
    // Fetch service
    const service = await fetchDetailItem(id, 'services');

    if (!service) {
        return (
            <div className="min-h-screen max-w-[1200px] mx-auto px-2 md:px-4 py-2">
                <div className="bg-white rounded-xl shadow-sm flex flex-col items-center justify-center gap-4 py-20">
                    <Wrench size={48} className="text-gray-300" />
                    <p className="text-gray-500 text-lg">Không tìm thấy dịch vụ</p>
                    <Link href="/category/sua-chua" className="text-copper hover:underline">
                        ← Xem tất cả dịch vụ
                    </Link>
                </div>
            </div>
        );
    }

    // SEO meta + JSON-LD
    const shortDescription = String(service.seoDescription || service.description || `Dịch vụ ${service.name} chính hãng, sửa nhanh, bảo hành uy tín tại Văn Lành Service.`);
    const url = `${SITE_URL}/service/${service.id}`;

    const structuredData = {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: service.name,
        description: shortDescription,
        provider: {
            '@type': 'LocalBusiness',
            name: 'Văn Lành Service',
            telephone: '0932242026',
        },
        areaServed: { '@type': 'City', name: 'Hồ Chí Minh' },
        url,
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
                    <Link href="/" className="hover:text-copper">Trang chủ</Link>
                    <ChevronRight size={14} />
                    <Link href="/category/sua-chua" className="hover:text-copper">Sửa chữa</Link>
                    <ChevronRight size={14} />
                    <span className="text-gray-800 font-medium line-clamp-1">{String(service.name ?? '')}</span>
                </nav>

                <ServiceDetailClient service={service as unknown as ServiceData} />
            </div>
        </div>
    );
}
