import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const cmd = 'git add src/app/api/restore/route.ts && git commit -m "antigravity: chore: clean up temporary restore API"';
    const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd() });
    return NextResponse.json({
      ok: true,
      stdout,
      stderr
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    });
  }
}
