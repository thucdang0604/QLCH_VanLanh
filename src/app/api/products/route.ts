import { NextRequest, NextResponse } from 'next/server';
import { getDocs, collection, query, where, limit as firestoreLimit, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');
        const brand = searchParams.get('brand');
        const status = searchParams.get('status') || 'active';
        const limitParam = parseInt(searchParams.get('limit') || '20');

        const constraints: any[] = [];

        if (status) constraints.push(where('status', '==', status));
        if (category) constraints.push(where('category', '==', category));
        if (brand) constraints.push(where('brand', '==', brand));

        constraints.push(orderBy('createdAt', 'desc'));
        constraints.push(firestoreLimit(limitParam));

        const q = query(collection(db, 'products'), ...constraints);
        const snapshot = await getDocs(q);

        const products = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json({
            success: true,
            products,
            total: products.length
        });
    } catch (error) {
        console.error('Products API error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch products' },
            { status: 500 }
        );
    }
}
