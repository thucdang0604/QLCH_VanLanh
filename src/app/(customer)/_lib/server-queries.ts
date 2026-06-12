import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { PRODUCT_STATUS } from '@/lib/productLifecycle';

/** Serialized Firestore document with guaranteed `id` field */
export type SerializedDoc = { id: string } & Record<string, unknown>;

export const revalidate = 30;

export const fetchDynamicCategories = unstable_cache(
    async () => {
        if (!isAdminAvailable()) return [];

        const db = getAdminDb();
        const snapshot = await db.collection('categories').get();
        const items = snapshot.docs.map(doc => {
            const data = doc.data();
            const serialized: SerializedDoc = { ...data, id: doc.id };
            if (serialized.createdAt && typeof (serialized.createdAt as { toDate?: unknown }).toDate === 'function') {
                serialized.createdAt = (serialized.createdAt as { toDate: () => Date }).toDate().getTime();
            }
            if (serialized.updatedAt && typeof (serialized.updatedAt as { toDate?: unknown }).toDate === 'function') {
                serialized.updatedAt = (serialized.updatedAt as { toDate: () => Date }).toDate().getTime();
            }
            return serialized;
        });
        return items as Record<string, unknown>[];
    },
    ['global-categories'],
    { tags: ['categories'], revalidate: 86400 }
);

export const fetchTaxonomyConfig = unstable_cache(
    async () => {
        if (!isAdminAvailable()) return { retail: [], service: [], component: [] };

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
        if (!isAdminAvailable()) return { headerNav: [], sidebarMenu: [], footerServices: [] };

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

export const fetchCategoryItems = unstable_cache(
    async (isRepair: boolean) => {
        if (!isAdminAvailable()) return [];

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

        const snapshot = await queryRef.limit(200).get();

        const items = snapshot.docs.map(doc => {
            const data = doc.data();

            // Remove non-serializable fields (like Firestore Timestamps)
            const serialized: SerializedDoc = { ...data, id: doc.id };
            if (serialized.createdAt && typeof (serialized.createdAt as { toDate?: unknown }).toDate === 'function') {
                serialized.createdAt = (serialized.createdAt as { toDate: () => Date }).toDate().getTime();
            }
            if (serialized.updatedAt && typeof (serialized.updatedAt as { toDate?: unknown }).toDate === 'function') {
                serialized.updatedAt = (serialized.updatedAt as { toDate: () => Date }).toDate().getTime();
            }

            return serialized;
        });

        return items;
    },
    ['category-items'],
    { tags: ['products', 'services'], revalidate: 30 }
);

export const fetchArticles = unstable_cache(
    async () => {
        if (!isAdminAvailable()) return [];

        const db = getAdminDb();
        const snapshot = await db.collection('articles')
            .where('status', '==', 'published')
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();

        const items = snapshot.docs.map(doc => {
            const data = doc.data();
            const serialized: SerializedDoc = { ...data, id: doc.id };
            if (serialized.createdAt && typeof (serialized.createdAt as { toDate?: unknown }).toDate === 'function') {
                serialized.createdAt = (serialized.createdAt as { toDate: () => Date }).toDate().getTime();
            }
            if (serialized.updatedAt && typeof (serialized.updatedAt as { toDate?: unknown }).toDate === 'function') {
                serialized.updatedAt = (serialized.updatedAt as { toDate: () => Date }).toDate().getTime();
            }
            return serialized;
        });

        return items;
    },
    ['articles-list'],
    { tags: ['articles'], revalidate: 30 }
);

export const fetchDetailItem = cache(async (id: string, type: 'products' | 'services') => {
    if (!isAdminAvailable()) return null;

    const db = getAdminDb();
    const doc = await db.collection(type).doc(id).get();

    if (!doc.exists) {
        return null;
    }

    const data = doc.data() as Record<string, unknown>;
    if (type === 'products' && data.status !== PRODUCT_STATUS.ACTIVE) {
        return null;
    }
    const serialized: SerializedDoc = { ...data, id: doc.id };
    if (serialized.createdAt && typeof (serialized.createdAt as { toDate?: unknown }).toDate === 'function') {
        serialized.createdAt = (serialized.createdAt as { toDate: () => Date }).toDate().getTime();
    }
    if (serialized.updatedAt && typeof (serialized.updatedAt as { toDate?: unknown }).toDate === 'function') {
        serialized.updatedAt = (serialized.updatedAt as { toDate: () => Date }).toDate().getTime();
    }

    return serialized;
});

export const fetchArticleDetail = cache(async (slug: string) => {
    if (!isAdminAvailable()) return null;

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

    const data = doc.data() as Record<string, unknown>;
    const serialized: SerializedDoc = { ...data, id: doc.id };
    if (serialized.createdAt && typeof (serialized.createdAt as { toDate?: unknown }).toDate === 'function') {
        serialized.createdAt = (serialized.createdAt as { toDate: () => Date }).toDate().getTime();
    }
    if (serialized.updatedAt && typeof (serialized.updatedAt as { toDate?: unknown }).toDate === 'function') {
        serialized.updatedAt = (serialized.updatedAt as { toDate: () => Date }).toDate().getTime();
    }
    if (serialized.publishedAt && typeof (serialized.publishedAt as { toDate?: unknown }).toDate === 'function') {
        serialized.publishedAt = (serialized.publishedAt as { toDate: () => Date }).toDate().getTime();
    }

    return serialized;
});

export const fetchFlashSaleProducts = unstable_cache(
    async () => {
        if (!isAdminAvailable()) return [];

        const db = getAdminDb();
        const snapshot = await db.collection('products')
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        const items = snapshot.docs.map(doc => {
            const data = doc.data();
            const serialized: SerializedDoc = { ...data, id: doc.id };
            if (serialized.createdAt && typeof (serialized.createdAt as { toDate?: unknown }).toDate === 'function') {
                serialized.createdAt = (serialized.createdAt as { toDate: () => Date }).toDate().getTime();
            }
            if (serialized.updatedAt && typeof (serialized.updatedAt as { toDate?: unknown }).toDate === 'function') {
                serialized.updatedAt = (serialized.updatedAt as { toDate: () => Date }).toDate().getTime();
            }
            return serialized;
        });

        // Filter flash sale items: isFlashSale=true OR discount >= 10%
        return items.filter((p) => {
            if (p.isFlashSale) return true;
            if (p.price_promo && p.price_original) {
                return ((p.price_original as number) - (p.price_promo as number)) / (p.price_original as number) * 100 >= 10;
            }
            return false;
        });
    },
    ['flash-sale-products'],
    { tags: ['products'], revalidate: 30 }
);

export const fetchServices = unstable_cache(
    async () => {
        if (!isAdminAvailable()) return [];

        const db = getAdminDb();
        const snapshot = await db.collection('services')
            .orderBy('createdAt', 'desc')
            .limit(12)
            .get();

        const items = snapshot.docs.map(doc => {
            const data = doc.data();
            const serialized: SerializedDoc = { ...data, id: doc.id };
            if (serialized.createdAt && typeof (serialized.createdAt as { toDate?: unknown }).toDate === 'function') {
                serialized.createdAt = (serialized.createdAt as { toDate: () => Date }).toDate().getTime();
            }
            if (serialized.updatedAt && typeof (serialized.updatedAt as { toDate?: unknown }).toDate === 'function') {
                serialized.updatedAt = (serialized.updatedAt as { toDate: () => Date }).toDate().getTime();
            }
            return serialized;
        });

        // Filter active services
        return items.filter((s) => s.isActive !== false);
    },
    ['services-list'],
    { tags: ['services'], revalidate: 30 }
);

/**
 * Fetch variant siblings by seriesId.
 * Returns other products sharing the same seriesId (different color/storage).
 */
export const fetchProductVariants = cache(async (seriesId: string, excludeId: string) => {
    if (!seriesId) return [];
    if (!isAdminAvailable()) return [];

    const db = getAdminDb();
    const snapshot = await db.collection('products')
        .where('seriesId', '==', seriesId)
        .where('status', '==', 'active')
        .get();

    return snapshot.docs
        .filter(doc => doc.id !== excludeId)
        .map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name || '',
                slug: data.slug || doc.id,
                color: data.color || '',
                storageCapacity: data.storageCapacity || '',
                conditionLabel: data.conditionLabel || '',
                price_original: data.price_original || 0,
                price_promo: data.price_promo || 0,
                images: data.images || [],
                imageUrl: data.imageUrl || '',
            };
        });
});

/**
 * Fetch approved product reviews.
 */
export const fetchProductReviews = cache(async (productId: string) => {
    if (!productId) return [];
    if (!isAdminAvailable()) return [];

    const db = getAdminDb();
    const snapshot = await db.collection('product_reviews')
        .where('productId', '==', productId)
        .where('status', '==', 'approved')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

    return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            customerName: data.customerName || '',
            rating: data.rating || 5,
            content: data.content || '',
            createdAt: data.createdAt?.toDate?.()?.getTime() || Date.now(),
        };
    });
});

/**
 * Fetch related services and accessories for a product.
 */
export const fetchRelatedItems = cache(async () => {
    if (!isAdminAvailable()) return { services: [], accessories: [] };

    const db = getAdminDb();
    
    // Fetch some services
    const servicesSnap = await db.collection('services')
        .orderBy('createdAt', 'desc')
        .limit(4)
        .get();

    const services = servicesSnap.docs
        .map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                _type: 'service',
                name: data.name || '',
                slug: data.slug || doc.id,
                price_original: data.price_original || 0,
                price_promo: data.price_promo || 0,
                imageUrl: data.imageUrl || data.image || '',
                brand: data.brand || '',
            };
        });

    // Fetch some accessories (products with category = 'Phụ kiện' or similar)
    const accessoriesSnap = await db.collection('products')
        .where('status', '==', 'active')
        .where('category', '==', 'Phụ kiện')
        .limit(4)
        .get();

    const accessories = accessoriesSnap.docs
        .map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                _type: 'product',
                name: data.name || '',
                slug: data.slug || doc.id,
                price_original: data.price_original || 0,
                price_promo: data.price_promo || 0,
                imageUrl: data.imageUrl || (data.images ? data.images[0] : ''),
                brand: data.brand || '',
            };
        });

    return { services, accessories };
});
