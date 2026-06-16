type ReviewCandidate = {
    customerName?: unknown;
    content?: unknown;
    isTest?: unknown;
};

function normalize(value: unknown): string {
    return typeof value === 'string'
        ? value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        : '';
}

export function isPublicReview(review: ReviewCandidate): boolean {
    if (review.isTest === true) return false;

    const name = normalize(review.customerName);
    const content = normalize(review.content);
    const testValues = new Set(['test', 'testing', 'teo']);

    return !testValues.has(name) && !testValues.has(content);
}
