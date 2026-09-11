import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function repoFile(...segments: string[]): string {
    return path.join(process.cwd(), ...segments);
}

test('repair receipt uses intake time when reprinted, with a legacy-safe fallback', () => {
    const receipt = fs.readFileSync(repoFile('src', 'components', 'admin', 'PrintableReceipt.tsx'), 'utf8');

    assert.match(receipt, /resolveReceiptDate\(ticket\.timing\?\.receivedAt\)/);
    assert.match(receipt, /Ngày tiếp nhận/);
    assert.match(receipt, /return new Date\(\);/);
});
