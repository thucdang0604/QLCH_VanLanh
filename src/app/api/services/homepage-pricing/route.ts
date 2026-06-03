import { NextResponse } from 'next/server';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';

export async function GET() {
    try {
        if (!isAdminAvailable()) {
            return NextResponse.json({ services: [] });
        }

        const snapshot = await getAdminDb()
            .collection('services')
            .where('isActive', '==', true)
            .limit(200)
            .get();
        const services = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                createdAt: data.createdAt?.toDate?.()?.getTime() ?? data.createdAt,
                updatedAt: data.updatedAt?.toDate?.()?.getTime() ?? data.updatedAt,
            };
        });

        return NextResponse.json(
            { services },
            { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
        );
    } catch (error) {
        console.error('Homepage pricing services API error:', error);
        return NextResponse.json({ error: 'Failed to fetch homepage pricing services' }, { status: 500 });
    }
}
