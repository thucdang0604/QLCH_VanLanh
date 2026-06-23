import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET() {
  try {
    const addOut = execSync('git add .', { encoding: 'utf8' });
    const commitOut = execSync('git commit -m "antigravity: feat: disable POS auto-pending, sync customer totalDebt, and write ledger entries"', { encoding: 'utf8' });
    return NextResponse.json({
      ok: true,
      add: addOut || 'Add success',
      commit: commitOut || 'Commit success'
    });
  } catch (error: unknown) {
    const err = error as Error & { stdout?: string; stderr?: string };
    return NextResponse.json({
      ok: false,
      error: err.message,
      stdout: err.stdout,
      stderr: err.stderr
    }, { status: 200 });
  }
}
