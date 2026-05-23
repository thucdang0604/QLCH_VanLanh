import { Metadata } from 'next';
import { fetchCategoryItems, fetchNavConfig, fetchTaxonomyConfig } from '../../_lib/server-queries';
import CategoryClient from './CategoryClient';
import { SITE_URL } from "@/lib/constants";
import { notFound } from 'next/navigation';
import type { TaxonomyNode } from '@/lib/types';

/* ── Resolve nav/taxonomy info for a given slug ── */
type ResolvedInfo = {
    label: string;
    condition?: string;
    isRepair?: boolean;
    isAccessory?: boolean;
    categoryConfig?: { id: string; slug: string; name: string; type: 'retail' | 'service' | 'component'; keywords: string[]; isActive: boolean };
};

type NavItem = { slug?: string; label?: string; name?: string; filterType?: string; taxonomyRef?: string };

function mapFilterType(ft?: string): Partial<ResolvedInfo> {
    switch (ft) {
        case 'repair': return { isRepair: true };
        case 'new': return { condition: 'new' };
        case 'likenew': return { condition: 'used' };
        case 'accessory': return { isAccessory: true };
        default: return {};
    }
}

/** Find a taxonomy node by slug. For multi-segment paths, walk the tree level by level. */
function findTaxonomyNode(slugSegments: string[], trees: { type: string; nodes: TaxonomyNode[] }[]): { node: TaxonomyNode; type: string } | null {
    const targetSlug = slugSegments[slugSegments.length - 1]; // deepest segment

    for (const tree of trees) {
        for (const node of tree.nodes) {
            if (node.id === targetSlug || node.slug === targetSlug) return { node, type: tree.type };
            if (node.children) {
                for (const child of node.children) {
                    if (child.id === targetSlug || child.slug === targetSlug) return { node: child, type: tree.type };
                    if (child.children) {
                        for (const gc of child.children) {
                            if (gc.id === targetSlug || gc.slug === targetSlug) return { node: gc, type: tree.type };
                        }
                    }
                }
            }
        }
    }
    return null;
}

async function resolveSlug(slugSegments: string[]): Promise<ResolvedInfo | null> {
    // 1. Check nav config first — match by single-segment slug (nav items use single slugs)
    const nav = await fetchNavConfig();
    const navItem = [...nav.headerNav, ...nav.sidebarMenu, ...nav.footerServices]
        .find((item: NavItem) => item.slug === slugSegments[0]); // nav items only match tier 1

    // For multi-segment, skip nav-based filterType — resolve directly from taxonomy
    if (slugSegments.length === 1 && navItem) {
        const ft = mapFilterType(navItem.filterType);
        const info: ResolvedInfo = { label: navItem.label || navItem.name || 'Danh mục', ...ft };

        // If nav item has taxonomyRef, resolve it for keyword filtering
        if (navItem.taxonomyRef) {
            const taxonomy = await fetchTaxonomyConfig();
            const trees = [
                { type: 'service', nodes: taxonomy.service || [] },
                { type: 'retail', nodes: taxonomy.retail || [] },
                { type: 'component', nodes: taxonomy.component || [] },
            ];
            const found = findTaxonomyNode([navItem.taxonomyRef], trees);
            if (found) {
                const keywords = [found.node.name, found.node.slug, ...(found.node.seoKeywords?.split(',').map((k: string) => k.trim()) || [])];
                info.categoryConfig = { id: found.node.id, slug: found.node.slug, name: found.node.name, type: found.type as 'retail' | 'service' | 'component', keywords, isActive: true };
                if (!info.isRepair && found.type === 'service') info.isRepair = true;
            }
        }

        return info;
    }

    // 2. Search taxonomy tree directly by the deepest slug segment
    const taxonomy = await fetchTaxonomyConfig();
    const trees = [
        { type: 'service', nodes: taxonomy.service || [] },
        { type: 'retail', nodes: taxonomy.retail || [] },
        { type: 'component', nodes: taxonomy.component || [] },
    ];
    const found = findTaxonomyNode(slugSegments, trees);
    if (found) {
        const keywords = [found.node.name, found.node.slug, ...(found.node.seoKeywords?.split(',').map((k: string) => k.trim()) || [])];

        // Inherit filterType from parent nav item if available
        let parentFilterType: Partial<ResolvedInfo> = {};
        if (navItem?.filterType) {
            parentFilterType = mapFilterType(navItem.filterType);
        }

        return {
            label: found.node.name,
            isRepair: found.type === 'service',
            ...parentFilterType,
            categoryConfig: { id: found.node.id, slug: found.node.slug, name: found.node.name, type: found.type as 'retail' | 'service' | 'component', keywords, isActive: true },
        };
    }

    return null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
    const { slug } = await params;
    const fullSlug = slug.join('/');
    const info = await resolveSlug(slug);

    if (!info) {
        return { title: 'Không tìm thấy trang | Văn Lành Service' };
    }

    const isRepair = !!info.isRepair;
    const title = `${info.label} | Văn Lành Service - Sửa chữa uy tín tại TP.HCM`;
    const description = isRepair
        ? `Dịch vụ ${info.label} chính hãng tại Văn Lành Service. Linh kiện chính hãng, bảo hành trọn đời, xong trong 30 phút. Hotline: 0932.242.026`
        : `Mua ${info.label} chính hãng giá tốt tại Văn Lành Service. Bảo hành uy tín, giao hàng nhanh.`;

    return {
        title,
        description,
        alternates: {
            canonical: `${SITE_URL}/category/${fullSlug}`
        }
    };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string[] }> }) {
    const { slug } = await params;
    const info = await resolveSlug(slug);

    if (!info) {
        notFound();
    }

    const isRepair = !!info.isRepair;

    // Fetch data from server
    const items = await fetchCategoryItems(isRepair);

    const seoDescription = isRepair
        ? `Dịch vụ ${info.label} chính hãng tại Văn Lành Service. Linh kiện chính hãng, bảo hành trọn đời, xong trong 30 phút. Hotline: 0932.242.026`
        : `Mua ${info.label} chính hãng giá tốt tại Văn Lành Service. Bảo hành uy tín, giao hàng nhanh.`;
        
    const schemaData = isRepair ? {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: info.label,
        description: seoDescription,
        provider: {
            '@type': 'LocalBusiness',
            name: 'Văn Lành Service',
            telephone: '0932242026',
        },
        areaServed: { '@type': 'City', name: 'Hồ Chí Minh' },
    } : {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: info.label,
        description: seoDescription,
    };

    const breadcrumbSchema = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'Trang chủ',
                item: `${SITE_URL}/`,
            },
            ...slug.map((segment, i) => ({
                '@type': 'ListItem',
                position: i + 2,
                name: i === slug.length - 1 ? info.label : segment,
                item: `${SITE_URL}/category/${slug.slice(0, i + 1).join('/')}`,
            })),
        ],
    };

    // Build navInfo for CategoryClient (same shape it expects)
    const navInfo = info.condition || info.isRepair || info.isAccessory
        ? { label: info.label, condition: info.condition, isRepair: info.isRepair, isAccessory: info.isAccessory }
        : undefined;

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
            />
            <CategoryClient initialItems={items} categoryConfig={info.categoryConfig} navInfo={navInfo} />
        </>
    );
}
