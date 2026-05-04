import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/constants';
import { fetchNavConfig, fetchTaxonomyConfig } from '../../_lib/server-queries';

function findTaxonomyNode(slugSegments: string[], trees: { type: string; nodes: any[] }[]): { node: any; type: string } | null {
    const targetSlug = slugSegments[slugSegments.length - 1];
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
    const { slug } = await params;
    const fullSlug = slug.join('/');
    const lastSegment = slug[slug.length - 1];

    // 1. Try nav config (only for single-segment slugs)
    const nav = await fetchNavConfig();
    const navItem = slug.length === 1
        ? [...nav.headerNav, ...nav.sidebarMenu, ...nav.footerServices]
            .find((item: any) => item.slug === slug[0])
        : null;

    let pageLabel = navItem?.label || navItem?.name || '';
    let isRepair = navItem?.filterType === 'repair';

    // 2. If no nav item or no label, try taxonomy (use last segment)
    if (!pageLabel) {
        const taxonomy = await fetchTaxonomyConfig();
        const trees = [
            { type: 'service', nodes: taxonomy.service || [] },
            { type: 'retail', nodes: taxonomy.retail || [] },
            { type: 'component', nodes: taxonomy.component || [] },
        ];
        const found = findTaxonomyNode(slug, trees);
        if (found) {
            pageLabel = found.node.name;
            isRepair = found.type === 'service';
        }
    }

    // 3. If nav item has taxonomyRef, resolve for better label
    if (navItem?.taxonomyRef && !pageLabel) {
        const taxonomy = await fetchTaxonomyConfig();
        const trees = [
            { type: 'service', nodes: taxonomy.service || [] },
            { type: 'retail', nodes: taxonomy.retail || [] },
            { type: 'component', nodes: taxonomy.component || [] },
        ];
        const found = findTaxonomyNode([navItem.taxonomyRef], trees);
        if (found) {
            pageLabel = found.node.name;
            isRepair = found.type === 'service';
        }
    }

    if (!pageLabel) pageLabel = 'Danh mục';

    const seoTitle = `${pageLabel} | Văn Lành Service - Sửa chữa uy tín tại TP.HCM`;
    const seoDescription = isRepair
        ? `Dịch vụ ${pageLabel} chính hãng tại Văn Lành Service. Linh kiện chính hãng, bảo hành trọn đời, xong trong 30 phút. Hotline: 0932.242.026`
        : `Mua ${pageLabel} chính hãng giá tốt tại Văn Lành Service. Bảo hành uy tín, giao hàng nhanh.`;

    const canonicalUrl = `${SITE_URL}/category/${fullSlug}`;
    
    return {
        title: seoTitle,
        description: seoDescription,
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            title: seoTitle,
            description: seoDescription,
            url: canonicalUrl,
            type: 'website',
            siteName: 'Văn Lành Service',
        },
        twitter: {
            card: 'summary_large_image',
            title: seoTitle,
            description: seoDescription,
        },
    };
}

export default function CategoryLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


export const revalidate = 30;
