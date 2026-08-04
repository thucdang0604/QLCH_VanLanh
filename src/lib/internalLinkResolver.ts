import { db } from './firebase';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';

export interface InternalLinkItem {
    id: string;
    title: string;
    url: string;
    type: 'article' | 'product' | 'service' | 'page';
    keywords: string[];
}

// Fixed core pages
const FIXED_PAGES: InternalLinkItem[] = [
    {
        id: 'page-booking',
        title: 'Đặt lịch sửa chữa & Báo giá linh kiện',
        url: '/',
        type: 'page',
        keywords: ['đặt lịch', 'sửa chữa', 'báo giá', 'bảo hành', 'quy trình', 'thay thế']
    },
    {
        id: 'page-contact',
        title: 'Trang liên hệ & Tư vấn kỹ thuật',
        url: '/lien-he',
        type: 'page',
        keywords: ['liên hệ', 'tư vấn', 'địa chỉ', 'cửa hàng', 'hotline', 'hỗ trợ']
    },
    {
        id: 'page-news',
        title: 'Trang tin tức & Kinh nghiệm công nghệ',
        url: '/tin-tuc',
        type: 'page',
        keywords: ['tin tức', 'kinh nghiệm', 'mẹo hay', 'bài viết', 'tổng hợp', 'hướng dẫn']
    }
];

/**
 * Fetch candidate internal links from Firestore (Articles, Services, Products)
 */
export async function getInternalLinkRegistry(): Promise<InternalLinkItem[]> {
    const registry: InternalLinkItem[] = [...FIXED_PAGES];

    try {
        // 1. Fetch published articles
        const articlesQuery = query(
            collection(db, 'articles'),
            where('status', '==', 'published'),
            limit(30)
        );
        const articleDocs = await getDocs(articlesQuery);
        articleDocs.forEach((docSnap) => {
            const data = docSnap.data();
            const slug = data.slug || docSnap.id;
            const title = data.title || '';
            if (title) {
                registry.push({
                    id: docSnap.id,
                    title: title,
                    url: `/tin-tuc/${slug}`,
                    type: 'article',
                    keywords: title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
                });
            }
        });
    } catch (e) {
        console.warn('Error fetching articles for link resolver:', e);
    }

    try {
        // 2. Fetch services
        const servicesQuery = query(collection(db, 'services'), limit(30));
        const serviceDocs = await getDocs(servicesQuery);
        serviceDocs.forEach((docSnap) => {
            const data = docSnap.data();
            const name = data.name || data.title || '';
            const slug = data.slug || docSnap.id;
            if (name) {
                registry.push({
                    id: docSnap.id,
                    title: name,
                    url: `/service/${slug}`,
                    type: 'service',
                    keywords: name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
                });
            }
        });
    } catch (e) {
        console.warn('Error fetching services for link resolver:', e);
    }

    try {
        // 3. Fetch products
        const productsQuery = query(collection(db, 'products'), limit(30));
        const productDocs = await getDocs(productsQuery);
        productDocs.forEach((docSnap) => {
            const data = docSnap.data();
            const name = data.name || data.title || '';
            const slug = data.slug || docSnap.id;
            if (name) {
                registry.push({
                    id: docSnap.id,
                    title: name,
                    url: `/product/${slug}`,
                    type: 'product',
                    keywords: name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
                });
            }
        });
    } catch (e) {
        console.warn('Error fetching products for link resolver:', e);
    }

    return registry;
}

/**
 * Score how well a candidate internal link matches a placeholder prompt
 */
function scoreMatch(placeholderText: string, item: InternalLinkItem): number {
    const textClean = placeholderText.toLowerCase();
    const itemTitle = item.title.toLowerCase();

    let score = 0;
    
    // Direct substring match
    if (textClean.includes(itemTitle) || itemTitle.includes(textClean)) {
        score += 10;
    }

    // Word token match
    const tokens = textClean.split(/\s+/).filter((w: string) => w.length > 2);

    for (const token of tokens) {
        if (itemTitle.includes(token)) {
            score += 2;
        }
        for (const kw of item.keywords) {
            if (kw === token) {
                score += 1.5;
            }
        }
    }

    return score;
}

/**
 * Scan HTML content for [GỢI Ý LIÊN KẾT: ...] placeholders and replace them with real internal links
 */
export async function resolveInternalLinkPlaceholdersInHtml(
    htmlContent: string
): Promise<{ updatedHtml: string; resolvedCount: number; logs: string[] }> {
    const logs: string[] = [];
    if (!htmlContent) return { updatedHtml: '', resolvedCount: 0, logs };

    const placeholderRegex = /\[GỢI Ý LIÊN KẾT:\s*(.*?)\]/g;
    const matches: { fullMatch: string; prompt: string }[] = [];
    let match: RegExpExecArray | null;

    while ((match = placeholderRegex.exec(htmlContent)) !== null) {
        matches.push({ fullMatch: match[0], prompt: match[1].trim() });
    }

    if (matches.length === 0) {
        return { updatedHtml: htmlContent, resolvedCount: 0, logs: ['Không tìm thấy placeholder [GỢI Ý LIÊN KẾT: ...] nào.'] };
    }

    logs.push(`🔍 Đang truy vấn dữ liệu web nội bộ để ghép ${matches.length} liên kết...`);
    const registry = await getInternalLinkRegistry();

    let updatedHtml = htmlContent;
    let resolvedCount = 0;

    for (let i = 0; i < matches.length; i++) {
        const { fullMatch, prompt } = matches[i];
        
        let bestMatch: InternalLinkItem | null = null;
        let highestScore = 0;

        for (const item of registry) {
            const score = scoreMatch(prompt, item);
            if (score > highestScore) {
                highestScore = score;
                bestMatch = item;
            }
        }

        // If no strong match, fallback to fixed pages or search
        let linkUrl = '/tin-tuc';
        let linkTitle = prompt || 'Xem bài viết liên quan';

        if (bestMatch && highestScore >= 2) {
            linkUrl = bestMatch.url;
            linkTitle = bestMatch.title;
            logs.push(`✓ Liên kết ${i + 1}: Đã ghép "${prompt}" ➔ [${bestMatch.type.toUpperCase()}] ${bestMatch.title} (${linkUrl})`);
        } else {
            // Smart fallback based on topic
            const lowerPrompt = prompt.toLowerCase();
            if (lowerPrompt.includes('sửa') || lowerPrompt.includes('giá') || lowerPrompt.includes('thay')) {
                linkUrl = '/';
                linkTitle = `Báo giá & Đặt lịch: ${prompt}`;
            } else if (lowerPrompt.includes('liên hệ') || lowerPrompt.includes('tư vấn')) {
                linkUrl = '/lien-he';
                linkTitle = `Liên hệ hỗ trợ: ${prompt}`;
            } else {
                linkUrl = `/search?q=${encodeURIComponent(prompt)}`;
                linkTitle = `Tìm kiếm: ${prompt}`;
            }
            logs.push(`ℹ️ Liên kết ${i + 1}: Tự động ghép fallback "${prompt}" ➔ ${linkUrl}`);
        }

        const linkBoxHtml = `<p class="my-4 p-3 rounded-r text-sm shadow-sm" style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 10px 14px; margin: 16px 0; border-radius: 0 6px 6px 0;">👉 <strong>Xem thêm:</strong> <a href="${linkUrl}" target="_blank" rel="noopener" style="color: #ea580c; font-weight: 600; text-decoration: underline;">${linkTitle}</a></p>`;

        updatedHtml = updatedHtml.replace(fullMatch, linkBoxHtml);
        resolvedCount++;
    }

    return { updatedHtml, resolvedCount, logs };
}
