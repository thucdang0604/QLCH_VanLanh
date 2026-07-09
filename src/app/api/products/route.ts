import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import { toPublicProduct } from '@/lib/publicCatalog';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');
        const brand = searchParams.get('brand');
        const requestedLimit = Number.parseInt(searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10);
        const limitParam = Number.isFinite(requestedLimit)
            ? Math.min(MAX_LIMIT, Math.max(1, requestedLimit))
            : DEFAULT_LIMIT;

        if (!isAdminAvailable()) {
            return NextResponse.json(
                { error: 'Service unavailable' },
                { status: 503 }
            );
        }

        let productsQuery = getAdminDb().collection('products') as FirebaseFirestore.Query;

        productsQuery = productsQuery.where('status', '==', 'active');
        if (category) productsQuery = productsQuery.where('category', '==', category);
        if (brand) productsQuery = productsQuery.where('brand', '==', brand);

        const snapshot = await productsQuery
            .orderBy('createdAt', 'desc')
            .limit(limitParam)
            .get();

        const products = snapshot.docs.map(doc => toPublicProduct(doc.id, doc.data()));

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
