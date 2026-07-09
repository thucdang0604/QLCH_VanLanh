'use client';

import { useState, useEffect } from 'react';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    QueryConstraint,
    DocumentData,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    setDoc
} from 'firebase/firestore';
import { onSnapshot, getDocs } from './firestoreLogger';
import { db } from './firebase';

/**
 * Custom hook for real-time Firestore collection subscription
 */
export function useFirestoreCollection<T extends DocumentData>(
    collectionName: string,
    constraints: QueryConstraint[] = []
) {
    const [data, setData] = useState<(T & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // This hook re-subscribes when its query changes; show loading state immediately.
        setLoading(true);
        setError(null);

        const q = query(collection(db, collectionName), ...constraints);

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const items = snapshot.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                })) as (T & { id: string })[];
                setData(items);
                setLoading(false);
            },
            (err) => {
                console.error(`Error fetching ${collectionName}:`, err);
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collectionName, JSON.stringify(constraints.map(c => c.toString()))]);

    return { data, loading, error };
}

/**
 * Hook for Products with filters
 */
export function useProducts(filters?: {
    category?: string;
    brand?: string;
    isFlashSale?: boolean;
    limit?: number;
}) {
    const constraints: QueryConstraint[] = [];

    if (filters?.category) {
        constraints.push(where('category', '==', filters.category));
    }
    if (filters?.brand) {
        constraints.push(where('brand', '==', filters.brand));
    }
    if (filters?.isFlashSale) {
        constraints.push(where('isFlashSale', '==', true));
    }
    if (filters?.limit) {
        constraints.push(limit(filters.limit));
    }

    constraints.push(orderBy('createdAt', 'desc'));

    return useFirestoreCollection('products', constraints);
}

/**
 * Hook for Flash Sale products
 */
export function useFlashSaleProducts(maxItems: number = 6) {
    const [data, setData] = useState<(DocumentData & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        try {
            // Query products with isFlashSale = true OR high discount
            const q = query(
                collection(db, 'products'),
                where('status', '==', 'active'),
                orderBy('createdAt', 'desc'),
                limit(maxItems)
            );

            unsubscribe = onSnapshot(q, (snapshot) => {
                const products = snapshot.docs
                    .map((doc) => ({ id: doc.id, ...doc.data() }))
                    .filter((p) => {
                        const item = p as Partial<{
                            isFlashSale: boolean;
                            price_promo: number;
                            price_original: number;
                        }>;
                        // Filter products with discount or isFlashSale flag
                        if (item.isFlashSale) return true;
                        if (item.price_promo && item.price_original) {
                            const discount = ((item.price_original - item.price_promo) / item.price_original) * 100;
                            return discount >= 10;
                        }
                        return false;
                    });
                setData(products);
                setLoading(false);
            });
        } catch (error) {
            console.error('Flash sale fetch error:', error);
            setLoading(false);
        }

        return () => {
            unsubscribe?.();
        };
    }, [maxItems]);

    return { data, loading };
}

/**
 * Hook for Services
 */
export function useServices() {
    const constraints = [orderBy('name', 'asc'), limit(50)];
    return useFirestoreCollection('services', constraints);
}

/**
 * Hook for Articles with filters
 */
export function useArticles(filters?: {
    type?: string;
    status?: string;
    limit?: number;
}) {
    const constraints: QueryConstraint[] = [];

    if (filters?.type) {
        constraints.push(where('type', '==', filters.type));
    }
    if (filters?.status) {
        constraints.push(where('status', '==', filters.status));
    }
    if (filters?.limit) {
        constraints.push(limit(filters.limit));
    }

    constraints.push(orderBy('createdAt', 'desc'));

    return useFirestoreCollection('articles', constraints);
}

/**
 * Hook for Orders with filters
 */
export function useOrders(filters?: {
    status?: string;
    limit?: number;
}) {
    const constraints: QueryConstraint[] = [];

    if (filters?.status && filters.status !== 'all') {
        constraints.push(where('status', '==', filters.status));
    }
    if (filters?.limit) {
        constraints.push(limit(filters.limit));
    }

    constraints.push(orderBy('createdAt', 'desc'));

    return useFirestoreCollection('orders', constraints);
}

/**
 * CRUD Operations
 */

export async function addDocument(collectionName: string, data: Record<string, unknown>) {
    try {
        const docRef = await addDoc(collection(db, collectionName), {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return docRef.id;
    } catch (error) {
        console.error('Error adding document:', error);
        throw error;
    }
}

export async function addDocumentWithId(collectionName: string, docId: string, data: Record<string, unknown>) {
    try {
        const docRef = doc(db, collectionName, docId);
        await setDoc(docRef, {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return docId;
    } catch (error) {
        console.error('Error adding document with ID:', error);
        throw error;
    }
}

export async function updateDocument(collectionName: string, docId: string, data: Record<string, unknown>) {
    try {
        const docRef = doc(db, collectionName, docId);
        await updateDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp(),
        });
        return true;
    } catch (error) {
        console.error('Error updating document:', error);
        throw error;
    }
}

export async function deleteDocument(collectionName: string, docId: string) {
    try {
        await deleteDoc(doc(db, collectionName, docId));
        return true;
    } catch (error) {
        console.error('Error deleting document:', error);
        throw error;
    }
}

/**
 * Subscribe to newsletter
 */
export async function subscribeNewsletter(email: string) {
    try {
        // Check if already subscribed
        const q = query(collection(db, 'subscribers'), where('email', '==', email));
        const existing = await getDocs(q);

        if (!existing.empty) {
            return { success: false, message: 'Email đã đăng ký' };
        }

        await addDoc(collection(db, 'subscribers'), {
            email,
            subscribedAt: serverTimestamp(),
            status: 'active',
        });

        return { success: true, message: 'Đăng ký thành công!' };
    } catch (error) {
        console.error('Error subscribing:', error);
        throw error;
    }
}
