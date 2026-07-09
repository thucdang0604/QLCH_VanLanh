import { NextResponse } from 'next/server';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';

type PublicPricingService = {
    id: string;
    name: string;
    slug?: string;
    category?: string;
    categoryIds?: string[];
    tags?: string[];
    device_model?: string;
    description?: string;
    imageUrl?: string;
    image?: string;
    icon?: string;
    price?: number;
    repair_time?: string;
    warranty_text?: string;
    price_original: number;
    price_promo?: number;
    hidePrice?: boolean;
};

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return items.length ? items : undefined;
}

function asNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toPublicPricingService(id: string, data: Record<string, unknown>): PublicPricingService {
    return {
        id,
        name: asString(data.name) || asString(data.title) || '',
        slug: asString(data.slug),
        category: asString(data.category),
        categoryIds: asStringArray(data.categoryIds),
        tags: asStringArray(data.tags),
        device_model: asString(data.device_model),
        description: asString(data.description),
        imageUrl: asString(data.imageUrl),
        image: asString(data.image),
        icon: asString(data.icon),
        price: asNumber(data.price),
        repair_time: asString(data.repair_time),
        warranty_text: asString(data.warranty_text),
        price_original: asNumber(data.price_original),
        price_promo: asNumber(data.price_promo),
        hidePrice: data.hidePrice === true,
    };
}

export async function GET() {
    try {
        if (!isAdminAvailable()) {
            return NextResponse.json({ services: [] });
        }

        const snapshot = await getAdminDb()
            .collection('services')
            .where('isActive', '==', true)
            .limit(200)
            .get();
        const services = snapshot.docs.map(doc => toPublicPricingService(doc.id, doc.data()));

        return NextResponse.json(
            { services },
            { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
        );
    } catch (error) {
        console.error('Homepage pricing services API error:', error);
        return NextResponse.json({ error: 'Failed to fetch homepage pricing services' }, { status: 500 });
    }
}
