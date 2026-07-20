import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidReviewCoordinates, parseReviewSubmission } from './reviewSubmission';

const validSubmission = {
    customerName: 'Nguyễn Văn A',
    phone: '0932242026',
    rating: 5,
    content: 'Sửa nhanh và tư vấn rõ ràng.',
    images: ['https://example.com/review.jpg', 'not-a-url'],
};

test('review submission validation keeps only bounded HTTP image URLs', () => {
    const result = parseReviewSubmission(validSubmission);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.value.images, ['https://example.com/review.jpg']);
    assert.equal(result.value.type, 'general');
});

test('review submission validation rejects values that would bypass Firestore Rules through Admin SDK', () => {
    assert.equal(parseReviewSubmission({ ...validSubmission, content: 'x'.repeat(2_001) }).ok, false);
    assert.equal(parseReviewSubmission({ ...validSubmission, content: null }).ok, false);
    assert.equal(parseReviewSubmission({ ...validSubmission, customerName: 'x' }).ok, false);
    assert.equal(parseReviewSubmission({ ...validSubmission, phone: '1'.repeat(21) }).ok, false);
    assert.equal(parseReviewSubmission({ ...validSubmission, images: {} }).ok, false);
    assert.equal(parseReviewSubmission(['not', 'an', 'object']).ok, false);
});

test('review geolocation accepts only finite, valid coordinates', () => {
    assert.equal(isValidReviewCoordinates({ lat: 10.8, lng: 106.7 }), true);
    assert.equal(isValidReviewCoordinates({ lat: Number.POSITIVE_INFINITY, lng: 106.7 }), false);
    assert.equal(isValidReviewCoordinates({ lat: 91, lng: 106.7 }), false);
    assert.equal(isValidReviewCoordinates({ lat: 10.8, lng: -181 }), false);
});
