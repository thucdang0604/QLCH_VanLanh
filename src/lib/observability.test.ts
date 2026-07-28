import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateRequestId, sanitizePii, logApiMetric } from './observability';

describe('Observability Module — Step 3.1', () => {
  it('generates a new request ID when header is missing', () => {
    const reqId = getOrCreateRequestId(null);
    assert.ok(reqId.startsWith('req_'));
    assert.ok(reqId.length > 10);
  });

  it('preserves existing x-request-id from Headers', () => {
    const headers = new Headers();
    headers.set('x-request-id', 'req_test_123456');
    const reqId = getOrCreateRequestId(headers);
    assert.equal(reqId, 'req_test_123456');
  });

  it('preserves existing x-request-id from record object', () => {
    const reqId = getOrCreateRequestId({ 'x-request-id': 'req_custom_abc' });
    assert.equal(reqId, 'req_custom_abc');
  });

  it('sanitizes sensitive PII fields (tokens, phone numbers, email, password)', () => {
    const rawData = {
      authorization: 'Bearer eyJhbGciOiJSUzI1NiIs...',
      phone: '0912345678',
      email: 'customer@gmail.com',
      password: 'supersecretpass',
      user: {
        displayName: 'Nguyen Van A',
        sdt: '0987654321',
        role: 'admin',
      },
      safeField: 100,
    };

    const sanitized = sanitizePii(rawData);

    assert.equal(sanitized.authorization, '[REDACTED]');
    assert.equal(sanitized.phone, '[REDACTED]');
    assert.equal(sanitized.email, '[REDACTED]');
    assert.equal(sanitized.password, '[REDACTED]');
    assert.equal(sanitized.user.displayName, '[REDACTED]');
    assert.equal(sanitized.user.sdt, '[REDACTED]');
    assert.equal(sanitized.user.role, 'admin');
    assert.equal(sanitized.safeField, 100);
  });

  it('correctly formats API metric without throwing errors', () => {
    assert.doesNotThrow(() => {
      logApiMetric({
        requestId: 'req_123',
        path: '/api/pos/checkout',
        method: 'POST',
        statusCode: 200,
        durationMs: 45.2,
        verifyIdTokenMs: 12.1,
        readUserProfileMs: 8.5,
        transactionRetries: 0,
        meta: { orderId: 'ORD_001', phone: '0901234567' },
      });
    });
  });
});
