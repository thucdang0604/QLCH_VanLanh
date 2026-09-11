export type LabelPaperPresetId = '30x20' | '40x20' | '40x25' | '40x30' | '50x30' | '58x40' | '58-roll' | 'a4-grid' | 'custom';
export type LabelContentMode = 'both' | 'qr' | 'barcode';
export type LabelTextMode = 'full' | 'compact' | 'code-only';
export type LabelBarcodePayloadMode = 'compact' | 'full';

export interface LabelPrintProfile {
    paperId: LabelPaperPresetId;
    labelMode: LabelContentMode;
    textMode: LabelTextMode;
    customWidthMm: number;
    customHeightMm: number;
    safeMarginMm: number;
    contentScale: number;
    labelsPerRow: 1 | 2;
    columnGapMm: number;
    barcodePayloadMode: LabelBarcodePayloadMode;
}

export const LABEL_PRINT_PROFILE_STORAGE_KEY = 'qlch_label_print_profile_v1';

export const DEFAULT_LABEL_PRINT_PROFILE: LabelPrintProfile = {
    paperId: '40x25',
    labelMode: 'both',
    textMode: 'compact',
    customWidthMm: 40,
    customHeightMm: 20,
    safeMarginMm: 0.8,
    contentScale: 88,
    labelsPerRow: 2,
    columnGapMm: 1.4,
    barcodePayloadMode: 'compact',
};

const PAPER_PRESET_IDS: readonly LabelPaperPresetId[] = ['30x20', '40x20', '40x25', '40x30', '50x30', '58x40', '58-roll', 'a4-grid', 'custom'];
const LABEL_CONTENT_MODES: readonly LabelContentMode[] = ['both', 'qr', 'barcode'];
const LABEL_TEXT_MODES: readonly LabelTextMode[] = ['full', 'compact', 'code-only'];
const BARCODE_PAYLOAD_MODES: readonly LabelBarcodePayloadMode[] = ['compact', 'full'];

function isAllowedValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
    return typeof value === 'string' && allowed.includes(value as T);
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

export function parseLabelPrintProfile(rawValue: string | null): LabelPrintProfile | null {
    if (!rawValue) return null;

    try {
        const raw = JSON.parse(rawValue) as unknown;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const profile = raw as Record<string, unknown>;

        return {
            paperId: isAllowedValue(profile.paperId, PAPER_PRESET_IDS) ? profile.paperId : DEFAULT_LABEL_PRINT_PROFILE.paperId,
            labelMode: isAllowedValue(profile.labelMode, LABEL_CONTENT_MODES) ? profile.labelMode : DEFAULT_LABEL_PRINT_PROFILE.labelMode,
            textMode: isAllowedValue(profile.textMode, LABEL_TEXT_MODES) ? profile.textMode : DEFAULT_LABEL_PRINT_PROFILE.textMode,
            customWidthMm: numberInRange(profile.customWidthMm, DEFAULT_LABEL_PRINT_PROFILE.customWidthMm, 20, 100),
            customHeightMm: numberInRange(profile.customHeightMm, DEFAULT_LABEL_PRINT_PROFILE.customHeightMm, 12, 80),
            safeMarginMm: numberInRange(profile.safeMarginMm, DEFAULT_LABEL_PRINT_PROFILE.safeMarginMm, 0, 3),
            contentScale: numberInRange(profile.contentScale, DEFAULT_LABEL_PRINT_PROFILE.contentScale, 70, 100),
            labelsPerRow: profile.labelsPerRow === 1 || profile.labelsPerRow === 2 ? profile.labelsPerRow : DEFAULT_LABEL_PRINT_PROFILE.labelsPerRow,
            columnGapMm: numberInRange(profile.columnGapMm, DEFAULT_LABEL_PRINT_PROFILE.columnGapMm, 0, 8),
            barcodePayloadMode: isAllowedValue(profile.barcodePayloadMode, BARCODE_PAYLOAD_MODES) ? profile.barcodePayloadMode : DEFAULT_LABEL_PRINT_PROFILE.barcodePayloadMode,
        };
    } catch {
        return null;
    }
}
