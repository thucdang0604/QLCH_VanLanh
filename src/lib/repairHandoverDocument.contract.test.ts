import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('handover document print mode is wired only for terminal repair tickets', () => {
    const template = fs.readFileSync(path.join(root, 'src/features/repairs/RepairPrintTemplates.tsx'), 'utf8');
    const board = fs.readFileSync(path.join(root, 'src/features/repairs/RepairTicketBoard.tsx'), 'utf8');
    const page = fs.readFileSync(path.join(root, 'src/app/admin/repairs/page.tsx'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8');

    assert.match(template, /mode === 'handover'/);
    assert.match(template, /<PrintableHandover ticket=\{ticket\}/);
    assert.ok(board.includes("st?.isTerminal && (") && board.includes("openPrint(ticket, 'handover')"));
    assert.match(page, /'handover'/);
    assert.match(css, /#printable-handover/);
});
