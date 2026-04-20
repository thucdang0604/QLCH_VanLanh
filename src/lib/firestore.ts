import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    DocumentData,
    QueryConstraint
} from 'firebase/firestore';
import { db } from './firebase';
import { Product, Service, Order, Article, User } from './types';

// ============ PRODUCTS ============

export async function getProducts(filters?: {
    category?: string;
    brand?: string;
    status?: string;
    limit?: number;
}): Promise<Product[]> {
    try {
        const constraints: QueryConstraint[] = [];

        if (filters?.category) {
            constraints.push(where('category', '==', filters.category));
        }
        if (filters?.brand) {
            constraints.push(where('brand', '==', filters.brand));
        }
        if (filters?.status) {
            constraints.push(where('status', '==', filters.status));
        }
        if (filters?.limit) {
            constraints.push(limit(filters.limit));
        }

        constraints.push(orderBy('createdAt', 'desc'));

        const q = query(collection(db, 'products'), ...constraints);
        const snapshot = await getDocs(q);

        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Product[];
    } catch (error) {
        console.error('Error fetching products:', error);
        return [];
    }
}

export async function getProductById(id: string): Promise<Product | null> {
    try {
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Product;
        }
        return null;
    } catch (error) {
        console.error('Error fetching product:', error);
        return null;
    }
}

export async function createProduct(product: Omit<Product, 'id'>): Promise<string | null> {
    try {
        const docRef = await addDoc(collection(db, 'products'), {
            ...product,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        return docRef.id;
    } catch (error) {
        console.error('Error creating product:', error);
        return null;
    }
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<boolean> {
    try {
        const docRef = doc(db, 'products', id);
        await updateDoc(docRef, {
            ...data,
            updatedAt: new Date().toISOString(),
        });
        return true;
    } catch (error) {
        console.error('Error updating product:', error);
        return false;
    }
}

export async function deleteProduct(id: string): Promise<boolean> {
    try {
        await deleteDoc(doc(db, 'products', id));
        return true;
    } catch (error) {
        console.error('Error deleting product:', error);
        return false;
    }
}

// ============ ORDERS ============

export async function getOrders(filters?: {
    status?: string;
    customerId?: string;
    limit?: number;
}): Promise<Order[]> {
    try {
        const constraints: QueryConstraint[] = [];

        if (filters?.status) {
            constraints.push(where('status', '==', filters.status));
        }
        if (filters?.customerId) {
            constraints.push(where('customer.id', '==', filters.customerId));
        }
        if (filters?.limit) {
            constraints.push(limit(filters.limit));
        }

        constraints.push(orderBy('createdAt', 'desc'));

        const q = query(collection(db, 'orders'), ...constraints);
        const snapshot = await getDocs(q);

        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Order[];
    } catch (error) {
        console.error('Error fetching orders:', error);
        return [];
    }
}

export async function getOrderById(id: string): Promise<Order | null> {
    try {
        const docRef = doc(db, 'orders', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Order;
        }
        return null;
    } catch (error) {
        console.error('Error fetching order:', error);
        return null;
    }
}

export async function createOrder(order: Omit<Order, 'id'>): Promise<string | null> {
    try {
        const docRef = await addDoc(collection(db, 'orders'), {
            ...order,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        return docRef.id;
    } catch (error) {
        console.error('Error creating order:', error);
        return null;
    }
}

export async function updateOrderStatus(id: string, status: string): Promise<boolean> {
    try {
        const docRef = doc(db, 'orders', id);
        await updateDoc(docRef, {
            status,
            updatedAt: new Date().toISOString(),
        });
        return true;
    } catch (error) {
        console.error('Error updating order:', error);
        return false;
    }
}

// ============ SERVICES ============

export async function getServices(): Promise<Service[]> {
    try {
        const q = query(collection(db, 'services'), orderBy('name'));
        const snapshot = await getDocs(q);

        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Service[];
    } catch (error) {
        console.error('Error fetching services:', error);
        return [];
    }
}

export async function createService(service: Omit<Service, 'id'>): Promise<string | null> {
    try {
        const docRef = await addDoc(collection(db, 'services'), {
            ...service,
            createdAt: new Date().toISOString(),
        });
        return docRef.id;
    } catch (error) {
        console.error('Error creating service:', error);
        return null;
    }
}

export async function updateService(id: string, data: Partial<Service>): Promise<boolean> {
    try {
        await updateDoc(doc(db, 'services', id), data);
        return true;
    } catch (error) {
        console.error('Error updating service:', error);
        return false;
    }
}

export async function deleteService(id: string): Promise<boolean> {
    try {
        await deleteDoc(doc(db, 'services', id));
        return true;
    } catch (error) {
        console.error('Error deleting service:', error);
        return false;
    }
}

// ============ ARTICLES ============

export async function getArticles(filters?: {
    type?: string;
    status?: string;
    limit?: number;
}): Promise<Article[]> {
    try {
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

        const q = query(collection(db, 'articles'), ...constraints);
        const snapshot = await getDocs(q);

        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Article[];
    } catch (error) {
        console.error('Error fetching articles:', error);
        return [];
    }
}

export async function createArticle(article: Omit<Article, 'id'>): Promise<string | null> {
    try {
        const docRef = await addDoc(collection(db, 'articles'), {
            ...article,
            views: 0,
            createdAt: new Date().toISOString(),
        });
        return docRef.id;
    } catch (error) {
        console.error('Error creating article:', error);
        return null;
    }
}

export async function updateArticle(id: string, data: Partial<Article>): Promise<boolean> {
    try {
        await updateDoc(doc(db, 'articles', id), {
            ...data,
            updatedAt: new Date().toISOString(),
        });
        return true;
    } catch (error) {
        console.error('Error updating article:', error);
        return false;
    }
}

export async function deleteArticle(id: string): Promise<boolean> {
    try {
        await deleteDoc(doc(db, 'articles', id));
        return true;
    } catch (error) {
        console.error('Error deleting article:', error);
        return false;
    }
}

// ============ FLASH SALE ============

export async function getFlashSaleProducts(): Promise<Product[]> {
    try {
        const q = query(
            collection(db, 'products'),
            where('status', '==', 'active'),
            where('price_promo', '>', 0),
            orderBy('price_promo'),
            limit(6)
        );
        const snapshot = await getDocs(q);

        return snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Product[];
    } catch (error) {
        console.error('Error fetching flash sale products:', error);
        return [];
    }
}
