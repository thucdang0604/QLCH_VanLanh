import assert from 'node:assert/strict';
import test from 'node:test';
import { isKnownSearchCrawlerUserAgent } from './searchCrawler';

test('recognizes common search and preview crawlers for analytics exclusion', () => {
    assert.equal(isKnownSearchCrawlerUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
    assert.equal(isKnownSearchCrawlerUserAgent('Mozilla/5.0 (compatible; Google-InspectionTool/1.0)'), true);
    assert.equal(isKnownSearchCrawlerUserAgent('facebookexternalhit/1.1'), true);
});

test('does not classify ordinary browsers as crawlers', () => {
    assert.equal(isKnownSearchCrawlerUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36'), false);
    assert.equal(isKnownSearchCrawlerUserAgent(null), false);
});
