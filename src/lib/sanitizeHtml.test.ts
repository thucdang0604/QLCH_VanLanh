import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeHtml } from './sanitizeHtml';

test('removes event handlers, javascript URLs, script blocks and SVG payloads', () => {
    const output = sanitizeHtml(
        '<p onclick=alert(1)>An toàn</p><a href="javascript:alert(1)">x</a><script>alert(1)</script><svg onload=alert(1)></svg>',
    );

    assert.equal(output, '<p>An toàn</p><a>x</a>');
});

test('keeps approved media and safely hardens new-tab links', () => {
    const output = sanitizeHtml(
        '<iframe src="https://www.youtube.com/embed/video-id" width="560"></iframe><a href="https://example.com" target="_blank">Xem</a><img src="https://example.com/a.jpg" onerror="alert(1)">',
    );

    assert.match(output, /youtube\.com\/embed\/video-id/);
    assert.match(output, /rel="noopener noreferrer"/);
    assert.match(output, /loading="lazy"/);
    assert.doesNotMatch(output, /onerror/i);
});

test('removes iframe sources outside the configured provider allowlist', () => {
    const output = sanitizeHtml('<iframe src="https://attacker.example/payload"></iframe>');
    assert.equal(output, '');
});
