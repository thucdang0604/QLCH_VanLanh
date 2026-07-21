import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { ApiError, getApiErrorCode, getApiErrorMessage, getApiErrorStatus, withApi } from './handler';

const staticRouteContext = { params: Promise.resolve({}) };

test('adds a request id and duration metadata without changing the JSON payload', async () => {
    const handler = withApi({ name: 'test/success' }, async (_request, context) => (
        context.json({ success: true, value: 'preserved' })
    ));
    const response = await handler(new NextRequest('http://localhost/api/test'), staticRouteContext);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, value: 'preserved' });
    assert.match(response.headers.get('x-request-id') || '', /^[a-f0-9-]{36}$/i);
    assert.match(response.headers.get('server-timing') || '', /^total;dur=\d+$/);
});

test('keeps a valid caller request id for cross-service tracing', async () => {
    const handler = withApi({ name: 'test/request-id' }, async (_request, context) => context.json({ success: true }));
    const response = await handler(new NextRequest('http://localhost/api/test', {
        headers: { 'x-request-id': 'checkout_20260720_001' },
    }), staticRouteContext);

    assert.equal(response.headers.get('x-request-id'), 'checkout_20260720_001');
});

test('adds trace metadata without changing a streamed or binary response contract', async () => {
    const handler = withApi({ name: 'test/plain-response' }, async () => new Response('stream payload', {
        status: 202,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
    }));
    const response = await handler(new NextRequest('http://localhost/api/test'), staticRouteContext);

    assert.equal(response.status, 202);
    assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(await response.text(), 'stream payload');
    assert.match(response.headers.get('x-request-id') || '', /^[a-f0-9-]{36}$/i);
    assert.match(response.headers.get('server-timing') || '', /^total;dur=\d+$/);
});

test('maps malformed JSON to a stable client error through the shared error helpers', async () => {
    const handler = withApi({
        name: 'test/json',
        onError: (error, context) => context.error(
            getApiErrorMessage(error, 'Invalid request body'),
            getApiErrorStatus(error, 500),
        ),
    }, async (request, context) => {
        const body = await context.readJson(request);
        return context.json({ success: true, body });
    });
    const response = await handler(new NextRequest('http://localhost/api/test', {
        method: 'POST',
        body: '{bad json',
        headers: { 'content-type': 'application/json' },
    }), staticRouteContext);

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Invalid JSON request body' });
});

test('retains explicit domain error status and message', () => {
    const error = new ApiError('Shift already open', 409, 'shift_already_open');

    assert.equal(getApiErrorMessage(error), 'Shift already open');
    assert.equal(getApiErrorStatus(error), 409);
});

test('does not expose an unexpected internal error message to API callers', async () => {
    const handler = withApi({ name: 'test/internal-error' }, async () => {
        throw new Error('Firebase service account credentials are unavailable');
    });
    const response = await handler(new NextRequest('http://localhost/api/test'), staticRouteContext);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Lỗi hệ thống. Vui lòng thử lại sau.' });
});

test('normalizes missing and forbidden bearer authentication to 401 and 403', () => {
    const unauthenticated = new Error('Missing Authorization bearer token');
    const forbidden = new Error('Forbidden: missing manage_orders permission');

    assert.equal(getApiErrorStatus(unauthenticated, 500), 401);
    assert.equal(getApiErrorCode(unauthenticated), 'unauthenticated');
    assert.equal(getApiErrorStatus(forbidden, 500), 403);
    assert.equal(getApiErrorCode(forbidden), 'forbidden');
});
