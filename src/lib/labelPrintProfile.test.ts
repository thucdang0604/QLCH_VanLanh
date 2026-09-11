import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_LABEL_PRINT_PROFILE, parseLabelPrintProfile } from './labelPrintProfile';

test('accepts a valid per-workstation label print profile', () => {
    const profile = parseLabelPrintProfile(JSON.stringify({
        paperId: 'custom',
        labelMode: 'qr',
        textMode: 'code-only',
        customWidthMm: 51,
        customHeightMm: 31,
        safeMarginMm: 1.2,
        contentScale: 92,
        labelsPerRow: 1,
        columnGapMm: 0,
        barcodePayloadMode: 'full',
    }));

    assert.deepEqual(profile, {
        paperId: 'custom',
        labelMode: 'qr',
        textMode: 'code-only',
        customWidthMm: 51,
        customHeightMm: 31,
        safeMarginMm: 1.2,
        contentScale: 92,
        labelsPerRow: 1,
        columnGapMm: 0,
        barcodePayloadMode: 'full',
    });
});

test('ignores invalid persisted label print values without breaking the modal', () => {
    const profile = parseLabelPrintProfile(JSON.stringify({
        paperId: 'unknown',
        labelMode: '<script>',
        customWidthMm: 999,
        contentScale: 'large',
        labelsPerRow: 3,
    }));

    assert.equal(profile?.paperId, DEFAULT_LABEL_PRINT_PROFILE.paperId);
    assert.equal(profile?.labelMode, DEFAULT_LABEL_PRINT_PROFILE.labelMode);
    assert.equal(profile?.customWidthMm, 100);
    assert.equal(profile?.contentScale, DEFAULT_LABEL_PRINT_PROFILE.contentScale);
    assert.equal(profile?.labelsPerRow, DEFAULT_LABEL_PRINT_PROFILE.labelsPerRow);
    assert.equal(parseLabelPrintProfile('{not-json'), null);
});
