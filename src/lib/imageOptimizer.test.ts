import assert from 'node:assert/strict';
import test from 'node:test';
import { dataUrlToImageFile } from './imageOptimizer';

const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL5hQAAAABJRU5ErkJggg==';

test('dataUrlToImageFile decodes a supported pasted image without fetch', () => {
    const file = dataUrlToImageFile(ONE_PIXEL_PNG, 'pasted_image');

    assert.equal(file.name, 'pasted_image.png');
    assert.equal(file.type, 'image/png');
    assert.ok(file.size > 0);
});

test('dataUrlToImageFile rejects unsupported pasted image formats', () => {
    assert.throws(
        () => dataUrlToImageFile('data:image/svg+xml;base64,PHN2Zy8+', 'pasted_image'),
        /JPG, PNG hoặc WebP/
    );
});

test('dataUrlToImageFile rejects an oversized pasted image before decoding it', () => {
    const tooLargeBase64 = 'A'.repeat(Math.ceil((((4 * 1024 * 1024) + 1) * 4) / 3));

    assert.throws(
        () => dataUrlToImageFile(`data:image/png;base64,${tooLargeBase64}`, 'pasted_image'),
        /tối đa 4 MB/
    );
});

test('dataUrlToImageFile rejects malformed data', () => {
    assert.throws(
        () => dataUrlToImageFile('data:image/png;base64,A', 'pasted_image'),
        /không hợp lệ/
    );
});
