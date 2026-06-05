import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');
        const brand = searchParams.get('brand');
        const status = searchParams.get('status') || 'active';
        const limitParam = parseInt(searchParams.get('limit') || '20');

        if (!isAdminAvailable()) {
            return NextResponse.json(
                { error: 'Service unavailable' },
                { status: 503 }
            );
        }

        let productsQuery = getAdminDb().collection('products') as FirebaseFirestore.Query;

        if (status) productsQuery = productsQuery.where('status', '==', status);
        if (category) productsQuery = productsQuery.where('category', '==', category);
        if (brand) productsQuery = productsQuery.where('brand', '==', brand);

        const snapshot = await productsQuery
            .orderBy('createdAt', 'desc')
            .limit(limitParam)
            .get();

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
