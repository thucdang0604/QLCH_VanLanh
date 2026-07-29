// Session cookie signing/verification using HMAC-SHA256 (Web Crypto API)
// Edge-compatible: works in both Node.js API routes and Edge middleware

export interface SessionPayload {
  uid: string;
  role: 'admin' | 'staff' | 'customer';
  permissions: string[];
  authorizationVersion: number;
  iat: number; // epoch ms
  exp: number; // epoch ms
}

// Firebase Hosting Frameworks reserves `__session` for a Firebase Auth JWT.
// This application uses its own HMAC payload, so it must never occupy that
// reserved cookie name in production.
const COOKIE_NAME = 'vl_admin_session';
const LEGACY_COOKIE_NAME = '__session';
const encoder = new TextEncoder();

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('Missing SESSION_SECRET env var');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(base64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Sign a payload → "base64(json).base64(hmac)" */
export async function signPayload(data: SessionPayload): Promise<string> {
  const key = await getKey();
  const json = JSON.stringify(data);
  const jsonB64 = toBase64Url(encoder.encode(json).buffer as ArrayBuffer);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(jsonB64));
  return `${jsonB64}.${toBase64Url(sig)}`;
}

/** Verify + parse cookie value. Returns null if invalid, tampered, or expired. */
export async function verifyPayload(cookie: string): Promise<SessionPayload | null> {
  try {
    const [jsonB64, sigB64] = cookie.split('.');
    if (!jsonB64 || !sigB64) return null;

    const key = await getKey();
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigB64).buffer as ArrayBuffer,
      encoder.encode(jsonB64),
    );
    if (!valid) return null;

    const json = new TextDecoder().decode(fromBase64Url(jsonB64));
    const payload = JSON.parse(json) as Partial<SessionPayload>;

    if (
      !payload ||
      typeof payload.uid !== 'string' ||
      !payload.uid ||
      (payload.role !== 'admin' && payload.role !== 'staff' && payload.role !== 'customer') ||
      !Array.isArray(payload.permissions) ||
      typeof payload.authorizationVersion !== 'number' ||
      !Number.isSafeInteger(payload.authorizationVersion) ||
      payload.authorizationVersion < 0 ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= payload.iat
    ) {
      return null;
    }

    if (Date.now() > payload.exp) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME, LEGACY_COOKIE_NAME };
