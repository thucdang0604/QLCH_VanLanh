import { getAdminDb } from '@/lib/firebaseAdmin';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

export const revalidate = 30;

export const fetchDynamicCategories = unstable_cache(
    async () => {
        const db = getAdminDb();
        const snapshot = await db.collection('categories').get();
        const items = snapshot.docs.map(doc => {
            const data = doc.data();
            const serialized = { ...data, id: doc.id } as Record<string, any>;
            if (serialized.createdAt && serialized.createdAt.toDate) {
                serialized.createdAt = serialized.createdAt.toDate().getTime();
            }
            if (serialized.updatedAt && serialized.updatedAt.toDate) {
                serialized.updatedAt = serialized.updatedAt.toDate().getTime();
            }
            return serialized;
        });
        return items as any[];
    },
    ['global-categories'],
    { tags: ['categories'], revalidate: 86400 }
);

export const fetchTaxonomyConfig = unstable_cache(
    async () => {
        const db = getAdminDb();
        const snap = await db.collection('system_config').doc('taxonomy_settings').get();
        if (!snap.exists) return { retail: [], service: [], component: [] };
        const raw = JSON.parse(JSON.stringify(snap.data()));
        // Firestore doc may wrap trees under a 'taxonomy' field or store at top level
        const data = raw.taxonomy ?? raw;
        return {
            retail: data.retail || [],
            service: data.service || [],
            component: data.component || [],
        };
    },
    ['global-taxonomy'],
    { tags: ['config'], revalidate: 86400 }
);

export const fetchNavConfig = unstable_cache(
    async () => {
        const db = getAdminDb();
        const snap = await db.collection('system_config').doc('navigation_settings').get();
        if (!snap.exists) return { headerNav: [], sidebarMenu: [], footerServices: [] };
        const data = JSON.parse(JSON.stringify(snap.data()));
        return {
            headerNav: data.headerNav || [],
            sidebarMenu: data.sidebarMenu || [],
            footerServices: data.footerServices || [],
        };
    },
    ['global-nav'],
    { tags: ['config'], revalidate: 86400 }
);

export const fetchCategoryItems = cache(async (isRepair: boolean, category?: string) => {
    const db = getAdminDb();
    const collectionName = isRepair ? 'services' : 'products';

    let queryRef = db.collection(collectionName) as FirebaseFirestore.Query;

    if (isRepair) {
        // Fetch ALL services. We will filter dynamically in the Client to avoid duplicate content.
        // Bỏ orderBy để tránh lỗi Missing Composite Index nếu có thêm filter.
        queryRef = queryRef.where('isActive', '==', true);
    } else {
        queryRef = queryRef.where('status', '==', 'active');
        // Không gọi orderBy ở đây để tránh lỗi Missing Index.
        // Sắp xếp (sort) sẽ được Client/Server xử lý trên bộ nhớ RAM (In-memory sorting)
    }

    const snapshot = await queryRef.limit(1000).get();

    const items = snapshot.docs.map(doc => {
        const data = doc.data();

        // Remove non-serializable fields (like Firestore Timestamps)
        const serialized = { ...data, id: doc.id } as Record<string, any>;
        if (serialized.createdAt) {
            serialized.createdAt = serialized.createdAt.toDate ? serialized.createdAt.toDate().getTime() : serialized.createdAt;
        }
        if (serialized.updatedAt) {
            serialized.updatedAt = serialized.updatedAt.toDate ? serialized.updatedAt.toDate().getTime() : serialized.updatedAt;
        }

        return serialized;
    });

    return items as any[];
});

export const fetchArticles = cache(async () => {
    const db = getAdminDb();
    const snapshot = await db.collection('articles')
        .where('status', '==', 'published')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

    const items = snapshot.docs.map(doc => {
        const data = doc.data();
        const serialized = { ...data, id: doc.id } as Record<string, any>;
        if (serialized.createdAt) {
            serialized.createdAt = serialized.createdAt.toDate ? serialized.createdAt.toDate().getTime() : serialized.createdAt;
        }
        if (serialized.updatedAt) {
            serialized.updatedAt = serialized.updatedAt.toDate ? serialized.updatedAt.toDate().getTime() : serialized.updatedAt;
        }
        return serialized;
    });

    return items as any[];
});

export const fetchDetailItem = cache(async (id: string, type: 'products' | 'services') => {
    const db = getAdminDb();
    const doc = await db.collection(type).doc(id).get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data() as Record<string, any>;
    const serialized = { ...data, id: doc.id } as Record<string, any>;
    if (serialized.createdAt) {
        serialized.createdAt = serialized.createdAt.toDate ? serialized.createdAt.toDate().getTime() : serialized.createdAt;
    }
    if (serialized.updatedAt) {
        serialized.updatedAt = serialized.updatedAt.toDate ? serialized.updatedAt.toDate().getTime() : serialized.updatedAt;
    }

    return serialized;
});

export const fetchArticleDetail = cache(async (slug: string) => {
    const db = getAdminDb();

    // First try by ID (slug is often the ID in this project for articles)
    let doc = await db.collection('articles').doc(slug).get();

    if (!doc.exists) {
        // Fallback: try querying by slug field if it exists
        const snapshot = await db.collection('articles')
            .where('slug', '==', slug)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return null;
        }
        doc = snapshot.docs[0];
    }

    const data = doc.data() as Record<string, any>;
    const serialized = { ...data, id: doc.id } as Record<string, any>;
    if (serialized.createdAt) {
        serialized.createdAt = serialized.createdAt.toDate ? serialized.createdAt.toDate().getTime() : serialized.createdAt;
    }
    if (serialized.updatedAt) {
        serialized.updatedAt = serialized.updatedAt.toDate ? serialized.updatedAt.toDate().getTime() : serialized.updatedAt;
    }
    if (serialized.publishedAt) {
        serialized.publishedAt = serialized.publishedAt.toDate ? serialized.publishedAt.toDate().getTime() : serialized.publishedAt;
    }

    return serialized;
});

export const fetchFlashSaleProducts = cache(async () => {
    const db = getAdminDb();
    const snapshot = await db.collection('products')
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

    const items = snapshot.docs.map(doc => {
        const data = doc.data();
        const serialized = { ...data, id: doc.id } as Record<string, any>;
        if (serialized.createdAt) {
            serialized.createdAt = serialized.createdAt.toDate ? serialized.createdAt.toDate().getTime() : serialized.createdAt;
        }
        if (serialized.updatedAt) {
            serialized.updatedAt = serialized.updatedAt.toDate ? serialized.updatedAt.toDate().getTime() : serialized.updatedAt;
        }
        return serialized;
    });

    // Filter flash sale items: isFlashSale=true OR discount >= 10%
    return items.filter((p: any) => {
        if (p.isFlashSale) return true;
        if (p.price_promo && p.price_original) {
            return ((p.price_original - p.price_promo) / p.price_original) * 100 >= 10;
        }
        return false;
    }) as any[];
});

export const fetchServices = cache(async () => {
    const db = getAdminDb();
    const snapshot = await db.collection('services')
        .orderBy('createdAt', 'desc')
        .limit(12)
        .get();

    const items = snapshot.docs.map(doc => {
        const data = doc.data();
        const serialized = { ...data, id: doc.id } as Record<string, any>;
        if (serialized.createdAt) {
            serialized.createdAt = serialized.createdAt.toDate ? serialized.createdAt.toDate().getTime() : serialized.createdAt;
        }
        if (serialized.updatedAt) {
            serialized.updatedAt = serialized.updatedAt.toDate ? serialized.updatedAt.toDate().getTime() : serialized.updatedAt;
        }
        return serialized;
    });

    // Filter active services
    return items.filter((s: any) => s.isActive !== false) as any[];
});
