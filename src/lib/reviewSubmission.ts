export type ReviewSubmission = {
    website?: unknown;
    referenceId: string;
    type: 'general' | 'repair';
    customerName: string;
    phone: string;
    rating: number;
    content: string;
    images: string[];
    lat: unknown;
    lng: unknown;
    pin: unknown;
};

type ParseResult =
    | { ok: true; value: ReviewSubmission }
    | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringWithin(value: unknown, min: number, max: number): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

function isHttpUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') && value.length <= 2_048;
    } catch {
        return false;
    }
}

export function isValidReviewCoordinates(
    coordinates: { lat: unknown; lng: unknown },
): coordinates is { lat: number; lng: number } {
    const { lat, lng } = coordinates;
    return typeof lat === 'number'
        && typeof lng === 'number'
        && Number.isFinite(lat)
        && Number.isFinite(lng)
        && lat >= -90
        && lat <= 90
        && lng >= -180
        && lng <= 180;
}

/**
 * Firestore Rules do not protect Admin SDK writes. Validate public review
 * payloads here before the route persists anything server-side.
 */
export function parseReviewSubmission(value: unknown): ParseResult {
    if (!isRecord(value)) {
        return { ok: false, error: 'Dữ liệu đánh giá không hợp lệ.' };
    }

    const customerName = stringWithin(value.customerName, 2, 100);
    if (!customerName) {
        return { ok: false, error: 'Vui lòng nhập tên từ 2 đến 100 ký tự.' };
    }

    const phone = stringWithin(value.phone, 4, 20);
    if (!phone) {
        return { ok: false, error: 'Số điện thoại không hợp lệ.' };
    }

    if (typeof value.rating !== 'number' || !Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5) {
        return { ok: false, error: 'Đánh giá không hợp lệ (1-5 sao).' };
    }

    const content = stringWithin(value.content === undefined ? '' : value.content, 0, 2_000);
    if (content === null) {
        return { ok: false, error: 'Nội dung đánh giá không được vượt quá 2.000 ký tự.' };
    }

    const referenceId = stringWithin(value.referenceId === undefined ? '' : value.referenceId, 0, 100);
    if (referenceId === null) {
        return { ok: false, error: 'Mã tham chiếu không hợp lệ.' };
    }

    if (value.images !== undefined && !Array.isArray(value.images)) {
        return { ok: false, error: 'Ảnh đánh giá không hợp lệ.' };
    }
    const rawImages = Array.isArray(value.images) ? value.images : [];
    const images = rawImages
        .filter((item): item is string => typeof item === 'string')
        .filter(isHttpUrl)
        .slice(0, 5);

    return {
        ok: true,
        value: {
            website: value.website,
            referenceId,
            type: value.type === 'repair' ? 'repair' : 'general',
            customerName,
            phone,
            rating: value.rating,
            content,
            images,
            lat: value.lat,
            lng: value.lng,
            pin: value.pin,
        },
    };
}
