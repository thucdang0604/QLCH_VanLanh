import type { ContactMethodConfidence } from './types/contact';

export interface ZaloQrIdentity {
    rawText: string;
    externalId: string;
    profileUrl: string;
    confidence: ContactMethodConfidence;
}

export interface ZaloContactCardImageResult {
    fileName: string;
    qrText: string;
    zalo?: ZaloQrIdentity;
}

const ZALO_QR_PATTERN = /^(?:https?:\/\/)?(?:www\.)?zaloapp\.com\/qr\/p\/([a-z0-9_-]+)\/?(?:[?#].*)?$/i;
const ZALO_PROFILE_HOSTS = new Set(['zaloapp.com', 'www.zaloapp.com', 'zalo.me', 'www.zalo.me']);

export function extractZaloQrIdentity(rawText: string): ZaloQrIdentity | null {
    const text = String(rawText || '').trim();
    if (!text) return null;
    const match = text.match(ZALO_QR_PATTERN);
    if (!match?.[1]) return null;

    const externalId = match[1].trim();
    return {
        rawText: text,
        externalId,
        profileUrl: `http://zaloapp.com/qr/p/${externalId}`,
        confidence: 'high',
    };
}

/**
 * Returns a safe, scannable Zalo profile/contact-card link for a stored
 * contact method. The QR is generated locally from this value, so customer
 * profiles never depend on a third-party QR image service.
 */
export function resolveZaloProfileQrValue(input: {
    value?: string;
    profileUrl?: string;
    externalId?: string;
}): string | null {
    const candidates = [input.profileUrl, input.value];
    for (const candidate of candidates) {
        const raw = String(candidate || '').trim();
        if (!raw) continue;

        const contactCard = extractZaloQrIdentity(raw);
        if (contactCard) return contactCard.profileUrl;

        try {
            const url = new URL(raw);
            if ((url.protocol === 'https:' || url.protocol === 'http:') && ZALO_PROFILE_HOSTS.has(url.hostname.toLowerCase())) {
                return url.toString();
            }
        } catch {
            // A plain Zalo nickname is useful as CRM data, but not safe to
            // turn into a QR link because Zalo cannot resolve it reliably.
        }
    }

    const externalId = String(input.externalId || '').trim();
    if (/^[a-z0-9_-]+$/i.test(externalId)) {
        return `http://zaloapp.com/qr/p/${externalId}`;
    }
    return null;
}

export async function decodeQrTextFromImageFile(file: File): Promise<string> {
    const { BrowserQRCodeReader } = await import('@zxing/browser');
    const reader = new BrowserQRCodeReader();
    const objectUrl = URL.createObjectURL(file);

    try {
        const result = await reader.decodeFromImageUrl(objectUrl);
        return result.getText();
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export async function importZaloContactCardImage(file: File): Promise<ZaloContactCardImageResult> {
    const qrText = await decodeQrTextFromImageFile(file);
    return {
        fileName: file.name,
        qrText,
        zalo: extractZaloQrIdentity(qrText) || undefined,
    };
}
