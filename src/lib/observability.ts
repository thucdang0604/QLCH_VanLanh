const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const requestIds = new WeakMap<object, string>();

/**
 * Extracts a bounded, non-sensitive caller trace ID or creates a UUID.
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

  if (existingId) {
    const normalized = existingId.trim();
    if (REQUEST_ID_PATTERN.test(normalized)) {
      return normalized;
    }
  }

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const hex = () => Math.floor(Math.random() * 0x1_0000_0000).toString(16).padStart(8, '0');
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(0, 3)}-8${hex().slice(0, 3)}-${hex()}${hex().slice(0, 4)}`;
}

/** Binds one request ID to the request object for downstream helpers. */
export function bindRequestId(request: { headers: Headers }): string {
  const requestId = getOrCreateRequestId(request.headers);
  requestIds.set(request, requestId);
  return requestId;
}

export function getBoundRequestId(request: { headers: Headers }): string {
  return requestIds.get(request) || getOrCreateRequestId(request.headers);
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
  readUserProfileCount?: number;
  transactionRetries?: number;
  errorCode?: string;
}

/**
 * Zero-PII Structured JSON Metric Logger for Observability & SLO tracking.
 */
export function logApiMetric(metric: ApiMetricPayload): void {
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
    readUserProfileCount: metric.readUserProfileCount,
    transactionRetries: metric.transactionRetries ?? 0,
    errorCode: metric.errorCode,
  };

  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
  }
}
