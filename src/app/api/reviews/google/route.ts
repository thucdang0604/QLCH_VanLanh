import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { DEFAULT_CONFIG } from '@/lib/config-defaults';
import { getAdminDb, isAdminAvailable } from '@/lib/firebaseAdmin';

const GOOGLE_PLACES_TIMEOUT_MS = 8000;

async function readConfiguredPlaceId() {
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

// The public reviews endpoint can be requested by every homepage visit. Keep
// its single Firestore configuration read in the Next data cache and share the
// existing `config` invalidation tag used by Appearance saves.
const getConfiguredPlaceId = unstable_cache(
    readConfiguredPlaceId,
    ['google-reviews-place-id'],
    { tags: ['config'], revalidate: 3600 },
);

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

export async function GET(request: Request) {
    try {
        const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
        const placeId = await getConfiguredPlaceId();

        if (!apiKey || !placeId) {
            return NextResponse.json({ configured: false, reviews: [], providerStatus: 'unconfigured' });
        }

        // Forward the client's referer to bypass Google API Key HTTP Referrer restrictions
        const clientReferer = request.headers.get('referer') || '';
        const host = request.headers.get('host') || '';
        const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
        const fallbackReferer = host ? `${protocol}://${host}/` : '';
        const refererUrl = clientReferer || fallbackReferer;

        const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GOOGLE_PLACES_TIMEOUT_MS);
        let res: Response;
        try {
            res = await fetch(url, {
                headers: {
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
                    'Accept-Language': 'vi',
                    ...(refererUrl ? { 'Referer': refererUrl } : {}),
                },
                next: { revalidate: 86400 }, // Cache for one day.
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutId);
        }

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
        }, {
            headers: {
                'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=600'
            }
        });

    } catch (error: unknown) {
        const errMsg = (error as Error).message;
        console.error('Google Reviews Error:', errMsg);
        return NextResponse.json(
            { 
                configured: true, 
                reviews: [], 
                providerStatus: 'provider_error',
                errorDetails: errMsg 
            },
            {
                status: 503,
                headers: {
                    // Avoid a request storm while an upstream credential or
                    // provider outage is being fixed, without hiding recovery
                    // for long from visitors.
                    'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=60',
                    'Retry-After': '60',
                },
            }
        );
    }
}
