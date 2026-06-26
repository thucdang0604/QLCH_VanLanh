'use client';

import { useEffect, useState } from 'react';
import { Smartphone, Tablet, Laptop, Watch, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useConfig, type PricingIconName } from '@/lib/ConfigContext';

const ICONS = {
    smartphone: Smartphone,
    tablet: Tablet,
    laptop: Laptop,
    watch: Watch,
};

function formatPrice(value?: number) {
    return value ? `${value.toLocaleString('vi-VN')}đ` : '';
}

interface PricingService {
    id: string;
    name: string;
    price_original: number;
    price_promo?: number;
    hidePrice?: boolean;
    device_model?: string;
    category?: string;
    categoryIds?: string[];
    tags?: string[];
    slug?: string;
}

export default function PricingSection({ ssrPricingServices }: { ssrPricingServices?: PricingService[] }) {
    const { config } = useConfig();
    const pricing = config.homepagePricing;
    
    // Initialize services with SSR data or empty array
    const [services, setServices] = useState<PricingService[]>(
        Array.isArray(ssrPricingServices) ? ssrPricingServices : []
    );
    const [loading, setLoading] = useState(!Array.isArray(ssrPricingServices));
    const [activeTab, setActiveTab] = useState(pricing.categories[0]?.id || '');
    const activeCategory = pricing.categories.find(category => category.id === activeTab) || pricing.categories[0];
    const currentServices = activeCategory
        ? services
            .filter(service => {
                const searchText = [
                    service.name,
                    service.device_model,
                    service.category,
                    ...(service.categoryIds || []),
                    ...(service.tags || []),
                ].join(' ').toLowerCase();
                return activeCategory.keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
            })
            .slice(0, activeCategory.maxItems)
        : [];

    useEffect(() => {
        // If we didn't get SSR data, fetch it (fallback)
        if (Array.isArray(ssrPricingServices) && ssrPricingServices.length > 0) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        fetch('/api/services/homepage-pricing')
            .then(response => response.ok ? response.json() : Promise.reject(new Error('Pricing services request failed')))
            .then(data => {
                if (!cancelled) setServices(Array.isArray(data.services) ? data.services : []);
            })
            .catch(error => console.error('Failed to load homepage pricing services:', error))
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [ssrPricingServices]);

    useEffect(() => {
        if (!pricing.categories.some(category => category.id === activeTab)) {
            setActiveTab(pricing.categories[0]?.id || '');
        }
    }, [activeTab, pricing.categories]);

    if (!activeCategory) return null;

    return (
        <section className="py-12 bg-gray-50 border-t border-b border-gray-100">
            <div className="max-w-[1200px] mx-auto px-4 md:px-6">
                <div className="text-center mb-10">
                    <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 tracking-tight">
                        {pricing.title} <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">{pricing.highlightedTitle}</span>
                    </h2>
                    <p className="text-gray-500 mt-2">{pricing.subtitle}</p>
                </div>

                {/* Tabs */}
                <div className="flex overflow-x-auto hide-scrollbar gap-2 md:justify-center mb-8 pb-2 snap-x">
                    {pricing.categories.map((cat) => {
                        const Icon = ICONS[cat.icon as PricingIconName] || Smartphone;
                        const isActive = activeTab === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveTab(cat.id)}
                                className={`snap-center flex items-center gap-2 px-5 py-3 rounded-full font-semibold transition-all whitespace-nowrap border-2 ${
                                    isActive 
                                    ? 'bg-orange-50 border-orange-500 text-orange-600 shadow-sm shadow-orange-500/20' 
                                    : 'bg-white border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                }`}
                            >
                                <Icon size={18} className={isActive ? 'text-orange-500' : 'text-gray-400'} />
                                {cat.label}
                            </button>
                        );
                    })}
                </div>

                {/* Pricing Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {currentServices.map((service) => {
                        const shouldHidePrice = service.hidePrice === true;
                        const hasPromo = !shouldHidePrice && !!(service.price_promo && service.price_promo < service.price_original);
                        return (
                            <Link
                                href={`/service/${service.slug || service.id}`}
                                key={service.id}
                                className="group bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer flex justify-between items-center relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-orange-50 to-red-50 rounded-bl-full -z-10 transition-transform group-hover:scale-150" />
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-gray-800">{service.name}</h3>
                                        {hasPromo && (
                                            <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                                                KM
                                            </span>
                                        )}
                                    </div>
                                    {shouldHidePrice ? (
                                        <div className="mt-2 text-sm font-bold text-orange-600">Liên hệ nhận báo giá</div>
                                    ) : (
                                        <div className="flex items-end gap-2 mt-2">
                                            <span className="text-lg font-extrabold text-orange-600">{formatPrice(service.price_promo || service.price_original)}</span>
                                            {hasPromo && (
                                                <span className="text-xs font-semibold text-gray-400 line-through mb-1">{formatPrice(service.price_original)}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="w-8 h-8 rounded-full bg-gray-50 group-hover:bg-orange-500 group-hover:text-white flex items-center justify-center text-gray-400 transition-colors">
                                    <ChevronRight size={18} />
                                </div>
                            </Link>
                        );
                    })}
                </div>
                {!loading && currentServices.length === 0 && (
                    <p className="text-center text-sm text-gray-500">Chưa có dịch vụ phù hợp với nhóm này.</p>
                )}

                <div className="mt-8 flex justify-center">
                    <Link href={pricing.ctaHref || '/category/sua-chua'} className="px-6 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 hover:text-orange-600 transition-colors flex items-center gap-2 shadow-sm">
                        {pricing.ctaLabel} <ChevronRight size={16} />
                    </Link>
                </div>
            </div>
        </section>
    );
}
