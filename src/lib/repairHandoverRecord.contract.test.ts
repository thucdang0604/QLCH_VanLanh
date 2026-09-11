import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function repoFile(...segments: string[]): string {
    return path.join(process.cwd(), ...segments);
}

test('repair handover keeps an audit record separate from the legacy delivery note', () => {
    const handover = fs.readFileSync(repoFile('src', 'app', 'api', 'repairs', 'handover', 'route.ts'), 'utf8');
    const repairTypes = fs.readFileSync(repoFile('src', 'lib', 'types', 'repair.ts'), 'utf8');

    assert.match(repairTypes, /handoverRecord\?: \{/);
    assert.match(handover, /const normalizedHandoverNote = typeof body\.handoverNote === 'string'/);
    assert.match(handover, /updateData\.handoverRecord = \{/);
    assert.match(handover, /action: targetTerminalAction/);
    assert.match(handover, /paymentConfirmationRequired/);
    assert.match(handover, /confirmedAt: FieldValue\.serverTimestamp\(\)/);
    assert.doesNotMatch(handover, /updateData\.deliveryNote/);
});
