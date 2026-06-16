import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicReview } from './reviewVisibility';

test('review visibility removes explicitly marked and obvious QA records', () => {
    assert.equal(isPublicReview({ customerName: 'Khách thật', content: 'Dịch vụ tốt' }), true);
    assert.equal(isPublicReview({ customerName: 'test', content: 'Dịch vụ tốt' }), false);
    assert.equal(isPublicReview({ customerName: 'Tèo', content: 'test' }), false);
    assert.equal(isPublicReview({ customerName: 'Khách thật', content: 'Dịch vụ tốt', isTest: true }), false);
});
