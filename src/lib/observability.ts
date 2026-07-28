/**
 * Clean Request ID extractor/generator for API tracing across Edge Middleware and Node runtime endpoints.
 */
export function getOrCreateRequestId(headers?: Headers | Record<string, string | string[] | undefined> | null): string {
  if (!headers) {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  }

  let existingId: string | null = null;

  if (typeof (headers as Headers).get === 'function') {
    existingId = (headers as Headers).get('x-request-id') || (headers as Headers).get('X-Request-Id');
  } else {
    const record = headers as Record<string, string | string[] | undefined>;
    const raw = record['x-request-id'] || record['X-Request-Id'];
    if (typeof raw === 'string') {
      existingId = raw;
    } else if (Array.isArray(raw) && raw.length > 0) {
      existingId = raw[0];
    }
  }

  if (existingId && existingId.trim().length > 0) {
    return existingId.trim();
  }

  const randomStr = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').substring(0, 16)
    : `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

  return `req_${randomStr}`;
}

const PII_FIELDS = new Set([
  'authorization',
  'token',
  'bearer',
  'password',
  'phone',
  'phonenumber',
  'sdt',
  'email',
  'displayname',
  'customername',
  'idtoken',
  'refreshtoken',
  'cookie',
  'secret',
  'session',
]);

/**
 * Deeply redacts sensitive PII fields from log objects/payloads.
 */
export function sanitizePii<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    // Redact Bearer tokens
    if (/^Bearer\s+/i.test(input)) {
      return '[REDACTED_BEARER_TOKEN]' as unknown as T;
    }
    // Redact Vietnam phone numbers if standalone string match
    if (/(?:\+84|0)\d{9,10}/.test(input) && input.length <= 15) {
      return '[REDACTED_PHONE]' as unknown as T;
    }
    // Redact Email
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) {
      return '[REDACTED_EMAIL]' as unknown as T;
    }
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizePii(item)) as unknown as T;
  }

  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (PII_FIELDS.has(lowerKey)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizePii(value);
      }
    }
    return result as T;
  }

  return input;
}

export interface ApiMetricPayload {
  requestId: string;
  path: string;
  method: string;
  statusCode: number;
  durationMs: number;
  verifyIdTokenMs?: number;
  readUserProfileMs?: number;
  transactionRetries?: number;
  meta?: Record<string, unknown>;
}

/**
 * Zero-PII Structured JSON Metric Logger for Observability & SLO tracking.
 */
export function logApiMetric(metric: ApiMetricPayload): void {
  const sanitizedMeta = metric.meta ? sanitizePii(metric.meta) : undefined;
  const payload = {
    type: 'API_METRIC',
    timestamp: new Date().toISOString(),
    requestId: metric.requestId,
    method: metric.method,
    path: metric.path,
    statusCode: metric.statusCode,
    durationMs: Math.round(metric.durationMs),
    verifyIdTokenMs: metric.verifyIdTokenMs !== undefined ? Math.round(metric.verifyIdTokenMs) : undefined,
    readUserProfileMs: metric.readUserProfileMs !== undefined ? Math.round(metric.readUserProfileMs) : undefined,
    transactionRetries: metric.transactionRetries ?? 0,
    meta: sanitizedMeta,
  };

  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  }
}
