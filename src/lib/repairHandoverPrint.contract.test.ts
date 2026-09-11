import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function repoFile(...segments: string[]): string {
    return path.join(process.cwd(), ...segments);
}

test('repair print documents consume the persisted handover audit record', () => {
    const receipt = fs.readFileSync(repoFile('src', 'components', 'admin', 'PrintableReceipt.tsx'), 'utf8');
    const invoice = fs.readFileSync(repoFile('src', 'components', 'admin', 'PrintableRepairInvoice.tsx'), 'utf8');

    assert.match(receipt, /ticket\.handoverRecord\?\.note/);
    assert.match(invoice, /ticket\.handoverRecord &&/);
    assert.match(invoice, /ticket\.handoverRecord\.paymentConfirmationRequired/);
    assert.match(invoice, /ticket\.handoverRecord\.paymentConfirmed/);
});
