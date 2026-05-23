// Session cookie signing/verification using HMAC-SHA256 (Web Crypto API)
// Edge-compatible: works in both Node.js API routes and Edge middleware

export interface SessionPayload {
  role: 'admin' | 'staff' | 'customer';
  permissions: string[];
}

const COOKIE_NAME = '__session';
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

/** Verify + parse cookie value. Returns null if invalid/tampered. */
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
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
