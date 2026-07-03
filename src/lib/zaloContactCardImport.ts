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

const ZALO_QR_PATTERN = /(?:https?:\/\/)?(?:www\.)?zaloapp\.com\/qr\/p\/([a-z0-9_-]+)/i;

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
