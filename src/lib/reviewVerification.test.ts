import assert from 'node:assert/strict';
import test from 'node:test';
import { hashReviewPin, isValidReviewPin, verifyReviewPin } from './reviewVerification';

test('review PIN hashes verify without storing the raw PIN', async () => {
    const hash = await hashReviewPin('202607');

    assert.match(hash, /^scrypt-v1\$/);
    assert.equal(hash.includes('202607'), false);
    assert.equal(await verifyReviewPin('202607', hash), true);
    assert.equal(await verifyReviewPin('000000', hash), false);
});

test('review PIN validation accepts only 4 to 8 digits', () => {
    assert.equal(isValidReviewPin('1234'), true);
    assert.equal(isValidReviewPin('12345678'), true);
    assert.equal(isValidReviewPin('123'), false);
    assert.equal(isValidReviewPin('123456789'), false);
    assert.equal(isValidReviewPin('12ab'), false);
});
