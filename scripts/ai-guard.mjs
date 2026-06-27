import { execFileSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const staged = args.has('--staged');

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function listChanged() {
  const diffArgs = staged ? ['diff', '--cached', '--name-status'] : ['diff', '--name-status'];
  const output = git(diffArgs);
  return output ? output.split(/\r?\n/) : [];
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const rows = listChanged();
const changedFiles = rows
  .map((line) => line.split(/\s+/).slice(1).join(' '))
  .filter(Boolean);
const deletedRows = rows.filter((line) => line.startsWith('D'));
const protectedPattern = /(^package\.json$|^pnpm-lock\.yaml$|^\.env|firebase|firestore|source_intelligence\.json)/i;
const protectedFiles = changedFiles.filter((file) => protectedPattern.test(file));
const allowDeletes = process.env.AI_GUARD_ALLOW_DELETES === '1';
const allowLargeChange = process.env.AI_GUARD_ALLOW_LARGE_CHANGE === '1';
const allowProtected = process.env.AI_GUARD_ALLOW_PROTECTED === '1';

console.log('Changed files:');
console.log(rows.length ? rows.join('\n') : '(none)');

if (deletedRows.length && !allowDeletes) {
  fail('\nBLOCKED: changes delete files. Set AI_GUARD_ALLOW_DELETES=1 only after manual approval.');
}

if (changedFiles.length > 8 && !allowLargeChange) {
  fail(`\nBLOCKED: too many files changed (${changedFiles.length}). Set AI_GUARD_ALLOW_LARGE_CHANGE=1 only after manual approval.`);
}

if (protectedFiles.length && !allowProtected) {
  fail(`\nBLOCKED: protected files changed:\n${protectedFiles.join('\n')}\nSet AI_GUARD_ALLOW_PROTECTED=1 only after manual approval.`);
}

if (!process.exitCode) {
  console.log('\nAI safety guard passed.');
}
