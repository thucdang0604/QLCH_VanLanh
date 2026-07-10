import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { unstable_cache } from 'next/cache';
import { PRODUCT_STATUS } from '@/lib/productLifecycle';
import { filterFlashSaleProducts } from '@/lib/flashSale';
import { toPublicProduct, toPublicService } from '@/lib/publicCatalog';

/** Serialized Firestore document with guaranteed `id` field */
export type SerializedDoc = { id: string } & Record<string, unknown>;

export const revalidate = 300;

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
    async (isRepair: boolean, categoryId?: string, condition?: string) => {
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
            
        }

        if (categoryId && categoryId !== 'all') {
            queryRef = queryRef.where('categoryIds', 'array-contains', categoryId);
        }

        const snapshot = await queryRef.limit(200).get();

        let items = snapshot.docs.map(doc => {
            const data = doc.data();
            return isRepair ? toPublicService(doc.id, data) : toPublicProduct(doc.id, data);
        });

        // In-memory filter for condition if specified
        if (!isRepair && condition) {
            items = items.filter(p => {
                const cond = (p as { condition?: string }).condition;
                if (condition === 'new') {
                    return cond === 'new';
                } else if (condition === 'used') {
                    return cond === 'used' || cond === 'like-new';
                }
                return true;
            });
        }

        return items;
    },
    ['category-items'],
    { tags: ['products', 'services'], revalidate: 300 }
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
            if (serialized.publishedAt && typeof (serialized.publishedAt as { toDate?: unknown }).toDate === 'function') {
                serialized.publishedAt = (serialized.publishedAt as { toDate: () => Date }).toDate().getTime();
            }
            if (serialized.viewsUpdatedAt && typeof (serialized.viewsUpdatedAt as { toDate?: unknown }).toDate === 'function') {
                serialized.viewsUpdatedAt = (serialized.viewsUpdatedAt as { toDate: () => Date }).toDate().getTime();
            }
            return serialized;
        });

        return items;
    },
    ['articles-list'],
    { tags: ['articles'], revalidate: 300 }
);

export const fetchDetailItem = unstable_cache(
    async (id: string, type: 'products' | 'services') => {
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
        return type === 'products' ? toPublicProduct(doc.id, data) : toPublicService(doc.id, data);
    },
    ['detail-item'],
    { tags: ['products', 'services'], revalidate: 300 }
);

export const fetchArticleDetail = unstable_cache(
    async (slug: string) => {
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
        if (serialized.viewsUpdatedAt && typeof (serialized.viewsUpdatedAt as { toDate?: unknown }).toDate === 'function') {
            serialized.viewsUpdatedAt = (serialized.viewsUpdatedAt as { toDate: () => Date }).toDate().getTime();
        }

        return serialized;
    },
    ['article-detail'],
    { tags: ['articles'], revalidate: 300 }
);

export const fetchFlashSaleProducts = unstable_cache(
    async () => {
        if (!isAdminAvailable()) return [];

        const db = getAdminDb();
        const snapshot = await db.collection('products')
            .where('status', '==', 'active')
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();

        const items = snapshot.docs.map(doc => toPublicProduct(doc.id, doc.data()));

        return filterFlashSaleProducts(items);
    },
    ['flash-sale-products'],
    { tags: ['products'], revalidate: 300 }
);

export const fetchServices = unstable_cache(
    async () => {
        if (!isAdminAvailable()) return [];

        const db = getAdminDb();
        const snapshot = await db.collection('services')
            .orderBy('createdAt', 'desc')
            .limit(12)
            .get();

        const items = snapshot.docs.map(doc => toPublicService(doc.id, doc.data()));

        // Filter active services
        return items.filter((s) => s.isActive !== false);
    },
    ['services-list'],
    { tags: ['services'], revalidate: 300 }
);

/**
 * Fetch variant siblings by the product's deepest category node.
 * Admin no longer maintains a separate Series group for customer-facing variants.
 */
export const fetchProductVariants = unstable_cache(
    async (categoryId: string, excludeId: string) => {
        if (!categoryId) return [];
        if (!isAdminAvailable()) return [];

        const db = getAdminDb();
        const snapshot = await db.collection('products')
            .where('status', '==', 'active')
            .where('categoryIds', 'array-contains', categoryId)
            .limit(20)
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
    },
    ['product-variants'],
    { tags: ['products'], revalidate: 300 }
);

/**
 * Fetch active service siblings by the service's deepest category node.
 */
export const fetchServiceVariants = unstable_cache(
    async (categoryId: string, excludeId: string) => {
        if (!categoryId) return [];
        if (!isAdminAvailable()) return [];

        const db = getAdminDb();
        const snapshot = await db.collection('services')
            .where('isActive', '==', true)
            .where('categoryIds', 'array-contains', categoryId)
            .limit(20)
            .get();

        return snapshot.docs
            .filter(doc => doc.id !== excludeId)
            .map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || '',
                    slug: data.slug || doc.id,
                    device_model: data.device_model || '',
                    repair_time: data.repair_time || '',
                    warranty_text: data.warranty_text || '',
                    hidePrice: data.hidePrice === true,
                    price_original: data.price_original || 0,
                    price_promo: data.price_promo || 0,
                    images: data.images || [],
                    imageUrl: data.imageUrl || data.image || '',
                };
            });
    },
    ['service-variants'],
    { tags: ['services'], revalidate: 300 }
);

/**
 * Fetch approved product reviews.
 */
export const fetchProductReviews = unstable_cache(
    async (productId: string) => {
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
    },
    ['product-reviews'],
    { tags: ['reviews'], revalidate: 300 }
);

/**
 * Fetch related services and accessories for a product.
 */
export const fetchRelatedItems = unstable_cache(
    async () => {
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
    },
    ['related-items'],
    { tags: ['products', 'services'], revalidate: 300 }
);
