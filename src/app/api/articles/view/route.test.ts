import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { NextRequest } from 'next/server';

const calls = {
    adminDb: 0,
    rateLimit: 0,
};

const moduleMocksAvailable = typeof mock.module === 'function';

if (moduleMocksAvailable) {
    mock.module('@/lib/firebaseAdmin', {
        namedExports: {
            getAdminDb: () => {
                calls.adminDb += 1;
                throw new Error('Crawler request must not access Firestore');
            },
        },
    });

    mock.module('@/lib/rateLimit', {
        namedExports: {
            isRateLimited: async () => {
                calls.rateLimit += 1;
                return false;
            },
        },
    });
}

async function getPost() {
    return (await import('./route')).POST;
}

test('article view: crawler requests return before rate limiting or Firestore writes', { skip: !moduleMocksAvailable }, async () => {
    calls.adminDb = 0;
    calls.rateLimit = 0;

    const response = await (await getPost())(new NextRequest('http://localhost/api/articles/view', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
        body: JSON.stringify({ slug: 'seo-safe-article' }),
    }), { params: Promise.resolve({}) });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, counted: false, reason: 'crawler' });
    assert.equal(calls.rateLimit, 0);
    assert.equal(calls.adminDb, 0);
});
