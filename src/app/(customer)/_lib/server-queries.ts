import { getAdminDb } from '@/lib/firebaseAdmin';
import { cache } from 'react';

export const revalidate = false;

export const fetchCategoryItems = cache(async (isRepair: boolean, category?: string) => {
    const db = getAdminDb();
    const collectionName = isRepair ? 'services' : 'products';
    
    let queryRef = db.collection(collectionName) as FirebaseFirestore.Query;
    
    if (isRepair) {
        // Fetch all services, active/inactive handling is usually on client, but we can do it later.
        queryRef = queryRef.orderBy('createdAt', 'desc');
    } else {
        queryRef = queryRef.where('status', '==', 'active');
        if (category) {
            queryRef = queryRef.where('category', '==', category);
        }
        queryRef = queryRef.orderBy('createdAt', 'desc');
    }
    
    // We should limit to preventing out-of-memory if the store scales out.
    // For normal shops, 1000 items is around a few megabytes. Safe for server.
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
