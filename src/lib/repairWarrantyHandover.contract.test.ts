import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function repoFile(...segments: string[]): string {
    return path.join(process.cwd(), ...segments);
}

test('repair handover uses one persisted start timestamp for warranty expiry and printed evidence', () => {
    const handover = fs.readFileSync(repoFile('src', 'app', 'api', 'repairs', 'handover', 'route.ts'), 'utf8');
    const ticketType = fs.readFileSync(repoFile('src', 'lib', 'types', 'repair.ts'), 'utf8');
    const printTemplates = fs.readFileSync(repoFile('src', 'features', 'repairs', 'RepairPrintTemplates.tsx'), 'utf8');

    assert.match(ticketType, /warrantyStartedAt\?: FirestoreDateValue/);
    assert.match(handover, /const warrantyStartedAt = Date\.now\(\);/);
    assert.match(handover, /updateData\.warrantyStartedAt = warrantyStartedAt;/);
    assert.match(handover, /new Date\(warrantyStartedAt\)/);
    assert.match(handover, /stampRepairWarrantyOnParts\([^\n]+warrantyStartedAt\)/);
    assert.match(printTemplates, /warrantyStartedAt: ticket\.warrantyStartedAt \|\| ticket\.createdAt/);
});
