import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';
import ReviewsClient from './ReviewsClient';

export const revalidate = 120; // ISR: revalidate every 2 minutes

async function getApprovedReviews() {
    if (!isAdminAvailable()) return [];

    try {
        const db = getAdminDb();
        const snapshot = await db.collection('reviews')
            .where('status', '==', 'approved')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                customerName: data.customerName || '',
                phone: data.phone || '',
                rating: data.rating || 5,
                content: data.content || '',
                images: data.images || [],
                type: data.type || '',
                createdAt: data.createdAt?.toMillis?.() || data.createdAt?._seconds * 1000 || 0,
            };
        });
    } catch (error) {
        console.error('Error fetching reviews (SSR):', error);
        return [];
    }
}

export default async function ReviewsPage() {
    const reviews = await getApprovedReviews();

    return <ReviewsClient reviews={reviews} />;
}
