import { NextResponse } from 'next/server';
import { DEFAULT_CONFIG } from '@/lib/config-defaults';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';

async function getConfiguredPlaceId() {
    const fallbackPlaceId = process.env.GOOGLE_PLACE_ID || DEFAULT_CONFIG.homepageReviews.googlePlaceId;
    if (!isAdminAvailable()) return fallbackPlaceId;

    try {
        const snapshot = await getAdminDb().collection('system_config').doc('layout_settings').get();
        const homepageReviews = snapshot.data()?.homepageReviews as { googlePlaceId?: unknown } | undefined;
        return typeof homepageReviews?.googlePlaceId === 'string' && homepageReviews.googlePlaceId.trim()
            ? homepageReviews.googlePlaceId.trim()
            : fallbackPlaceId;
    } catch (error) {
        console.error('Failed to read Google Place ID from layout settings:', error);
        return fallbackPlaceId;
    }
}

interface GooglePlacesReview {
    authorAttribution?: {
        displayName?: string;
        photoUri?: string;
    };
    rating?: number;
    text?: {
        text?: string;
    };
}

interface GooglePlaceDetails {
    rating?: number;
    userRatingCount?: number;
    reviews?: GooglePlacesReview[];
}

interface GoogleApiError {
    error?: {
        code?: number;
        message?: string;
        status?: string;
    };
}

export async function GET() {
    try {
        const apiKey = process.env.GOOGLE_MAPS_API_KEY;
        const placeId = await getConfiguredPlaceId();

        if (!apiKey || !placeId) {
            return NextResponse.json({ configured: false, reviews: [] });
        }

        const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
        const res = await fetch(url, {
            headers: {
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
                'Accept-Language': 'vi',
            },
            next: { revalidate: 86400 } // Cache for one day.
        });

        if (!res.ok) {
            const details = await res.json().catch(() => null) as GoogleApiError | null;
            const googleStatus = details?.error?.status || 'UNKNOWN';
            const googleMessage = details?.error?.message || 'No error details returned';
            throw new Error(`Google API ${res.status} ${googleStatus}: ${googleMessage}`);
        }

        const data = await res.json() as GooglePlaceDetails;
        const reviews = (data.reviews || []).map(review => ({
            author_name: review.authorAttribution?.displayName || 'Khach hang Google',
            rating: review.rating || 0,
            text: review.text?.text || '',
            profile_photo_url: review.authorAttribution?.photoUri,
        })).filter(review => review.text);

        return NextResponse.json({
            configured: true,
            rating: data.rating || 0,
            total_ratings: data.userRatingCount || 0,
            reviews
        });

    } catch (error: unknown) {
        console.error('Google Reviews Error:', (error as Error).message);
        return NextResponse.json({ configured: false, reviews: [] });
    }
}
