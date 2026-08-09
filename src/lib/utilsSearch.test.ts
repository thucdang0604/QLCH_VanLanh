import assert from 'node:assert';
import { generateSearchKeywords, getSearchKeywordQuery } from './utils';

console.log('Running utilsSearch unit tests...');

const keywords = generateSearchKeywords('Điện thoại iPhone 16 Pro Max 256GB');

// Single words
assert.strictEqual(keywords.includes('iphone'), true, 'Single word "iphone" should be indexed');
assert.strictEqual(keywords.includes('16'), true, 'Single word "16" should be indexed');
assert.strictEqual(keywords.includes('pro'), true, 'Single word "pro" should be indexed');
assert.strictEqual(keywords.includes('max'), true, 'Single word "max" should be indexed');

// Bigrams
assert.strictEqual(keywords.includes('iphone 16'), true, 'Bigram "iphone 16" should be indexed');
assert.strictEqual(keywords.includes('16 pro'), true, 'Bigram "16 pro" should be indexed');
assert.strictEqual(keywords.includes('pro max'), true, 'Bigram "pro max" should be indexed');
assert.strictEqual(keywords.includes('dien thoai'), true, 'Bigram "dien thoai" should be indexed');

// Trigrams
assert.strictEqual(keywords.includes('iphone 16 pro'), true, 'Trigram "iphone 16 pro" should be indexed');
assert.strictEqual(keywords.includes('16 pro max'), true, 'Trigram "16 pro max" should be indexed');

// getSearchKeywordQuery verification
assert.strictEqual(getSearchKeywordQuery('iphone 16'), 'iphone 16');
assert.strictEqual(getSearchKeywordQuery('iphone 16 pro'), 'iphone 16 pro');

console.log('✅ ALL utilsSearch N-gram unit tests passed successfully!');
